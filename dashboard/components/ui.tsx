import type { ReactNode } from "react";
import type { ChangeType } from "../../src/types";

export const TYPE_META: Record<
  ChangeType,
  { label: string; glyph: string; chip: string; bar: string }
> = {
  added: { label: "ADDED", glyph: "▲", chip: "border-signal/40 text-signal", bar: "bg-signal" },
  changed: { label: "CHANGED", glyph: "◆", chip: "border-azure/40 text-azure", bar: "bg-azure" },
  deprecated: { label: "DEPRECATED", glyph: "▼", chip: "border-warn/40 text-warn", bar: "bg-warn" },
  removed: { label: "REMOVED", glyph: "✕", chip: "border-alert/50 text-alert", bar: "bg-alert" },
  fixed: { label: "FIXED", glyph: "●", chip: "border-viol/40 text-viol", bar: "bg-viol" },
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function parseISO(iso: string): number | null {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d);
}

export function fmtDate(iso: string): string {
  const t = parseISO(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function fmtDateLong(iso: string): string {
  const t = parseISO(iso);
  if (t === null) return iso;
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()]} · ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")} ${d.getUTCFullYear()}`;
}

export function daysAgoLabel(iso: string): string {
  const t = parseISO(iso);
  if (t === null) return "";
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const n = Math.round((today - t) / 86400000);
  if (n <= 0) return "TODAY";
  if (n === 1) return "YESTERDAY";
  if (n < 30) return `${n}D AGO`;
  if (n < 365) return `${Math.floor(n / 30)}MO AGO`;
  return `${Math.floor(n / 365)}Y AGO`;
}

export function vendorHue(name: string): number {
  const s = name.toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function LiveDot({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full bg-signal animate-blip ${className}`}
    />
  );
}

export function Hud({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative border border-line bg-panel ${className}`}>
      <span aria-hidden className="pointer-events-none absolute -left-px -top-px h-[7px] w-[7px] border-l border-t border-ink-faint/70" />
      <span aria-hidden className="pointer-events-none absolute -right-px -top-px h-[7px] w-[7px] border-r border-t border-ink-faint/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -left-px h-[7px] w-[7px] border-b border-l border-ink-faint/70" />
      <span aria-hidden className="pointer-events-none absolute -bottom-px -right-px h-[7px] w-[7px] border-b border-r border-ink-faint/70" />
      {children}
    </div>
  );
}

export function SectionHead({
  index,
  title,
  right,
}: {
  index: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] text-signal">[{index}]</span>
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-dim">{title}</h2>
        <span aria-hidden className="hidden h-px w-16 bg-line-strong sm:block" />
      </div>
      {right ? <div className="font-mono text-[11px] tracking-widest text-ink-faint">{right}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "default" | "alert" | "signal";
}) {
  const toneClass =
    tone === "alert" ? "text-alert" : tone === "signal" ? "text-signal" : "text-ink";
  return (
    <div className="bg-base px-5 py-5">
      <div className="font-mono text-[10px] tracking-[0.2em] text-ink-faint">{label}</div>
      <div className={`mt-2 font-display text-3xl font-bold tabular-nums sm:text-4xl ${toneClass}`}>
        {value}
      </div>
      {note ? (
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">{note}</div>
      ) : null}
    </div>
  );
}

export function VendorSigil({ name, size = 36 }: { name: string; size?: number }) {
  const hue = vendorHue(name);
  const initials = name
    .split(/[\s\-_.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, size * 0.32),
        color: `hsl(${hue} 90% 68%)`,
        borderColor: `hsl(${hue} 85% 62% / 0.4)`,
        backgroundColor: `hsl(${hue} 85% 55% / 0.08)`,
      }}
      className="flex shrink-0 select-none items-center justify-center border font-display font-bold leading-none"
    >
      {initials}
    </span>
  );
}

export function TypeChip({ type }: { type: ChangeType }) {
  const meta = TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border bg-base/70 px-1.5 py-[3px] font-mono text-[10px] tracking-[0.14em] ${meta.chip}`}
    >
      <span aria-hidden className="text-[8px] leading-none">
        {meta.glyph}
      </span>
      {meta.label}
    </span>
  );
}
