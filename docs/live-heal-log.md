# Live Self-Healing Log — Real Collector, Real Heal

> Two real self-healing events, both driven by ModelPulse's **automated**
> pipeline (no human at the keyboard): a manual-quality heal on 2026-08-21
> (below) and a fully autonomous detect → heal → approve → recover cycle on
> 2026-08-22 ([second entry](#event-2--2026-08-22-fully-autonomous-heal--recovery)).

## Event 2 — 2026-08-22: fully autonomous heal + recovery

`npm run scrape` (the same code the daily cron runs) against all 10
collectors. Detection, healing, approval, and recovery all happened inside
one pipeline run.

**Detection fired on three real signals:**

```
❌ Anthropic       — Dataset fetch failed (HTTP 502, transient gateway error)
❌ Groq/Together/HF — Trigger 403: "Collector does not have a template"
✅ Fireworks AI    — 29 rows … but partial breakage:
                    "Partial breakage: 29/29 rows are missing change_type.
                     The page likely changed under the scraper."
```

The Fireworks case is the classic silent failure: rows still flow, dashboards
still render, but the field that drives impact scoring and breaking-change
alerts (`change_type`) had gone null for **every** entry. `detectPartialFailure()`
(`src/normalize.ts`) caught it from the raw dataset before normalization
masked it.

**Heal → approve → re-run, same `c_*` ID:**

```
🔧 Healing Fireworks AI (c_mt36bqzoxmjmuuk6y) ...
   POST /dca/collectors/c_mt36bqzoxmjmuuk6y/refactor_template {"prompt": "..."}
   GET  .../refactor_template/progress → pending_answer (approval gate)
   POST .../resume_automation_job {"message": true, "auto_save": true}
✅ healed & approved (ia_mt3bwk3f1l3wyn63hq)
🔄 Re-running Fireworks AI (attempt 1/2) ... ✅ 29 rows recovered (29 new)
```

Same collector ID. No code change. No deployment. The recovered rows carry
the restored field, and the `heals` table + `/health` page show the full
audit trail (reason, interaction ID, timestamps).

**Also in the same run:**

- Anthropic's transient 502 degraded into a slow dataset; the pipeline healed
  the collector (`ia_mt3bcpnuo5ux6zu0k` approved) and left re-verification to
  the next daily run rather than blocking.
- The repair cooldown correctly refused to burn heal attempts on vendors with
  3+ consecutive failures (template generation still pending server-side),
  surfacing them on `/health` instead of retrying blindly.

## Event 1 — 2026-08-21: quality heal on the OpenAI collector

> A transcript of an actual self-healing event performed on
> **2026-08-21** against production collector `c_mt35uk633yulmy4ui`
> (OpenAI changelog). Same Collector ID before and after — nothing
> downstream changed.

## The collector

| | |
|---|---|
| Vendor | OpenAI |
| Collector ID | `c_mt35uk633yulmy4ui` |
| Target URL | `https://platform.openai.com/docs/changelog` |
| Created via | `POST /dca/collector` + `POST /dca/collectors/{id}/automate_template` |

## Step 1 — Real data reveals real flaws

First live run returned 154 rows / ~90 KB of genuine changelog data.
Inspecting the raw payload showed two quality problems:

```json
{
  "date": "Aug 20",          ← no year
  "type": "Feature",
  "tags": ["gpt-image-2"],
  "description": "<p>Transparent backgrounds are now available…"   ← HTML, no title field
}
```

1. Dates come back as partial strings (`Aug 20`) with no year.
2. Entries have no `title` field at all.

## Step 2 — The heal request

Sent to `POST /dca/collectors/c_mt35uk633yulmy4ui/refactor_template`:

```
Two fixes are needed. 1) The date field currently returns partial dates
like 'Aug 20' with no year. Return every date as a full YYYY-MM-DD date
instead. 2) Each entry is missing a short headline. Add a 'title' field
containing a concise summary line (max ~12 words) for each changelog entry.
```

Response:

```json
{"id":"ia_mt37ypxx68l5ci4qt","queued":false}
```

Scraper Studio's AI rewrote the extraction template in place.

## Step 3 — Same ID, nothing downstream touched

Immediately re-triggered the **same collector ID**:

```
POST /dca/trigger?collector=c_mt35uk633yulmy4ui&queue_next=1
→ {"collection_id":"j_mt384euh1h8zv4b3yh"}   HTTP 200
GET /dca/dataset?id=j_mt384euh1h8zv4b3yh
→ HTTP 200, ~90 KB of entries
```

No code change. No config change. No new collector. The pipeline,
database, dashboard, feeds and alerts all continued working against the
same `c_*` ID — exactly the guarantee that makes this architecture
self-healing rather than self-destructing.

## Why this matters

Traditional scrapers die silently when a site shifts. With Scraper
Studio, the repair is one prompt against a stable endpoint — which is
why ModelPulse can promise daily unattended operation across 10+
vendors whose layouts we do not control.
