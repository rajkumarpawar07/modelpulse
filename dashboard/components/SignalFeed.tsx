"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Change, ChangeType } from "../../src/types";
import { SignalRow } from "./SignalRow";
import { Hud, TYPE_META, daysAgoLabel, fmtDateLong } from "./ui";

const TYPES: ChangeType[] = ["added", "changed", "deprecated", "removed", "fixed"];

const PILL_BASE =
  "flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] tracking-[0.14em] transition-colors";

function matchesWatch(c: Change, keywords: string[]): boolean {
  const hay = `${c.title} ${c.description} ${c.version ?? ""} ${c.vendor_display}`.toLowerCase();
  return keywords.some((k) => hay.includes(k.toLowerCase()));
}

function watchHitsFor(c: Change, keywords: string[]): string[] {
  if (keywords.length === 0) return [];
  const hay = `${c.title} ${c.description} ${c.version ?? ""} ${c.vendor_display}`.toLowerCase();
  return keywords.filter((k) => hay.includes(k.toLowerCase()));
}

export function SignalFeed({
  changes,
  groupByDate = false,
  watches = [],
}: {
  changes: Change[];
  groupByDate?: boolean;
  watches?: string[];
}) {
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("all");
  const [activeTypes, setActiveTypes] = useState<ChangeType[]>([]);
  const [breakingOnly, setBreakingOnly] = useState(false);
  const [watchOnly, setWatchOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const vendors = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of changes) if (!m.has(c.vendor)) m.set(c.vendor, c.vendor_display);
    return Array.from(m.entries());
  }, [changes]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return changes.filter((c) => {
      if (breakingOnly && !c.is_breaking) return false;
      if (watchOnly && watches.length > 0 && !matchesWatch(c, watches)) return false;
      if (vendor !== "all" && c.vendor !== vendor) return false;
      if (activeTypes.length > 0 && !activeTypes.includes(c.change_type)) return false;
      if (needle) {
        const hay = `${c.title} ${c.description} ${c.version ?? ""} ${c.vendor_display}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [changes, query, vendor, activeTypes, breakingOnly, watchOnly, watches]);

  const groups = useMemo(() => {
    if (!groupByDate) return [];
    const m = new Map<string, Change[]>();
    for (const c of filtered) {
      if (!m.has(c.date)) m.set(c.date, []);
      m.get(c.date)!.push(c);
    }
    return Array.from(m.keys())
      .sort((a, b) => b.localeCompare(a))
      .map((d) => ({ date: d, items: m.get(d)! }));
  }, [filtered, groupByDate]);

  const hasFilters =
    query.trim() !== "" ||
    vendor !== "all" ||
    activeTypes.length > 0 ||
    breakingOnly ||
    (watchOnly && watches.length > 0);

  function toggleType(t: ChangeType) {
    setActiveTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  function reset() {
    setQuery("");
    setVendor("all");
    setActiveTypes([]);
    setBreakingOnly(false);
    setWatchOnly(false);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[170px] max-w-xs flex-1">
          <span
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-ink-faint"
          >
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search signals · press "/"`}
            className="w-full border border-line bg-base py-1.5 pl-7 pr-3 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-signal/50 focus:outline-none"
          />
        </div>

        <div className="relative">
          <select
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            className="appearance-none border border-line bg-base py-1.5 pl-2.5 pr-7 font-mono text-[11px] tracking-wide text-ink-dim focus:border-signal/50 focus:outline-none"
          >
            <option value="all">ALL VENDORS</option>
            {vendors.map(([slug, label]) => (
              <option key={slug} value={slug}>
                {label.toUpperCase()}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] text-ink-faint"
          >
            ▾
          </span>
        </div>

        <button
          onClick={() => setBreakingOnly((v) => !v)}
          aria-pressed={breakingOnly}
          className={`${PILL_BASE} ${
            breakingOnly
              ? "border-alert/60 bg-alert/10 text-alert"
              : "border-line text-ink-faint hover:text-ink-dim"
          }`}
        >
          ⌁ BREAKING
        </button>

        {watches.length > 0 && (
          <button
            onClick={() => setWatchOnly((v) => !v)}
            aria-pressed={watchOnly}
            title={`Watching: ${watches.join(", ")}`}
            className={`${PILL_BASE} ${
              watchOnly
                ? "border-signal/60 bg-signal/10 text-signal"
                : "border-line text-ink-faint hover:text-ink-dim"
            }`}
          >
            ◉ WATCHES {watches.length}
          </button>
        )}

        {TYPES.map((t) => {
          const on = activeTypes.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleType(t)}
              aria-pressed={on}
              className={`${PILL_BASE} ${
                on ? `${TYPE_META[t].chip} bg-panel` : "border-line text-ink-faint hover:text-ink-dim"
              }`}
            >
              <span aria-hidden className="text-[8px] leading-none">
                {TYPE_META[t].glyph}
              </span>
              {TYPE_META[t].label}
            </button>
          );
        })}

        <span className="ml-auto font-mono text-[10px] tracking-widest text-ink-faint">
          SHOWING {filtered.length}/{changes.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Hud className="px-8 py-10 text-center">
          <p className="font-mono text-xs tracking-[0.25em] text-ink-dim">NO MATCHES</p>
          {hasFilters && (
            <button
              onClick={reset}
              className="mt-4 border border-line px-3 py-1.5 font-mono text-[10px] tracking-[0.2em] text-ink-dim transition-colors hover:border-signal/50 hover:text-signal"
            >
              RESET FILTERS
            </button>
          )}
        </Hud>
      ) : groupByDate ? (
        (() => {
          let offset = 0;
          return groups.map((g) => {
            const start = offset;
            offset += g.items.length;
            return (
              <section key={g.date} className="mb-8">
                <div className="sticky top-[92px] z-10 -mx-5 mb-1 flex items-center gap-3 border-y border-line bg-base/95 px-5 py-2.5 backdrop-blur md:-mx-6 md:top-0 md:px-6">
                  <span aria-hidden className="h-2 w-2 shrink-0 rotate-45 border border-signal bg-base" />
                  <h2 className="font-mono text-[11px] tracking-[0.2em] text-ink">{fmtDateLong(g.date)}</h2>
                  <span className="ml-auto hidden font-mono text-[10px] tracking-widest text-ink-faint sm:inline">
                    {daysAgoLabel(g.date)}
                  </span>
                  <span className="font-mono text-[10px] tracking-widest text-ink-faint">
                    {g.items.length} SIGNAL{g.items.length === 1 ? "" : "S"}
                  </span>
                </div>
                <div>
                  {g.items.map((c, i) => (
                    <SignalRow
                      key={c.id}
                      change={c}
                      seq={start + i + 1}
                      watchHits={watchHitsFor(c, watches)}
                    />
                  ))}
                </div>
              </section>
            );
          });
        })()
      ) : (
        <div>
          {filtered.map((c, i) => (
            <SignalRow key={c.id} change={c} seq={i + 1} watchHits={watchHitsFor(c, watches)} />
          ))}
        </div>
      )}
    </div>
  );
}
