import { Hud, Metric, SectionHead, VendorSigil } from "../../components/ui";
import { readCollectorHealth, readHeals } from "../../lib/read";

export const dynamic = "force-dynamic";

const HEAL_STATUS_META: Record<string, { label: string; cls: string }> = {
  approved: { label: "APPROVED", cls: "border-signal/40 text-signal" },
  healed: { label: "HEALED", cls: "border-azure/40 text-azure" },
  failed: { label: "FAILED", cls: "border-alert/50 text-alert" },
  pending: { label: "PENDING", cls: "border-warn/40 text-warn" },
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (isNaN(t)) return iso;
  return new Date(t).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

export default function HealthPage() {
  const health = readCollectorHealth();
  const heals = readHeals(25);

  const healthy = health.filter((h) => h.last_run_status === "success").length;
  const degraded = health.filter((h) => h.last_run_status !== "success").length;
  const totalHeals = health.reduce((acc, h) => acc + h.total_heals, 0);
  const totalRuns = health.reduce((acc, h) => acc + h.total_runs, 0);
  const uptime = totalRuns > 0 ? Math.round((health.reduce((acc, h) => acc + h.success_runs, 0) / totalRuns) * 100) : 0;

  return (
    <div className="animate-fadeup">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
          HEALTH<span className="text-signal">.</span>
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-dim">
          Collector uptime and the self-healing record. When a vendor page changes and a collector
          degrades, the pipeline detects it, triggers a Bright Data heal on the same{" "}
          <span className="font-mono text-xs text-ink">c_*</span> collector, approves the fixed
          template, and re-runs — all without human intervention.
        </p>
      </header>

      <section className="mb-12">
        <SectionHead index="00" title="HEADLINE NUMBERS" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line md:grid-cols-4">
          <Metric label="COLLECTORS OK" value={`${healthy}/${health.length}`} note="LAST RUN SUCCEEDED" tone={degraded === 0 ? "signal" : "default"} />
          <Metric label="DEGRADED" value={String(degraded)} note="NEED ATTENTION" tone={degraded > 0 ? "alert" : "default"} />
          <Metric label="RUN UPTIME" value={`${uptime}%`} note={`${totalRuns} RUNS TOTAL`} />
          <Metric label="AUTO-HEALS" value={String(totalHeals)} note="LIFETIME" tone={totalHeals > 0 ? "signal" : "default"} />
        </div>
      </section>

      <section className="mb-12">
        <SectionHead index="01" title="COLLECTOR STATUS" right="ONE ROW PER c_* ID" />
        <div className="border border-line">
          {health.map((h) => {
            const ok = h.last_run_status === "success";
            const never = h.last_run_status === null;
            const statusCls = never
              ? "border-line text-ink-faint"
              : ok
                ? "border-signal/40 text-signal"
                : "border-alert/50 text-alert";
            return (
              <div
                key={h.vendor}
                className="grid grid-cols-[28px_minmax(110px,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3.5 last:border-b-0 sm:grid-cols-[32px_minmax(140px,200px)_1fr_auto]"
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${never ? "bg-ink-faint" : ok ? "bg-signal animate-blip" : "bg-alert"}`} />
                <span className="flex min-w-0 items-center gap-2.5">
                  <VendorSigil name={h.vendor_display} size={26} />
                  <span className="truncate text-sm text-ink-dim">{h.vendor_display}</span>
                </span>
                <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] tracking-[0.12em] text-ink-faint sm:col-span-1">
                  <span className="font-mono text-[10px]">{h.collector_id}</span>
                  <span>{h.success_runs}/{h.total_runs} RUNS</span>
                  <span>{h.total_heals > 0 ? `${h.successful_heals}/${h.total_heals} HEALS` : "NO HEALS"}</span>
                </span>
                <span className={`col-span-3 flex items-center justify-between gap-3 sm:col-span-1 sm:justify-end ${statusCls}`}>
                  <span className="font-mono text-[10px] tracking-[0.14em] text-ink-faint">
                    {fmtTime(h.last_run_at)}
                  </span>
                  <span className={`border bg-base/70 px-1.5 py-[3px] font-mono text-[10px] tracking-[0.14em] ${statusCls}`}>
                    {never ? "NEVER RUN" : ok ? "NOMINAL" : h.last_run_status!.toUpperCase()}
                  </span>
                </span>
              </div>
            );
          })}
          {health.length === 0 && (
            <div className="bg-base px-4 py-8 text-center font-mono text-xs text-ink-faint">
              NO RUN HISTORY YET — RUN `npm run scrape` FIRST
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionHead index="02" title="SELF-HEALING LOG" right="MOST RECENT FIRST" />
        {heals.length === 0 ? (
          <Hud className="px-6 py-10 text-center font-mono text-xs text-ink-faint">
            NO HEALS TRIGGERED YET — EVERY COLLECTOR HAS HELD ITS SHAPE
          </Hud>
        ) : (
          <div className="border border-line">
            {heals.map((h) => {
              const meta = HEAL_STATUS_META[h.status] ?? { label: h.status.toUpperCase(), cls: "border-line text-ink-dim" };
              return (
                <div key={h.id} className="border-b border-line px-4 py-3.5 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                    <span className={`border bg-base/70 px-1.5 py-[3px] font-mono text-[10px] tracking-[0.14em] ${meta.cls}`}>
                      {meta.label}
                    </span>
                    <span className="text-sm text-ink-dim">{h.vendor}</span>
                    <span className="font-mono text-[10px] text-ink-faint">{h.collector_id}</span>
                    <span className="ml-auto font-mono text-[10px] tracking-[0.12em] text-ink-faint">
                      {fmtTime(h.started_at)}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl font-mono text-[11px] leading-relaxed text-ink-dim">
                    ⟶ {h.trigger_reason}
                  </p>
                  {h.error && (
                    <p className="mt-1 font-mono text-[10px] text-alert">{h.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
