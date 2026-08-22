/**
 * heal.test.ts — Tests for partial-breakage detection.
 *
 * The auto-heal loop triggers on three signals: hard errors, 0-row scrapes,
 * and partial breakage (rows come back but required fields are gone).
 * These tests cover the third — the classic post-redesign failure mode.
 */
import { describe, it, expect } from 'vitest';
import { detectPartialFailure } from '../normalize.js';

describe('detectPartialFailure', () => {
  it('returns null for a healthy dataset', () => {
    const dataset = [
      { title: 'New model', date: '2026-08-15', change_type: 'added', description: 'x', url: 'https://a' },
      { title: 'Deprecation', date: '2026-08-14', change_type: 'deprecated', description: 'y', url: 'https://b' },
    ];
    expect(detectPartialFailure(dataset)).toBeNull();
  });

  it('returns null for empty or non-array input (0-row case is handled separately)', () => {
    expect(detectPartialFailure([])).toBeNull();
    expect(detectPartialFailure(null)).toBeNull();
    expect(detectPartialFailure({ entries: [] })).toBeNull();
  });

  it('flags a majority of rows missing change_type', () => {
    const dataset = Array.from({ length: 10 }, (_, i) => ({
      title: `Entry ${i}`,
      date: '2026-08-15',
      description: 'text',
      // change_type missing everywhere — the exact demo-heal scenario
    }));
    const reason = detectPartialFailure(dataset);
    expect(reason).toMatch(/missing change_type/);
  });

  it('flags a majority of rows missing dates', () => {
    const dataset = Array.from({ length: 6 }, (_, i) => ({
      title: `Entry ${i}`,
      change_type: 'changed',
      description: 'text',
    }));
    const reason = detectPartialFailure(dataset);
    expect(reason).toMatch(/missing dates/);
  });

  it('flags a majority of rows missing titles (no title-like field at all)', () => {
    const dataset = Array.from({ length: 4 }, () => ({
      date: '2026-08-15',
      change_type: 'changed',
      url: 'https://example.com/e',
    }));
    const reason = detectPartialFailure(dataset);
    expect(reason).toMatch(/missing titles/);
  });

  it('does not flag when a description survives to derive titles from', () => {
    const dataset = Array.from({ length: 4 }, () => ({
      date: '2026-08-15',
      change_type: 'changed',
      description: 'some body text',
    }));
    expect(detectPartialFailure(dataset)).toBeNull();
  });

  it('does not flag when only a minority of rows lack a field', () => {
    const dataset = Array.from({ length: 10 }, (_, i) => ({
      title: `Entry ${i}`,
      date: i < 2 ? null : '2026-08-15', // 20% missing — tolerable
      change_type: 'changed',
    }));
    expect(detectPartialFailure(dataset)).toBeNull();
  });

  it('accepts alternate field names vendors use', () => {
    const dataset = [
      { headline: 'New model', published_at: '2026-08-15', category: 'new' },
      { name: 'Fix', timestamp: '2026-08-14', tag: 'bugfix' },
    ];
    expect(detectPartialFailure(dataset)).toBeNull();
  });

  it('accepts Cohere-style release_date fields', () => {
    const dataset = Array.from({ length: 5 }, () => ({
      title: 'New model',
      release_date: '2026-07-07T00:00:00.000Z',
      model_name: 'cohere-transcribe-arabic',
      category: 'added',
      description: 'x',
    }));
    expect(detectPartialFailure(dataset)).toBeNull();
  });

  it('ignores null/empty values, not just absent keys', () => {
    const dataset = Array.from({ length: 5 }, () => ({
      title: 'Entry',
      date: null,
      change_type: '',
      description: 'x',
    }));
    const reason = detectPartialFailure(dataset);
    expect(reason).toMatch(/missing dates/);
  });
});
