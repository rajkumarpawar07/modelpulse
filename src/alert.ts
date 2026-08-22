/**
 * alert.ts — Slack + Discord webhook dispatcher.
 *
 * Formats the diff result into a chat-friendly message and POSTs it.
 * Falls back to console if no webhook is configured.
 */
import { request } from 'undici';
import type { Change, DiffResult } from './types.js';

const SLACK_EMOJI: Record<Change['change_type'], string> = {
  added: '✨',
  changed: '🔧',
  deprecated: '⚠️',
  removed: '🚨',
  fixed: '🐛',
};

/** Render a single change to a one-line summary. */
function renderChange(c: Change): string {
  const emoji = SLACK_EMOJI[c.change_type];
  const breaking = c.is_breaking ? ' *(BREAKING)*' : '';
  const ver = c.version ? ` — \`${c.version}\`` : '';
  const impact = c.impact != null ? ` \`(IMPACT ${c.impact})\`` : '';
  return `${emoji} *${c.vendor_display}* [${c.date}] *${c.change_type}*${breaking}${impact}: ${c.title}${ver}\n   ${c.url}`;
}

/**
 * Build the alert payload. The chat message shows only the top N changes by
 * priority — breaking first, then by impact score (ALERT_MAX_CHANGES,
 * default 5). The full list stays in `changes` for the JSON webhook payload.
 */
export function buildAlert(diff: DiffResult[]): {
  text: string;
  is_breaking: boolean;
  changes: Change[];
} {
  const allChanges: Change[] = [];
  for (const d of diff) allChanges.push(...d.new_changes);
  const breaking = allChanges.filter(c => c.is_breaking);
  const isBreaking = breaking.length > 0;

  const maxShown = Math.max(1, parseInt(process.env.ALERT_MAX_CHANGES || '5', 10));
  const ranked = [...allChanges].sort((a, b) => {
    if (a.is_breaking !== b.is_breaking) return a.is_breaking ? -1 : 1;
    return (b.impact ?? 0) - (a.impact ?? 0);
  });
  const top = ranked.slice(0, maxShown);

  const header = isBreaking
    ? `🚨 *ModelPulse — ${allChanges.length} new change(s), ${breaking.length} breaking — top ${top.length} by impact*`
    : `📡 *ModelPulse — ${allChanges.length} new change(s) — top ${top.length} by impact*`;

  const lines: string[] = [header, ''];
  for (const c of top) {
    lines.push(renderChange(c));
  }
  const omitted = allChanges.length - top.length;
  if (omitted > 0) {
    lines.push('');
    lines.push(`_…and ${omitted} more — see the dashboard or \`/api/changes\`._`);
  }

  return {
    text: lines.join('\n'),
    is_breaking: isBreaking,
    changes: allChanges,
  };
}

/** Send to Slack. */
export async function sendSlack(text: string, webhookUrl: string): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    const res = await request(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      console.error(`  ❌ Slack webhook failed (HTTP ${res.statusCode}): ${body}`);
      return false;
    }
    await res.body.dump();
    return true;
  } catch (err) {
    console.error(`  ❌ Slack webhook error: ${(err as Error).message}`);
    return false;
  }
}

/** Send to Discord. Discord uses a slightly different payload format. */
export async function sendDiscord(text: string, webhookUrl: string): Promise<boolean> {
  if (!webhookUrl) return false;
  try {
    // Discord limit: 2000 chars per message
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 1900) {
      chunks.push(text.slice(i, i + 1900));
    }
    for (const chunk of chunks) {
      const res = await request(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: chunk }),
      });
      if (res.statusCode >= 400) {
        const body = await res.body.text();
        console.error(`  ❌ Discord webhook failed (HTTP ${res.statusCode}): ${body}`);
        return false;
      }
      await res.body.dump();
    }
    return true;
  } catch (err) {
    console.error(`  ❌ Discord webhook error: ${(err as Error).message}`);
    return false;
  }
}

/** Does a change match any of the given watch keywords? */
export function matchWatch(c: Change, keywords: string[]): boolean {
  const hay = `${c.title} ${c.description} ${c.version ?? ''} ${c.vendor_display}`.toLowerCase();
  return keywords.some(k => hay.includes(k.toLowerCase()));
}

/** Send a structured JSON payload to a generic webhook (Zapier/Make/anything). */
export async function sendWebhook(payload: Record<string, unknown>, url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      console.error(`  ❌ Webhook failed (HTTP ${res.statusCode}): ${body.slice(0, 200)}`);
      return false;
    }
    await res.body.dump();
    return true;
  } catch (err) {
    console.error(`  ❌ Webhook error: ${(err as Error).message}`);
    return false;
  }
}

/** Send to all configured webhooks. */
export async function dispatchAlert(alert: { text: string; is_breaking: boolean; changes: Change[] }): Promise<{
  slack: boolean;
  discord: boolean;
  webhook: boolean;
  console: boolean;
}> {
  const slackUrl = process.env.SLACK_WEBHOOK_URL || '';
  const discordUrl = process.env.DISCORD_WEBHOOK_URL || '';
  const hookUrl = process.env.WEBHOOK_URL || '';

  let slackOk = false;
  let discordOk = false;
  let hookOk = false;

  if (slackUrl) slackOk = await sendSlack(alert.text, slackUrl);
  if (discordUrl) discordOk = await sendDiscord(alert.text, discordUrl);
  if (hookUrl) {
    hookOk = await sendWebhook(
      {
        event: 'modelpulse.alert',
        triggered_at: new Date().toISOString(),
        is_breaking: alert.is_breaking,
        count: alert.changes.length,
        window_days: parseInt(process.env.DIFF_WINDOW_DAYS || '7', 10),
        vendors: [...new Set(alert.changes.map(c => c.vendor_display))],
        changes: alert.changes.map(c => ({
          vendor: c.vendor,
          vendor_display: c.vendor_display,
          title: c.title,
          version: c.version,
          date: c.date,
          change_type: c.change_type,
          is_breaking: c.is_breaking,
          impact: c.impact ?? null,
          url: c.url,
        })),
      },
      hookUrl,
    );
  }

  if (!slackUrl && !discordUrl && !hookUrl) {
    console.log('\n─── ModelPulse Alert (no webhook configured; printing to console) ───');
    console.log(alert.text);
    console.log('────────────────────────────────────────────────────────────────────\n');
    return { slack: false, discord: false, webhook: false, console: true };
  }

  return { slack: slackOk, discord: discordOk, webhook: hookOk, console: false };
}
