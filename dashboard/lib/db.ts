/**
 * dashboard/lib/db.ts — read-only access to the ModelPulse SQLite DB.
 *
 * This is a separate instance from src/db.ts so the dashboard and the
 * scraper can run independently. They share the same .db file.
 */
import Database from "better-sqlite3";
import { readFileSync, existsSync, copyFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import type { Change } from "./types";

/**
 * Candidate DB locations, in preference order:
 *  1. DATABASE_PATH env (explicit override)
 *  2. ../data/modelpulse.db — local dev from dashboard/ (the live DB the scraper writes)
 *  3. ./data/modelpulse.db  — Vercel deploys (DB committed inside dashboard/)
 *  4. $LAMBDA_TASK_ROOT/data/modelpulse.db — AWS-style serverless layouts
 */
function dbCandidates(): string[] {
  return [
    process.env.DATABASE_PATH,
    join(process.cwd(), "..", "data", "modelpulse.db"),
    join(process.cwd(), "data", "modelpulse.db"),
    process.env.LAMBDA_TASK_ROOT ? join(process.env.LAMBDA_TASK_ROOT, "data", "modelpulse.db") : null,
  ].filter((p): p is string => Boolean(p));
}

/**
 * Open a database and PROVE it works by running a real query. Opening a
 * WAL-mode database readonly on a read-only filesystem succeeds — the
 * failure only surfaces on the first query, when SQLite cannot initialize
 * the WAL shared-memory. Without this validation the broken handle wins
 * and every read silently returns empty.
 */
function tryOpen(path: string, readonly: boolean): Database.Database | null {
  let db: Database.Database | null = null;
  try {
    db = new Database(path, readonly ? { readonly: true } : undefined);
    db.prepare("SELECT count(*) FROM sqlite_schema").get();
    return db;
  } catch {
    try {
      db?.close();
    } catch {
      /* handle already released */
    }
    return null;
  }
}

/**
 * Open the first candidate that actually works — validated by a query:
 *  1. readonly open (works for rollback-journal files anywhere)
 *  2. copy the bytes to /tmp (the writable location in a lambda) and open
 *     the copy read-write — works for WAL files and permission quirks
 */
function openDb(): Database.Database {
  for (const p of dbCandidates()) {
    if (!existsSync(p)) continue;
    const ro = tryOpen(p, true);
    if (ro) return ro;
    try {
      const st = statSync(p);
      const tmp = join(tmpdir(), `modelpulse-${st.size}-${Math.round(st.mtimeMs)}.db`);
      copyFileSync(p, tmp);
      const rw = tryOpen(tmp, false);
      if (rw) return rw;
    } catch {
      // this candidate is unusable — try the next one
    }
  }
  // Nothing opened; return a handle to the preferred path so callers'
  // try/catch keeps rendering empty states instead of crashing pages.
  const fallback = dbCandidates()[0];
  return new Database(fallback, { readonly: true, fileMustExist: false });
}

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  _db = openDb();
  return _db;
}

function mapRow(r: any): Change {
  return {
    id: r.id,
    vendor: r.vendor,
    vendor_display: r.vendor_display,
    title: r.title,
    version: r.version,
    date: r.date,
    change_type: r.change_type,
    description: r.description,
    url: r.url,
    is_breaking: r.is_breaking === 1,
    raw: null,
    impact: typeof r.impact === "number" ? r.impact : undefined,
    updated_at: r.updated_at ?? null,
  };
}

const COLS = `id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, impact, updated_at`;

export function getLatestChanges(limit = 50): Change[] {
  const rows = db()
    .prepare(
      `SELECT ${COLS} FROM changes ORDER BY date DESC, vendor ASC LIMIT ?`
    )
    .all(limit) as any[];
  return rows.map(mapRow);
}

export function getChangesForVendor(vendor: string, limit = 200): Change[] {
  const rows = db()
    .prepare(
      `SELECT ${COLS} FROM changes WHERE vendor = ? ORDER BY date DESC LIMIT ?`
    )
    .all(vendor, limit) as any[];
  return rows.map(mapRow);
}

export function getStats() {
  const d = db();
  const total = (d.prepare(`SELECT COUNT(*) AS c FROM changes`).get() as any).c;
  const breaking = (d.prepare(`SELECT COUNT(*) AS c FROM changes WHERE is_breaking = 1`).get() as any).c;
  const vendors = (d.prepare(`SELECT COUNT(DISTINCT vendor) AS c FROM changes`).get() as any).c;

  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const thisWeek = (d.prepare(`SELECT COUNT(*) AS c FROM changes WHERE date >= ?`).get(weekAgo) as any).c;
  const lastWeek = (d.prepare(`SELECT COUNT(*) AS c FROM changes WHERE date >= ? AND date < ?`).get(twoWeeksAgo, weekAgo) as any).c;

  const byVendor = d.prepare(`
    SELECT vendor, vendor_display, COUNT(*) AS count, SUM(is_breaking) AS breaking,
           CAST(AVG(COALESCE(impact, 0)) AS INTEGER) AS avg_impact
    FROM changes GROUP BY vendor ORDER BY count DESC
  `).all() as any[];

  return { total_changes: total, total_breaking: breaking, vendors_active: vendors, by_vendor: byVendor, this_week_count: thisWeek, last_week_count: lastWeek };
}

