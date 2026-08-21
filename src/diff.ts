/**
 * diff.ts — Week-over-week comparison.
 *
 * The "what changed since last week" engine.
 *
 * Strategy:
 *   1. Look at all changes with date in [today - windowDays, today]
 *   2. Look at all changes with date in [today - 2*windowDays, today - windowDays]
 *   3. The diff = current window rows that have an id NOT in the prior window
 *
 * Idempotent thanks to the stable `id` (sha256 of vendor+url).
 */
import type { Change, DiffResult } from './types.js';
import { getChangesBetween } from './db.js';
import type Database from 'better-sqlite3';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Compute the diff: which changes appeared in the current window but not
 * in the prior window of the same length?
 */
export function computeDiff(
  db: Database.Database,
  windowDays: number = 7,
): DiffResult[] {
  const today = new Date();
  const windowStart = addDays(today, -windowDays);
  const priorStart = addDays(today, -2 * windowDays);

  const currentRows = getChangesBetween(db, isoDate(windowStart), isoDate(today));
  const priorRows = getChangesBetween(db, isoDate(priorStart), isoDate(addDays(windowStart, -1)));

  const priorIds = new Set(priorRows.map(r => r.id));

  // Group current rows by vendor
  const byVendor = new Map<string, Change[]>();
  for (const c of currentRows) {
    if (!priorIds.has(c.id)) {
      if (!byVendor.has(c.vendor)) byVendor.set(c.vendor, []);
      byVendor.get(c.vendor)!.push(c);
    }
  }

  const results: DiffResult[] = [];
  for (const [vendor, changes] of byVendor.entries()) {
    const display = changes[0]?.vendor_display || vendor;
    results.push({
      vendor,
      vendor_display: display,
      new_changes: changes.sort((a, b) => b.date.localeCompare(a.date)),
      window_start: isoDate(windowStart),
      window_end: isoDate(today),
    });
  }

  return results.sort((a, b) => b.new_changes.length - a.new_changes.length);
}

/** Flatten a DiffResult[] into a single Change[]. */
export function flattenDiff(diff: DiffResult[]): Change[] {
  const out: Change[] = [];
  for (const d of diff) out.push(...d.new_changes);
  return out;
}

/** Pretty-print a diff for console output. */
export function printDiff(diff: DiffResult[]): void {
  if (diff.length === 0) {
    console.log('  (no new changes in the window)');
    return;
  }
  for (const d of diff) {
    const breaking = d.new_changes.filter(c => c.is_breaking).length;
    const breakingStr = breaking > 0 ? ` (🚨 ${breaking} breaking)` : '';
    console.log(`  • ${d.vendor_display}: ${d.new_changes.length} new change(s)${breakingStr}`);
    for (const c of d.new_changes.slice(0, 5)) {
      const icon = c.is_breaking ? '🚨' : '  ';
      console.log(`    ${icon} [${c.date}] ${c.change_type.padEnd(11)} ${c.title.slice(0, 80)}`);
    }
    if (d.new_changes.length > 5) {
      console.log(`    ... and ${d.new_changes.length - 5} more`);
    }
  }
}
