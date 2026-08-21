#!/usr/bin/env bash
# ============================================================================
# setup.sh — One-command bootstrap.
#
# 1. Installs Node deps
# 2. Sets up .env
# 3. Logs into Bright Data (if not already)
# 4. Creates any missing collectors (skipped when real c_* IDs already exist)
# 5. Runs the first scrape
#
# Run on a fresh clone: ./scripts/setup.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# --- 1. Pre-flight -----------------------------------------------------------
echo ""
echo "🕷️  ModelPulse — Setup"
echo "========================================================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found. Install Node.js 20+ from https://nodejs.org"
  exit 1
fi
NODE_VERSION=$(node -v)
echo "✅ Node.js: $NODE_VERSION"

# --- 2. Install deps ---------------------------------------------------------
echo ""
echo "📦 Installing dependencies..."
npm install

# --- 3. .env -----------------------------------------------------------------
if [ ! -f .env ]; then
  echo ""
  echo "📝 Creating .env from template..."
  cp .env.example .env
  echo "   ⚠️  Edit .env and add your BRIGHT_DATA_API_KEY"
  echo "   (Get it from https://brightdata.com/cp/setting)"
  echo "   (If you haven't claimed your \$50 promo yet, enter code 'wemakedevs' in Billing)"
  read -rp "Press ENTER after you've filled in .env..."
else
  echo "✅ .env already exists"
fi

# --- 4. Bright Data login ----------------------------------------------------
echo ""
echo "🔐 Logging into Bright Data..."
if npx -p @brightdata/cli bdata status 2>/dev/null | grep -q "Logged in"; then
  echo "✅ Already logged in"
else
  echo "   Running: npx -p @brightdata/cli bdata login"
  npx -p @brightdata/cli bdata login
fi

# --- 5. Create collectors ---------------------------------------------------
echo ""
# Skip creation if collectors.json already has real c_* IDs (this repo ships
# with 10 live collectors; the script below only fills c_REPLACE_ME entries).
if grep -q 'c_REPLACE_ME' collectors.json 2>/dev/null; then
  echo "🕷️  Creating the missing Scraper Studio collectors..."
  echo "   (Each takes ~5–15 min; the script saves progress after every success.)"
  read -rp "Press ENTER to start, or Ctrl+C to cancel..."
  bash scripts/create-collectors.sh
else
  echo "✅ collectors.json already has real c_* collector IDs — skipping creation."
  echo "   (To add a new vendor: add a c_REPLACE_ME entry, then run scripts/create-collectors.sh <vendor>)"
fi

# --- 6. First scrape --------------------------------------------------------
echo ""
echo "🚀 Running first scrape to verify everything works..."
npm run scrape

echo ""
echo "========================================================"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run the dashboard:    cd dashboard && npm install && npm run dev"
echo "  2. Push to GitHub:       git remote add origin <url> && git push -u origin main"
echo "  3. Deploy dashboard:     cd dashboard && vercel"
echo "  4. Add GitHub secrets:   BRIGHT_DATA_API_KEY, SLACK_WEBHOOK_URL (in repo Settings → Secrets)"
echo "  5. Record demo:          follow scripts/demo-heal.sh"
echo ""
echo "🚀 Go ship."
