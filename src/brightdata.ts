/**
 * brightdata.ts — Bright Data Scraper Studio API client.
 *
 * The endpoints we call directly (instead of the CLI, so we can run from
 * GitHub Actions without needing npx and the interactive login):
 *
 *   POST /dca/trigger?collector=c_xxx
 *     body: [{ "url": "https://..." }]  (or whatever input schema the collector expects)
 *     returns: { collection_id: "j_xxx" } or { snapshot_id: "j_xxx" }
 *
 *   GET /dca/dataset?id=j_xxx
 *     returns: a JSON array of rows (or pending status until ready)
 *
 *   POST /dca/collectors/{id}/refactor_template  (heal)
 *   GET  /dca/collectors/{id}                    (heal/collector status)
 *   POST /dca/collectors/{id}/approve            (approve the healed template)
 */
import { request } from 'undici';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TriggerResponse, Dataset, Collector } from './types.js';

const BRIGHTDATA_BASE = 'https://api.brightdata.com';

function apiKey(): string {
  const k = process.env.BRIGHT_DATA_API_KEY;
  if (!k) {
    throw new Error('BRIGHT_DATA_API_KEY is not set. Copy .env.example to .env and fill it in.');
  }
  return k;
}

/**
 * Trigger a scrape run. Returns the collection_id (also called snapshot_id).
 * Polls /dca/dataset until the data is ready or timeout.
 */
export async function runCollector(
  collector: Collector,
  opts: { pollIntervalMs?: number; timeoutMs?: number; saveRaw?: boolean } = {},
): Promise<Dataset> {
  const { pollIntervalMs = 5000, timeoutMs = 120_000, saveRaw = true } = opts;

  // 1. Trigger
  const triggerBody = [{ url: collector.url }];
  const triggerUrl = `${BRIGHTDATA_BASE}/dca/trigger?collector=${encodeURIComponent(collector.collector_id)}&queue_next=1`;

  let triggerRes;
  try {
    triggerRes = await request(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerBody),
    });
  } catch (err) {
    throw new Error(`Failed to trigger collector ${collector.vendor}: ${(err as Error).message}`);
  }

  if (triggerRes.statusCode >= 500) {
    // Transient server error — one retry after a short backoff.
    await triggerRes.body.dump();
    console.warn(`  ⚠️  ${collector.vendor}: trigger HTTP ${triggerRes.statusCode} (transient), retrying in 15s...`);
    await sleep(15_000);
    triggerRes = await request(triggerUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(triggerBody),
    });
  }

  if (triggerRes.statusCode >= 400) {
    const body = await triggerRes.body.text();
    throw new Error(`Trigger failed for ${collector.vendor} (HTTP ${triggerRes.statusCode}): ${body}`);
  }

  const triggerJson = (await triggerRes.body.json()) as TriggerResponse;
  const collectionId = triggerJson.collection_id || triggerJson.snapshot_id || triggerJson.response_id;
  if (!collectionId) {
    throw new Error(`No collection_id in trigger response for ${collector.vendor}: ${JSON.stringify(triggerJson)}`);
  }

  // 2. Poll for results
  const startedAt = Date.now();
  let lastSeenData: Dataset | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);

    const datasetUrl = `${BRIGHTDATA_BASE}/dca/dataset?id=${encodeURIComponent(collectionId)}`;
    let datasetRes;
    try {
      datasetRes = await request(datasetUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey()}` },
      });
    } catch (err) {
      console.warn(`  ⚠️  Poll error for ${collector.vendor}: ${(err as Error).message}`);
      continue;
    }

    if (datasetRes.statusCode === 202) {
      // Still processing
      continue;
    }

    if ([502, 503, 504].includes(datasetRes.statusCode)) {
      // Transient gateway error — the job is usually still running.
      await datasetRes.body.dump();
      console.warn(`  ⚠️  ${collector.vendor}: dataset HTTP ${datasetRes.statusCode} (transient), retrying...`);
      continue;
    }

    if (datasetRes.statusCode >= 400) {
      const body = await datasetRes.body.text();
      throw new Error(`Dataset fetch failed for ${collector.vendor} (HTTP ${datasetRes.statusCode}): ${body}`);
    }

    // Parse. Ready payloads can be a bare array or wrapped ({"entries": [...]}).
    const text = await datasetRes.body.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Sometimes it's not JSON during polling; skip.
      continue;
    }

    const unwrapped = unwrapDataset(parsed);
    if (unwrapped !== null) {
      lastSeenData = unwrapped;

      // Save raw output for debugging
      if (saveRaw) {
        saveRawOutput(collector.vendor, parsed);
      }
      return unwrapped;
    }

    // Still processing. Keep polling.
    continue;
  }

  if (lastSeenData) {
    // We got data but timed out before confirming; use it.
    if (saveRaw) saveRawOutput(collector.vendor, lastSeenData);
    return lastSeenData;
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for ${collector.vendor} (collection_id=${collectionId})`);
}

