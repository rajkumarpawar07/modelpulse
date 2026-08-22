# ModelPulse — AI Handover Prompt

> Paste everything below this line into a new AI IDE session working on this repo.

---

You are taking over **ModelPulse**, a production hackathon project (Scrape-Verse × Bright Data, submission Aug 23 2026). Read this fully before touching anything. The project is DONE and deployed — your job is to preserve its behavior while you work on it. Every "gotcha" below was learned in production; skipping one will reintroduce a bug we already fixed.

## What it is

ModelPulse watches **15 public AI vendor changelogs daily** (OpenAI, Anthropic, Gemini, Mistral, Cohere, Groq, Together, Replicate, Fireworks, Hugging Face, Z.ai GLM, Kimi/Moonshot, MiniMax, Qwen/Alibaba, DeepSeek) via **Bright Data Scraper Studio collectors** (one stable `c_*` ID per vendor), normalizes every entry into one schema (`title/date/change_type/version/description/url/is_breaking/impact 0–100`), stores history in SQLite, diffs week-over-week, **detects silent edits to published entries** (field-level diffs in `change_diffs`), and outputs: Slack/Discord/webhook alerts (top-5 by impact), RSS feeds, a public JSON API, and a CI gate that fails builds on breaking changes. Its headline feature: **automated self-healing** — when a vendor's page changes and a collector degrades, the pipeline detects it, heals the scraper via Bright Data's AI (same `c_*` ID), approves at the gate, and re-runs. Fully unattended on GitHub Actions.

- Repo: `github.com/rajkumarpawar07/modelpulse` (branch `main`, push directly)
- Live dashboard: https://modelpulse-ruby.vercel.app (Vercel, root dir `dashboard/`)
- Dashboard diagnostics: `/api/diagnostics` (DB open strategy, row counts — check it first when the deploy looks wrong)

## Architecture (all TypeScript, ESM, `type: module`)

```
GitHub Actions cron 09:00 UTC (.github/workflows/daily-scrape.yml)
  → src/cli.ts scrape  (15 collectors, 4 parallel, SCRAPE_TIMEOUT_MS=600s in CI)
  → src/brightdata.ts  (direct HTTP client — no bdata CLI)
  → src/normalize.ts   (vendor-agnostic schema + detectPartialFailure)
  → src/db.ts          (better-sqlite3, WAL locally/CI; tables: changes/runs/heals/change_diffs/watches)
  → src/diff.ts → src/alert.ts (top-5 by impact; ALERT_MAX_CHANGES)
Next.js 14 dashboard in dashboard/ reads the same DB read-only.
```

Commands: `npm run scrape | diff | alert | all | heal -- <vendor> "what broke" | watch -- add|list|remove <kw> | test | typecheck` · single vendor: `VENDOR_FILTER=openai npm run scrape` · dashboard: `cd dashboard && npm run dev`. Tests: 118, must pass. `CLAUDE.md` holds the pinned collector-ID table; `collectors.json` is the source of truth.

## The Bright Data API contract (verified in production — do not "fix" these)

- Create: `POST /dca/collector` `{name, deliver:{type:"api_pull"}}` then `POST /dca/collectors/{id}/automate_template` `{urls:[url]}`. **Max 3 concurrent generations per account** → 429s need ~75s backoff retries. Generation takes 5–15 min server-side; until then triggering 403s `"Collector does not have a template"`.
- **Dead collectors cannot be regenerated**: `automate_template` on a failed/disabled collector returns `403 Not allowed`. The only fix is creating a FRESH collector and updating `collectors.json`. (Gemini has died twice this way; ai.google.dev seems to break generation.)
- Run: `POST /dca/trigger?collector=c_*` body `[{"url":...}]` → `{collection_id}`; poll `GET /dca/dataset?id=j_*`. Payloads are bare arrays OR wrapped in `entries|results|data|items|rows|changelog_entries` — `unwrapDataset()` handles all. 202 = building. **502/503/504 are transient — keep polling, never fail the run.**
- **Slow jobs are normal** (Anthropic/Cohere/Qwen, first runs of new templates can exceed 10 min). On timeout we save the collection_id to `data/pending-jobs.json` and the NEXT run polls that job to completion instead of re-triggering (24h max age). The workflow commits this file. Do not remove the pending-resume logic.
- Heal: `POST /dca/collectors/{id}/refactor_template` `{"prompt": "...", "custom_input": []}` (prompt ≤1000 chars; a `description` field gets 400). Poll `GET .../refactor_template/progress` until `status: "pending_answer"` (the gate); approve via `POST .../resume_automation_job` `{"message": true, "auto_save": true}` — there is NO `/approve` endpoint. **Approve only at the gate**; approving early 400s ("Invalid ide automation"). HTTP 409 = a previous heal is still running → adopt it (poll+approve) rather than submitting a new one.
- Self-heal triggers on three signals: errors, 0 rows, **partial breakage** (`detectPartialFailure`: title/date/change_type missing from >50% of rows — catches the classic post-redesign null-field failure). Repair cooldown: one attempt per vendor per window (HEAL_COOLDOWN_HOURS=20, REGEN_COOLDOWN_HOURS=48) — time-based on purpose; a count-based breaker locked vendors out permanently once. GitHub-source runs (`gh:`) must not reset failure counters.
- Field-name aliases matter: dates arrive as `date|published_at|release_date|created_at|timestamp`, versions as `version|model|model_id|model_name|release` (Cohere/Replicate taught us this).

