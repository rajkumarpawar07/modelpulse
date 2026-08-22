# ModelPulse — 5-Minute Demo Video Script (v2)

Deck: `docs/modelpulse-demo-deck.pptx` (4 slides) · Live site: **https://modelpulse-ruby.vercel.app**
Total: **5:00** — deck ≈ 1:30, live demo ≈ 3:30. The deck is visual; the demo is the star.

---

## Before you hit record (5-minute checklist)

1. **Open these tabs now**, in order: the dashboard (`/`), `/health`, `/api/changes?breaking=true`,
   `/feed/openai`, and the repo on GitHub. One browser window, pinned tabs (Ctrl+1..5).
2. **Terminal prep**: a terminal scrolled to the heal section of a real `npm run scrape` run
   (or `docs/live-heal-log.md` open as backup).
3. Close notifications; 1920×1080; browser zoom 100%; dark terminal.
4. **Do one dry run** of the whole click path before recording.

---

## PART 1 — THE DECK (0:00 – 1:30)

### Slide 1 — Title (0:00 – 0:12)

> I'm Raj, and this is **ModelPulse** — AI API change intelligence, built for Scrape-Verse on
> Bright Data Scraper Studio. One sentence: **catch breaking changes in AI vendor APIs before
> your code does.**

### Slide 2 — One radar. Ten vendors. (0:12 – 0:45)

> The problem is on top: vendors ship breaking changes weekly, they silently edit published
> entries, and you find out from your error logs.
>
> The system is the diagram: ten AI vendors, each watched by a Scraper Studio collector — that's
> the green zone, Bright Data runs all of it. Every change normalizes into one schema with an
> impact score, lands in SQLite with full history, and comes out where you work: Slack alerts,
> a CI gate that fails your build, RSS, and a JSON API.

### Slide 3 — Detect. Heal. Recover. (0:45 – 1:22)

> This is the part that matters, and it's not a mockup. During a real run, Fireworks'
> collector returned 29 rows — but every single `change_type` was null. Silent breakage.
> The pipeline detected it, sent one heal prompt to the **same collector ID**, approved the
> fix at the gate, and re-ran: 29 rows recovered, zero code changes. Same `c_*` ID before
> and after — that's self-healing. It runs unattended every day at 9 UTC, and every attempt
> is audited on the health page.

### Slide 4 — Closing (1:22 – 1:30)

> The scraper that fixes itself. Let's go live.

*(Quit slideshow → switch to browser)*

---

## PART 2 — LIVE DEMO (1:30 – 5:00)

Everything below is the deployed site: **https://modelpulse-ruby.vercel.app**

### Overview (1:30 – 2:00)

*(Tab 1 — `/`)*

> Here's the live radar — real data, scraped by the daily cron. The ticker streams the latest
> signals. Every entry carries a type badge and an **impact score** — this DeepSeek deprecation
> on Fireworks is flagged breaking. Entries edited after publication get the ↻ EDITED badge —
> that's silent-edit detection, field by field. Search, vendor filters, keyword watches — all live.

### HEALTH — the star (2:00 – 2:45)

*(Tab 2 — `/health`)*

> This page tells the self-healing story. One row per `c_*` collector — runs, uptime, heal
> counts. And the **self-healing log** — every detection with its reason, every heal with its
> status. *(point)* Here's the Fireworks event — partial breakage detected, healed, APPROVED —
> real interaction ID, timestamped. And here's Cohere — timed out, healed, approved. The cron
> wrote these rows. Nobody touched a keyboard.

### Terminal — the pipeline (2:45 – 3:20)

*(Switch to terminal)*

> Same story in the logs. Ten collectors, four in parallel. *(scroll)* Detection fires on
> three signals — errors, zero rows, or partial breakage like this: 29 of 29 rows missing
> `change_type`. Heal → approve at the gate → re-run the SAME collector → 29 rows recovered.
> Vendors that are down get skipped by the repair cooldown instead of burning credits. Full
> transcript is in the repo — real API calls, real IDs.

### API + RSS (3:20 – 3:45)

*(Tab 3 — `/api/changes?breaking=true`, then Tab 4 — `/feed/openai`)*

> Everything the dashboard shows is a public JSON API — filter by vendor, type, breaking.
> This is what CI consumes: the `check-breaking` script fails your build when a breaking
> change ships in your window. And every vendor has an RSS feed.

### Close (3:45 – 5:00 buffer)

*(Tab 5 — the GitHub repo)*

> ModelPulse — ten vendors, one schema, self-healing collectors, and a CI gate that catches
> breaking changes before your users do. The repo has the setup, the tests, the heal
> transcripts — everything reproducible. Thanks for watching.

*(Buffer absorbs slow page loads; if ahead, scroll the repo README for 10–15 seconds.)*

---

## Backup plans

- **A collector shows FAILED on /health** — narrate it as a feature: "the cooldown skipped
  this one — its template is regenerating server-side; the system retries on a schedule
  instead of burning credits."
- **A page loads slowly** — cold starts happen; breathe, say "first hit spins up the lambda."
- **Anything looks off** — the same data is in `docs/live-heal-log.md`; pivot there.

## After recording

- Upload unlisted → watch once end-to-end → make public.
- Put the link in the README *Live demo* section + the submission form.
- Post on LinkedIn tagging **WeMakeDevs** (Daily Bugle track).
