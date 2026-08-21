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
} from './db.js';
import { runCollector, loadCollectors } from './brightdata.js';
import { normalizeDataset } from './normalize.js';
import { computeDiff, printDiff } from './diff.js';
import { buildAlert, dispatchAlert, matchWatch } from './alert.js';
import { fetchGithubReleases } from './sources/github.js';
import type { Change } from './types.js';

const args = process.argv.slice(2);
const command = args[0] || 'all';

async function cmdScrape(): Promise<void> {
  const db = getDb();
  const collectors = await loadCollectors();
  if (collectors.length === 0) {
    console.error('❌ No enabled collectors found. Run scripts/create-collectors.sh first.');
    process.exit(1);
  }

  console.log(`\n🕷️  Scraping ${collectors.length} collector(s)...\n`);
  let totalChanges = 0;
  let totalFailures = 0;
  const allChanges: Change[] = [];

  for (const collector of collectors) {
    process.stdout.write(`  ▶ ${collector.vendor_display.padEnd(20)} (${collector.collector_id}) ... `);
    const runId = startRun(db, collector.vendor, collector.collector_id);

    try {
      const dataset = await runCollector(collector, {
        timeoutMs: parseInt(process.env.SCRAPE_TIMEOUT_MS || '300000', 10),
      });
      const changes = normalizeDataset(dataset, collector);
      const res = upsertChanges(db, changes);
      finishRun(db, runId, 'success', changes.length);
      console.log(`✅ ${changes.length} rows (${res.inserted} new, ${res.updated} mutated)`);
      totalChanges += changes.length;
      allChanges.push(...changes);
    } catch (err) {
      finishRun(db, runId, 'failed', 0, (err as Error).message);
      console.log(`❌ ${(err as Error).message.slice(0, 80)}`);
      totalFailures += 1;
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

  console.log(`\n📊 Scrape complete: ${totalChanges}+ total rows, ${totalFailures} failure(s).\n`);
  if (totalFailures > 0) {
    console.log(`  ⚠️  ${totalFailures} collector(s) failed. Run \`npm run scrape:debug\` or check raw/*.json`);
  }
}

async function cmdNormalize(): Promise<void> {
  console.log('\n🔄 Normalization happens automatically during scrape. Run `npm run scrape` instead.\n');
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
      case 'normalize': await cmdNormalize(); break;
      case 'diff':      await cmdDiff(); break;
      case 'alert':     await cmdAlert(); break;
      case 'all':       await cmdAll(); break;
      case 'watch':     await cmdWatch(args.slice(1)); break;
      default:
        console.error(`Unknown command: ${command}. Use: scrape | normalize | diff | alert | all | watch`);
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
