"use client";

import { useState } from "react";
import Link from "next/link";
import type { Change } from "../../src/types";
import { TypeChip, TYPE_META, daysAgoLabel, fmtDate } from "./ui";

function toMarkdown(c: Change): string {
  const lines = [
    `### [${c.vendor_display}] ${c.title}`,
    `- **Type:** ${c.change_type}${c.is_breaking ? " · **BREAKING**" : ""}`,
    `- **Date:** ${c.date}` +
      (c.version ? ` · **Version:** \`${c.version}\`` : "") +
      (typeof c.impact === "number" ? ` · **Impact:** ${c.impact}/100` : ""),
    `- **Source:** ${c.url}`,
  ];
  if (c.description) lines.push("", `> ${c.description}`);
  return lines.join("\n");
}

function CopyButton({ change }: { change: Change }) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(change));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button
      onClick={onCopy}
      title="Copy as Markdown"
      className={`font-mono text-[11px] transition-colors ${
        copied ? "text-signal" : "text-ink-faint hover:text-signal"
      }`}
    >
      {copied ? "✓ MD" : "⧉ MD"}
    </button>
  );
}

function ImpactBadge({ score }: { score: number }) {
  const tone =
    score >= 70
      ? "border-alert/40 text-alert"
      : score >= 40
        ? "border-warn/40 text-warn"
        : "border-line text-ink-faint";
  return (
    <span
      title="Heuristic impact score"
      className={`inline-flex items-center border px-1 py-px font-mono text-[10px] tabular-nums ${tone}`}
    >
      IMPACT {score}
    </span>
  );
}

export function SignalRow({
  change,
  seq,
  watchHits,
}: {
  change: Change;
  seq?: number;
  watchHits?: string[];
}) {
  const meta = TYPE_META[change.change_type];
  const edited = Boolean(change.updated_at);
  const hits = watchHits ?? [];

  return (
    <article
      className={`group relative border-b border-line py-4 pl-5 pr-4 transition-colors duration-200 hover:bg-panel ${
        change.is_breaking ? "bg-alert/[0.035]" : ""
      }`}
    >
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 top-0 w-[2px] transition-opacity duration-200 ${meta.bar} ${
          change.is_breaking ? "opacity-100" : "opacity-25 group-hover:opacity-90"
        }`}
      />

      <div className="md:grid md:grid-cols-[52px_96px_136px_1fr_72px] md:gap-x-5">
        <div className="hidden pt-1 font-mono text-[11px] text-ink-faint md:block">
          {seq !== undefined ? String(seq).padStart(3, "0") : "···"}
        </div>

        <div className="hidden pt-0.5 font-mono md:block">
          <div className="text-xs text-ink-dim">{fmtDate(change.date)}</div>
          <div className="mt-0.5 text-[10px] tracking-widest text-ink-faint">
            {daysAgoLabel(change.date)}
          </div>
        </div>

        <div className="hidden pt-0.5 md:block">
          <TypeChip type={change.change_type} />
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 md:hidden">
            <TypeChip type={change.change_type} />
            <Link
              href={`/vendor/${change.vendor}`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim transition-colors hover:text-signal"
            >
              {change.vendor_display}
            </Link>
            {typeof change.impact === "number" && change.impact > 0 && (
              <ImpactBadge score={change.impact} />
            )}
            <span className="font-mono text-[10px] tracking-widest text-ink-faint">
              {fmtDate(change.date)} · {daysAgoLabel(change.date)}
            </span>
            {edited && <span className="font-mono text-[10px] tracking-widest text-azure">↻ EDITED</span>}
            {hits.length > 0 && (
              <span className="font-mono text-[10px] tracking-widest text-signal">◉ {hits.join(" · ")}</span>
            )}
          </div>

          <a
            href={change.url}
            target="_blank"
            rel="noreferrer"
            className="block break-words font-display text-[15px] font-medium leading-snug text-ink transition-colors group-hover:text-signal"
          >
            {change.title}
          </a>

          {change.description && (
            <p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-faint line-clamp-2">
              {change.description}
            </p>
          )}

          <div className="mt-1.5 hidden flex-wrap items-center gap-2.5 md:flex">
            <Link
              href={`/vendor/${change.vendor}`}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-signal"
            >
              {change.vendor_display}
            </Link>
            {change.version && (
              <code className="border border-line px-1 py-px font-mono text-[10px] text-ink-dim">
                {change.version}
              </code>
            )}
            {typeof change.impact === "number" && change.impact > 0 && (
              <ImpactBadge score={change.impact} />
            )}
            {change.is_breaking && (
              <span className="font-mono text-[10px] tracking-[0.2em] text-alert">⌁ BREAKING</span>
            )}
            {edited && (
              <span
                title={`Last edited ${change.updated_at}`}
                className="font-mono text-[10px] tracking-[0.2em] text-azure"
              >
                ↻ EDITED
              </span>
            )}
            {hits.length > 0 && (
              <span className="font-mono text-[10px] tracking-[0.2em] text-signal">
                ◉ {hits.join(" · ").toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="hidden items-start justify-end gap-3 pt-0.5 md:flex">
          <CopyButton change={change} />
          <a
            href={change.url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open source"
            className="font-mono text-sm text-ink-faint transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-signal"
          >
            ↗
          </a>
        </div>
      </div>

      <div className="absolute right-3 top-3 flex items-center gap-3 md:hidden">
        {change.is_breaking && (
          <span className="font-mono text-[10px] tracking-[0.2em] text-alert">BREAKING</span>
        )}
        <CopyButton change={change} />
      </div>
    </article>
  );
}
