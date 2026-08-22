/**
 * normalize.ts — Vendor-agnostic schema.
 *
 * Every vendor's changelog page returns rows that look slightly different.
 * This module flattens them into a single Change shape.
 *
 * The Bright Data AI Agent does most of the heavy lifting (the
 * `bdata scraper create` prompt tells it what fields to extract). But
 * vendors use different field names, and we still need to:
 *   - normalize change_type strings to one of: added|changed|deprecated|removed|fixed
 *   - flag deprecated/removed as breaking
 *   - generate a stable id (sha256 of vendor + url)
 *   - parse dates to YYYY-MM-DD
 */
import { createHash } from 'node:crypto';
import type { Change, ChangeType, Collector } from './types.js';

const KNOWN_CHANGE_TYPES: ChangeType[] = ['added', 'changed', 'deprecated', 'removed', 'fixed'];

/** Map vendor-specific strings to our normalized ChangeType. */
function normalizeChangeType(raw: unknown): ChangeType {
  if (typeof raw !== 'string') return 'changed';
  const s = raw.toLowerCase().trim();
  if (KNOWN_CHANGE_TYPES.includes(s as ChangeType)) return s as ChangeType;

  // Vendor-specific mappings
  if (s === 'new' || s === 'feature' || s === 'launch' || s === 'release' || s === 'shipped') return 'added';
  if (s === 'update' || s === 'improvement' || s === 'enhance' || s === 'modified') return 'changed';
  if (s === 'deprecate' || s === 'sunset' || s === 'retire' || s === 'end-of-life' || s === 'eol') return 'deprecated';
  if (s === 'delete' || s === 'drop' || s === 'kill') return 'removed';
  if (s === 'bugfix' || s === 'patch' || s === 'hotfix') return 'fixed';

  return 'changed';
}

/** Normalize a date to YYYY-MM-DD. Falls back to today's date if unparseable. */
function normalizeDate(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return new Date().toISOString().slice(0, 10);
  }

  const s = raw.trim();

  // ISO date (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  // YYYY/MM/DD
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) {
    return s.slice(0, 10).replace(/\//g, '-');
  }

  // Try Date.parse
  const ms = Date.parse(s);
  if (!isNaN(ms)) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  // Fallback: today
  return new Date().toISOString().slice(0, 10);
}

/** Coerce to string, fallback to empty string. */
function asString(v: unknown, fallback: string = ''): string {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'object') {
    // Try common field names
    const obj = v as Record<string, unknown>;
    return asString(obj.text || obj.value || obj.name || obj.content, fallback);
  }
  return fallback;
}

/** Coerce to string|null for optional fields. */
function asStringOrNull(v: unknown): string | null {
  const s = asString(v, '').trim();
  return s === '' ? null : s;
}

function stableId(vendor: string, key: string): string {
  return createHash('sha256').update(`${vendor}::${key}`).digest('hex').slice(0, 32);
}

