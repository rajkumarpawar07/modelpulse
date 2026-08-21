/**
 * db.test.ts — Tests for the SQLite layer.
 *
 * Covers: idempotent upserts, field-level mutation detection (the silent-edit
 * diffing in change_diffs), the consecutive-failure counter used by the
 * auto-heal circuit breaker, and first_seen_at-based week stats.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getDb,
  closeDb,
  upsertChanges,
  getChangesForVendor,
  startRun,
  finishRun,
  getConsecutiveFailures,
  getStats,
} from '../db.js';
import type { Change } from '../types.js';

let dbDir: string;

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: 'test-id-1',
    vendor: 'test',
    vendor_display: 'Test',
    title: 'Some change',
    version: null,
    date: '2026-08-15',
    change_type: 'changed',
    description: 'A generic description.',
    url: 'https://example.com/entry',
    is_breaking: false,
    raw: null,
    ...overrides,
  };
}

beforeAll(() => {
  dbDir = mkdtempSync(join(tmpdir(), 'modelpulse-test-'));
  getDb(join(dbDir, 'test.db'));
});

afterAll(() => {
  closeDb();
  rmSync(dbDir, { recursive: true, force: true });
});

describe('upsertChanges', () => {
  it('inserts new rows and is idempotent on re-scrape', () => {
    const db = getDb();
    const res1 = upsertChanges(db, [makeChange()]);
    expect(res1).toMatchObject({ inserted: 1, updated: 0, total: 1 });

    // Same content re-scraped: no insert, no mutation recorded.
    const res2 = upsertChanges(db, [makeChange()]);
    expect(res2).toMatchObject({ inserted: 0, updated: 0, total: 1 });
  });

  it('detects silent edits field-by-field and records them in change_diffs', () => {
    const db = getDb();

    // Vendor edits the description and re-tags the type after publication.
    const mutated = makeChange({
      description: 'An EDITED description with more detail.',
      change_type: 'deprecated',
      is_breaking: true,
    });
    const res = upsertChanges(db, [mutated]);
    expect(res).toMatchObject({ inserted: 0, updated: 1 });

    const diffs = db
      .prepare(`SELECT field, old_value, new_value FROM change_diffs WHERE change_id = ? ORDER BY field`)
      .all('test-id-1') as Array<{ field: string; old_value: string; new_value: string }>;

    const fields = diffs.map(d => d.field);
    expect(fields).toContain('description');
    expect(fields).toContain('change_type');
    expect(fields).toContain('is_breaking');
    const desc = diffs.find(d => d.field === 'description')!;
    expect(desc.old_value).toBe('A generic description.');
    expect(desc.new_value).toContain('EDITED');

    // The row itself reflects the edit.
    const [row] = getChangesForVendor(db, 'test');
    expect(row.change_type).toBe('deprecated');
    expect(row.is_breaking).toBe(true);
  });

  it('does not record a diff for the same edit twice', () => {
    const db = getDb();
    const before = (db.prepare(`SELECT COUNT(*) AS c FROM change_diffs`).get() as { c: number }).c;
    upsertChanges(db, [makeChange({ description: 'An EDITED description with more detail.', change_type: 'deprecated', is_breaking: true })]);
    const after = (db.prepare(`SELECT COUNT(*) AS c FROM change_diffs`).get() as { c: number }).c;
    expect(after).toBe(before);
  });
});

describe('getConsecutiveFailures (heal circuit breaker)', () => {
  it('counts trailing failures and resets on success', () => {
    const db = getDb();
    const vendor = 'breaker';

    const r1 = startRun(db, vendor, 'c_breaker');
    finishRun(db, r1, 'failed', 0, 'boom');
    const r2 = startRun(db, vendor, 'c_breaker');
    finishRun(db, r2, 'failed', 0, 'boom');
    expect(getConsecutiveFailures(db, vendor)).toBe(2);

    const r3 = startRun(db, vendor, 'c_breaker');
    finishRun(db, r3, 'success', 10);
    expect(getConsecutiveFailures(db, vendor)).toBe(0);

    // A failure after success counts as 1, not 3.
    const r4 = startRun(db, vendor, 'c_breaker');
    finishRun(db, r4, 'failed', 0, 'boom');
    expect(getConsecutiveFailures(db, vendor)).toBe(1);
  });
});

describe('getStats', () => {
  it('counts week-over-week on first_seen_at, not publication date', () => {
    const db = getDb();
    // First seen today, but published months ago — must land in THIS week.
    upsertChanges(db, [makeChange({
      id: 'old-pub-new-capture',
      date: '2026-01-02',
      url: 'https://example.com/old',
    })]);
    const stats = getStats(db);
    expect(stats.this_week_count).toBeGreaterThanOrEqual(1);
  });
});
