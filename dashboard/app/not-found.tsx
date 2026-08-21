import Link from "next/link";
import { Hud } from "../components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Hud className="max-w-md px-10 py-12 text-center">
        <p className="font-display text-6xl font-bold tracking-tight">
          <span className="stroke-word">404</span>
        </p>
        <p className="mt-4 font-mono text-xs tracking-[0.25em] text-ink-dim">
          NO SIGNAL ON THIS FREQUENCY
        </p>
        <Link
          href="/"
          className="mt-6 inline-block border border-line px-4 py-2 font-mono text-[11px] tracking-[0.2em] text-ink-dim transition-colors hover:border-signal/50 hover:text-signal"
        >
          RETURN TO BASE
        </Link>
      </Hud>
    </div>
  );
}
