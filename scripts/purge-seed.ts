import Database from 'better-sqlite3';

const db = new Database('./data/modelpulse.db');
const before = (db.prepare('SELECT COUNT(*) c FROM changes').get() as any).c;
const del = db
  .prepare(`DELETE FROM changes WHERE description LIKE 'Auto-generated seed entry%'`)
  .run();
const after = (db.prepare('SELECT COUNT(*) c FROM changes').get() as any).c;
console.log(`before: ${before} | deleted seed rows: ${del.changes} | remaining: ${after}`);
db.close();
