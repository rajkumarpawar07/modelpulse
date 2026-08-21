# ModelPulse — AI API Change Intelligence

> Catch breaking changes in AI vendor APIs before your code does.

ModelPulse watches **20+ public AI vendor changelog pages daily**, normalizes them into a single schema, and alerts you on Slack/Discord the moment a breaking change ships. Built for the [Scrape-Verse Hackathon](https://www.wemakedevs.org/hackathons/scrape-verse) with [Bright Data Scraper Studio](https://brightdata.com).

![ModelPulse dashboard](./docs/screenshot-dashboard.png)

---

## The problem

AI vendors (OpenAI, Anthropic, Mistral, Cohere, Groq, ...) ship breaking changes weekly:

- Model deprecations
- Parameter removals
- API endpoint changes
- New authentication requirements

Most developers find out from their error logs, not from the vendor. By then, production is already down.

## The solution

A self-healing pipeline of Bright Data collectors that:

1. Scrapes 20+ public AI vendor changelog pages daily (+ optional GitHub Releases per vendor)
2. Normalizes them into one schema (SQLite), scored with a 0–100 **impact rating**
3. Diffs week-over-week, flags new changes **and detects silent edits** to old ones
4. Alerts via Slack/Discord/generic **webhooks** — optionally filtered by your **keyword watches**
5. Exposes **RSS feeds** and a public **JSON API**, so CI can fail builds on breaking changes
6. **Self-heals** when a vendor changes their changelog page layout — the same `c_*` collector ID, no downstream code change

## Live demo

- **Dashboard:** _deployed to Vercel / Railway during Day 2 of the build_
- **Demo video:** _uploaded to YouTube, link in submission form_
- **Slack alert sample:** [`examples/slack-alert-sample.json`](./examples/slack-alert-sample.json)

---

## How Bright Data Scraper Studio is used

ModelPulse is built on **20 independent Scraper Studio collectors**, one per AI vendor. Each was created with a single `bdata scraper create` command:

```bash
bdata scraper create https://platform.openai.com/docs/changelog \
  "Extract every changelog entry. For each entry: title, version, date (YYYY-MM-DD), change_type (one of: added, changed, deprecated, removed, fixed), description, url. Skip navigation, footer, hero sections, and any non-changelog content."
```

Bright Data's AI Agent wrote the scraper code, returned a stable `c_*` collector ID, and from then on we've been calling that ID like an API:

```bash
bdata scraper run c_openai_xxx https://platform.openai.com/docs/changelog --pretty
```

For the full list of all 20 collectors and the exact creation prompts, see [`scripts/create-collectors.sh`](./scripts/create-collectors.sh).

### The three CLI commands at the heart of ModelPulse

| Command | What it does | How ModelPulse uses it |
|---------|--------------|------------------------|
| `bdata scraper create` | Generate a scraper from a URL + natural-language description | One-time per vendor; creates our 20 collectors |
| `bdata scraper run` | Execute a scraper on a URL and return structured data | Called by `npm run scrape` against all 20 collectors |
| `bdata scraper heal` | Fix an existing scraper in place via AI self-healing | Called by `npm run demo:heal` to show the headline demo |

Under the hood, the CLI maps to four Bright Data HTTP endpoints:
- `POST /dca/collector` + `POST /dca/collectors/{c_*}/automate_template` (create)
- `POST /dca/trigger_immediate` + `GET /dca/get_result` (run, small input)
- `POST /dca/trigger` + `GET /dca/dataset?id=j_*` (run, large/batch input)
- `POST /dca/collectors/{id}/refactor_template` (heal)

See [`src/brightdata.ts`](./src/brightdata.ts) for our direct-HTTP client that calls these endpoints without the CLI (so it runs in GitHub Actions without an interactive login).

### Self-healing — the headline feature

When a vendor redesigns their changelog page, our scraper starts returning null or partial data. We fix it in place with:

```bash
bdata scraper heal c_mistral_xxx \
  "The change_type field returns null since they restructured. Look for the new 'category' label and use its value."

bdata scraper approve c_mistral_xxx
```

**The `c_*` ID stays the same across heals.** No downstream code changes. See [`docs/self-healing.md`](./docs/self-healing.md) for the full demo transcript.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  GitHub Actions (cron)                      │
│                  daily 09:00 UTC = 14:30 IST                │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  src/cli.ts scrape         │
         │  - Loop over 20 collectors │
         │  - POST /dca/trigger       │
         │  - Poll /dca/dataset       │
         └────────────┬───────────────┘
                      │ raw JSON per vendor
                      ▼
         ┌────────────────────────────┐
         │  src/normalize.ts          │
         │  Vendor-agnostic schema:   │
         │  vendor, title, version,   │
         │  date, change_type,        │
         │  is_breaking, url          │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  SQLite (data/modelpulse.db)│
         │  changes, runs             │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  src/diff.ts               │
         │  Week-over-week comparison │
         │  Flag new + breaking       │
         └────────────┬───────────────┘
                      │
                      ▼
         ┌────────────────────────────┐
         │  src/alert.ts              │
         │  POST Slack / Discord hook │
         └────────────────────────────┘

The Next.js dashboard reads from the same SQLite database:
  /                → This week, all vendors
  /vendor/[slug]   → All changes for one vendor
  /timeline        → Visual timeline grouped by date
  /stats           → Top vendors, breaking-change frequency
```

---

## Quick start

### Prerequisites
- Node.js 20+ ([nodejs.org](https://nodejs.org))
- A free [Bright Data](https://brightdata.com) account (5,000 credits/month, no card required)
- Apply promo code **`wemakedevs`** in Billing for an extra $50 in credits
- A Slack incoming webhook URL (optional, for alerts) — get one at `https://api.slack.com/messaging/webhooks`
- A GitHub account (for free Actions cron + Vercel-style deploy)

### One-command setup

```bash
git clone <your-repo-url> modelpulse
cd modelpulse
bash scripts/setup.sh
```

The setup script will:
1. Install Node deps
2. Verify `bdata login`
3. Create all 20 Scraper Studio collectors (≈15 min)
4. Write `.env` from the template
5. Run the first scrape so you can see the pipeline working

### Manual setup (if you prefer)

```bash
# 1. Install
npm install

# 2. Log in to Bright Data
npx -p @brightdata/cli bdata login

# 3. Configure
cp .env.example .env
# Edit .env: set BRIGHT_DATA_API_KEY and (optionally) SLACK_WEBHOOK_URL

# 4. Create the 20 collectors
bash scripts/create-collectors.sh
# → writes collectors.json with 20 c_* IDs

# 5. Run the full pipeline
npm run all
# → scrape → normalize → diff → alert

# 6. Start the dashboard
cd dashboard
npm install
npm run dev
# → open http://localhost:3000
```

### Useful commands

```bash
npm run scrape        # Run all 20 collectors (+ GitHub Releases sources)
npm run diff          # Compute the week-over-week diff
npm run alert         # Send the alert to Slack/Discord/webhook
npm run all           # Full pipeline: scrape → diff → alert
npm run watch -- add "rate limit"   # add a keyword watch
npm run watch -- list               # list / remove watches
npm run seed          # Populate demo data without scraping
npm run demo:heal     # Stage the self-healing demo (run on Day 3)
npm run typecheck     # TypeScript validation
```

---

## Capabilities

### RSS feeds

Subscribe from any RSS reader, Slack feed app, or automation tool:

- All vendors: **`/feed`**
- Per vendor: **`/feed/openai`**, `/feed/anthropic`, … (any vendor slug)

### Public JSON API

Everything the dashboard shows, available to scripts and integrations:

```
GET /api/changes?limit=100&breaking=true&since=2026-08-14&vendor=openai&type=deprecated
```

| Param | Values | Default |
|---|---|---|
| `limit` | 1–500 | 50 |
| `vendor` | vendor slug (e.g. `openai`) | all |
| `type` | added · changed · deprecated · removed · fixed | all |
| `since` | YYYY-MM-DD | — |
| `breaking` | `true` for breaking-only | false |

CORS is enabled — call it from anywhere.

### Keyword watches

Watch only what you care about:

```bash
npm run watch -- add "rate limit"
npm run watch -- add deprecat
npm run watch -- remove "rate limit"   # or by id
npm run watch -- list
```

Set `ALERT_WATCH_ONLY=true` in `.env` so alerts fire only on watch matches. The dashboard highlights matching entries with a ◉ tag and adds a WATCHES filter pill.

### Impact scoring

Every change gets a deterministic 0–100 severity score — change type + breaking flag + risk keywords (auth, pricing, rate-limit, deprecation…). Shown as IMPACT badges in the dashboard and stored in the `impact` column for sorting/analytics. See [`src/impact.ts`](./src/impact.ts).

### Structured diffing (mutation detection)

Changelog entries get edited after publication — silently. Every scrape compares each entry field-by-field against what we stored; edits are recorded into the `change_diffs` table (field, old → new), the row gets an `updated_at`, and the dashboard flags edited entries with an ↻ EDITED badge.

### Multi-source ingestion (GitHub Releases)

Any collector can also ingest GitHub Releases by adding one line in `collectors.json`:

```json
{ "vendor": "openai", "...": "...", "github_repo": "openai/openai-python" }
```

Releases flow through the same normalizer as scraped changelogs. Disable with `ENABLE_GITHUB=false`.

### Generic webhooks (Zapier / Make / n8n)

Set `WEBHOOK_URL` in `.env` to receive structured JSON alerts (sample: [`examples/webhook-payload.json`](./examples/webhook-payload.json)):

```json
{
  "event": "modelpulse.alert",
  "is_breaking": true,
  "count": 3,
  "changes": [ { "title": "...", "impact": 88, "...": "..." } ]
}
```

Works with Zapier's *Catch Hook*, Make custom webhooks, n8n, or your own endpoint.

### CI: fail builds on breaking changes

Drop this into any repo that builds on AI vendor APIs — sample workflow in [`examples/modelpulse-check.yml`](./examples/modelpulse-check.yml):

```bash
node ci/check-breaking.mjs
# env:
#   MODEL_PULSE_URL    — your ModelPulse instance
#   MODEL_PULSE_DAYS   — look-back window (default 7)
#   MODEL_PULSE_VENDOR — optional vendor filter slug
#   MODEL_PULSE_MODE   — fail (exit 1) | warn (::warning)
```

Exits non-zero if breaking changes shipped within the window — catch drift before deploy, not after.

---

## Repository structure

```
modelpulse/
├── README.md                          # you are here
├── LICENSE                            # MIT
├── package.json                       # Node deps + scripts
├── tsconfig.json                      # TypeScript config
├── collectors.json                    # 20 c_* collector IDs
├── .env.example                       # template (copy to .env)
├── .gitignore
├── IMPLEMENTATION.md                  # the full implementation guide
├── src/                               # Node.js + TypeScript backend
│   ├── types.ts                       # unified Change schema
│   ├── db.ts                          # SQLite wrapper + watches + mutation diffing
│   ├── brightdata.ts                  # Scraper Studio HTTP client
│   ├── normalize.ts                   # vendor-agnostic schema
│   ├── impact.ts                      # 0-100 severity scoring
│   ├── diff.ts                        # week-over-week diff engine
│   ├── alert.ts                       # Slack/Discord/webhook dispatcher
│   ├── cli.ts                         # the main entry point (+ watch commands)
│   └── sources/
│       └── github.ts                  # GitHub Releases source adapter
├── dashboard/                         # Next.js 14 dashboard ("SIGNAL" mission-control UI)
│   ├── app/
│   │   ├── page.tsx                   # / — overview + live feed
│   │   ├── timeline/page.tsx          # /timeline
│   │   ├── stats/page.tsx             # /stats — risk index, WoW verdict
│   │   ├── vendor/[slug]/page.tsx     # /vendor/openai, etc.
│   │   ├── feed/route.ts              # RSS (all vendors)
│   │   ├── feed/[vendor]/route.ts     # RSS per vendor
│   │   ├── api/changes/route.ts       # public JSON API
│   │   └── layout.tsx
│   ├── components/
│   │   ├── SignalFeed.tsx             # filterable feed (search/vendor/type/watches)
│   │   ├── SignalRow.tsx              # log row + copy-as-markdown + badges
│   │   ├── Sidebar.tsx                # mission-control nav
│   │   ├── Ticker.tsx                 # scrolling latest-signals ticker
│   │   └── ui.tsx                     # HUD panels, sigils, chips
│   ├── lib/
│   │   ├── db.ts                      # read-only DB access
│   │   ├── read.ts                    # guarded data readers
│   │   └── rss.ts                     # RSS XML builder
│   └── package.json
├── ci/
│   └── check-breaking.mjs             # CI gate: fail builds on breaking changes
├── scripts/
│   ├── create-collectors.sh           # creates all 20 c_* IDs
│   ├── setup.sh                       # one-command bootstrap
│   ├── demo-heal.sh                   # the self-healing demo
│   ├── seed-data.sh                   # populate fake data
│   └── seed.ts                        # the seed script
├── .github/workflows/
│   └── daily-scrape.yml               # cron: 09:00 UTC daily
├── docs/
│   ├── architecture.md
│   ├── self-healing.md                # the demo transcript
│   ├── why-modelpulse.md
│   └── screenshot-dashboard.png       # ← ADD THIS (screenshot your dashboard)
├── examples/
│   ├── openai-sample.json
│   ├── anthropic-sample.json
│   ├── mistral-sample.json
│   ├── all-vendors-this-week.json
│   ├── slack-alert-sample.json
│   ├── webhook-payload.json           # generic webhook sample (Zapier/Make)
│   └── modelpulse-check.yml           # CI workflow sample for consumer repos
├── raw/                               # ← raw scrape outputs (debug)
└── data/                              # ← SQLite DB lives here
```

---

## AI tool disclosure

This project was built with the assistance of **Claude Code** (Sonnet 4.5), using the official [Bright Data `scraper-studio` skill](https://github.com/brightdata/skills). AI assistance was used to:

- Scaffold the Next.js dashboard
- Write the diff and normalize logic
- Generate JSON example outputs and the seed script

All architectural decisions, scraper design choices, vendor selection, prompt engineering, and product trade-offs were made by the project author. The Bright Data collector prompts in `scripts/create-collectors.sh` were written and refined manually to handle the specific structure of each vendor's changelog page.

---

## License

MIT — see [LICENSE](./LICENSE).

## Acknowledgments

- [Bright Data](https://brightdata.com) for Scraper Studio and the `bdata` CLI
- [WeMakeDevs](https://www.wemakedevs.org) for hosting the Scrape-Verse Hackathon
- The 20 AI vendors whose public changelogs make this project possible
