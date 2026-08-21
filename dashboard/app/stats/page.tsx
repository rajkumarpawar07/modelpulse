import Link from "next/link";
import { Hud, Metric, SectionHead, VendorSigil } from "../../components/ui";
import { readStats } from "../../lib/read";

export const dynamic = "force-dynamic";

function Legend() {
  return (
    <span className="flex items-center gap-4">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2 w-2 bg-signal/40" />
        TOTAL
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-2 w-2 bg-alert/80" />
        BREAKING
      </span>
    </span>
  );
}

export default function StatsPage() {
  const stats = readStats();
  const maxCount = Math.max(1, ...stats.by_vendor.map((v: any) => v.count));
  const breakingPct = stats.total_changes
    ? Math.round((stats.total_breaking / stats.total_changes) * 100)
    : 0;
  const wow = stats.this_week_count - stats.last_week_count;

  return (
    <div className="animate-fadeup">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
          ANALYTICS<span className="text-signal">.</span>
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-dim">
          Aggregate signal across every vendor on the radar. Risk is measured as the share of
          breaking entries in each vendor&apos;s feed.
        </p>
      </header>

      <section className="mb-12">
        <SectionHead index="00" title="HEADLINE NUMBERS" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
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
          <Metric label="ACTIVE VENDORS" value={String(stats.vendors_active)} note="IN ROTATION" />
        </div>
      </section>

      <section className="mb-12">
        <SectionHead index="01" title="RISK INDEX BY VENDOR" right={<Legend />} />
        <div className="border border-line">
          {stats.by_vendor.map((v: any, i: number) => {
            const w = (v.count / maxCount) * 100;
            const bw = (v.breaking / maxCount) * 100;
            const pct = v.count > 0 ? Math.round((v.breaking / v.count) * 100) : 0;
            return (
              <Link
                key={v.vendor}
                href={`/vendor/${v.vendor}`}
                className="group grid grid-cols-[28px_1fr] items-center gap-x-4 gap-y-2.5 border-b border-line px-4 py-3.5 transition-colors last:border-b-0 hover:bg-panel sm:grid-cols-[32px_minmax(120px,190px)_1fr_auto]"
              >
                <span className="font-mono text-[11px] text-ink-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <VendorSigil name={v.vendor_display} size={26} />
                  <span className="truncate text-sm text-ink-dim transition-colors group-hover:text-ink">
                    {v.vendor_display}
                  </span>
                </span>
                <span className="col-span-2 flex items-center sm:col-span-1">
                  <span className="relative h-2 w-full border border-line bg-panel">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-signal/30"
                      style={{ width: `${w}%` }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-alert/80"
                      style={{ width: `${bw}%` }}
                    />
                  </span>
                </span>
                <span className="col-span-2 flex items-center justify-between font-mono text-[11px] tabular-nums sm:col-span-1 sm:justify-end sm:gap-4">
                  <span className="text-ink-dim">{v.count} TOT</span>
                  <span className={v.breaking > 0 ? "text-alert" : "text-ink-faint"}>
                    {v.breaking} BRK
                  </span>
                  <span className="hidden text-ink-faint sm:inline">{pct}%</span>
                </span>
              </Link>
            );
          })}
          {stats.by_vendor.length === 0 && (
            <div className="bg-base px-4 py-8 text-center font-mono text-xs text-ink-faint">
              NO DATA TO ANALYZE YET
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHead index="02" title="WEEK OVER WEEK" right="7-DAY WINDOWS" />
        <Hud className="flex flex-wrap items-center gap-x-12 gap-y-5 px-6 py-6">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-faint">THIS WEEK</div>
            <div className="mt-1 font-display text-3xl font-bold tabular-nums text-signal">
              {stats.this_week_count.toLocaleString()}
            </div>
          </div>
          <div aria-hidden className="font-display text-2xl text-ink-faint">→</div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-faint">LAST WEEK</div>
            <div className="mt-1 font-display text-3xl font-bold tabular-nums text-ink-dim">
              {stats.last_week_count.toLocaleString()}
            </div>
          </div>
          <div className="ml-auto border-l border-line pl-6">
            <div className="font-mono text-[10px] tracking-[0.2em] text-ink-faint">VERDICT</div>
            <div
              className={`mt-1 font-display text-xl font-bold ${
                wow > 0 ? "text-signal" : wow < 0 ? "text-azure" : "text-ink-dim"
              }`}
            >
              {wow > 0 ? "▲ ACCELERATING" : wow < 0 ? "▼ COOLING" : "— STABLE"}
            </div>
            <div className="mt-0.5 font-mono text-[10px] tracking-widest text-ink-faint">
              NET {wow >= 0 ? "+" : ""}
              {wow} SIGNALS
            </div>
          </div>
        </Hud>
      </section>
    </div>
  );
}
