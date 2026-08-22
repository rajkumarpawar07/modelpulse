#!/usr/bin/env node
/**
 * cli.ts — The main entry point.
 *
 * Usage:
 *   npm run scrape    # Run all collectors (+ GitHub release sources)
 *   npm run diff      # Compute the week-over-week diff
 *   npm run alert     # Send the alert (Slack/Discord/generic webhook)
 *   npm run all       # scrape → diff → alert (full pipeline)
 *   npm run watch -- add "rate limit"   # add a keyword watch
 *   npm run watch -- remove "rate limit" # remove by keyword or id
 *   npm run watch -- list              # list watches
 *   npm run heal -- mistral "what broke" # on-demand heal via the production path
 *
 * Runs on Node 20+ with tsx for TypeScript execution.
 */
import 'dotenv/config';
import {
  getDb,
  upsertChanges,
  startRun,
  finishRun,
  closeDb,
  addWatch,
  removeWatch,
  listWatches,
  startHeal,
  finishHeal,
  getLastHealAgeHours,
} from './db.js';
import {
  runCollector,
  loadCollectors,
  healCollector,
  approveHeal,
  waitForHealApproval,
  generateTemplate,
} from './brightdata.js';
import { normalizeDataset, detectPartialFailure } from './normalize.js';
import { computeDiff, printDiff } from './diff.js';
import { buildAlert, dispatchAlert, matchWatch } from './alert.js';
import { fetchGithubReleases } from './sources/github.js';
import type { Change, Collector } from './types.js';

const args = process.argv.slice(2);
const command = args[0] || 'all';

/** Collectors that failed, returned 0 rows, or show partial breakage → auto-heal. */
interface FailedCollector {
  collector: Collector;
  reason: string;
}

/** Result of one collector scrape, gathered concurrently. */
interface ScrapeResult {
  collector: Collector;
  ok: boolean;
  rows: number;
  inserted: number;
  updated: number;
  changes: Change[];
  error?: string;
  partialReason?: string;
}

/** Scrape one collector: run, normalize, upsert, and detect partial breakage. */
async function scrapeOne(collector: Collector): Promise<ScrapeResult> {
  const db = getDb();
  const runId = startRun(db, collector.vendor, collector.collector_id);
  try {
    const dataset = await runCollector(collector, {
      timeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS || '300000', 10),
    });
    const partialReason = detectPartialFailure(dataset);
    const changes = normalizeDataset(dataset, collector);
    const res = upsertChanges(db, changes);
    finishRun(db, runId, 'success', changes.length);
    console.log(`  ✅ ${collector.vendor_display.padEnd(20)} — ${changes.length} rows (${res.inserted} new, ${res.updated} mutated)`);
    return {
      collector,
      ok: true,
      rows: changes.length,
      inserted: res.inserted,
      updated: res.updated,
      changes,
      partialReason: partialReason ?? undefined,
    };
  } catch (err) {
    const msg = (err as Error).message;
    finishRun(db, runId, 'failed', 0, msg);
    console.log(`  ❌ ${collector.vendor_display.padEnd(20)} — ${msg.slice(0, 80)}`);
    return { collector, ok: false, rows: 0, inserted: 0, updated: 0, changes: [], error: msg };
  }
}

