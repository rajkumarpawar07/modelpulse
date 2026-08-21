#!/usr/bin/env bash
# ============================================================================
# create-collectors.sh
# ----------------------------------------------------------------------------
# Creates ALL ModelPulse Scraper Studio collectors in one shot.
# Run this once on Day 1 to generate the 20 c_* collector IDs.
#
# Usage:  ./scripts/create-collectors.sh
#
# Requirements:
#   - You have run `bdata login` already
#   - You have a free Bright Data account (5,000 credits/month)
#   - You have applied promo code "wemakedevs" in Billing
#
# After running, paste the printed c_* IDs into ../collectors.json
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."

# Sanity check
if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx not found. Install Node.js 20+ first: https://nodejs.org"
  exit 1
fi

echo "🕷️  ModelPulse — Creating 20 Scraper Studio collectors"
echo "========================================================"
echo ""
echo "This will create 20 c_* collector IDs and save them to collectors.json."
echo "Each one takes ~30–60s. Total time: ~15–20 minutes."
echo ""
read -rp "Press ENTER to start, or Ctrl+C to cancel..."

# Helper function
create_collector() {
  local name="$1"
  local url="$2"
  local description="$3"

  echo ""
  echo "────────────────────────────────────────────────────────"
  echo "▶ Creating: $name"
  echo "  URL: $url"
  echo ""

  # Run bdata scraper create and capture the output
  # The CLI prints the collector_id to stdout in a "collector_id" field
  local output
  output=$(npx -p @brightdata/cli bdata scraper create "$url" "$description" --name "modelpulse-$name" 2>&1) || {
    echo "⚠️  Failed to create $name. Skipping."
    echo "    Output: $output"
    return 1
  }

  # Extract c_* ID from the output
  local cid
  cid=$(echo "$output" | grep -oE 'c_[a-z0-9]{10,}' | head -n1 || true)

  if [ -z "$cid" ]; then
    echo "⚠️  No collector_id found in output for $name."
    echo "    Output: $output"
    return 1
  fi

  echo "✅ $name → $cid"

  # Append to a temp file we'll merge into collectors.json at the end
  echo "$name|$cid|$url" >> /tmp/modelpulse_collectors.txt
}

# ============================================================================
# Tier 1 — Top 10 (must-have)
# ============================================================================
create_collector "openai" \
  "https://platform.openai.com/docs/changelog" \
  "Extract every changelog entry. For each entry: title, version, date (YYYY-MM-DD), change_type (one of: added, changed, deprecated, removed, fixed), description, url. Skip navigation, footer, hero sections, and any non-changelog content."

create_collector "anthropic" \
  "https://docs.anthropic.com/en/release-notes/overview" \
  "Extract every release-notes entry. For each entry: title, date (YYYY-MM-DD), version_or_model (e.g. claude-3-5-sonnet), change_type (added, changed, deprecated, removed, fixed), description, url. Skip nav, footer, and unrelated docs."

create_collector "google_gemini" \
  "https://ai.google.dev/gemini-api/docs/changelog" \
  "Extract every changelog row. For each row: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer, and unrelated content."

create_collector "mistral" \
  "https://docs.mistral.ai/getting-started/changelog/" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer, and unrelated content."

create_collector "cohere" \
  "https://docs.cohere.com/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer, ads."

create_collector "groq" \
  "https://console.groq.com/docs/release-notes" \
  "Extract every release-notes entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer, login prompts."

create_collector "together" \
  "https://docs.together.ai/docs/release-notes" \
  "Extract every release-notes entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

create_collector "replicate" \
  "https://replicate.com/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), category, description, url. Skip nav, footer, popular models sections."

create_collector "fireworks" \
  "https://docs.fireworks.ai/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

create_collector "huggingface" \
  "https://huggingface.co/docs/api-inference/en/package_reference/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer, intro."

# ============================================================================
# Tier 2 — Add 5 more (recommended)
# ============================================================================
create_collector "perplexity" \
  "https://docs.perplexity.ai/changelog/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), change_type, description, url. Skip nav, footer."

create_collector "anyscale" \
  "https://docs.anyscale.com/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

create_collector "aws_bedrock" \
  "https://docs.aws.amazon.com/bedrock/latest/userguide/doc-history.html" \
  "Extract every doc-history entry. For each: title, date (YYYY-MM-DD), change_type, description, url. Skip nav, footer, sidebars."

create_collector "azure_openai" \
  "https://learn.microsoft.com/en-us/azure/ai-services/openai/whats-new" \
  "Extract every whats-new entry. For each: title, date (YYYY-MM-DD), change_type, description, url. Skip nav, footer."

create_collector "xai" \
  "https://docs.x.ai/docs/release-notes" \
  "Extract every release-notes entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

