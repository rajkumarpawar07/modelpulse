/**
 * brightdata.test.ts — Tests for the dataset unwrapping logic.
 *
 * /dca/get_result and /dca/dataset return different payload shapes depending
 * on collector state. unwrapDataset must accept every "ready" shape and
 * return null (keep polling) for in-flight states.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { unwrapDataset, savePendingJob, loadPendingJobs, clearPendingJob } from '../brightdata.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'modelpulse-pending-'));
  process.env.PENDING_JOBS_PATH = join(tmpDir, 'pending.json');
});

afterAll(() => {
  delete process.env.PENDING_JOBS_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('pending job map', () => {
  it('saves, loads, and clears jobs per vendor', () => {
    expect(loadPendingJobs()).toEqual({});
    savePendingJob('qwen', 'j_test123');
    expect(loadPendingJobs().qwen?.collection_id).toBe('j_test123');
    expect(loadPendingJobs().qwen?.queued_at).toBeGreaterThan(0);
    clearPendingJob('qwen');
    expect(loadPendingJobs()).toEqual({});
    clearPendingJob('never-saved'); // no-op, does not throw
  });
});

describe('unwrapDataset', () => {
  it('passes through a bare array', () => {
    expect(unwrapDataset([{ a: 1 }])).toEqual([{ a: 1 }]);
  });

  it.each(['entries', 'results', 'data', 'items', 'rows', 'changelog_entries'])(
    'unwraps { "%s": [...] } payloads',
    key => {
      const rows = [{ a: 1 }, { a: 2 }];
      expect(unwrapDataset({ [key]: rows })).toEqual(rows);
    },
  );

  it('returns null for in-flight status objects', () => {
    expect(unwrapDataset({ status: 'pending' })).toBeNull();
    expect(unwrapDataset({ status: 'building', progress: 40 })).toBeNull();
  });

  it('returns null for non-array input', () => {
    expect(unwrapDataset(null)).toBeNull();
    expect(unwrapDataset('loading')).toBeNull();
    expect(unwrapDataset({ data: { not: 'an array' } })).toBeNull();
  });

  it('does not confuse an empty array with "still processing"', () => {
    // An empty ready array is a legitimate (if suspicious) result — the
    // 0-row auto-heal path handles it downstream.
    expect(unwrapDataset({ entries: [] })).toEqual([]);
  });
});
