#!/usr/bin/env bash
# ============================================================================
# create-collectors.sh — Create Scraper Studio collectors.
#
# Thin wrapper around scripts/create-collectors.ts, which talks to the Bright
# Data API directly (no bdata login needed), merges results INTO the existing
# collectors.json (never clobbers github_repo/enabled/tier), and saves after
# every success so it's crash-safe.
#
# Usage:
#   bash scripts/create-collectors.sh                 # create all placeholders
#   bash scripts/create-collectors.sh perplexity xai  # only these vendors
#
# To add a NEW vendor: append an entry with "collector_id": "c_REPLACE_ME"
# to collectors.json, then run this script (optionally with the vendor name).
#
# Requirements:
#   - BRIGHT_DATA_API_KEY set in .env
#   - Note: Bright Data allows max 3 concurrent template generations
#     account-wide; the script retries with backoff automatically.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "❌ .env not found. Copy .env.example to .env and set BRIGHT_DATA_API_KEY."
  exit 1
fi

npx tsx scripts/create-collectors.ts "$@"
