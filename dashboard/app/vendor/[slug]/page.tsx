import Link from "next/link";
import { notFound } from "next/navigation";
import { SignalFeed } from "../../../components/SignalFeed";
import { Metric, SectionHead, VendorSigil, daysAgoLabel, fmtDate } from "../../../components/ui";
import { readVendorChanges } from "../../../lib/read";

export const dynamic = "force-dynamic";

export default function VendorPage({ params }: { params: { slug: string } }) {
  const changes = readVendorChanges(params.slug, 200);
  if (changes.length === 0) notFound();

  const display = changes[0].vendor_display;
  const breaking = changes.filter((c) => c.is_breaking).length;
  const breakingPct = changes.length ? Math.round((breaking / changes.length) * 100) : 0;
  const sortedDates = changes.map((c) => c.date).sort();
  const firstDate = sortedDates[0];
  const lastDate = sortedDates[sortedDates.length - 1];

  return (
    <div className="animate-fadeup">
      <Link
        href="/"
        className="font-mono text-[11px] tracking-[0.2em] text-ink-faint transition-colors hover:text-signal"
      >
        ← BACK TO INDEX
      </Link>

      <header className="mb-10 mt-6 flex flex-wrap items-start gap-5">
        <VendorSigil name={display} size={64} />
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            {display}
            <span className="text-signal">.</span>
          </h1>
          <p className="mt-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink-faint">
            {changes.length} signals · {breaking} breaking · last activity{" "}
            {daysAgoLabel(lastDate) || lastDate}
          </p>
        </div>
      </header>

      <section className="mb-12">
        <SectionHead index="00" title="VENDOR TELEMETRY" />
        <div className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          <Metric label="TOTAL" value={String(changes.length)} note="INDEXED ENTRIES" />
          <Metric
            label="BREAKING"
            value={String(breaking)}
            note={`${breakingPct}% OF VENDOR FEED`}
            tone={breaking > 0 ? "alert" : "default"}
          />
          <Metric label="FIRST SEEN" value={fmtDate(firstDate)} note={`EST. ${firstDate.slice(0, 4)}`} />
          <Metric label="LAST SEEN" value={fmtDate(lastDate)} note={daysAgoLabel(lastDate)} />
        </div>
      </section>

      <section>
        <SectionHead index="01" title="SIGNAL LOG" right={`${changes.length} ENTRIES`} />
        <SignalFeed changes={changes} />
      </section>
    </div>
  );
}
