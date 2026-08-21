import { SignalFeed } from "../../components/SignalFeed";
import { Hud } from "../../components/ui";
import { readLatestChanges } from "../../lib/read";

export const dynamic = "force-dynamic";

function EmptyState() {
  return (
    <Hud className="px-8 py-12 text-center">
      <p className="font-mono text-xs tracking-[0.25em] text-ink-dim">TIMELINE EMPTY</p>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-faint">
        Run the scraper or seed the database to start recording signals.
      </p>
    </Hud>
  );
}

export default function TimelinePage() {
  const changes = readLatestChanges(200);

  return (
    <div className="animate-fadeup">
      <header className="mb-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-5xl">
          TIMELINE<span className="text-signal">.</span>
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-dim">
          Every captured signal in chronological order, grouped by day. Filter by vendor, type or
          search to isolate exactly what you care about.
        </p>
      </header>

      {changes.length === 0 ? (
        <EmptyState />
      ) : (
        <SignalFeed changes={changes} groupByDate />
      )}
    </div>
  );
}