/** Run async work with a bounded concurrency limit. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function cmdScrape(): Promise<void> {
  const db = getDb();
  const collectors = await loadCollectors();
  if (collectors.length === 0) {
    console.error('❌ No enabled collectors found. Run scripts/create-collectors.sh first.');
    process.exit(1);
  }

  const concurrency = Math.max(1, parseInt(process.env.SCRAPE_CONCURRENCY || '4', 10));
  console.log(`\n🕷️  Scraping ${collectors.length} collector(s), ${concurrency} at a time...\n`);

  const results = await mapLimit(collectors, concurrency, scrapeOne);

  let totalChanges = 0;
  let totalFailures = 0;
  const allChanges: Change[] = [];
  const failedCollectors: FailedCollector[] = [];

  for (const r of results) {
    if (r.ok) {
      totalChanges += r.rows;
      allChanges.push(...r.changes);

      if (r.rows === 0) {
        failedCollectors.push({
          collector: r.collector,
          reason: 'Scraper returned 0 rows — the site layout may have changed.',
        });
      } else if (r.partialReason) {
        // Rows came back, but the fields we depend on are gone → partial breakage.
        failedCollectors.push({
          collector: r.collector,
          reason: `Partial breakage: ${r.partialReason}. The page likely changed under the scraper.`,
        });
      }
    } else {
      totalFailures += 1;
      failedCollectors.push({
        collector: r.collector,
        reason: `Scrape error: ${r.error!.slice(0, 200)}`,
      });
    }
  }

  // Second source type: GitHub Releases for collectors that declare a repo.
  if (process.env.ENABLE_GITHUB !== 'false') {
    const ghCollectors = collectors.filter(c => c.github_repo);
    if (ghCollectors.length > 0) {
      console.log(`\n🐙 Ingesting GitHub releases for ${ghCollectors.length} vendor(s)...\n`);
      for (const collector of ghCollectors) {
        const repo = collector.github_repo!;
        process.stdout.write(`  ▶ ${collector.vendor_display.padEnd(20)} (gh:${repo}) ... `);
        const runId = startRun(db, collector.vendor, `gh:${repo}`);
        try {
          const changes = await fetchGithubReleases(collector, repo);
          const res = upsertChanges(db, changes);
          finishRun(db, runId, 'success', changes.length);
          console.log(`✅ ${changes.length} rows (${res.inserted} new, ${res.updated} mutated)`);
          allChanges.push(...changes);
        } catch (err) {
          finishRun(db, runId, 'failed', 0, (err as Error).message);
          console.log(`❌ ${(err as Error).message.slice(0, 80)}`);
        }
      }
    }
  }

  console.log(`\n📊 Scrape complete: ${totalChanges}+ total rows, ${totalFailures} failure(s).`);

  // ── Auto-heal: detect → heal → approve → re-run ────────────────────
  const autoHeal = process.env.AUTO_HEAL !== 'false';
  const healCooldownH = parseFloat(process.env.HEAL_COOLDOWN_HOURS || '20');
  const regenCooldownH = parseFloat(process.env.REGEN_COOLDOWN_HOURS || '48');
  if (autoHeal && failedCollectors.length > 0) {
    console.log(`\n🩺 Auto-heal: ${failedCollectors.length} collector(s) need attention...\n`);

    for (const { collector, reason } of failedCollectors) {
      const needsTemplate = /does not have a template|collector disabled/i.test(reason);

      // Cooldown: one repair attempt per window per vendor. Unlike a count
      // breaker this self-recovers — when the window passes, the vendor gets
      // another attempt even after many failures.
      const cooldownH = needsTemplate ? regenCooldownH : healCooldownH;
      const lastAttemptH = getLastHealAgeHours(db, collector.vendor);
      if (lastAttemptH !== null && lastAttemptH < cooldownH) {
        console.log(
          `  ⏳ ${collector.vendor_display.padEnd(16)} skipped — repair attempted ${Math.round(lastAttemptH)}h ago ` +
          `(cooldown ${cooldownH}h). Next attempt in ~${Math.ceil(cooldownH - lastAttemptH)}h.`
        );
        continue;
      }

      const healPrompt =
        `The latest scrape of ${collector.vendor_display}'s changelog is broken or degraded. ` +
        `The site layout may have changed. Re-inspect the page at ${collector.url} and fix the extraction ` +
        `to return: title, date (YYYY-MM-DD), change_type (added/changed/deprecated/removed/fixed), ` +
        `version, description, url for every entry. Reason: ${reason}`;

      process.stdout.write(`  🔧 Healing ${collector.vendor_display.padEnd(16)} (${collector.collector_id}) ... `);
      const healId = startHeal(db, collector.vendor, collector.collector_id, reason);

      // Two repair paths:
      //  - collector has no template at all (or is disabled) → queue AI
      //    template generation; nothing to refactor yet
      //  - otherwise → refactor the existing template (classic heal)
      if (needsTemplate) {
        const queued = await generateTemplate(collector.collector_id, collector.url);
        if (!queued) {
          finishHeal(db, healId, 'failed', null, 'Template generation request failed');
          console.log('❌ template generation request failed');
          continue;
        }
        finishHeal(db, healId, 'healed', null);
        console.log('✅ template generation queued (takes 5–15 min server-side)');
        console.log('     → next run of the daily cron will verify with a real trigger');
        continue; // no point re-running before the template exists
      }

      const submit = await healCollector(collector.collector_id, healPrompt);
      if (submit.status === 'failed') {
        finishHeal(db, healId, 'failed', null, submit.error);
        console.log(`❌ ${submit.error}`);
        continue;
      }

      // Either a fresh job was submitted, or a previous heal is still running
      // server-side (HTTP 409) — in both cases the recovery path is the same:
      // wait for the job's approval gate, then approve and re-run.
      const interactionId = submit.status === 'submitted' ? submit.id : null;
      if (submit.status === 'inflight') {
        console.log('\n     ℹ️  a previous heal job is still in progress — adopting it');
      }

      const gate = await waitForHealApproval(collector.collector_id);
      if (gate === 'failed') {
        finishHeal(db, healId, 'failed', interactionId, 'Self-healing job failed');
        console.log(`❌ self-healing job failed${interactionId ? ` (${interactionId})` : ''}`);
        continue;
      }
      if (gate === 'timeout') {
        // Never approve a job that hasn't reached its gate — approving early
        // fails server-side and can kill the in-flight refactor. Leave it
        // pending; the next daily run adopts it via the 409 path.
        finishHeal(db, healId, 'healed', interactionId, 'Approval gate not reached in time; left for next run');
        console.log(`⚠️ heal in progress but gate not reached in time — next run will adopt and approve it`);
        continue;
      }

      if (gate === 'approve') {
        const approved = await approveHeal(collector.collector_id);
        if (!approved) {
          finishHeal(db, healId, 'healed', interactionId, 'Auto-approve failed');
          console.log(`⚠️ healed but approve failed${interactionId ? ` (${interactionId})` : ''}`);
          continue;
        }
      }
      finishHeal(db, healId, 'approved', interactionId);
      console.log(`✅ healed & approved${interactionId ? ` (${interactionId})` : ''}`);

      // Re-run the healed collector — up to HEAL_RERUN_ATTEMPTS times.
      const maxAttempts = Math.max(1, parseInt(process.env.HEAL_RERUN_ATTEMPTS || '2', 10));
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        process.stdout.write(`  🔄 Re-running ${collector.vendor_display.padEnd(16)} (attempt ${attempt}/${maxAttempts}) ... `);
        const reRunId = startRun(db, collector.vendor, collector.collector_id);
        try {
          const dataset = await runCollector(collector, { timeoutMs: 180_000 });
          const partialReason = detectPartialFailure(dataset);
          const changes = normalizeDataset(dataset, collector);
          const res = upsertChanges(db, changes);
          finishRun(db, reRunId, 'success', changes.length);
          console.log(`✅ ${changes.length} rows recovered (${res.inserted} new)`);
          allChanges.push(...changes);
          if (partialReason && changes.length > 0) {
            console.log(`     ⚠️  still partially degraded: ${partialReason}`);
          }
          break;
        } catch (err) {
          finishRun(db, reRunId, 'failed', 0, (err as Error).message);
          console.log(`❌ ${(err as Error).message.slice(0, 60)}`);
        }
      }
    }
    console.log();
  } else if (failedCollectors.length > 0) {
    console.log(`  ⚠️  ${failedCollectors.length} collector(s) failed. Set AUTO_HEAL=true to auto-fix.`);
  }

  console.log();
}

async function cmdDiff(): Promise<void> {
  const db = getDb();
  const windowDays = parseInt(process.env.DIFF_WINDOW_DAYS || '7', 10);
  console.log(`\n🔍 Computing week-over-week diff (window: ${windowDays} days)...\n`);
  const diff = computeDiff(db, windowDays);
  printDiff(diff);
  console.log(`\n📈 ${diff.reduce((acc, d) => acc + d.new_changes.length, 0)} new change(s) across ${diff.length} vendor(s).\n`);
}

async function cmdAlert(): Promise<void> {
  const db = getDb();
  const windowDays = parseInt(process.env.DIFF_WINDOW_DAYS || '7', 10);
  const threshold = parseInt(process.env.ALERT_THRESHOLD || '1', 10);
  const breakingOnly = process.env.ALERT_BREAKING_ONLY === 'true';

  const diff = computeDiff(db, windowDays);

  let filtered = diff;
  if (breakingOnly) {
    filtered = filtered
      .map(d => ({ ...d, new_changes: d.new_changes.filter(c => c.is_breaking) }))
      .filter(d => d.new_changes.length > 0);
  }

  const watches = listWatches(db);
  if (process.env.ALERT_WATCH_ONLY === 'true' && watches.length > 0) {
    const keywords = watches.map(w => w.keyword);
    console.log(`👁️  Watch mode: filtering to ${keywords.length} keyword(s): ${keywords.join(', ')}`);
    filtered = filtered
      .map(d => ({ ...d, new_changes: d.new_changes.filter(c => matchWatch(c, keywords)) }))
      .filter(d => d.new_changes.length > 0);
  }

  const totalNew = filtered.reduce((acc, d) => acc + d.new_changes.length, 0);
  if (totalNew < threshold) {
    console.log(`\n😴 Only ${totalNew} new change(s); below threshold of ${threshold}. Skipping alert.\n`);
    return;
  }

  const alert = buildAlert(filtered);
  console.log(`\n📡 Dispatching alert (${alert.changes.length} change(s), ${alert.is_breaking ? 'BREAKING' : 'normal'})...`);
  const result = await dispatchAlert(alert);
  if (result.slack) console.log('  ✅ Slack');
  if (result.discord) console.log('  ✅ Discord');
  if (result.webhook) console.log('  ✅ Generic webhook');
  if (result.console) console.log('  ℹ️  Console (no webhook configured)');
  console.log();
}

async function cmdWatch(rest: string[]): Promise<void> {
  const db = getDb();
  const sub = rest[0] || 'list';

  if (sub === 'add') {
    const kw = rest.slice(1).join(' ').trim();
    if (!kw) {
      console.error('Usage: npm run watch -- add "rate limit"');
      process.exitCode = 1;
      return;
    }
    const added = addWatch(db, kw);
    console.log(added ? `👁️  Now watching "${kw}"` : `ℹ️  Already watching "${kw}"`);
    return;
  }

  if (sub === 'remove') {
    const target = rest.slice(1).join(' ').trim();
    if (!target) {
      console.error('Usage: npm run watch -- remove "rate limit" | <id>');
      process.exitCode = 1;
      return;
    }
    const removed = removeWatch(db, target);
    console.log(removed ? `🗑️  Stopped watching "${target}"` : `ℹ️  No watch found for "${target}"`);
    return;
  }

  const watches = listWatches(db);
  if (watches.length === 0) {
    console.log('\n👁️  No keyword watches yet. Add one:  npm run watch -- add "deprecat"\n');
    return;
  }
  console.log(`\n👁️  ${watches.length} keyword watch(es):`);
  for (const w of watches) {
    console.log(`   [${w.id}] ${w.keyword}`);
  }
  console.log('\nTip: set ALERT_WATCH_ONLY=true to alert only on watch matches.\n');
}

/**
 * On-demand heal of one vendor, using the exact same production code path
 * the daily cron uses (HTTP refactor_template → wait → approve → re-run).
 *
 *   npm run heal -- mistral
 *   npm run heal -- mistral "change_type returns null since they restructured"
 */
