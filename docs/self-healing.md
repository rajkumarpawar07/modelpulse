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

Below is the literal terminal session for the Mistral collector. Adapt the vendor if Mistral hasn't actually broken recently — pick whichever vendor has the most volatile page when you record.

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

`scripts/demo-heal.sh` automates the above for screen recording. It:

1. Picks the first non-placeholder collector (Mistral by default; edit the `VENDOR=` line to switch)
2. Walks through each step with a 3-second pause so you can re-record cleanly
3. Press ENTER between steps to control the pace

To run:

```bash
npm run demo:heal
```

## Staging a real break

If Mistral (or whichever vendor you pick) hasn't actually changed their page recently, you'll need to either:

**Option A — wait for a real break.** The hackathon runs Aug 17-23. With 20 collectors running daily, the odds of a real change are high. If you spot one, just point the demo at that vendor.

**Option B — stage a fake break.** Don't do this; judges can tell. The whole point of the demo is that it's real.

**Option C — use an existing known break.** Search "[vendor] changelog redesign 2024/2025" on Google. If you find one, point the demo at that vendor and the heal prompt you write is realistic.

## Why this wins the grand prize

The hackathon's **Web-Slinger (Best Use of Bright Data)** track says:

> "The submission that gets the most out of the platform: the scraper you designed in Scraper Studio, how you drove it from your coding agent, what it did when the site changed under it, and what the structured output went on to power."

This demo hits **all four** clauses in 90 seconds. The collector ID staying the same is the line the judges will quote in the winner announcement.

## The next level: auto self-heal

For bonus points, add a GitHub Action that runs `bdata scraper heal` automatically when the daily scrape returns fewer than expected rows. Pseudocode:

```yaml
- name: Scrape
  id: scrape
  run: npm run scrape

- name: Auto-heal if any vendor returned 0 rows
  if: steps.scrape.outputs.failures > 0
  run: |
    for vendor in $(cat .failed_vendors); do
      cid=$(jq -r ".collectors[] | select(.vendor==\"$vendor\") | .collector_id" collectors.json)
      bdata scraper heal "$cid" "The latest scrape returned 0 rows; the site may have changed. Re-inspect the page and fix the schema." --url "..."
      bdata scraper approve "$cid"
    done
```

This is the "zero maintenance" mode Bright Data is building. You can ship a stripped-down version in 30 minutes of work. The judges will love it.
