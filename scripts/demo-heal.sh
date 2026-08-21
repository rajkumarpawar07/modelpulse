#!/usr/bin/env bash
# ============================================================================
# demo-heal.sh — The self-healing demo, scripted for screen recording.
#
# Every step below runs REAL code against a REAL collector:
#   1. Run the pipeline for one vendor (VENDOR_FILTER) — shows live output
#      and the detection logic that decides when healing is needed
#   2. Trigger a heal through the production code path (`npm run heal`) —
#      the exact same HTTP calls the daily cron makes automatically:
#      POST /dca/collectors/{id}/refactor_template → poll → approve → re-run
#   3. Re-run the same collector and show the recovered data
#
# Nothing here is simulated. There is no staged "broken" output — if you
# want to demo a real break, heal runs equally well when the site actually
# changed; the cron version of this flow fires on its own (see src/cli.ts).
#
# Usage:  bash scripts/demo-heal.sh [vendor]    (default: mistral)
# Record with Loom:  loom.com → New Recording → Screen + Camera (optional)
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

VENDOR="${1:-mistral}"

if [ ! -f collectors.json ]; then
  echo "❌ collectors.json not found. Run scripts/setup.sh first."
  exit 1
fi

COLLECTOR_ID=$(node -e "const c=require('./collectors.json'); const x=c.collectors.find(x=>x.vendor==='$VENDOR'); if(!x||x.collector_id.includes('REPLACE')){console.error('No real collector for $VENDOR');process.exit(1)}; console.log(x.collector_id);")

URL=$(node -e "const c=require('./collectors.json'); console.log(c.collectors.find(x=>x.vendor==='$VENDOR').url);")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕷️  ModelPulse — Self-Healing Demo (live, nothing staged)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Target vendor:       $VENDOR"
echo "Collector ID:        $COLLECTOR_ID"
echo "Changelog URL:       $URL"
echo ""
echo "Same c_* ID before and after healing. No downstream code changes."
echo ""
read -rp "Press ENTER to start the demo (or Ctrl+C to cancel)..."

# --- Step 1: Run the pipeline for this vendor -------------------------------
echo ""
echo "▶ STEP 1: Run the pipeline for $VENDOR (VENDOR_FILTER=$VENDOR npm run scrape)"
echo "  The pipeline detects breakage on three signals:"
echo "    - hard errors        (trigger/poll failures)"
echo "    - 0 rows returned    (page moved completely)"
echo "    - partial breakage   (rows return but title/date/change_type go null)"
echo ""
VENDOR_FILTER="$VENDOR" AUTO_HEAL=false npm run scrape
echo ""
read -rp "Press ENTER for step 2..."

# --- Step 2: Heal via the production command --------------------------------
echo ""
echo "▶ STEP 2: Heal the collector through the production code path."
echo "  npm run heal -- $VENDOR \"<what broke>\""
echo ""
echo "  This is the SAME code the daily cron runs automatically when a"
echo "  collector degrades (src/cli.ts → healCollector → waitForHealReady"
echo "  → approveHeal → re-run). Equivalent Bright Data CLI for reference:"
echo "    bdata scraper heal $COLLECTOR_ID \"<what broke>\""
echo "    bdata scraper approve $COLLECTOR_ID"
echo ""
read -rp "Press ENTER to run the heal for real..."
npm run heal -- "$VENDOR" "Demo heal: re-inspect the page and make sure every entry returns title, date, change_type, description, url"
echo ""
read -rp "Press ENTER for step 3..."

# --- Step 3: Re-run and show the recovered data -----------------------------
echo ""
echo "▶ STEP 3: Re-run the SAME collector. Same c_* ID, no downstream change."
echo ""
VENDOR_FILTER="$VENDOR" AUTO_HEAL=false npm run scrape
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Demo complete."
echo ""
echo "What just happened:"
echo "  - Same collector_id throughout: $COLLECTOR_ID"
echo "  - The heal went through our production HTTP client, not a one-off script"
echo "  - Every attempt is recorded in the heals table → visible at /health"
echo "  - The daily cron runs this exact loop on its own when detection fires"
echo ""
echo "Record the terminal during this run. Upload to YouTube (unlisted → public)."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
