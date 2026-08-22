import type { Change } from "../lib/types";
import { fmtDate } from "./ui";

export function Ticker({ changes }: { changes: Change[] }) {
  if (changes.length === 0) return null;
  const items = changes.slice(0, 12);
  const track = [...items, ...items];
  return (
    <div className="ticker relative overflow-hidden border-b border-line bg-panel">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-base to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-base to-transparent" />
      <div className="ticker-track flex w-max animate-ticker whitespace-nowrap py-2">
        {track.map((c, i) => (
          <span key={`${c.id}-${i}`} className="flex items-center gap-2 px-4 font-mono text-[11px]">
            <span aria-hidden className={c.is_breaking ? "text-alert" : "text-signal"}>
              {c.is_breaking ? "▲" : "•"}
            </span>
            <span className="text-ink-faint">{fmtDate(c.date)}</span>
            <span className="text-ink-dim">{c.vendor_display}</span>
            <span className="text-ink">{c.title.length > 64 ? `${c.title.slice(0, 61)}…` : c.title}</span>
            <span aria-hidden className="pl-2 text-ink-faint/50">///</span>
          </span>
        ))}
      </div>
    </div>
  );
}