/** Save raw output to ./raw/<vendor>-<timestamp>.json for debugging. */
function saveRawOutput(vendor: string, data: unknown): void {
  if (!existsSync('./raw')) mkdirSync('./raw', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = join('./raw', `${vendor}-${ts}.json`);
  try {
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch (err) {
    // Best-effort. Don't fail the run.
    console.warn(`  ⚠️  Could not save raw output: ${(err as Error).message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * The dataset endpoint returns different shapes depending on state:
 *   - bare JSON array when ready (some collectors)
 *   - {"entries": [...]} / {"results": [...]} / {"data": [...]} when ready
 *   - {"status": "building|pending|...", ...} while processing
 * Normalize all of these to an array (or null = keep waiting).
 */
export function unwrapDataset(parsed: unknown): Dataset | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['entries', 'results', 'data', 'items', 'rows', 'changelog_entries']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
  }
  return null;
}

/** Load collectors from collectors.json. Filter by VENDOR_FILTER env if set. */
export async function loadCollectors(): Promise<Collector[]> {
  const fs = await import('node:fs/promises');
  const raw = await fs.readFile('./collectors.json', 'utf-8');
  const parsed = JSON.parse(raw) as { collectors: Collector[] };
  let collectors = parsed.collectors.filter(c => c.enabled !== false);

  // Skip placeholders
  collectors = collectors.filter(c => c.collector_id && !c.collector_id.includes('REPLACE_ME'));

  // Apply vendor filter if set
  const filter = process.env.VENDOR_FILTER;
  if (filter) {
    const allow = new Set(filter.split(',').map(s => s.trim()));
    collectors = collectors.filter(c => allow.has(c.vendor));
  }

  return collectors;
}

/**
 * Heal a broken collector via POST /dca/collectors/{id}/refactor_template.
 * Body: {"prompt": "<what broke>", "custom_input": []} (prompt max 1000 chars).
 *
 * Outcomes:
 *  - submitted: new self-healing job queued (returns its id)
 *  - inflight:  HTTP 409 — a previous heal job is still running server-side;
 *               the caller should adopt it (poll progress, approve, re-run)
 *  - failed:    the API rejected the request (error carries the reason)
 */
export type HealSubmitResult =
  | { status: 'submitted'; id: string }
  | { status: 'inflight' }
  | { status: 'failed'; error: string };

export async function healCollector(
  collectorId: string,
  prompt: string,
): Promise<HealSubmitResult> {
  const healUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`;
  try {
    const res = await request(healUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: prompt.slice(0, 1000), custom_input: [] }),
    });

    if (res.statusCode === 409) {
      await res.body.dump();
      return { status: 'inflight' };
    }

    if (res.statusCode >= 400) {
      const body = await res.body.text();
      return { status: 'failed', error: `Heal API HTTP ${res.statusCode}: ${body.slice(0, 200)}` };
    }

    const json = (await res.body.json().catch(() => ({}))) as { id?: string; interaction_id?: string; job_id?: string };
    const id = json.id || json.interaction_id || json.job_id || 'heal-submitted';
    return { status: 'submitted', id };
  } catch (err) {
    return { status: 'failed', error: `Heal request error: ${(err as Error).message}` };
  }
}

/**
 * Wait for a self-healing job to reach its approval gate.
 *
 * Polls GET /dca/collectors/{id}/refactor_template/progress until the job
 * reports status "pending_answer" (step "user_approval") — the point where
 * the proposed template diff is ready to be approved — or a terminal state.
 *
 * Returns 'approve' when the gate is reached, 'done' when the job finished
 * without needing approval, 'failed' on a terminal error, and 'timeout' if
 * the job never reported a gate within the window.
 */
export async function waitForHealApproval(
  collectorId: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<'approve' | 'done' | 'failed' | 'timeout'> {
  const { pollIntervalMs = 5000, timeoutMs = 300_000 } = opts;
  const progressUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template/progress`;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);
    try {
      const res = await request(progressUrl, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey()}` },
      });
      if (res.statusCode === 404) {
        await res.body.dump();
        // No progress endpoint / no active job — nothing to wait for.
        return 'done';
      }
      if (res.statusCode >= 400) {
        await res.body.dump();
        continue; // transient error — keep polling
      }
      const json = (await res.body.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) continue;

      const status = String(json.status ?? '').toLowerCase();
      const step = String(json.step ?? '').toLowerCase();

      if (status === 'pending_answer' || step === 'user_approval' || status === 'awaiting_approval') {
        return 'approve';
      }
      if (['done', 'completed', 'success', 'finished'].includes(status)) {
        return 'done';
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        return 'failed';
      }
      // Anything else (running/building/...) — keep polling.
    } catch {
      // Transient network error — keep polling until timeout.
    }
  }
  return 'timeout';
}