# ============================================================================
# Tier 3 — Stretch (5 more if Tier 1 and 2 succeed)
# ============================================================================
create_collector "cerebras" \
  "https://inference-docs.cerebras.ai/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

create_collector "sambanova" \
  "https://docs.sambanova.ai/docs/get-started/release-notes" \
  "Extract every release-notes entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

create_collector "deepseek" \
  "https://api-docs.deepseek.com/updates" \
  "Extract every updates entry. For each: title, date (YYYY-MM-DD), change_type, description, url. Skip nav, footer."

create_collector "elevenlabs" \
  "https://elevenlabs.io/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), change_type, description, url. Skip nav, footer, hero."

create_collector "voyage" \
  "https://docs.voyageai.com/docs/changelog" \
  "Extract every changelog entry. For each: title, date (YYYY-MM-DD), version, change_type, description, url. Skip nav, footer."

# ============================================================================
# Write the consolidated collectors.json
# ============================================================================
echo ""
echo "────────────────────────────────────────────────────────"
echo "📝 Writing collectors.json..."

# Build JSON
if [ ! -f /tmp/modelpulse_collectors.txt ] || [ ! -s /tmp/modelpulse_collectors.txt ]; then
  echo "❌ No collectors were created. Aborting."
  exit 1
fi

{
  echo "{"
  echo "  \"_comment\": \"Generated by scripts/create-collectors.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ). The c_* IDs are stable; never re-create them.\","
  echo "  \"_schema\": \"Each entry has: vendor, collector_id, url, vendor_display, vendor_homepage, tier\","
  echo "  \"collectors\": ["

  first=1
  while IFS='|' read -r name cid url; do
    [ -z "$name" ] && continue
    if [ $first -eq 0 ]; then echo ","; fi
    first=0

    # Pretty display name + homepage
    case "$name" in
      openai)            disp="OpenAI"; hp="https://openai.com" ;;
      anthropic)         disp="Anthropic"; hp="https://anthropic.com" ;;
      google_gemini)     disp="Google Gemini"; hp="https://ai.google.dev" ;;
      mistral)           disp="Mistral AI"; hp="https://mistral.ai" ;;
      cohere)            disp="Cohere"; hp="https://cohere.com" ;;
      groq)              disp="Groq"; hp="https://groq.com" ;;
      together)          disp="Together AI"; hp="https://together.ai" ;;
      replicate)         disp="Replicate"; hp="https://replicate.com" ;;
      fireworks)         disp="Fireworks AI"; hp="https://fireworks.ai" ;;
      huggingface)       disp="Hugging Face"; hp="https://huggingface.co" ;;
      perplexity)        disp="Perplexity"; hp="https://perplexity.ai" ;;
      anyscale)          disp="Anyscale"; hp="https://anyscale.com" ;;
      aws_bedrock)       disp="AWS Bedrock"; hp="https://aws.amazon.com/bedrock" ;;
      azure_openai)      disp="Azure OpenAI"; hp="https://azure.microsoft.com" ;;
      xai)               disp="xAI"; hp="https://x.ai" ;;
      cerebras)          disp="Cerebras"; hp="https://cerebras.net" ;;
      sambanova)         disp="SambaNova"; hp="https://sambanova.ai" ;;
      deepseek)          disp="DeepSeek"; hp="https://deepseek.com" ;;
      elevenlabs)        disp="ElevenLabs"; hp="https://elevenlabs.io" ;;
      voyage)            disp="Voyage AI"; hp="https://voyageai.com" ;;
      *)                 disp="$name"; hp="" ;;
    esac

    # Tier
    case "$name" in
      openai|anthropic|google_gemini|mistral|cohere|groq|together|replicate|fireworks|huggingface) tier=1 ;;
      perplexity|anyscale|aws_bedrock|azure_openai|xai) tier=2 ;;
      *) tier=3 ;;
    esac

    cat <<EOF
    {
      "vendor": "$name",
      "vendor_display": "$disp",
      "vendor_homepage": "$hp",
      "collector_id": "$cid",
      "url": "$url",
      "tier": $tier
    }
EOF
  done < /tmp/modelpulse_collectors.txt

  echo ""
  echo "  ]"
  echo "}"
} > collectors.json

rm -f /tmp/modelpulse_collectors.txt

echo ""
echo "✅ collectors.json written with $(grep -c 'collector_id' collectors.json) collectors."
echo ""
echo "👉 Next steps:"
echo "   1. cat collectors.json | head -40      # inspect"
echo "   2. npm install                          # install deps"
echo "   3. cp .env.example .env                 # fill in your keys"
echo "   4. npm run scrape                       # run the pipeline"
echo "   5. cd dashboard && npm install && npm run dev"
echo ""
echo "🚀 You're shipping. Go."
