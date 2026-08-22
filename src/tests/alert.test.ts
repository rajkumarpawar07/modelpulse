/**
 * alert.test.ts — Tests for alert dispatch logic.
 *
 * Covers: matchWatch keyword matching, buildAlert formatting,
 * and payload construction.
 */
import { describe, it, expect } from 'vitest';
import { matchWatch, buildAlert } from '../alert.js';
import type { Change, DiffResult } from '../types.js';

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: 'test-id',
    vendor: 'openai',
    vendor_display: 'OpenAI',
    title: 'GPT-4o update',
    version: 'gpt-4o-2026-08',
    date: '2026-08-15',
    change_type: 'changed',
    description: 'Updated model with improved performance.',
    url: 'https://platform.openai.com/docs/changelog#aug15',
    is_breaking: false,
    raw: null,
    ...overrides,
  };
}

describe('matchWatch', () => {
  it('matches keyword in title', () => {
    const c = makeChange({ title: 'Rate limit increased for GPT-4' });
    expect(matchWatch(c, ['rate limit'])).toBe(true);
  });

  it('matches keyword in description', () => {
    const c = makeChange({ description: 'Token auth is now required for all endpoints' });
    expect(matchWatch(c, ['auth'])).toBe(true);
  });

  it('matches keyword in version', () => {
    const c = makeChange({ version: 'gpt-3.5-turbo-0613' });
    expect(matchWatch(c, ['gpt-3.5'])).toBe(true);
  });

  it('matches keyword in vendor_display', () => {
    const c = makeChange({ vendor_display: 'Anthropic' });
    expect(matchWatch(c, ['anthropic'])).toBe(true);
  });

  it('is case-insensitive', () => {
    const c = makeChange({ title: 'DEPRECATION NOTICE' });
    expect(matchWatch(c, ['deprecation'])).toBe(true);
    expect(matchWatch(c, ['Deprecation'])).toBe(true);
  });

  it('returns false when no keywords match', () => {
    const c = makeChange({ title: 'Minor docs fix', description: 'Typo correction' });
    expect(matchWatch(c, ['deprecation', 'rate limit', 'auth'])).toBe(false);
  });

  it('returns false for empty keywords array', () => {
    const c = makeChange();
    expect(matchWatch(c, [])).toBe(false);
  });

  it('matches any one of multiple keywords', () => {
    const c = makeChange({ title: 'Rate limit update' });
    expect(matchWatch(c, ['auth', 'rate limit', 'pricing'])).toBe(true);
  });

  it('handles null version gracefully', () => {
    const c = makeChange({ version: null, title: 'Minor docs fix', description: 'Typo correction' });
    expect(matchWatch(c, ['nonexistent-keyword'])).toBe(false);
  });
});

describe('buildAlert', () => {
  it('builds a non-breaking alert', () => {
    const diff: DiffResult[] = [
      {
        vendor: 'openai',
        vendor_display: 'OpenAI',
        new_changes: [makeChange()],
        window_start: '2026-08-08',
        window_end: '2026-08-15',
      },
    ];
    const alert = buildAlert(diff);
    expect(alert.is_breaking).toBe(false);
    expect(alert.changes).toHaveLength(1);
    expect(alert.text).toContain('ModelPulse');
    expect(alert.text).toContain('1 new change');
  });

  it('builds a breaking alert when breaking changes exist', () => {
    const diff: DiffResult[] = [
      {
        vendor: 'openai',
        vendor_display: 'OpenAI',
        new_changes: [
          makeChange({ is_breaking: true, change_type: 'removed', title: 'GPT-3 removed' }),
          makeChange({ is_breaking: false, change_type: 'added', title: 'GPT-5 launched' }),
        ],
        window_start: '2026-08-08',
        window_end: '2026-08-15',
      },
    ];
    const alert = buildAlert(diff);
    expect(alert.is_breaking).toBe(true);
    expect(alert.changes).toHaveLength(2);
    expect(alert.text).toContain('breaking');
  });

  it('aggregates changes across multiple vendors', () => {
    const diff: DiffResult[] = [
      {
        vendor: 'openai',
        vendor_display: 'OpenAI',
        new_changes: [makeChange({ vendor: 'openai' })],
        window_start: '2026-08-08',
        window_end: '2026-08-15',
      },
      {
        vendor: 'anthropic',
        vendor_display: 'Anthropic',
        new_changes: [makeChange({ vendor: 'anthropic', vendor_display: 'Anthropic' })],
        window_start: '2026-08-08',
        window_end: '2026-08-15',
      },
    ];
    const alert = buildAlert(diff);
    expect(alert.changes).toHaveLength(2);
    expect(alert.text).toContain('OpenAI');
    expect(alert.text).toContain('Anthropic');
  });

  it('handles empty diff', () => {
    const alert = buildAlert([]);
    expect(alert.is_breaking).toBe(false);
    expect(alert.changes).toHaveLength(0);
  });

  it('shows only the top 5 changes by priority — breaking first, then impact', () => {
    const mk = (id: string, impact: number, breaking = false) =>
      makeChange({ id, title: `Change ${id}`, impact, is_breaking: breaking });
    const diff: DiffResult[] = [
      {
        vendor: 'openai',
        vendor_display: 'OpenAI',
        new_changes: [
          mk('low1', 10), mk('b1', 40, true), mk('high1', 80), mk('mid1', 50),
          mk('high2', 75), mk('b2', 20, true), mk('low2', 5), mk('mid2', 55),
        ],
        window_start: '2026-08-08',
        window_end: '2026-08-15',
      },
    ];
    const alert = buildAlert(diff);
    // Full list preserved for the JSON webhook payload…
    expect(alert.changes).toHaveLength(8);
    // …but the message shows only the 5 highest-priority entries:
    // both breaking changes plus impact 80, 75, 55.
    expect(alert.text).toContain('Change b1');
    expect(alert.text).toContain('Change b2');
    expect(alert.text).toContain('Change high1');
    expect(alert.text).toContain('Change high2');
    expect(alert.text).toContain('Change mid2');
    expect(alert.text).not.toContain('Change low1');
    expect(alert.text).not.toContain('Change low2');
    expect(alert.text).not.toContain('Change mid1');
    expect(alert.text).toContain('…and 3 more');
  });
});
