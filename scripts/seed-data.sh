#!/usr/bin/env bash
# ============================================================================
# seed-data.sh — Generate seed data for the dashboard demo.
#
# If you can't run the real scrapers yet (no API key, no credits, etc.),
# this script populates the SQLite database with realistic fake data
# so the dashboard looks alive.
#
# Run:  bash scripts/seed-data.sh
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

echo ""
echo "🌱 Seeding fake data into the database for demo purposes..."
echo ""

# Run a one-off TypeScript seed script via tsx
npx tsx scripts/seed.ts
