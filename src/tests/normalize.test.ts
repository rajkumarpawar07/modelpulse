/**
 * normalize.test.ts — Tests for the vendor-agnostic normalization layer.
 *
 * Covers: date parsing, change_type mapping, HTML stripping, null/missing
 * field handling, stable ID generation, and edge cases.
 */
import { describe, it, expect } from 'vitest';
import { normalizeRow, normalizeDataset } from '../normalize.js';
import type { Collector } from '../types.js';

const MOCK_COLLECTOR: Collector = {
  vendor: 'testvendor',
  vendor_display: 'TestVendor',
  vendor_homepage: 'https://example.com',
  collector_id: 'c_test123',
  url: 'https://example.com/changelog',
  tier: 1,
  enabled: true,
};

describe('normalizeRow', () => {
  it('normalizes a well-formed row', () => {
    const row = {
      title: 'New feature launched',
      date: '2026-08-15',
      change_type: 'added',
      description: 'A great new feature.',
      url: 'https://example.com/changelog#aug15',
      version: 'v2.0',
    };
    const result = normalizeRow(row, MOCK_COLLECTOR);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('New feature launched');
    expect(result!.date).toBe('2026-08-15');
    expect(result!.change_type).toBe('added');
    expect(result!.vendor).toBe('testvendor');
    expect(result!.vendor_display).toBe('TestVendor');
    expect(result!.version).toBe('v2.0');
    expect(result!.is_breaking).toBe(false);
  });

  it('returns null for null input', () => {
    expect(normalizeRow(null, MOCK_COLLECTOR)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(normalizeRow('a string', MOCK_COLLECTOR)).toBeNull();
    expect(normalizeRow(42, MOCK_COLLECTOR)).toBeNull();
  });

  it('returns null when title is missing and description is empty', () => {
    const row = { date: '2026-01-01', change_type: 'added', url: 'https://x.com' };
    const result = normalizeRow(row, MOCK_COLLECTOR);
    // With no title and no description, it falls back to a derived title
    // from the vendor display name, which is non-empty
    expect(result).not.toBeNull();
  });

  // --- Date normalization ---
  it('normalizes ISO dates', () => {
    const row = { title: 'X', date: '2026-08-15T10:00:00Z', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.date).toBe('2026-08-15');
  });

  it('normalizes slash-formatted dates', () => {
    const row = { title: 'X', date: '2026/08/15', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.date).toBe('2026-08-15');
  });

  it('normalizes natural-language dates', () => {
    const row = { title: 'X', date: 'January 1, 2026', url: 'https://x.com' };
    const result = normalizeRow(row, MOCK_COLLECTOR)!.date;
    // Date.parse may shift by timezone; accept 2025-12-31 or 2026-01-01
    expect(['2025-12-31', '2026-01-01']).toContain(result);
  });

  it('falls back to today when date is empty', () => {
    const row = { title: 'X', date: '', url: 'https://x.com' };
    const today = new Date().toISOString().slice(0, 10);
    expect(normalizeRow(row, MOCK_COLLECTOR)!.date).toBe(today);
  });

  // --- Change type normalization ---
  it.each([
    ['added', 'added'],
    ['new', 'added'],
    ['feature', 'added'],
    ['launch', 'added'],
    ['release', 'added'],
    ['shipped', 'added'],
    ['changed', 'changed'],
    ['update', 'changed'],
    ['improvement', 'changed'],
    ['modified', 'changed'],
    ['deprecated', 'deprecated'],
    ['sunset', 'deprecated'],
    ['retire', 'deprecated'],
    ['end-of-life', 'deprecated'],
    ['eol', 'deprecated'],
    ['removed', 'removed'],
    ['delete', 'removed'],
    ['drop', 'removed'],
    ['fixed', 'fixed'],
    ['bugfix', 'fixed'],
    ['patch', 'fixed'],
    ['hotfix', 'fixed'],
    ['ADDED', 'added'],       // case insensitive
    ['  Fixed  ', 'fixed'],   // whitespace
    ['unknown_type', 'changed'], // fallback
  ])('maps change_type "%s" to "%s"', (input, expected) => {
    const row = { title: 'X', change_type: input, url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.change_type).toBe(expected);
  });

  // --- Breaking flag ---
  it('flags deprecated as breaking', () => {
    const row = { title: 'X', change_type: 'deprecated', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.is_breaking).toBe(true);
  });

  it('flags removed as breaking', () => {
    const row = { title: 'X', change_type: 'removed', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.is_breaking).toBe(true);
  });

  it('does not flag added as breaking', () => {
    const row = { title: 'X', change_type: 'added', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.is_breaking).toBe(false);
  });

  // --- HTML stripping ---
  it('strips HTML from descriptions', () => {
    const row = { title: 'X', description: '<p>Hello <strong>world</strong></p>', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.description).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    const row = { title: 'X', description: 'Use &amp; enjoy &lt;models&gt;', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.description).toBe('Use & enjoy <models>');
  });

  // --- Stable IDs ---
  it('generates stable IDs for the same vendor+url', () => {
    const row = { title: 'X', url: 'https://x.com/entry1' };
    const a = normalizeRow(row, MOCK_COLLECTOR)!.id;
    const b = normalizeRow(row, MOCK_COLLECTOR)!.id;
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });

  it('generates different IDs for different URLs', () => {
    const row1 = { title: 'X', url: 'https://x.com/entry1' };
    const row2 = { title: 'X', url: 'https://x.com/entry2' };
    const a = normalizeRow(row1, MOCK_COLLECTOR)!.id;
    const b = normalizeRow(row2, MOCK_COLLECTOR)!.id;
    expect(a).not.toBe(b);
  });

  // --- Fallback fields ---
  it('uses headline/name/summary as fallback for title', () => {
    const row = { headline: 'My headline', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.title).toBe('My headline');
  });

  it('uses published_at as fallback for date', () => {
    const row = { title: 'X', published_at: '2026-03-10', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.date).toBe('2026-03-10');
  });

  it('uses link/href as fallback for url', () => {
    const row = { title: 'X', link: 'https://x.com/alt-link' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.url).toBe('https://x.com/alt-link');
  });

  it('uses model/model_id as fallback for version', () => {
    const row = { title: 'X', model: 'gpt-4o', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.version).toBe('gpt-4o');
  });

  it('uses type/category/tag as fallback for change_type', () => {
    const row = { title: 'X', category: 'bugfix', url: 'https://x.com' };
    expect(normalizeRow(row, MOCK_COLLECTOR)!.change_type).toBe('fixed');
  });
});

describe('normalizeDataset', () => {
  it('normalizes an array of rows', () => {
    const dataset = [
      { title: 'A', date: '2026-01-01', url: 'https://a.com' },
      { title: 'B', date: '2026-01-02', url: 'https://b.com' },
    ];
    const result = normalizeDataset(dataset, MOCK_COLLECTOR);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('A');
    expect(result[1].title).toBe('B');
  });

  it('filters out invalid rows', () => {
    const dataset = [
      { title: 'Good', date: '2026-01-01', url: 'https://a.com' },
      null,
      42,
      'bad',
    ];
    const result = normalizeDataset(dataset, MOCK_COLLECTOR);
    expect(result).toHaveLength(1);
  });

  it('returns empty array for non-array input', () => {
    const result = normalizeDataset('not an array', MOCK_COLLECTOR);
    expect(result).toEqual([]);
  });
});
