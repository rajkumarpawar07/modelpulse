# CLAUDE.md — ModelPulse agent rules

## Project

ModelPulse — AI API Change Intelligence. Watches AI vendor changelogs
daily via Bright Data Scraper Studio, normalizes into SQLite, diffs
week-over-week, alerts Slack/Discord/webhook. Next.js dashboard reads
the same DB read-only.

## Pinned Scraper Studio Collector IDs

NEVER re-create these collectors. They are stable production endpoints.
If a target site changes layout, HEAL them instead:
`bdata scraper heal <collector_id> "<what broke>"` or
`POST /dca/collectors/{id}/refactor_template`.

| vendor | collector_id | url |
|---|---|---|
| openai | c_mt35uk633yulmy4ui | https://platform.openai.com/docs/changelog |
| anthropic | c_mt35zpsefr1p4nqoc | https://docs.anthropic.com/en/release-notes/overview |
| google_gemini | c_mt4b82622gyfsai046 | https://ai.google.dev/gemini-api/docs/changelog |
| mistral | c_mt3638oncytrsltmo | https://docs.mistral.ai/getting-started/changelog/ |
| cohere | c_mt363bal1b9dhuyepi | https://docs.cohere.com/changelog |
| groq | c_mt4b84pk2287wlln2x | https://console.groq.com/docs/release-notes |
| together | c_mt4b86v11x3vr12uwk | https://docs.together.ai/docs/release-notes |
| replicate | c_mt36a1uldo8r1e2zo | https://replicate.com/changelog |
| fireworks | c_mt36bqzoxmjmuuk6y | https://docs.fireworks.ai/changelog |
| huggingface | c_mt4b890219ib842kca | https://huggingface.co/docs/api-inference/en/package_reference/changelog |
| glm | c_mt4bd78whbd7waa1i | https://docs.z.ai/release-notes/new-released |
| kimi | c_mt4bi5dd17tngtta1n | https://platform.kimi.ai/blog/posts/changelog |
| minimax | c_mt4bjuen1srxirrag1 | https://platform.minimax.io/docs/release-notes/models |
| qwen | c_mt4bjxc61xdbeaifte | https://www.alibabacloud.com/help/en/model-studio/model-release-notes |
| deepseek | c_mt4blmek11fl1chf7 | https://api-docs.deepseek.com/updates |

Source of truth: `collectors.json`. To add a vendor: append an entry
with `c_REPLACE_ME`, then run `npx tsx scripts/create-collectors.ts <vendor>`.

## Commands

- `npm run scrape` — run every enabled collector (changelog-only; GitHub
  Releases sources are opt-in per vendor via `github_repo`); auto-heals
  broken ones (detect → heal → approve → re-run)
- `VENDOR_FILTER=openai npm run scrape` — one vendor only
- `npm run diff` / `npm run alert` / `npm run all` — pipeline steps
- `npm run heal -- <vendor> "what broke"` — on-demand heal via the production path
- `npm run watch -- add|remove|list <keyword>` — keyword watches
- `npm test` / `npm run typecheck` — must pass before committing
- Dashboard: `cd dashboard && npm run dev`

## Bright Data API notes (learned from production)

- Create: `POST /dca/collector` `{ "name": "...", "deliver": { "type": "api_pull" } }`
- Generate template: `POST /dca/collectors/{id}/automate_template` `{ "urls": [url] }`
  - MAX 3 concurrent generations per account → retry 429s with backoff
  - Generation takes 5–15 min; collectors 403 "does not have a template" until done
  - The pipeline auto-queues regeneration when a trigger 403s this way
- Trigger: `POST /dca/trigger?collector={id}&queue_next=1` body `[{"url": ...}]`
- Poll: `GET /dca/dataset?id={j_*}` → 202 while building, then
  `{"entries": [...]}` (wrapped!) or a bare array — handle both.
  502/503/504 are transient — keep polling, don't fail the run.
- Heal: `POST /dca/collectors/{id}/refactor_template` `{ "prompt": "..." }` (prompt ≤ 1000 chars)
- Heal progress: `GET /dca/collectors/{id}/refactor_template/progress`
  → wait for `status: "pending_answer"` (step `user_approval`)
- Approve: `POST /dca/collectors/{id}/resume_automation_job`
  `{ "message": true, "auto_save": true }` (NOT /approve — that endpoint doesn't exist)

## Conventions

- TypeScript strict, ESM (`type: module`, `.js` import suffixes in src/)
- No secrets in repo; `.env` holds BRIGHT_DATA_API_KEY
- Public data only; never scrape login-walled/paywalled sources
