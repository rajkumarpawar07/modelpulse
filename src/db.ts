/**
 * db.ts — SQLite wrapper.
 *
 * Two tables:
 *   - changes: every normalized changelog entry, unique by id.
 *   - runs: one row per scrape run per collector.
 *
 * The diff engine queries "what's new in the last 7 days that's not in
 * the prior 7 days." The dashboard reads directly from here.
 *
 * Uses better-sqlite3 (synchronous, no callback hell, single-file DB).
 */
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Change, Run, Watch } from './types.js';
import { scoreImpact } from './impact.js';

let dbInstance: Database.Database | null = null;

/** Add a column to a table if it does not exist yet (lightweight migration). */
function ensureColumn(db: Database.Database, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}

export function getDb(dbPath: string = process.env.DATABASE_PATH || './data/modelpulse.db'): Database.Database {
  if (dbInstance) return dbInstance;

  // Ensure parent directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // Pragmas for performance + safety
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS changes (
      id              TEXT PRIMARY KEY,
      vendor          TEXT NOT NULL,
      vendor_display  TEXT NOT NULL,
      title           TEXT NOT NULL,
      version         TEXT,
      date            TEXT NOT NULL,
      change_type     TEXT NOT NULL,
      description     TEXT,
      url             TEXT,
      is_breaking     INTEGER NOT NULL DEFAULT 0,
      raw             TEXT,
      first_seen_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_changes_vendor ON changes(vendor);
    CREATE INDEX IF NOT EXISTS idx_changes_date   ON changes(date);
    CREATE INDEX IF NOT EXISTS idx_changes_breaking ON changes(is_breaking) WHERE is_breaking = 1;

    CREATE TABLE IF NOT EXISTS runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor          TEXT NOT NULL,
      collector_id    TEXT NOT NULL,
      started_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at     TEXT,
      status          TEXT NOT NULL DEFAULT 'running',
      rows            INTEGER NOT NULL DEFAULT 0,
      error           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_vendor ON runs(vendor);
    CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);

    CREATE TABLE IF NOT EXISTS change_diffs (
      change_id   TEXT NOT NULL,
      field       TEXT NOT NULL,
      old_value   TEXT,
      new_value   TEXT,
      detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_change_diffs_change ON change_diffs(change_id);

    CREATE TABLE IF NOT EXISTS watches (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword    TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(db, 'changes', 'impact', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'changes', 'updated_at', 'TEXT');

  dbInstance = db;
  return db;
}

/** Insert or ignore a change row (idempotent on id). */
export function upsertChange(db: Database.Database, c: Change): void {
  upsertChanges(db, [c]);
}

export interface UpsertSummary {
  inserted: number;
  updated: number;
  total: number;
}

/** Fields we track mutations for (structured diffing between scrapes). */
const TRACKED_FIELDS: Array<{ field: string; get: (c: Change) => string }> = [
  { field: 'title', get: c => c.title },
  { field: 'description', get: c => c.description ?? '' },
  { field: 'date', get: c => c.date },
  { field: 'change_type', get: c => c.change_type },
  { field: 'version', get: c => c.version ?? '' },
];

/**
 * Upsert a batch of changes.
 * - New ids are inserted (with impact score).
 * - Known ids are compared field-by-field; any mutation updates the row,
 *   bumps `updated_at`, and records the before/after into change_diffs.
 */
export function upsertChanges(db: Database.Database, changes: Change[]): UpsertSummary {
  if (changes.length === 0) return { inserted: 0, updated: 0, total: 0 };

  const selectStmt = db.prepare(`
    SELECT title, description, date, change_type, version, is_breaking
    FROM changes WHERE id = ?
  `);
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO changes
      (id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw, impact)
    VALUES
      (@id, @vendor, @vendor_display, @title, @version, @date, @change_type, @description, @url, @is_breaking, @raw, @impact)
  `);
  const updateStmt = db.prepare(`
    UPDATE changes SET
      vendor = @vendor, vendor_display = @vendor_display, title = @title, version = @version,
      date = @date, change_type = @change_type, description = @description, url = @url,
      is_breaking = @is_breaking, raw = @raw, impact = @impact, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const diffStmt = db.prepare(`
    INSERT INTO change_diffs (change_id, field, old_value, new_value) VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction((rows: Change[]) => {
    let inserted = 0;
    let updated = 0;
    for (const c of rows) {
      const impact = scoreImpact(c);
      const shared = {
        id: c.id,
        vendor: c.vendor,
        vendor_display: c.vendor_display,
        title: c.title,
        version: c.version,
        date: c.date,
        change_type: c.change_type,
        description: c.description ?? '',
        url: c.url,
        is_breaking: c.is_breaking ? 1 : 0,
        raw: JSON.stringify(c.raw ?? null),
        impact,
      };

      const existing = selectStmt.get(c.id) as
        | { title: string; description: string; date: string; change_type: string; version: string | null; is_breaking: number }
        | undefined;

      if (!existing) {
        const info = insertStmt.run(shared);
        if (info.changes > 0) inserted += 1;
        continue;
      }

      const diffs: Array<[string, string, string]> = [];
      for (const f of TRACKED_FIELDS) {
        const oldVal = String((existing as Record<string, unknown>)[f.field] ?? '');
        const newVal = f.get(c);
        if (oldVal !== newVal) diffs.push([f.field, oldVal, newVal]);
      }
      const oldBreaking = existing.is_breaking === 1;
      if (oldBreaking !== c.is_breaking) {
        diffs.push(['is_breaking', String(oldBreaking), String(c.is_breaking)]);
      }

      if (diffs.length > 0) {
        updateStmt.run(shared);
        for (const [field, oldVal, newVal] of diffs) {
          diffStmt.run(c.id, field, oldVal.slice(0, 4000), newVal.slice(0, 4000));
        }
        updated += 1;
      }
    }
    return { inserted, updated, total: rows.length };
  });

  return tx(changes);
}

/* ── Keyword watches ─────────────────────────────────────────────── */

export function addWatch(db: Database.Database, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return false;
  const info = db.prepare(`INSERT OR IGNORE INTO watches (keyword) VALUES (?)`).run(kw);
  return info.changes > 0;
}

export function removeWatch(db: Database.Database, keywordOrId: string): boolean {
  const trimmed = keywordOrId.trim();
  const asNum = Number(trimmed);
  const info =
    Number.isFinite(asNum) && String(asNum) === trimmed
      ? db.prepare(`DELETE FROM watches WHERE id = ?`).run(asNum)
      : db.prepare(`DELETE FROM watches WHERE keyword = ?`).run(trimmed.toLowerCase());
  return info.changes > 0;
}

export function listWatches(db: Database.Database): Watch[] {
  return db
    .prepare(`SELECT id, keyword, created_at FROM watches ORDER BY id ASC`)
    .all() as Watch[];
}

/** Record a scrape run. Returns the run id. */
export function startRun(db: Database.Database, vendor: string, collectorId: string): number {
  const info = db.prepare(`
    INSERT INTO runs (vendor, collector_id, status) VALUES (?, ?, 'running')
  `).run(vendor, collectorId);
  return Number(info.lastInsertRowid);
}

export function finishRun(db: Database.Database, runId: number, status: Run['status'], rows: number, error: string | null = null): void {
  db.prepare(`
    UPDATE runs SET finished_at = CURRENT_TIMESTAMP, status = ?, rows = ?, error = ?
    WHERE id = ?
  `).run(status, rows, error, runId);
}

/** Get changes since a given date (inclusive). */
export function getChangesSince(db: Database.Database, sinceDate: string): Change[] {
  const rows = db.prepare(`
    SELECT id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw
    FROM changes
    WHERE date >= ?
    ORDER BY date DESC, vendor ASC
  `).all(sinceDate) as Array<{
    id: string; vendor: string; vendor_display: string; title: string;
    version: string | null; date: string; change_type: string; description: string;
    url: string; is_breaking: number; raw: string;
  }>;
  return rows.map(r => ({
    id: r.id,
    vendor: r.vendor,
    vendor_display: r.vendor_display,
    title: r.title,
    version: r.version,
    date: r.date,
    change_type: r.change_type as Change['change_type'],
    description: r.description,
    url: r.url,
    is_breaking: r.is_breaking === 1,
    raw: r.raw ? JSON.parse(r.raw) : null,
  }));
}

/** Get changes between two dates (inclusive both). */
export function getChangesBetween(db: Database.Database, startDate: string, endDate: string): Change[] {
  const rows = db.prepare(`
    SELECT id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw
    FROM changes
    WHERE date BETWEEN ? AND ?
    ORDER BY date DESC, vendor ASC
  `).all(startDate, endDate) as Array<{
    id: string; vendor: string; vendor_display: string; title: string;
    version: string | null; date: string; change_type: string; description: string;
    url: string; is_breaking: number; raw: string;
  }>;
  return rows.map(r => ({
    id: r.id,
    vendor: r.vendor,
    vendor_display: r.vendor_display,
    title: r.title,
    version: r.version,
    date: r.date,
    change_type: r.change_type as Change['change_type'],
    description: r.description,
    url: r.url,
    is_breaking: r.is_breaking === 1,
    raw: r.raw ? JSON.parse(r.raw) : null,
  }));
}

/** Latest N changes across all vendors. */
export function getLatestChanges(db: Database.Database, limit: number = 50): Change[] {
  const rows = db.prepare(`
    SELECT id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw
    FROM changes
    ORDER BY date DESC, vendor ASC
    LIMIT ?
  `).all(limit) as Array<{
    id: string; vendor: string; vendor_display: string; title: string;
    version: string | null; date: string; change_type: string; description: string;
    url: string; is_breaking: number; raw: string;
  }>;
  return rows.map(r => ({
    id: r.id,
    vendor: r.vendor,
    vendor_display: r.vendor_display,
    title: r.title,
    version: r.version,
    date: r.date,
    change_type: r.change_type as Change['change_type'],
    description: r.description,
    url: r.url,
    is_breaking: r.is_breaking === 1,
    raw: r.raw ? JSON.parse(r.raw) : null,
  }));
}

/** Get changes for one vendor. */
export function getChangesForVendor(db: Database.Database, vendor: string, limit: number = 200): Change[] {
  const rows = db.prepare(`
    SELECT id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw
    FROM changes
    WHERE vendor = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(vendor, limit) as Array<{
    id: string; vendor: string; vendor_display: string; title: string;
    version: string | null; date: string; change_type: string; description: string;
    url: string; is_breaking: number; raw: string;
  }>;
  return rows.map(r => ({
    id: r.id,
    vendor: r.vendor,
    vendor_display: r.vendor_display,
    title: r.title,
    version: r.version,
    date: r.date,
    change_type: r.change_type as Change['change_type'],
    description: r.description,
    url: r.url,
    is_breaking: r.is_breaking === 1,
    raw: r.raw ? JSON.parse(r.raw) : null,
  }));
}

/** Stats for the /stats page. */
export function getStats(db: Database.Database): {
  total_changes: number;
  total_breaking: number;
  vendors_active: number;
  by_vendor: Array<{ vendor: string; vendor_display: string; count: number; breaking: number }>;
  this_week_count: number;
  last_week_count: number;
} {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM changes`).get() as { c: number }).c;
  const breaking = (db.prepare(`SELECT COUNT(*) AS c FROM changes WHERE is_breaking = 1`).get() as { c: number }).c;
  const vendors = (db.prepare(`SELECT COUNT(DISTINCT vendor) AS c FROM changes`).get() as { c: number }).c;

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const thisWeek = (db.prepare(`SELECT COUNT(*) AS c FROM changes WHERE date >= ?`).get(weekAgo) as { c: number }).c;
  const lastWeek = (db.prepare(`SELECT COUNT(*) AS c FROM changes WHERE date >= ? AND date < ?`).get(twoWeeksAgo, weekAgo) as { c: number }).c;

  const byVendor = db.prepare(`
    SELECT vendor, vendor_display,
           COUNT(*) AS count,
           SUM(is_breaking) AS breaking
    FROM changes
    GROUP BY vendor
    ORDER BY count DESC
  `).all() as Array<{ vendor: string; vendor_display: string; count: number; breaking: number }>;

  return {
    total_changes: total,
    total_breaking: breaking,
    vendors_active: vendors,
    by_vendor: byVendor,
    this_week_count: thisWeek,
    last_week_count: lastWeek,
  };
}

/** Close the database. (Called on process exit.) */
export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
