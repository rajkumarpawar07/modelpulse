import Link from "next/link";
import { SignalFeed } from "../components/SignalFeed";
import { Hud, LiveDot, Metric, SectionHead, VendorSigil } from "../components/ui";
import { readLatestChanges, readStats, readWatches } from "../lib/read";

export const dynamic = "force-dynamic";

const EKG_PATH =
  "M0,60 L180,60 L206,60 L220,26 L236,92 L252,42 L264,68 L282,60 L520,60 L546,60 L559,36 L571,82 L583,50 L602,60 L898,60 L924,60 L937,18 L952,98 L968,46 L982,66 L1000,60 L1200,60";

function EkgLine() {
  return (
    <div className="relative mb-12 overflow-hidden border-y border-line bg-panel">
      <span aria-hidden className="absolute left-0 top-0 h-[7px] w-[7px] border-l border-t border-ink-faint/70" />
      <span aria-hidden className="absolute right-0 top-0 h-[7px] w-[7px] border-r border-t border-ink-faint/70" />
      <span aria-hidden className="absolute bottom-0 left-0 h-[7px] w-[7px] border-b border-l border-ink-faint/70" />
      <span aria-hidden className="absolute bottom-0 right-0 h-[7px] w-[7px] border-b border-r border-ink-faint/70" />
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none" className="block h-24 w-full sm:h-28" aria-hidden>
        <path d={EKG_PATH} fill="none" stroke="rgba(53,240,180,0.13)" strokeWidth="1.5" />
        <path
          d={EKG_PATH}
          fill="none"
          stroke="#35F0B4"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="260 1740"
          strokeDashoffset="2000"
          className="animate-ekgscan"
          style={{ filter: "drop-shadow(0 0 6px rgba(53,240,180,0.75))" }}
        />
      </svg>
    </div>
  );
}

function EmptyState() {
  return (
    <Hud className="px-8 py-12 text-center">
      <p className="font-mono text-xs tracking-[0.25em] text-ink-dim">NO SIGNAL DETECTED</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-faint">
        Populate the radar with{" "}
        <code className="border border-line bg-base px-1.5 py-0.5 font-mono text-xs text-ink-dim">npm run seed</code>{" "}
        or fetch live data with{" "}
        <code className="border border-line bg-base px-1.5 py-0.5 font-mono text-xs text-ink-dim">npm run scrape</code>.
      </p>
    </Hud>
  );
}

export default function HomePage() {
  const changes = readLatestChanges(40);
  const stats = readStats();
  const watches = readWatches().map((w) => w.keyword);
  const wow = stats.this_week_count - stats.last_week_count;
  const breakingPct = stats.total_changes
    ? Math.round((stats.total_breaking / stats.total_changes) * 100)
    : 0;

  return (
    <div className="animate-fadeup">
      <section className="mb-10">
        <div className="mb-6 flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-[0.2em]">
          <span className="flex items-center gap-2 border border-line bg-panel px-2.5 py-1 text-ink-dim">
            <LiveDot />
            SYSTEM ONLINE
          </span>
          <span className="text-ink-faint">
            {stats.vendors_active} VENDORS · {stats.total_changes.toLocaleString()} SIGNALS INDEXED
          </span>
          {watches.length > 0 && (
            <span className="text-signal/90">◉ WATCHING: {watches.join(" · ").toUpperCase()}</span>
          )}
        </div>
        <h1 className="max-w-4xl font-display text-[2.75rem] font-bold leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
          EVERY MODEL CHANGE.
          <br />
          ONE <span className="stroke-word">SIGNAL.</span>
        </h1>
        <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-dim sm:text-base">
          ModelPulse watches the changelogs of 20+ AI vendors every day, diffs them week-over-week
          and flags anything that can break your build — deprecations, removals, silent parameter
          shifts.
        </p>
      </section>

      <EkgLine />

      <section className="mb-12">
        <SectionHead index="00" title="TELEMETRY" right="WINDOW · 7 DAYS" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          <Metric label="TOTAL SIGNALS" value={stats.total_changes.toLocaleString()} note="ALL TIME" />
          <Metric
            label="BREAKING"
            value={stats.total_breaking.toLocaleString()}
            note={`${breakingPct}% OF FEED`}
            tone={stats.total_breaking > 0 ? "alert" : "default"}
          />
          <Metric
            label="THIS WEEK"
            value={stats.this_week_count.toLocaleString()}
            note={
              wow === 0
                ? "FLAT VS LAST WEEK"
                : `${wow > 0 ? "▲" : "▼"} ${Math.abs(wow)} VS LAST WEEK`
            }
            tone={wow > 0 ? "signal" : "default"}
          />
          <Metric label="VENDORS LIVE" value={String(stats.vendors_active)} note="IN ROTATION" />
        </div>
      </section>

      <section className="mb-12">
        <SectionHead index="01" title="LIVE SIGNAL FEED" right={`${changes.length} LATEST`} />
        {changes.length === 0 ? (
          <EmptyState />
        ) : (
          <SignalFeed changes={changes} watches={watches} />
        )}
      </section>

      <section>
        <SectionHead index="02" title="WATCHLIST" right="ALL VENDORS" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
          {stats.by_vendor.map((v: any) => (
            <Link
              key={v.vendor}
              href={`/vendor/${v.vendor}`}
              className="group flex items-center gap-3 bg-base px-4 py-3.5 transition-colors hover:bg-panel"
            >
              <VendorSigil name={v.vendor_display} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[13px] text-ink-dim transition-colors group-hover:text-ink">
                  {v.vendor_display}
                </div>
                <div className="truncate font-mono text-[10px] tracking-wider text-ink-faint">
                  {v.count} SIG{v.breaking > 0 ? ` · ${v.breaking} BRK` : ""}
                </div>
              </div>
            </Link>
          ))}
          {stats.by_vendor.length === 0 && (
            <div className="col-span-full bg-base px-4 py-6 text-center font-mono text-xs text-ink-faint">
              NO VENDORS INDEXED YET
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
