#!/usr/bin/env bash
# ============================================================================
# setup.sh — One-command bootstrap.
#
# 1. Installs Node deps
# 2. Logs into Bright Data (if not already)
# 3. Creates the 20 collectors (interactive)
# 4. Sets up .env
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
echo "🕷️  Creating 20 Scraper Studio collectors..."
echo "   This will take ~15-20 minutes (one scraper at a time)."
read -rp "Press ENTER to start, or Ctrl+C to cancel..."
bash scripts/create-collectors.sh

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
