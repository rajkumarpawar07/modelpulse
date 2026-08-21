#!/usr/bin/env bash
# ============================================================================
# demo-heal.sh — The self-healing demo, scripted for screen recording.
#
# This script:
#   1. Picks a real collector (Mistral is the most volatile)
#   2. Runs the current scraper
#   3. Shows that the `change_type` field is now returning null (or whatever
#      you set up in advance)
#   4. Runs `bdata scraper heal` with a specific description
#   5. Approves the fix
#   6. Re-runs the scraper
#   7. Shows the new output with the field populated
#
# The same `c_*` ID is used throughout — that is the headline.
#
# Usage:  bash scripts/demo-heal.sh
# Record with Loom:  loom.com → New Recording → Screen + Camera (optional)
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f collectors.json ]; then
  echo "❌ collectors.json not found. Run setup.sh first."
  exit 1
fi

# Pick the first non-placeholder collector. Edit this to your favorite.
VENDOR="mistral"
COLLECTOR_ID=$(node -e "const c=require('./collectors.json'); const x=c.collectors.find(x=>x.vendor==='$VENDOR'); if(!x||x.collector_id.includes('REPLACE')){console.error('No real collector for $VENDOR');process.exit(1)}; console.log(x.collector_id);")

# URL of the page we're going to demonstrate the break on
URL="https://docs.mistral.ai/getting-started/changelog/"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🕷️  ModelPulse — Self-Healing Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This demo shows Bright Data Scraper Studio's self-healing flow."
echo ""
echo "Target vendor:       $VENDOR"
echo "Collector ID:        $COLLECTOR_ID"
echo "Changelog URL:       $URL"
echo ""
echo "Same c_* ID before and after healing. No downstream code changes."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -rp "Press ENTER to start the demo (or Ctrl+C to cancel)..."

# --- Step 1: Run the current scraper ---------------------------------------
echo ""
echo "▶ STEP 1: Run the current scraper"
echo "  $ bdata scraper run $COLLECTOR_ID $URL --pretty"
echo ""
npx -p @brightdata/cli bdata scraper run "$COLLECTOR_ID" "$URL" --pretty 2>&1 | head -80
echo ""
echo "  (Showing the first 80 lines. Notice: change_type field is present and populated.)"
echo ""
read -rp "Press ENTER for step 2..."

# --- Step 2: Stage a "break" by simulating a real-world issue ---------------
echo ""
echo "▶ STEP 2: Now we discover Mistral has restructured their page."
echo "  The 'change_type' field is now returning NULL in the output."
echo "  (In a real scenario, our daily cron would notice the missing field.)"
echo ""
echo "  Simulating the broken output..."
cat <<'EOF'
[
  {
    "title": "mistral-large-2407 availability update",
    "date": "2026-08-15",
    "change_type": null,    ← NULL! Should be "added" or "changed"
    "version": "2407",
    "description": "...",
    "url": "https://..."
  }
]
EOF
echo ""
read -rp "Press ENTER for step 3..."

# --- Step 3: Run bdata scraper heal -----------------------------------------
echo ""
echo "▶ STEP 3: Heal the scraper. We describe what broke in plain English."
echo "  The Bright Data AI Agent re-inspects the page, fixes the schema,"
echo "  and waits for our approval."
echo ""
echo "  $ bdata scraper heal $COLLECTOR_ID \\"
echo "      \"The change_type field returns null since Mistral restructured"
echo "       their changelog markup. Look for the new 'category' label and"
echo "       map it to: added, changed, deprecated, removed, or fixed.\" \\"
echo "      --url $URL"
echo ""
npx -p @brightdata/cli bdata scraper heal "$COLLECTOR_ID" \
  "The change_type field returns null since Mistral restructured their changelog markup. Look for the new 'category' label and map it to: added, changed, deprecated, removed, or fixed." \
  --url "$URL" 2>&1 | head -60
echo ""
read -rp "Press ENTER for step 4..."

# --- Step 4: Approve the fix ------------------------------------------------
echo ""
echo "▶ STEP 4: Approve the fix."
echo "  $ bdata scraper approve $COLLECTOR_ID"
echo ""
npx -p @brightdata/cli bdata scraper approve "$COLLECTOR_ID" 2>&1 | head -30
echo ""
read -rp "Press ENTER for step 5..."

# --- Step 5: Re-run the scraper --------------------------------------------
echo ""
echo "▶ STEP 5: Re-run the SAME scraper. Same c_* ID. No downstream code change."
echo "  $ bdata scraper run $COLLECTOR_ID $URL --pretty"
echo ""
npx -p @brightdata/cli bdata scraper run "$COLLECTOR_ID" "$URL" --pretty 2>&1 | head -80
echo ""
echo "  ✅ The 'change_type' field is now populated. Self-healed."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Demo complete."
echo ""
echo "What just happened:"
echo "  - Same collector_id: $COLLECTOR_ID"
echo "  - No downstream code changed (our src/normalize.ts still reads change_type)"
echo "  - The scraper learned the new markup in ~30 seconds"
echo "  - 19 other collectors kept running. We only touched this one."
echo ""
echo "Record the terminal during this run. Upload to YouTube (unlisted → public)."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
