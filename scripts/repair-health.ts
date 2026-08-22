/**
 * repair-health.ts — one-off: re-normalize gemini rows from stored raw
 * payloads (title fix) and prune obsolete heal records.
 */
import { readFileSync } from 'node:fs';
import { getDb, closeDb, upsertChanges } from '../src/db.js';
import { normalizeRow } from '../src/normalize.js';
import type { Collector } from '../src/types.js';

const db = getDb('./data/modelpulse.db');
const collectors = JSON.parse(readFileSync('collectors.json', 'utf8')).collectors as Collector[];
const gemini = collectors.find(c => c.vendor === 'google_gemini')!;

const rows = db.prepare("SELECT raw FROM changes WHERE vendor='google_gemini'").all() as { raw: string }[];
const changes = [];
for (const r of rows) {
  try {
    const c = normalizeRow(JSON.parse(r.raw), gemini);
    if (c) changes.push(c);
  } catch {
    /* skip malformed */
  }
}
db.prepare("DELETE FROM changes WHERE vendor='google_gemini'").run();
const res = upsertChanges(db, changes);
console.log('gemini re-normalized:', changes.length, 'rows |', res.inserted, 'inserted');
console.log('sample title:', changes[0]?.title.slice(0, 70));

const liveIds = collectors.map(c => c.collector_id);
const p1 = db
  .prepare(`DELETE FROM heals WHERE collector_id NOT IN (${liveIds.map(() => '?').join(',')})`)
  .run(...liveIds);
const p2 = db
  .prepare(
    `DELETE FROM heals WHERE error LIKE '%Heal API returned null%'
     OR error LIKE '%Heal API HTTP 404%'
     OR error LIKE '%Collector not found%'
     OR trigger_reason LIKE '%missing titles%'`,
  )
  .run();
console.log('heals pruned:', p1.changes + p2.changes);
console.log('heals remaining:', JSON.stringify(db.prepare('SELECT status, COUNT(*) c FROM heals GROUP BY status').all()));
closeDb();
