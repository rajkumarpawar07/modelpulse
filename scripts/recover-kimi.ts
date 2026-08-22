/**
 * recover-kimi.ts — one-off: re-harvest kimi's lost 22-row dataset directly,
 * re-run the health repairs, and requeue the still-building trio.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { request } from 'undici';
import { getDb, closeDb, upsertChanges } from '../src/db.js';
import { normalizeDataset } from '../src/normalize.js';
import { parseMaybeNdjson } from '../src/brightdata.js';
import type { Collector } from '../src/types.js';

const key = readFileSync('.env', 'utf8').match(/BRIGHT_DATA_API_KEY=(.+)/)![1].trim();
const collectors = JSON.parse(readFileSync('collectors.json', 'utf8')).collectors as Collector[];
const db = getDb('./data/modelpulse.db');

// 1. Re-harvest kimi
const res = await request('https://api.brightdata.com/dca/dataset?id=j_mt4e6tk61hkginnxxj', {
  headers: { Authorization: `Bearer ${key}` },
});
const text = await res.body.text();
const parsed = parseMaybeNdjson(text);
if (parsed === null) throw new Error('kimi dataset unparseable');
const rows = (Array.isArray(parsed) ? parsed : Object.values(parsed as object).find(Array.isArray) || []) as Record<string, unknown>[];
const kimi = collectors.find(c => c.vendor === 'kimi')!;
const changes = normalizeDataset(rows, kimi);
const before = db.prepare("SELECT COUNT(*) c FROM changes WHERE vendor='kimi'").get() as { c: number };
const up = upsertChanges(db, changes);
const after = db.prepare("SELECT COUNT(*) c FROM changes WHERE vendor='kimi'").get() as { c: number };
console.log(`kimi: ${before.c} → ${after.c} rows (harvested ${changes.length}, ${up.inserted} new)`);

// 2. Requeue the still-building trio
const pending = {
  groq: { collection_id: 'j_mt4ksdz41zv6mi7bf1', queued_at: Date.now() },
  together: { collection_id: 'j_mt4kseoysgq85af0v', queued_at: Date.now() },
  huggingface: { collection_id: 'j_mt4ksf0l1aozfkdc79', queued_at: Date.now() },
};
writeFileSync('data/pending-jobs.json', JSON.stringify(pending, null, 2) + '\n');
console.log('pending requeued:', Object.keys(pending).join(', '));

// 3. Repairs: gemini titles + heal prune (idempotent)
const gemini = collectors.find(c => c.vendor === 'google_gemini')!;
const gRows = db.prepare("SELECT raw FROM changes WHERE vendor='google_gemini'").all() as { raw: string }[];
const gChanges = normalizeDataset(gRows.map(r => JSON.parse(r.raw)), gemini);
db.prepare("DELETE FROM changes WHERE vendor='google_gemini'").run();
const gRes = upsertChanges(db, gChanges as any);
console.log(`gemini re-normalized: ${gChanges.length} rows (${gRes.inserted} inserted) | sample:`, (gChanges[0] as any)?.title?.slice(0, 60));

const liveIds = collectors.map(c => c.collector_id);
db.prepare(`DELETE FROM heals WHERE collector_id NOT IN (${liveIds.map(() => '?').join(',')})`).run(...liveIds);
db.prepare(
  `DELETE FROM heals WHERE error LIKE '%Heal API returned null%'
   OR error LIKE '%Heal API HTTP 404%' OR error LIKE '%Collector not found%'
   OR trigger_reason LIKE '%missing titles%'`,
).run();
console.log('heals remaining:', JSON.stringify(db.prepare('SELECT status, COUNT(*) c FROM heals GROUP BY status').all()));
console.log('total changes:', (db.prepare('SELECT COUNT(*) c FROM changes').get() as { c: number }).c);
closeDb();
