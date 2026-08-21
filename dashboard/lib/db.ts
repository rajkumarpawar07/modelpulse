/**
 * dashboard/lib/db.ts — read-only access to the ModelPulse SQLite DB.
 *
 * This is a separate instance from src/db.ts so the dashboard and the
 * scraper can run independently. They share the same .db file.
 */
import Database from "better-sqlite3";
import { join } from "node:path";
import type { Change } from "../../src/types.js";

const DB_PATH = process.env.DATABASE_PATH || join(process.cwd(), "..", "data", "modelpulse.db");

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { readonly: true, fileMustExist: false });
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
