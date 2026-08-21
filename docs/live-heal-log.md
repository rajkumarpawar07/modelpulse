# Live Self-Healing Log — Real Collector, Real Heal

> This is a transcript of an actual self-healing event performed on
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
