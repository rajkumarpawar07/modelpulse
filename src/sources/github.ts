/**
 * sources/github.ts — Second source type: GitHub Releases.
 *
 * Vendors often ship SDK/API changes as GitHub releases before they hit
 * the marketing changelog. If a collector has `github_repo: "owner/name"`,
 * we ingest the latest releases through the same normalize pipeline so
 * everything lands in one schema.
 *
 * No auth required (60 req/hr anonymous is plenty for ~20 vendors/day).
 */
import { request } from 'undici';
import type { Change, Collector } from '../types.js';
import { normalizeRow } from '../normalize.js';

interface GhRelease {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
  body?: unknown;
  prerelease?: unknown;
}

export async function fetchGithubReleases(collector: Collector, repo: string): Promise<Change[]> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=10`;
  const res = await request(url, {
    headers: {
      'User-Agent': 'modelpulse/0.2 (+https://github.com/yourusername/modelpulse)',
      'Accept': 'application/vnd.github+json',
    },
  });
  await res.body.dump();
  if (res.statusCode === 403 || res.statusCode === 429) {
    throw new Error(`GitHub rate limit hit (${res.statusCode})`);
  }
  if (res.statusCode >= 400) {
    throw new Error(`GitHub API ${res.statusCode} for ${repo}`);
  }

  let payload: unknown;
  try {
    payload = await res.body.json();
  } catch {
    throw new Error(`GitHub API returned non-JSON for ${repo}`);
  }
  if (!Array.isArray(payload)) return [];

  // Reuse the standard normalizer via synthetic raw rows + a synthetic collector
  const ghCollector: Collector = { ...collector, collector_id: `gh:${repo}` };
  const out: Change[] = [];
  for (const rel of payload as GhRelease[]) {
    const tag = typeof rel.tag_name === 'string' ? rel.tag_name : '';
    if (!tag) continue;
    const releaseName = typeof rel.name === 'string' && rel.name.trim() ? rel.name.trim() : tag;
    const raw = {
      title: `${releaseName}`,
      url: typeof rel.html_url === 'string' ? rel.html_url : `https://github.com/${repo}/releases/tag/${tag}`,
      date: typeof rel.published_at === 'string' ? rel.published_at : '',
      change_type: 'added',
      version: tag,
      description:
        typeof rel.body === 'string'
          ? rel.body.replace(/<[^>]+>/g, '').trim().slice(0, 500)
          : '',
    };
    const c = normalizeRow(raw, ghCollector);
    if (c) out.push(c);
  }
  return out;
}