/**
 * Approve a pending self-healing job via
 * POST /dca/collectors/{id}/resume_automation_job
 * with {"message": true, "auto_save": true} — the API equivalent of
 * `bdata scraper approve`.
 */
export async function approveHeal(collectorId: string): Promise<boolean> {
  const approveUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/resume_automation_job`;
  try {
    const res = await request(approveUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: true, auto_save: true }),
    });

    if (res.statusCode >= 400) {
      const body = await res.body.text();
      console.error(`  ❌ Approve failed for ${collectorId} (HTTP ${res.statusCode}): ${body.slice(0, 200)}`);
      return false;
    }
    await res.body.dump();
    return true;
  } catch (err) {
    console.error(`  ❌ Approve error for ${collectorId}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Queue AI template generation for a collector whose template is missing or
 * was never finished (trigger fails with "Collector does not have a template").
 * POST /dca/collectors/{id}/automate_template with {"urls": [url]}.
 * Generation runs server-side (5–15 min); poll by triggering the collector.
 */
export async function generateTemplate(collectorId: string, url: string): Promise<boolean> {
  const genUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/automate_template`;
  // Max 3 concurrent generations per account — back off on 429 until a slot frees.
  const MAX_ATTEMPTS = 5;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const res = await request(genUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ urls: [url] }),
      });

      if (res.statusCode === 429) {
        await res.body.dump();
        if (attempt === MAX_ATTEMPTS) break;
        console.log(`(429, attempt ${attempt}/${MAX_ATTEMPTS}, waiting 60s for a generation slot)`);
        await sleep(60_000);
        continue;
      }

      if (res.statusCode >= 400) {
        const body = await res.body.text();
        console.error(`  ❌ Template generation failed for ${collectorId} (HTTP ${res.statusCode}): ${body.slice(0, 200)}`);
        return false;
      }
      await res.body.dump();
      return true;
    }
    console.error(`  ❌ Template generation still rate-limited after ${MAX_ATTEMPTS} attempts for ${collectorId}`);
    return false;
  } catch (err) {
    console.error(`  ❌ Template generation error for ${collectorId}: ${(err as Error).message}`);
    return false;
  }
}
