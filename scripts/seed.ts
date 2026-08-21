/**
 * scripts/seed.ts — Populate SQLite with realistic demo data.
 *
 * Used when you want the dashboard to look alive before the real scrapers
 * have run. Produces 60 days of fake changelog entries from 10 vendors.
 */
import 'dotenv/config';
import { getDb, upsertChanges, closeDb } from '../src/db.js';
import type { Change, ChangeType } from '../src/types.js';
import { createHash } from 'node:crypto';

const VENDORS = [
  { vendor: 'openai',         display: 'OpenAI' },
  { vendor: 'anthropic',      display: 'Anthropic' },
  { vendor: 'google_gemini',  display: 'Google Gemini' },
  { vendor: 'mistral',        display: 'Mistral AI' },
  { vendor: 'cohere',         display: 'Cohere' },
  { vendor: 'groq',           display: 'Groq' },
  { vendor: 'together',       display: 'Together AI' },
  { vendor: 'replicate',      display: 'Replicate' },
  { vendor: 'fireworks',      display: 'Fireworks AI' },
  { vendor: 'huggingface',    display: 'Hugging Face' },
];

const SAMPLE_TITLES: Record<string, { type: ChangeType; title: string; version?: string }[]> = {
  openai: [
    { type: 'added', title: 'New gpt-4o-mini model available', version: 'gpt-4o-mini-2024-07-18' },
    { type: 'changed', title: 'Increased rate limits for GPT-4o', version: 'gpt-4o' },
    { type: 'deprecated', title: 'gpt-3.5-turbo-0613 will be retired', version: 'gpt-3.5-turbo-0613' },
    { type: 'added', title: 'Structured outputs now support json_schema', version: 'gpt-4o-2024-08-06' },
    { type: 'fixed', title: 'Bug fix in streaming responses for gpt-4-turbo', version: 'gpt-4-turbo' },
  ],
  anthropic: [
    { type: 'added', title: 'Claude 3.5 Sonnet now supports prompt caching', version: 'claude-3-5-sonnet-20241022' },
    { type: 'changed', title: 'Updated default temperature for Claude 3 Opus', version: 'claude-3-opus' },
    { type: 'added', title: 'New Computer Use beta endpoint', version: 'claude-3-5-sonnet-20241022' },
    { type: 'fixed', title: 'Resolved token counting edge case', version: 'claude-3-5-haiku' },
  ],
  google_gemini: [
    { type: 'added', title: 'Gemini 1.5 Pro context window expanded to 2M tokens', version: 'gemini-1.5-pro' },
    { type: 'changed', title: 'Updated safety filter thresholds', version: 'gemini-1.5-flash' },
    { type: 'added', title: 'New code execution tool', version: 'gemini-1.5-pro' },
  ],
  mistral: [
    { type: 'added', title: 'mistral-large-2407 general availability', version: 'mistral-large-2407' },
    { type: 'changed', title: 'Faster inference for mistral-small', version: 'mistral-small-2407' },
    { type: 'deprecated', title: 'mistral-7b-v0.3 deprecation notice', version: 'mistral-7b-v0.3' },
  ],
  cohere: [
    { type: 'added', title: 'Command R+ now supports 128k context', version: 'command-r-plus' },
    { type: 'fixed', title: 'Embedding endpoint timeout fix', version: 'embed-english-v3.0' },
  ],
  groq: [
    { type: 'added', title: 'Llama 3.1 70B now available on Groq', version: 'llama-3.1-70b' },
    { type: 'changed', title: 'Reduced latency for mixtral-8x7b', version: 'mixtral-8x7b' },
  ],
  together: [
    { type: 'added', title: 'Qwen2.5-72B available', version: 'Qwen2.5-72B' },
  ],
  replicate: [
    { type: 'added', title: 'Flux 1.1 Pro now available', version: 'flux-1.1-pro' },
    { type: 'changed', title: 'CogVideoX inference speed improved', version: 'cogvideox-5b' },
  ],
  fireworks: [
    { type: 'added', title: 'Llama 3.2 90B Vision available', version: 'llama-3.2-90b-vision' },
  ],
  huggingface: [
    { type: 'changed', title: 'Inference API rate limit updates', version: 'inference-api' },
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function dateNDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function stableId(vendor: string, key: string): string {
  return createHash('sha256').update(`${vendor}::${key}`).digest('hex').slice(0, 32);
}

function main(): void {
  const db = getDb();
  const changes: Change[] = [];

  // 60 days of history
  for (let day = 0; day < 60; day++) {
    // 0-3 changes per vendor per day
    for (const v of VENDORS) {
      const numChanges = Math.floor(Math.random() * 3);
      for (let i = 0; i < numChanges; i++) {
        const samples = SAMPLE_TITLES[v.vendor] || [];
        if (samples.length === 0) continue;
        const sample = pickRandom(samples);
        const url = `https://example.com/${v.vendor}/changelog/${dateNDaysAgo(day)}-${i}`;
        changes.push({
          id: stableId(v.vendor, url),
          vendor: v.vendor,
          vendor_display: v.display,
          title: sample.title,
          version: sample.version || null,
          date: dateNDaysAgo(day),
          change_type: sample.type,
          description: `Auto-generated seed entry for ${v.display}. Real data replaces this on the first scheduled scrape.`,
          url,
          is_breaking: sample.type === 'deprecated' || sample.type === 'removed',
          raw: null,
        });
      }
    }
  }

  const res = upsertChanges(db, changes);
  console.log(`  ✅ Seeded ${res.total} change(s) across ${VENDORS.length} vendors over 60 days (${res.inserted} new, ${res.updated} mutated).`);
  console.log(`  📊 Database: ${process.env.DATABASE_PATH || './data/modelpulse.db'}`);
  closeDb();
}

main();