## Deployment gotchas (Vercel — each of these was a real outage)

1. **Root Directory = `dashboard/`** and framework pinned by `dashboard/vercel.json` `{"framework":"nextjs"}` (the project once imported as "Other" and failed with "No Output Directory named public").
2. **`allowScripts: {"better-sqlite3": true}`** in dashboard/package.json — npm 11.16+/12 blocks dependency install scripts by default; without it the native binding never builds.
3. **`engines.node: "20.x"`** — Vercel defaulted to Node 24; Next 14 supports ≤22 and produced intermittent 500s on all App-Router pages.
4. **SQLite on read-only serverless**: a WAL-mode DB cannot even be *queried* readonly without the -shm sidecars. `dashboard/lib/db.ts` opens candidates validated by a REAL query (an open alone lies — WAL opens fine then fails on first query), falling back to copying the bytes to `/tmp` and opening read-write there. The deployed copy (`dashboard/data/modelpulse.db`) is converted to rollback journal (`journal_mode=DELETE`) by the workflow on every data commit. Never ship a WAL file as the deployed DB.
5. `outputFileTracingIncludes` ships `data/modelpulse.db` + `collectors.json` into every DB-reading route — `fs` reads are not auto-traced.

## Operating rules (learned the hard way)

- **The daily cron owns the databases.** Running `npm run scrape` locally writes to the same committed binaries and guarantees a merge conflict when CI's data commit lands. If a `git pull` conflicts on `data/modelpulse.db` or `dashboard/data/modelpulse.db`: do NOT pick a side — merge row-wise (ATTACH the CI blob, `INSERT OR IGNORE` changes, dedupe-copy runs/heals on (vendor, started_at, interaction_id)), keep the dashboard copy in journal_mode=DELETE, checkpoint WALs (`PRAGMA wal_checkpoint(TRUNCATE)` — an un-checkpointed committed .db is an empty shell).
- The workflow: scrape → heal → diff → alert → checkpoint WAL → convert dashboard copy to DELETE journal → sync `dashboard/collectors.json` + `data/pending-jobs.json` → commit `chore(data): daily scrape update [skip ci]` (paths-filtered so it doesn't re-trigger).
- New vendor: append an entry with `"collector_id": "c_REPLACE_ME"` to `collectors.json`, run `bash scripts/create-collectors.sh <vendor>` (direct API; 429-aware; saves after each success). Expect first data 1–2 runs later (generation + pending-resume warm-up). Update counts in README/deck/script/CLAUDE.md.
- GitHub SDK releases are intentionally NOT ingested (alerts are changelog-only; the `github_repo` opt-in exists in code).
- Secrets: `BRIGHT_DATA_API_KEY` (required) + optional `SLACK_WEBHOOK_URL`/`DISCORD_WEBHOOK_URL`/`WEBHOOK_URL` as GitHub repo secrets. Never commit `.env`.

## Current state (as of Aug 22 2026)

Working: OpenAI, Mistral, Fireworks, Replicate (127 rows after the `changelog_entries` fix). Recovering via pending-resume on the next runs: Anthropic, Cohere, GLM, Kimi, MiniMax, Qwen, DeepSeek (their jobs run longer than one window — data lands on the following cron). Warming up (templates generating): Groq, Together, Hugging Face (fresh collectors). Problem child: Google Gemini — generation has failed/disabled twice server-side; harmless (instant 403, cooldown-gated). Real heal evidence in `docs/live-heal-log.md` (Fireworks `ia_mt3bwk3f1l3wyn63hq` — detect→heal→approve→recover; Cohere `ia_mt46xgqkuapp1cdid`).

Key docs: README.md (full manual) · docs/self-healing.md · docs/live-heal-log.md · docs/demo-video-script.md + docs/modelpulse-demo-deck.pptx (5-min demo, record with these) · CLAUDE.md (agent rules + collector table).

## House rules

- `npm test` (118) and `npm run typecheck` must pass before every commit. Pure functions have Vitest suites — extend them when you touch normalize/impact/diff/alert/db/brightdata logic.
- Keep claims honest — every number in the README is real; if you change behavior, update README/CLAUDE.md/deck/script together.
- Public changelogs only, no login-walled sources, no personal data, no secrets in repo or demos.