/** Strip HTML tags and markdown bold, collapse whitespace. */
function stripHtml(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Derive a title when the source has none: first sentence of the
 * description, trimmed to a readable length.
 */
function deriveTitle(descriptionHtml: string, fallback: string): string {
  if (!descriptionHtml.trim()) return fallback;
  // Gemini-style entries embed the heading as the first **bold** segment.
  const bold = descriptionHtml.match(/\*\*([^*]+)\*\*/);
  if (bold && bold[1].trim()) return bold[1].trim().slice(0, 110);
  const text = stripHtml(descriptionHtml);
  if (!text) return fallback;
  const sentence = text.split(/(?<=[.!?])\s/)[0] || text;
  return sentence.length > 110 ? `${sentence.slice(0, 107)}…` : sentence;
}

/**
 * Normalize a single raw row from a Scraper Studio collector into a Change.
 *
 * The Bright Data AI Agent returns rows with the field names we asked for
 * in the create prompt. We just need to be defensive about types.
 */
export function normalizeRow(raw: unknown, collector: Collector): Change | null {
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;

  let rawDescription = asString(row.description || row.body || row.details || row.content);
  if (!rawDescription.trim() && Array.isArray(row.updates)) {
    // Gemini-style entries: {date, updates: ["**Heading**: body…", …]}
    rawDescription = row.updates.filter(x => typeof x === 'string').join('\n\n');
  }

  // Required: title (derived from the description when the source has none)
  let title = asString(row.title || row.headline || row.name || row.summary || row.announcement_title);
  if (!title.trim()) title = deriveTitle(rawDescription, `${collector.vendor_display} update`);
  if (!title.trim()) return null;

  // URL is the dedup key (combined with vendor). Some sources omit it —
  // synthesize a stable one from the entry content so ids stay stable.
  let url = asString(row.url || row.link || row.href || row.announcement_url || '');
  if (!url.trim()) {
    url = `${collector.url}#e-${stableId(collector.vendor, `${title}|${asString(row.date || '')}`).slice(0, 12)}`;
  }

  const version = asStringOrNull(row.version || row.model || row.model_id || row.model_name || row.release);

  // Pages without type labels (Qwen/MiniMax announcement feeds): infer
  // breaking-relevant types from the text so deprecations still alert.
  let rawType: unknown = row.change_type ?? row.type ?? row.category ?? row.tag;
  if (rawType == null || String(rawType).trim() === '') {
    const hay = `${title} ${rawDescription}`.toLowerCase();
    if (/deprecat|sunset|end-of-life|\beol\b/.test(hay)) rawType = 'deprecated';
    else if (/removed|discontinued|shut(ting)? down|turned off/.test(hay)) rawType = 'removed';
  }
  const changeType = normalizeChangeType(rawType);

  // Some feeds (Qwen) give only {year, month} — build a full date.
  let rawDate: unknown =
    row.date || row.published_at || row.release_date || row.created_at || row.timestamp;
  if (rawDate == null || String(rawDate).trim() === '') {
    if (row.year != null && row.month != null) {
      const ms = Date.parse(`${row.month} 1, ${row.year}`);
      if (!isNaN(ms)) rawDate = new Date(ms).toISOString().slice(0, 10);
    }
  }
  const date = normalizeDate(rawDate);

  const description = stripHtml(rawDescription);

  const isBreaking = changeType === 'deprecated' || changeType === 'removed';

  return {
    id: stableId(collector.vendor, url),
    vendor: collector.vendor,
    vendor_display: collector.vendor_display,
    title: stripHtml(title).trim(),
    version,
    date,
    change_type: changeType,
    description,
    url: url.trim(),
    is_breaking: isBreaking,
    raw,
  };
}

/**
 * Detect partial breakage: the scraper still returns rows, but the fields
 * we depend on have gone missing — the classic post-redesign failure mode
 * where the layout changed and extraction silently degrades.
 *
 * Returns a human-readable reason string, or null when the dataset looks
 * healthy enough to trust.
 */
export function detectPartialFailure(dataset: unknown): string | null {
  if (!Array.isArray(dataset) || dataset.length === 0) return null;

  const REQUIRED_DATE_KEYS = ['date', 'published_at', 'release_date', 'created_at', 'timestamp', 'year'];
  const REQUIRED_TYPE_KEYS = ['change_type', 'type', 'category', 'tag'];
  const REQUIRED_TITLE_KEYS = ['title', 'headline', 'name', 'summary', 'announcement_title', 'description', 'body', 'details', 'content', 'updates'];

  let missingDate = 0;
  let nullType = 0;
  let missingTitle = 0;

  for (const row of dataset) {
    if (row == null || typeof row !== 'object') continue;
    const obj = row as Record<string, unknown>;
    const has = (keys: string[]) => keys.some(k => obj[k] != null && String(obj[k]).trim() !== '');
    if (!has(REQUIRED_DATE_KEYS)) missingDate += 1;
    if (!has(REQUIRED_TITLE_KEYS)) missingTitle += 1;
    // A type key that EXISTS but is null/empty is real degradation (the
    // Fireworks case). Type keys that are simply absent are normal for
    // announcement feeds (Qwen/MiniMax/DeepSeek) — not a breakage.
    const typeKeyPresent = REQUIRED_TYPE_KEYS.some(k => k in obj);
    if (typeKeyPresent && !has(REQUIRED_TYPE_KEYS)) nullType += 1;
  }

  const n = dataset.length;
  const ratio = (x: number) => x / n;
  // Any required field missing from a majority of rows means the page moved.
  if (ratio(missingTitle) > 0.5) return `${missingTitle}/${n} rows are missing titles`;
  if (ratio(missingDate) > 0.5) return `${missingDate}/${n} rows are missing dates`;
  if (ratio(nullType) > 0.5) return `${nullType}/${n} rows have null change_type`;
  return null;
}

/** Normalize an entire dataset (JSON array) from a collector. */
export function normalizeDataset(dataset: unknown, collector: Collector): Change[] {
  if (!Array.isArray(dataset)) {
    console.warn(`  ⚠️  ${collector.vendor}: dataset is not an array (${typeof dataset})`);
    return [];
  }
  const out: Change[] = [];
  for (const row of dataset) {
    const c = normalizeRow(row, collector);
    if (c) out.push(c);
  }
  return out;
}
