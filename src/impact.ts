/**
 * impact.ts — Heuristic severity scoring (0-100) for a normalized Change.
 *
 * Signals: change type, breaking flag, version pinning, and risk keywords
 * found in title/description. Deterministic, no ML — good enough to sort
 * a feed by "what should I look at first".
 */
import type { Change, ChangeType } from './types.js';

const TYPE_BASE: Record<ChangeType, number> = {
  removed: 45,
  deprecated: 40,
  changed: 20,
  added: 10,
  fixed: 8,
};

const RISK_KEYWORDS: Array<[RegExp, number]> = [
  [/\b(breaking|migrat|incompat)\b/i, 18],
  [/\b(deprecat|sunset|retire|end[- ]of[- ]life|eol)\b/i, 20],
  [/\b(remov|discontinu|shut ?down)\b/i, 20],
  [/\b(auth|api[_ ]?key|token|oauth|permission)\b/i, 15],
  [/\b(rate[_ ]?limit|throttl|quota|429)\b/i, 12],
  [/\b(pric|cost|billing|charge)\b/i, 12],
  [/\b(context window|max tokens?|token limit)\b/i, 10],
  [/\b(latency|timeout|uptime)\b/i, 8],
  [/\b(error|fail|bug|regression)\b/i, 6],
  [/\b(sdk|library|client)\b/i, 5],
];

export function scoreImpact(c: Change): number {
  let score = TYPE_BASE[c.change_type] ?? 15;
  if (c.is_breaking) score += 30;
  if (c.version) score += 8;
  const text = `${c.title} ${c.description}`.toLowerCase();
  for (const [re, pts] of RISK_KEYWORDS) {
    if (re.test(text)) score += pts;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}