async function cmdHeal(rest: string[]): Promise<void> {
  const db = getDb();
  const vendor = rest[0];
  if (!vendor) {
    console.error('Usage: npm run heal -- <vendor> ["description of what broke"]');
    process.exitCode = 1;
    return;
  }

  const collectors = await loadCollectors();
  const collector = collectors.find(c => c.vendor === vendor);
  if (!collector) {
    console.error(`❌ No enabled collector for vendor "${vendor}". Check collectors.json.`);
    process.exitCode = 1;
    return;
  }

  const whatBroke = rest.slice(1).join(' ').trim();
  const reason = whatBroke || 'Manual heal requested from the CLI';

  console.log(`\n🩺 Healing ${collector.vendor_display} (${collector.collector_id})`);
  console.log(`   Reason: ${reason}\n`);

  const healId = startHeal(db, collector.vendor, collector.collector_id, reason);
  const healPrompt =
    `The scrape of ${collector.vendor_display}'s changelog at ${collector.url} is broken or degraded. ` +
    `Re-inspect the page and fix the extraction to return: title, date (YYYY-MM-DD), ` +
    `change_type (added/changed/deprecated/removed/fixed), version, description, url for every entry. ` +
    (whatBroke ? `What broke: ${whatBroke}. ` : '') +
    'Same output schema as before.';

  const submit = await healCollector(collector.collector_id, healPrompt);
  if (submit.status === 'failed') {
    finishHeal(db, healId, 'failed', null, submit.error);
    console.error(`❌ ${submit.error}`);
    process.exitCode = 1;
    return;
  }
  const interactionId = submit.status === 'submitted' ? submit.id : null;
  if (submit.status === 'inflight') {
    console.log('  ℹ️  a previous heal job is still in progress — adopting it');
  }

  if (interactionId) {
    console.log(`  Heal job: ${interactionId} — waiting for the approval gate...`);
  }
  const gate = await waitForHealApproval(collector.collector_id);
  if (gate === 'failed') {
    finishHeal(db, healId, 'failed', interactionId, 'Self-healing job failed');
    console.error('❌ Self-healing job failed.');
    process.exitCode = 1;
    return;
  }
  if (gate === 'timeout') {
    finishHeal(db, healId, 'healed', interactionId, 'Approval gate not reached in time');
    console.log(`⚠️ Heal in progress but the approval gate wasn't reached. Re-run later: npm run heal -- ${vendor}`);
    process.exitCode = 1;
    return;
  }

  if (gate === 'approve') {
    const approved = await approveHeal(collector.collector_id);
    if (!approved) {
      finishHeal(db, healId, 'healed', interactionId, 'Approve failed');
      console.log(`⚠️ Healed but approve failed. Run: bdata scraper approve ${collector.collector_id}`);
      process.exitCode = 1;
      return;
    }
  }
  finishHeal(db, healId, 'approved', interactionId);
  console.log(`✅ Healed & approved${interactionId ? ` (${interactionId})` : ''}\n`);

  // Verify with a real re-run on the same c_* ID.
  process.stdout.write(`🔄 Re-running ${collector.vendor_display} to verify ... `);
  const runId = startRun(db, collector.vendor, collector.collector_id);
  try {
    const dataset = await runCollector(collector, { timeoutMs: 180_000 });
    const partialReason = detectPartialFailure(dataset);
    const changes = normalizeDataset(dataset, collector);
    upsertChanges(db, changes);
    finishRun(db, runId, 'success', changes.length);
    console.log(`✅ ${changes.length} rows recovered`);
    if (partialReason) console.log(`   ⚠️  still partially degraded: ${partialReason}`);
  } catch (err) {
    finishRun(db, runId, 'failed', 0, (err as Error).message);
    console.log(`❌ re-run failed: ${(err as Error).message.slice(0, 80)}`);
    process.exitCode = 1;
  }
  console.log();
}

async function cmdAll(): Promise<void> {
  await cmdScrape();
  await cmdDiff();
  await cmdAlert();
  console.log('🎉 Full pipeline complete.\n');
}

async function main(): Promise<void> {
  try {
    switch (command) {
      case 'scrape':    await cmdScrape(); break;
      case 'diff':      await cmdDiff(); break;
      case 'alert':     await cmdAlert(); break;
      case 'all':       await cmdAll(); break;
      case 'watch':     await cmdWatch(args.slice(1)); break;
      case 'heal':      await cmdHeal(args.slice(1)); break;
      default:
        console.error(`Unknown command: ${command}. Use: scrape | diff | alert | all | watch | heal`);
        process.exit(1);
    }
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main();
