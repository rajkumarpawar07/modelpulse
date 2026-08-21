"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LiveDot } from "./ui";

export const NAV = [
  { n: "01", label: "OVERVIEW", href: "/" },
  { n: "02", label: "TIMELINE", href: "/timeline" },
  { n: "03", label: "ANALYTICS", href: "/stats" },
  { n: "04", label: "HEALTH", href: "/health" },
];

export function PulseMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <rect x="0.5" y="0.5" width="25" height="25" stroke="rgba(237,242,247,0.2)" />
      <polyline
        points="3,15 8,15 11,7 15,21 18,12 23,12"
        stroke="#35F0B4"
        strokeWidth="1.6"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-line bg-base/80 backdrop-blur md:flex">
      <Link href="/" className="flex items-center gap-3 border-b border-line px-5 py-5">
        <PulseMark />
        <div>
          <div className="font-display text-sm font-bold leading-none tracking-wide">
            MODEL<span className="text-signal">PULSE</span>
          </div>
          <div className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-ink-faint">
            change intelligence
          </div>
        </div>
      </Link>

      <nav className="flex-1 px-3 py-6">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`group mb-1 flex items-center gap-3 border px-3 py-2.5 transition-all ${
                active ? "border-line bg-panel" : "border-transparent hover:border-line hover:bg-panel"
              }`}
            >
              <span
                className={`font-mono text-[10px] transition-colors ${
                  active ? "text-signal" : "text-ink-faint group-hover:text-signal"
                }`}
              >
                {item.n}
              </span>
              <span
                className={`font-mono text-xs tracking-[0.18em] transition-colors ${
                  active ? "text-ink" : "text-ink-dim group-hover:text-ink"
                }`}
              >
                {item.label}
              </span>
              <span
                aria-hidden
                className={`ml-auto font-mono text-[10px] transition-opacity ${
                  active ? "text-signal opacity-100" : "text-ink-faint opacity-0 group-hover:opacity-100"
                }`}
              >
                {active ? "●" : "→"}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <LiveDot />
          <span className="font-mono text-[10px] tracking-[0.2em] text-ink-dim">RADAR ACTIVE</span>
        </div>
        <a
          href="https://github.com/rajkumarpawar07/modelpulse"
          target="_blank"
          rel="noreferrer"
          className="mt-3 block font-mono text-[10px] tracking-[0.16em] text-ink-faint transition-colors hover:text-signal"
        >
          GITHUB ↗
        </a>
        <div className="mt-3 border-t border-line pt-3 font-mono text-[9px] leading-relaxed tracking-[0.14em] text-ink-faint/70">
          BUILT WITH BRIGHT DATA
          <br />
          SCRAPER STUDIO
        </div>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 border px-3 py-1.5 font-mono text-[11px] tracking-[0.18em] transition-colors ${
              active
                ? "border-signal/40 text-signal"
                : "border-transparent text-ink-dim hover:border-line hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
