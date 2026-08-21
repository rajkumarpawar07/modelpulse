/**
 * create-collectors.ts — Create Scraper Studio collectors via the direct API.
 *
 * Usage:
 *   npx tsx scripts/create-collectors.ts              # create ALL placeholder ones
 *   npx tsx scripts/create-collectors.ts openai mistral  # only these vendors
 *
 * Reads collectors.json, replaces c_REPLACE_ME ids with real ones as they
 * come back, and saves the file after every success (crash-safe).
 */
import 'dotenv/config';
import { request } from 'undici';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://api.brightdata.com';

function key(): string {
  const k = process.env.BRIGHT_DATA_API_KEY;
  if (!k) throw new Error('BRIGHT_DATA_API_KEY not set');
  return k;
}

interface CollectorEntry {
  vendor: string;
  vendor_display: string;
  vendor_homepage: string;
  collector_id: string;
  url: string;
  tier: number;
  enabled: boolean;
  github_repo?: string;
}

interface CollectorFile {
  _comment?: string;
  _schema?: string;
  collectors: CollectorEntry[];
}

const PROMPTS: Record<string, string> = {
  openai:
    'Extract every changelog entry. For each entry: title, version, date (YYYY-MM-DD), change_type (one of: added, changed, deprecated, removed, fixed), description, url. Skip navigation, footer, hero sections, and any non-changelog content.',
  anthropic:
    'Extract every release-notes entry. For each entry: title, date (YYYY-MM-DD), version_or_model (e.g. claude-3-5-sonnet), change_type (added, changed, deprecated, removed, fixed), description, url. Skip nav, footer, and unrelated docs.',
};

function promptFor(entry: CollectorEntry): string {
  if (PROMPTS[entry.vendor]) return PROMPTS[entry.vendor];
  const label = entry.vendor_display;
  return [
    `Extract every changelog or release-notes entry from this ${label} documentation page.`,
    'For each entry return: title, date (YYYY-MM-DD), version if present,',
    'change_type (one of: added, changed, deprecated, removed, fixed), description, url.',
    'Skip navigation, footer, sidebars, hero sections, cookie banners, and any non-changelog content.',
  ].join(' ');
}

async function createCollector(entry: CollectorEntry): Promise<string> {
  // Step 1: create the collector shell
  const body = {
    name: `modelpulse-${entry.vendor}`,
    deliver: { type: 'api_pull' },
  };
  const res = await request(`${BASE}/dca/collector`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 500)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
  }
  const cid = json.collector_id || json.collector?.collector_id || json.id;
  if (!cid || typeof cid !== 'string' || !cid.startsWith('c_')) {
    throw new Error(`No collector_id in response: ${JSON.stringify(json).slice(0, 500)}`);
  }

  // Step 2: queue AI template generation (max 3 concurrent jobs account-wide —
  // retry on 429 with backoff until a slot frees up)
  const MAX_ATTEMPTS = 20;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const autoRes = await request(`${BASE}/dca/collectors/${cid}/automate_template`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ urls: [entry.url] }),
    });
    const autoText = await autoRes.body.text();
    if (autoRes.statusCode === 429) {
      process.stdout.write(`(429, attempt ${attempt}/${MAX_ATTEMPTS}, waiting 75s) `);
      await new Promise(r => setTimeout(r, 75_000));
      continue;
    }
    if (autoRes.statusCode >= 400) {
      throw new Error(`automate_template HTTP ${autoRes.statusCode}: ${autoText.slice(0, 300)} [shell=${cid}, logged to scripts/orphaned-collectors.log]`);
    }
    return cid;
  }
  throw new Error(`automate_template still rate-limited after ${MAX_ATTEMPTS} attempts [shell=${cid}]`);
}

async function main() {
  const only = process.argv.slice(2);
  const file: CollectorFile = JSON.parse(readFileSync('./collectors.json', 'utf-8'));
  const targets = file.collectors.filter(
    c =>
      c.collector_id.includes('REPLACE_ME') &&
      (only.length === 0 || only.includes(c.vendor)),
  );

  if (targets.length === 0) {
    console.log('No placeholder collectors found for the given filter. Nothing to do.');
    return;
  }

  console.log(`Creating ${targets.length} collector(s)...\n`);
  let ok = 0;
  let fail = 0;

  for (const entry of targets) {
    process.stdout.write(`▶ ${entry.vendor.padEnd(16)} ${entry.url}\n  ... `);
    try {
      const cid = await createCollector(entry);
      entry.collector_id = cid;
      writeFileSync('./collectors.json', JSON.stringify(file, null, 2) + '\n');
      console.log(`✅ ${cid}`);
      ok += 1;
    } catch (err) {
      console.log(`❌ ${(err as Error).message}`);
      fail += 1;
    }
  }

  console.log(`\nDone. ${ok} created, ${fail} failed. collectors.json updated.`);
  if (fail > 0) process.exitCode = 1;
}

main();
