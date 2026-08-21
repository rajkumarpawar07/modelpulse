import "./globals.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { MobileNav, PulseMark, Sidebar } from "../components/Sidebar";
import { Ticker } from "../components/Ticker";
import { LiveDot } from "../components/ui";
import { readLatestChanges } from "../lib/read";

export const metadata: Metadata = {
  title: "ModelPulse — AI API Change Intelligence",
  description: "Catch breaking changes in AI vendor APIs before your code does.",
};

export const viewport: Viewport = { themeColor: "#05070A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tickerItems = readLatestChanges(12);

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="alternate" type="application/rss+xml" title="ModelPulse Feed" href="/feed" />
      </head>
      <body className="min-h-screen font-display antialiased">
        <div aria-hidden className="noise-overlay" />
        <Sidebar />

        <div className="md:pl-56">
          <header className="sticky top-0 z-30 border-b border-line bg-base/90 backdrop-blur md:hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <PulseMark />
              <span className="font-display text-sm font-bold tracking-wide">
                MODEL<span className="text-signal">PULSE</span>
              </span>
              <LiveDot className="ml-auto" />
            </div>
            <MobileNav />
          </header>

          <Ticker changes={tickerItems} />

          <main className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8">{children}</main>

          <footer className="border-t border-line">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-5 font-mono text-[10px] tracking-[0.14em] text-ink-faint">
              <span>MODEL PULSE © 2026 · SCRAPE-VERSE HACKATHON × BRIGHT DATA</span>
              <span>ALL SIGNALS PUBLIC · MIT</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
