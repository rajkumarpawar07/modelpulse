#!/usr/bin/env node
/**
 * ModelPulse CI check — fail/warn a build when breaking AI API changes
 * were detected within the last N days.
 *
 * Usage in GitHub Actions (see examples/modelpulse-check.yml):
 *   env:
 *     MODEL_PULSE_URL: https://your-modelpulse-instance.example.com
 *     MODEL_PULSE_DAYS: 7        # look-back window (default 7)
 *     MODEL_PULSE_VENDOR: openai # optional vendor filter slug
 *     MODEL_PULSE_MODE: fail     # fail | warn (default fail)
 */
const base = (process.env.MODEL_PULSE_URL || "http://localhost:3000").replace(/\/$/, "");
const days = parseInt(process.env.MODEL_PULSE_DAYS || "7", 10);
const vendor = process.env.MODEL_PULSE_VENDOR || "";
const mode = (process.env.MODEL_PULSE_MODE || "fail").toLowerCase();

const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
const url = new URL("/api/changes", base);
url.searchParams.set("breaking", "true");
url.searchParams.set("since", since);
url.searchParams.set("limit", "100");
if (vendor) url.searchParams.set("vendor", vendor);

try {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  const data = await res.json();

  if (!data.changes || data.changes.length === 0) {
    console.log(`modelpulse ✓ no breaking AI API changes since ${since}`);
    process.exit(0);
  }

  const lines = data.changes.map(
    (c) => `  [${c.vendor_display}] ${c.date} ${String(c.change_type).toUpperCase()} — ${c.title}\n    ${c.url}`
  );
  console.error(`modelpulse ✗ ${data.count} breaking change(s) since ${since}:\n${lines.join("\n")}`);

  if (mode === "warn") {
    console.log("::warning::ModelPulse detected recent breaking AI API changes — review before release.");
    process.exit(0);
  }
  process.exit(1);
} catch (err) {
  console.error(`modelpulse check failed: ${err.message}`);
  process.exit(1);
}
