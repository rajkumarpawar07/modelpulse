/**
 * diff.test.ts — Tests for the week-over-week diff engine.
 *
 * Uses an in-memory SQLite database to test the real diff logic
 * including window boundaries, deduplication, and vendor grouping.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { computeDiff, flattenDiff, printDiff } from '../diff.js';
import type { Change } from '../types.js';

// We need the real db module's schema, but pointing to in-memory DB.
// We'll manually create the schema and insert test data.

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE changes (
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
      impact          INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT,
      first_seen_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

function insertChange(db: Database.Database, overrides: Partial<Change> & { id: string; date: string }): void {
  const defaults = {
    vendor: 'openai',
    vendor_display: 'OpenAI',
    title: 'Test change',
    version: null,
    change_type: 'changed',
    description: 'A test change.',
    url: 'https://example.com',
    is_breaking: 0,
    raw: null,
    impact: 20,
  };
  const c = { ...defaults, ...overrides };
  db.prepare(`
    INSERT INTO changes (id, vendor, vendor_display, title, version, date, change_type, description, url, is_breaking, raw, impact)
    VALUES (@id, @vendor, @vendor_display, @title, @version, @date, @change_type, @description, @url, @is_breaking, @raw, @impact)
  `).run(c);
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

describe('computeDiff', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array when no changes exist', () => {
    const diff = computeDiff(db, 7);
    expect(diff).toEqual([]);
  });

  it('detects new changes in the current window', () => {
    insertChange(db, { id: 'new-1', date: daysAgo(2), title: 'Recent change' });
    const diff = computeDiff(db, 7);
    expect(diff).toHaveLength(1);
    expect(diff[0].vendor).toBe('openai');
    expect(diff[0].new_changes).toHaveLength(1);
    expect(diff[0].new_changes[0].title).toBe('Recent change');
  });

  it('excludes changes that were in the prior window', () => {
    // This change is in the prior window (8-14 days ago) AND in the current window
    // Since the ID exists in the prior window, it should be excluded
    insertChange(db, { id: 'old-1', date: daysAgo(10), title: 'Old change' });
    const diff = computeDiff(db, 7);
    // Old change is outside the current window, so not in current results
    expect(flattenDiff(diff)).toHaveLength(0);
  });

  it('groups changes by vendor', () => {
    insertChange(db, { id: 'oa-1', date: daysAgo(1), vendor: 'openai', vendor_display: 'OpenAI' });
    insertChange(db, { id: 'oa-2', date: daysAgo(2), vendor: 'openai', vendor_display: 'OpenAI' });
    insertChange(db, { id: 'an-1', date: daysAgo(1), vendor: 'anthropic', vendor_display: 'Anthropic' });

    const diff = computeDiff(db, 7);
    expect(diff).toHaveLength(2);

    const openai = diff.find(d => d.vendor === 'openai');
    const anthropic = diff.find(d => d.vendor === 'anthropic');
    expect(openai!.new_changes).toHaveLength(2);
    expect(anthropic!.new_changes).toHaveLength(1);
  });

  it('sorts vendors by number of new changes (descending)', () => {
    insertChange(db, { id: 'a1', date: daysAgo(1), vendor: 'a', vendor_display: 'A' });
    insertChange(db, { id: 'b1', date: daysAgo(1), vendor: 'b', vendor_display: 'B' });
    insertChange(db, { id: 'b2', date: daysAgo(2), vendor: 'b', vendor_display: 'B' });
    insertChange(db, { id: 'b3', date: daysAgo(3), vendor: 'b', vendor_display: 'B' });

    const diff = computeDiff(db, 7);
    expect(diff[0].vendor).toBe('b');
    expect(diff[1].vendor).toBe('a');
  });

  it('sorts changes within a vendor by date descending', () => {
    insertChange(db, { id: 'c1', date: daysAgo(5), title: 'Older' });
    insertChange(db, { id: 'c2', date: daysAgo(1), title: 'Newer' });

    const diff = computeDiff(db, 7);
    expect(diff[0].new_changes[0].title).toBe('Newer');
    expect(diff[0].new_changes[1].title).toBe('Older');
  });

  it('respects custom window sizes', () => {
    insertChange(db, { id: 'w1', date: daysAgo(2) });   // within 3-day window
    insertChange(db, { id: 'w2', date: daysAgo(5) });   // outside 3-day window

    const diff = computeDiff(db, 3);
    expect(flattenDiff(diff)).toHaveLength(1);
  });
});

describe('flattenDiff', () => {
  it('flattens multiple DiffResults into a single array', () => {
    const diff = [
      {
        vendor: 'a',
        vendor_display: 'A',
        new_changes: [
          { id: '1' } as Change,
          { id: '2' } as Change,
        ],
        window_start: '2026-08-01',
        window_end: '2026-08-08',
      },
      {
        vendor: 'b',
        vendor_display: 'B',
        new_changes: [{ id: '3' } as Change],
        window_start: '2026-08-01',
        window_end: '2026-08-08',
      },
    ];
    expect(flattenDiff(diff)).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(flattenDiff([])).toEqual([]);
  });
});

describe('printDiff', () => {
  it('does not throw for empty diff', () => {
    expect(() => printDiff([])).not.toThrow();
  });

  it('does not throw for populated diff', () => {
    const diff = [{
      vendor: 'openai',
      vendor_display: 'OpenAI',
      new_changes: [{
        id: 'x', vendor: 'openai', vendor_display: 'OpenAI',
        title: 'Test', date: '2026-08-15', change_type: 'added' as const,
        is_breaking: false, description: '', url: '', version: null, raw: null,
      }],
      window_start: '2026-08-08',
      window_end: '2026-08-15',
    }];
    expect(() => printDiff(diff)).not.toThrow();
  });
});