export interface WatchRow {
  id: number;
  keyword: string;
}

export function getWatches(): WatchRow[] {
  try {
    return db().prepare(`SELECT id, keyword FROM watches ORDER BY id ASC`).all() as WatchRow[];
  } catch {
    return [];
  }
}

/* ── Collector health + heal history (for /health) ────────────────── */

export interface CollectorHealthRow {
  vendor: string;
  vendor_display: string;
  collector_id: string;
  last_run_status: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  total_runs: number;
  success_runs: number;
  total_heals: number;
  successful_heals: number;
}

export interface HealRow {
  id: number;
  vendor: string;
  collector_id: string;
  trigger_reason: string;
  status: string;
  interaction_id: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
}

/**
 * Per-vendor health summary. Built from the collectors in collectors.json
 * joined against run/heal history, so vendors that never ran still show up
 * as UNKNOWN rather than silently missing.
 */
export function getCollectorHealth(): CollectorHealthRow[] {
  const d = db();

  let declared: Array<{ vendor: string; vendor_display: string; collector_id: string; enabled: boolean }> = [];
  // Try a few plausible locations for collectors.json (dev server, CI, deploy).
  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    candidates.push(join(here, "..", "..", "..", "collectors.json"));
  } catch {
    // import.meta unavailable (CJS bundle) — cwd paths below still apply.
  }
  candidates.push(join(process.cwd(), "..", "collectors.json"), join(process.cwd(), "collectors.json"));
  for (const p of candidates) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf-8"));
      if (Array.isArray(raw.collectors)) {
        declared = raw.collectors;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  const runStats = d.prepare(`
    SELECT vendor,
           COUNT(*) AS total_runs,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_runs,
           (SELECT status FROM runs r2 WHERE r2.vendor = r1.vendor ORDER BY id DESC LIMIT 1) AS last_run_status,
           (SELECT started_at FROM runs r2 WHERE r2.vendor = r1.vendor ORDER BY id DESC LIMIT 1) AS last_run_at,
           (SELECT started_at FROM runs r2 WHERE r2.vendor = r1.vendor AND status = 'success' ORDER BY id DESC LIMIT 1) AS last_success_at
    FROM runs r1
    GROUP BY vendor
  `).all() as any[];

  const healStats = d.prepare(`
    SELECT vendor,
           COUNT(*) AS total_heals,
           SUM(CASE WHEN status IN ('healed', 'approved') THEN 1 ELSE 0 END) AS successful_heals
    FROM heals
    GROUP BY vendor
  `).all() as any[];

  const runBy = new Map(runStats.map((r: any) => [r.vendor, r]));
  const healBy = new Map(healStats.map((h: any) => [h.vendor, h]));

  const rows: CollectorHealthRow[] = (declared.length
    ? declared.map((c: any) => ({
        vendor: c.vendor,
        vendor_display: c.vendor_display,
        collector_id: c.collector_id,
      }))
    : // Fallback when collectors.json isn't readable: derive from run history.
      (d
        .prepare(
          `SELECT DISTINCT vendor, MAX(collector_id) AS collector_id FROM runs GROUP BY vendor ORDER BY vendor`
        )
        .all() as any[]).map((r: any) => ({
        vendor: r.vendor,
        vendor_display: r.vendor,
        collector_id: r.collector_id,
      }))
  ).map((c: any) => {
    const r = runBy.get(c.vendor) || {} as any;
    const h = healBy.get(c.vendor) || {} as any;
    return {
      vendor: c.vendor,
      vendor_display: c.vendor_display,
      collector_id: c.collector_id,
      last_run_status: r.last_run_status ?? null,
      last_run_at: r.last_run_at ?? null,
      last_success_at: r.last_success_at ?? null,
      total_runs: r.total_runs ?? 0,
      success_runs: r.success_runs ?? 0,
      successful_heals: h.successful_heals ?? 0,
      total_heals: h.total_heals ?? 0,
    };
  });

  return rows;
}

export function getHeals(limit = 25): HealRow[] {
  try {
    return db()
      .prepare(
        `SELECT id, vendor, collector_id, trigger_reason, status, interaction_id, started_at, finished_at, error
         FROM heals ORDER BY started_at DESC LIMIT ?`
      )
      .all(limit) as HealRow[];
  } catch {
    return [];
  }
}
