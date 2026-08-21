/**
 * impact.test.ts — Tests for the heuristic severity scoring engine.
 *
 * Covers: base scores by type, breaking flag bonus, version bonus,
 * risk keyword matching, score clamping, and composite scenarios.
 */
import { describe, it, expect } from 'vitest';
import { scoreImpact } from '../impact.js';
import type { Change, ChangeType } from '../types.js';

function makeChange(overrides: Partial<Change> = {}): Change {
  return {
    id: 'test-id',
    vendor: 'test',
    vendor_display: 'Test',
    title: 'Some change',
    version: null,
    date: '2026-08-15',
    change_type: 'changed',
    description: 'A generic description.',
    url: 'https://example.com',
    is_breaking: false,
    raw: null,
    ...overrides,
  };
}

describe('scoreImpact', () => {
  // --- Base scores by change type ---
  it.each<[ChangeType, number]>([
    ['removed', 45],
    ['deprecated', 40],
    ['changed', 20],
    ['added', 10],
    ['fixed', 8],
  ])('assigns base score %d for type "%s"', (type, expected) => {
    const c = makeChange({ change_type: type, is_breaking: false });
    expect(scoreImpact(c)).toBe(expected);
  });

  // --- Breaking flag ---
  it('adds 30 points for breaking changes', () => {
    const normal = makeChange({ change_type: 'changed', is_breaking: false });
    const breaking = makeChange({ change_type: 'changed', is_breaking: true });
    expect(scoreImpact(breaking) - scoreImpact(normal)).toBe(30);
  });

  // --- Version bonus ---
  it('adds 8 points when version is present', () => {
    const without = makeChange({ version: null });
    const withVer = makeChange({ version: 'v2.0' });
    expect(scoreImpact(withVer) - scoreImpact(without)).toBe(8);
  });

  // --- Risk keywords ---
  it('boosts score for "deprecation" keyword in title', () => {
    const base = makeChange();
    const withKeyword = makeChange({ title: 'Model deprecation notice' });
    expect(scoreImpact(withKeyword)).toBeGreaterThan(scoreImpact(base));
  });

  it('boosts score for "rate limit" keyword in description', () => {
    const base = makeChange();
    const withKeyword = makeChange({ description: 'New rate limit applied to all endpoints' });
    expect(scoreImpact(withKeyword)).toBeGreaterThan(scoreImpact(base));
  });

  it('boosts score for "authentication" keyword', () => {
    const base = makeChange();
    const withKeyword = makeChange({ title: 'New auth requirements' });
    expect(scoreImpact(withKeyword)).toBeGreaterThan(scoreImpact(base));
  });

  it('boosts score for "pricing" keyword', () => {
    const base = makeChange();
    const withKeyword = makeChange({ description: 'Updated pricing for embeddings' });
    expect(scoreImpact(withKeyword)).toBeGreaterThan(scoreImpact(base));
  });

  it('boosts score for "breaking" keyword', () => {
    const base = makeChange();
    const withKeyword = makeChange({ title: 'Breaking change: migration required' });
    expect(scoreImpact(withKeyword)).toBeGreaterThan(scoreImpact(base));
  });

  // --- Clamping ---
  it('never exceeds 100', () => {
    // Stack everything: removed + breaking + version + all keywords
    const maxed = makeChange({
      change_type: 'removed',
      is_breaking: true,
      version: 'v9',
      title: 'Breaking deprecation removal of auth token with rate limit change',
      description: 'Pricing updated, SDK incompatible, context window reduced, timeout regression',
    });
    expect(scoreImpact(maxed)).toBeLessThanOrEqual(100);
  });

  it('never goes below 0', () => {
    // Minimal score scenario
    const minimal = makeChange({ change_type: 'fixed', is_breaking: false, version: null });
    expect(scoreImpact(minimal)).toBeGreaterThanOrEqual(0);
  });

  // --- Composite scenarios ---
  it('scores a typical breaking deprecation highly', () => {
    const c = makeChange({
      change_type: 'deprecated',
      is_breaking: true,
      title: 'gpt-3.5-turbo-0613 sunset',
      version: 'gpt-3.5-turbo-0613',
      description: 'Model will be deprecated and removed from the API.',
    });
    // deprecated(40) + breaking(30) + version(8) + keyword matches
    expect(scoreImpact(c)).toBeGreaterThanOrEqual(78);
  });

  it('scores a minor bugfix low', () => {
    const c = makeChange({
      change_type: 'fixed',
      is_breaking: false,
      title: 'Fixed typo in documentation',
      version: null,
    });
    expect(scoreImpact(c)).toBeLessThanOrEqual(20);
  });
});
