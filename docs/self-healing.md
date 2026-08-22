# Self-Healing — The Headline Feature

The hackathon explicitly says **"Judges will be looking for it"** in the demo. This document walks through the actual self-healing flow you should record for your 3-minute video.

## Why self-healing matters

Web scrapers break constantly. Every AI vendor redesigns their docs site every few months. Without self-healing:

- You find out from a Slack user pinging you
- You open the source code, hunt for the broken selector
- You redeploy
- You wait 30 minutes for CI

With `bdata scraper heal`:

- The same `c_*` collector ID stays
- You describe what broke in plain English
- The Bright Data AI re-inspects the page
- You approve
- It just works

**Same collector ID = no downstream code change.** That's the headline.

## The demo transcript

Below is an illustrative walkthrough of the flow (for a real, timestamped heal
with actual API responses, see [`live-heal-log.md`](./live-heal-log.md)). Adapt
the vendor to whichever has the most volatile page when you record.

### Step 1: Run the current scraper

```bash
$ bdata scraper run c_mistral_xxx https://docs.mistral.ai/getting-started/changelog/ --pretty
{
  "title": "mistral-large-2407 availability update",
  "date": "2026-08-15",
  "change_type": "added",
  "version": "2407",
  "description": "General availability for mistral-large-2407 in the la Plateforme API.",
  "url": "https://docs.mistral.ai/getting-started/changelog/#2026-08-15"
}
```

**Healthy state.** All fields present.

### Step 2: Discover the breakage

A few days later, Mistral redesigns their changelog page. The new markup uses a `<span class="category">` tag instead of a structured field. Our next daily scrape returns:

```json
{
  "title": "mistral-large-2407 availability update",
  "date": "2026-08-15",
  "change_type": null,    ← NULL! Should be "added"
  "version": "2407",
  "description": "...",
  "url": "..."
}
```

Our `src/normalize.ts` flags the `null` change_type as invalid (it can't classify it). The diff engine stops showing Mistral changes. We notice in the dashboard that "Mistral: 0 changes this week."

### Step 3: Heal

```bash
$ bdata scraper heal c_mistral_xxx \
    "The change_type field returns null since they restructured their changelog markup. Look for the new 'category' label inside each entry and map it to: added, changed, deprecated, removed, or fixed." \
    --url https://docs.mistral.ai/getting-started/changelog/

🔄 Refactor in progress for c_mistral_xxx...
📋 Preview result:
{
  "title": "mistral-large-2407 availability update",
  "date": "2026-08-15",
  "change_type": "added",    ← fixed!
  "version": "2407",
  "description": "...",
  "url": "..."
}

✅ Awaiting approval. Run `bdata scraper approve c_mistral_xxx` to apply.
```

### Step 4: Approve

```bash
$ bdata scraper approve c_mistral_xxx
✅ Approved. Scraper c_mistral_xxx updated.
```

**Notice: same `c_*` ID.** Our `src/normalize.ts`, our `src/diff.ts`, our dashboard, our GitHub Actions — none of it needed to change. The collector learned the new schema in ~30 seconds.

### Step 5: Re-run

```bash
$ bdata scraper run c_mistral_xxx https://docs.mistral.ai/getting-started/changelog/ --pretty
{
  "title": "mistral-large-2407 availability update",
  "date": "2026-08-15",
  "change_type": "added",
  "version": "2407",
  "description": "...",
  "url": "..."
}
```

Same `c_*` ID. Same output structure. **The scraper that fixes itself.**

## The script

`npm run demo:heal` walks through the flow for screen recording. Every step runs **real commands
against a real collector** — nothing is staged or simulated:

1. `VENDOR_FILTER=<vendor> npm run scrape` — live run, showing the detection logic
2. `npm run heal -- <vendor> "<what broke>"` — the production heal command
3. Re-run of the same collector to show the recovered data

If the vendor hasn't actually broken, the heal still runs for real (re-inspection
and re-approval of the template); when a vendor *has* genuinely changed, the
daily cron performs this same loop with no human involved at all.

## Staging a real break

Don't stage fake output — judges can tell. The honest options:

**Option A — wait for a real break.** With 10 collectors running daily, layout
drift is common. When detection fires, the cron heals it on its own; the heal
shows up in the `heals` table and on the dashboard's `/health` page — that's
your evidence, timestamped.

**Option B — use a real past break.** [`live-heal-log.md`](./live-heal-log.md)
is the transcript of an actual heal we performed on the OpenAI collector when
real data revealed partial dates and missing titles. That's the proof artifact.

**Option C — run the production heal live.** `npm run heal -- <vendor> "reason"`
goes through the identical code path the cron uses (refactor_template → poll →
approve → re-run). It's a real heal whether or not the site changed today.

## Why this wins the grand prize

The hackathon's **Web-Slinger (Best Use of Bright Data)** track says:

> "The submission that gets the most out of the platform: the scraper you designed in Scraper Studio, how you drove it from your coding agent, what it did when the site changed under it, and what the structured output went on to power."

This demo hits **all four** clauses in 90 seconds. The collector ID staying the same is the line the judges will quote in the winner announcement.

## The next level: auto self-heal (implemented)

This is not pseudocode — it ships. The daily GitHub Actions cron runs
`npm run scrape` with `AUTO_HEAL=true`, and `src/cli.ts` runs the whole loop
on its own:

1. **Detect** — after every scrape, each collector is checked for three
   failure signals: hard errors, 0 rows, and *partial breakage* (rows return
   but `title`/`date`/`change_type` is missing from a majority of entries —
   `detectPartialFailure()` in `src/normalize.ts`). Partial breakage is the
   classic post-redesign failure mode where naive 0-row checks stay silent.
2. **Cooldown** — a vendor gets one repair attempt per window (20h heal /
   48h template regeneration) instead of a daily credit burn. Unlike a
   count-based breaker this self-recovers when the window passes, and an
   in-flight server-side heal (HTTP 409) is adopted and approved rather
   than duplicated.
3. **Heal** — `POST /dca/collectors/{c_*}/refactor_template` with a prompt
   describing what broke (or `automate_template` to regenerate a collector
   whose template never finished generating — a distinct failure mode the
   pipeline detects from the trigger 403).
4. **Wait** — poll `GET /dca/collectors/{id}/refactor_template/progress`
   until the job reaches its approval gate (`status: pending_answer`), so a
   half-written template is never approved (`waitForHealApproval()` in
   `src/brightdata.ts`).
5. **Approve & re-run** — `POST .../resume_automation_job` with
   `{"message": true, "auto_save": true}`, then re-run the same `c_*`
   collector (up to 2 attempts) and upsert the recovered rows.

Every attempt is recorded in the `heals` table with its trigger reason, status,
and interaction ID — rendered on the dashboard's `/health` page. On-demand,
the same path is available as `npm run heal -- <vendor> "what broke"`.
