/**
 * ModelPulse — core types
 *
 * These types describe the unified schema that ALL 20+ Scraper Studio
 * collectors normalize into. Vendor-specific weirdness gets squashed here.
 *
 * The schema is intentionally simple. The dashboard reads from it. The
 * diff engine compares week-over-week snapshots of it. The alert formatter
 * renders it into Slack/Discord messages.
 */

/** The five change_types every vendor uses (we normalize to these). */
export type ChangeType = 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed';

/** A single changelog entry from a single vendor, normalized. */
export interface Change {
  id: string;                // sha256(vendor + url) — stable per (vendor, entry)
  vendor: string;            // e.g. "openai"
  vendor_display: string;    // e.g. "OpenAI"
  title: string;
  version: string | null;    // e.g. "gpt-3.5-turbo-0613" or null
  date: string;              // YYYY-MM-DD
  change_type: ChangeType;
  description: string;       // one-paragraph summary
  url: string;               // link to the changelog entry
  is_breaking: boolean;      // deprecated or removed = true
  raw: unknown;              // the original raw row (for debugging)
  impact?: number;           // 0-100 heuristic severity score
  updated_at?: string | null;// set when an entry mutates after first capture
}

/** A single Scraper Studio collector definition. */
export interface Collector {
  vendor: string;
  vendor_display: string;
  vendor_homepage: string;
  collector_id: string;      // the c_* string
  url: string;               // the changelog URL
  tier: 1 | 2 | 3;
  enabled: boolean;
  github_repo?: string;      // optional: "owner/name" — also ingest GitHub releases
}

/** A keyword watch: alerts can be filtered to only matching changes. */
export interface Watch {
  id: number;
  keyword: string;
  created_at: string;
}

/** The shape of collectors.json. */
export interface CollectorFile {
  _comment?: string;
  _schema?: string;
  collectors: Collector[];
}

/** The shape of a single Bright Data /dca/trigger response. */
export interface TriggerResponse {
  collection_id?: string;
  snapshot_id?: string;
  response_id?: string;
}

/** The shape of the /dca/dataset response (a JSON array of rows). */
export type Dataset = unknown[];

/** A diff result: changes that appeared in the current window. */
export interface DiffResult {
  vendor: string;
  vendor_display: string;
  new_changes: Change[];
  window_start: string;      // YYYY-MM-DD
  window_end: string;        // YYYY-MM-DD
}

/** A run record: one scrape of one collector. */
export interface Run {
  id: number;
  vendor: string;
  collector_id: string;
  started_at: string;        // ISO timestamp
  finished_at: string | null;
  status: 'running' | 'success' | 'failed' | 'timeout';
  rows: number;
  error: string | null;
}

/** Slack/Discord alert payload (built by alert.ts). */
export interface AlertPayload {
  title: string;
  body: string;
  is_breaking: boolean;
  changes: Change[];
}
