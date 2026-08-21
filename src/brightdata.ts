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
    for (const key of ['entries', 'results', 'data', 'items', 'rows']) {
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
 * Returns the interaction_id on success, or null if the API call fails.
 */
export async function healCollector(
  collectorId: string,
  description: string,
): Promise<string | null> {
  const healUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/refactor_template`;
  try {
    const res = await request(healUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description }),
    });

    if (res.statusCode >= 400) {
      const body = await res.body.text();
      console.error(`  ❌ Heal API failed for ${collectorId} (HTTP ${res.statusCode}): ${body.slice(0, 200)}`);
      return null;
    }

    const json = (await res.body.json()) as { id?: string; interaction_id?: string };
    return json.id || json.interaction_id || 'heal-submitted';
  } catch (err) {
    console.error(`  ❌ Heal request error for ${collectorId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Wait for a heal (template refactor) to finish before approving.
 *
 * Polls GET /dca/collectors/{id} until the collector reports an idle/ready
 * state rather than a running/pending one. The API shape varies, so this is
 * defensive: unknown shapes are treated as ready after a minimum settle
 * delay, and the function never throws — worst case it returns false and the
 * caller approves anyway (matching the previous behavior).
 */
export async function waitForHealReady(
  collectorId: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<boolean> {
  const { pollIntervalMs = 5000, timeoutMs = 180_000 } = opts;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollIntervalMs);
    try {
      const res = await request(`${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey()}` },
      });
      if (res.statusCode >= 400) {
        await res.body.dump();
        // Endpoint not available for this account/shape — fall back to settle delay.
        await sleep(Math.max(0, 15_000 - (Date.now() - startedAt)));
        return true;
      }
      const json = (await res.body.json()) as Record<string, unknown>;
      const state = json.collector_status ?? json.status ?? json.state;
      if (typeof state === 'string') {
        const s = state.toLowerCase();
        if (['running', 'pending', 'building', 'processing', 'refactoring', 'drafting'].some(x => s.includes(x))) {
          continue; // still working — keep polling
        }
        if (['ready', 'idle', 'complete', 'completed', 'approved', 'active', 'draft'].some(x => s.includes(x))) {
          return true;
        }
      }
      // Got a payload but no recognizable state — settle briefly and accept.
      await sleep(pollIntervalMs);
      return true;
    } catch {
      // Transient network error — keep polling until timeout.
    }
  }
  return false; // timed out; caller decides whether to approve anyway
}

/**
 * Approve a pending heal via POST /dca/collectors/{id}/approve.
 * Returns true on success.
 */
export async function approveHeal(collectorId: string): Promise<boolean> {
  const approveUrl = `${BRIGHTDATA_BASE}/dca/collectors/${encodeURIComponent(collectorId)}/approve`;
  try {
    const res = await request(approveUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
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
