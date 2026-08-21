# Architecture

## High-level

ModelPulse is a four-stage pipeline:

```
Scraper Studio (10 collectors)  →  Normalize  →  Diff  →  Alert
       ↓                              ↓           ↓        ↓
   raw JSON                       SQLite       week-over- Slack/
                                                   week   Discord
                                                          webhook
```

The whole thing runs once a day via GitHub Actions, plus on-demand via `npm run all`.

## Component map

| Component | File | Role |
|-----------|------|------|
| Bright Data client | `src/brightdata.ts` | Calls `/dca/trigger` and `/dca/dataset` for each collector. Polls for results. |
| Schema | `src/types.ts` | Defines the `Change` type, the single shape every row gets normalized to. |
| Normalizer | `src/normalize.ts` | Vendor-agnostic flattener. Maps vendor-specific change_type strings to one of: `added`, `changed`, `deprecated`, `removed`, `fixed`. Generates a stable `id` per (vendor, url). Flags `deprecated` and `removed` as breaking. |
| Storage | `src/db.ts` | SQLite via `better-sqlite3`. Two tables: `changes` (idempotent on `id`) and `runs` (audit log of every scrape). |
| Diff engine | `src/diff.ts` | Compares the last N days against the prior N days. Returns only rows whose `id` is new. |
| Alerter | `src/alert.ts` | Renders the diff into Slack/Discord-flavored markdown. POSTs to incoming webhooks. |
| Orchestrator | `src/cli.ts` | The `scrape → normalize → diff → alert` entry point. `npm run all` runs all four. |
| Dashboard | `dashboard/` | Next.js 14 (App Router) + Tailwind. Read-only views of the same SQLite. |

## The data model

```sql
CREATE TABLE changes (
  id              TEXT PRIMARY KEY,        -- sha256(vendor + url)
  vendor          TEXT NOT NULL,
  vendor_display  TEXT NOT NULL,
  title           TEXT NOT NULL,
  version         TEXT,
  date            TEXT NOT NULL,           -- YYYY-MM-DD
  change_type     TEXT NOT NULL,           -- added|changed|deprecated|removed|fixed
  description     TEXT,
  url             TEXT,
  is_breaking     INTEGER NOT NULL,
  raw             TEXT,                    -- original raw row
  first_seen_at   TEXT NOT NULL
);

CREATE TABLE runs (
  id              INTEGER PRIMARY KEY,
  vendor          TEXT NOT NULL,
  collector_id    TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  finished_at     TEXT,
  status          TEXT NOT NULL,           -- running|success|failed|timeout
  rows            INTEGER,
  error           TEXT
);
```

The `id` is the heart of idempotency. The same (vendor, url) pair always produces the same `id`, so re-running a scrape never creates duplicate rows. This is also what makes `bdata scraper heal` work — the schema can be regenerated without touching the DB.

## Why we don't use the Bright Data CLI in production

`bdata` is great for interactive use, but the CLI requires an interactive `bdata login` which doesn't work in GitHub Actions. So `src/brightdata.ts` calls the underlying HTTP endpoints directly using a `BRIGHT_DATA_API_KEY` from env. Same surface, just headless.

## Why a separate dashboard project

The scraper needs to write to SQLite; the dashboard only reads from it. We separate them so they can be deployed independently. In dev they share the same file. In production you can put the dashboard on Vercel (with a different data source) and the scraper on Railway (with persistent disk).

## Cost model

- Bright Data free tier: 5,000 credits/month
- Each `bdata scraper run` against a small page ≈ 1 credit
- 10 collectors × 1 run/day × 30 days = 300 credits/month
- Plus the $50 promo credits = **months of runway**

## Scaling notes

If you go past 50 vendors, the daily scrape takes ~30 minutes. Two options:
1. Add GitHub Actions `matrix` parallelism — split collectors across 5 jobs
2. Use Scraper Studio's batch endpoint (`POST /dca/trigger` with `[{url: ...}]`) to scrape many URLs in parallel under one collector

We use option 2 implicitly: each `bdata scraper run` call sends a single URL, but the underlying `/dca/trigger` can take an array. If you have a Discovery scraper that returns a list of URLs, you can swap in the batch form.

## Why not a real database?

SQLite is the right call for a 7-day hackathon project:
- File-based, no server
- Faster than Postgres for this read pattern
- One file (`data/modelpulse.db`) you can ship in the repo
- Drizzle/Prisma is overkill

When you outgrow it (after 1M+ rows, or 5+ concurrent writers), switch to Postgres. The `db.ts` interface is small enough to swap implementations.
