# ModelPulse — 5-Minute Demo Video Script

Deck: `docs/modelpulse-demo-deck.pptx` · Total runtime target: **5:00**
(PPT ≈ 2:50, live demo ≈ 2:10). Speak it, don't read it — the lines below are
word-for-word *targets*, but natural beats matter more than exact wording.

---

## Before you hit record (5-minute checklist)

1. **Dashboard URL** — `modelpulse.vercel.app` currently serves an **unrelated
   old project**. Either redeploy this dashboard to Vercel before recording,
   or record against `http://localhost:3000` (start it with
   `cd dashboard && npm run dev`). Localhost is fine for the judges — say
   "running locally, same code as the deployed build".
2. **Terminal prep** — open a terminal in the repo and have the output of the
   last real `npm run scrape` scrollable (or run `VENDOR_FILTER=fireworks
   npm run scrape` ~10 min before recording and leave the window open). The
   heal section is what you'll scroll to.
3. **API key** — make sure no `.env` content is visible anywhere in the
   recording. Close notification apps (Slack/Discord/Email).
4. **Record at 1920×1080**, browser zoom 100%, dark terminal, Oceans/Fira
   code font. Presenter view OFF for the PPT part (use full-screen slideshow).
5. **Do one dry run** of the whole click path below before recording.

---

## PART 1 — THE DECK (0:00 – 2:50)

### Slide 1 — Title (0:00 – 0:15)

> Hi, I'm Raj, and this is **ModelPulse** — AI API change intelligence, built
> for the Scrape-Verse hackathon on Bright Data's Scraper Studio. The pitch is
> one sentence: **catch breaking changes in AI vendor APIs before your code
> does.**

*(Advance)*

### Slide 2 — The Problem (0:15 – 0:50)

> If you build on OpenAI, Anthropic, Mistral, Cohere — any of them — you know
> this cycle. They ship breaking changes **weekly**: models get deprecated,
> parameters disappear, auth changes. Entries get **silently edited** after
> publication. And you find out from your **error logs** — production is
> already down.
>
> And no, just subscribing to RSS doesn't fix it. Half these vendors have **no
> feed at all**. Feeds are **prose, not schema** — no change type, no breaking
> flag. Feeds never tell you an entry was **edited**. And a feed can't **fail
> your CI build**.

*(Advance)*

### Slide 3 — The Solution (0:50 – 1:20)

> ModelPulse is one radar over ten vendors. Ten Scraper Studio collectors,
> one per vendor, normalize everything into **one schema** — title, date,
> change type, and a 0-to-100 **impact score**. Every scrape is diffed
> field-by-field, so **silent edits** get flagged with an EDITED badge. And
> the output is actionable: keyword watches, Slack and Discord alerts, RSS
> feeds, a JSON API — and a CI check that **fails your build** when a
> breaking change ships.

*(Advance)*

### Slide 4 — Architecture (1:20 – 1:50)

> Here's the whole system. A GitHub Action fires **daily at 9 UTC**, triggers
> all ten collectors through Bright Data's API, normalizes into SQLite, diffs,
> and alerts. The green dashed box is the key: everything inside it — proxies,
> unblocking, retries, browsers — **Bright Data runs it**. We never operate a
> scraper server. The dashboard reads the same database, and the workflow
> commits it back daily, so the deployed UI always has fresh data with full
> history.
>
> Note the detection signals: errors, zero rows, and **partial breakage** —
> that one matters on the next slide.

*(Advance)*

### Slide 5 — Bright Data, everywhere (1:50 – 2:25)

> Bright Data isn't bolted on — it's the spine. **Create**: one prompt per
> vendor, the AI writes the scraper, and we own the code. **Run**: the
> `c_*` collector ID *is* an API — we POST a trigger, poll the dataset, get
> clean JSON, straight from GitHub Actions. **Heal**: when a site changes, we
> POST the heal prompt, poll the progress endpoint to its approval gate, and
> approve with one call. Same collector ID before and after — **nothing
> downstream ever changes**.

*(Advance)*

### Slide 6 — Proof (2:25 – 2:45)

> And this isn't a mockup. During a real run, Fireworks' collector came back
> with 29 rows — but every single `change_type` was null. Classic silent
> breakage. The pipeline detected it, healed the collector, approved the fix,
> and re-ran: **29 rows recovered, same `c_*` ID, zero code changes**. Same
> run: the circuit breaker skipped vendors that were down instead of burning
> heal attempts. Full transcript is in the repo.

*(Advance)*

### Slide 7 — Closing (2:45 – 2:50)

> The scraper that fixes itself. Let's watch it live.

*(Quit slideshow. Switch to terminal.)*

---

## PART 2 — LIVE DEMO (2:50 – 5:00)

### Terminal — the pipeline that ran (2:50 – 3:25)

Open the terminal with the real scrape output.

> This is the actual output from the daily run. Ten collectors, four in
> parallel. *(scroll slowly)* Here's OpenAI — 154 rows. Mistral — 54. Now
> watch this: Fireworks returns 29 rows, but the pipeline flags **partial
> breakage** — 29 of 29 rows missing `change_type`. The page changed under
> the scraper.
>
> *(scroll to the heal section)* So it heals: refactor template with a prompt
> describing what broke… approved — that's a real interaction ID… re-runs the
> **same collector ID**… and **29 rows recovered**. No human touched it.
> On-demand, the same flow is one command: `npm run heal -- fireworks
> "what broke"`.

### Dashboard — overview (3:25 – 3:45)

Switch to the browser, `http://localhost:3000` (or your deployed URL).

> Here's the radar. The ticker streams the latest signals. Every entry has a
> type badge, an **IMPACT score**, and edited entries get the ↻ EDITED flag —
> that's the silent-edit detection. Filter by vendor, search, or filter to
> just your keyword watches.

### Dashboard — vendor + analytics (3:45 – 4:00)

Click **OpenAI** in the vendor list → then **ANALYTICS**.

> Per-vendor drill-down — every change we've captured. Analytics gives risk
> by vendor and the week-over-week verdict.

### Dashboard — HEALTH, the star (4:00 – 4:30)

Click **04 HEALTH**.

> This is the page that tells the self-healing story. One row per `c_*`
> collector — runs, uptime, heal counts. And the **self-healing log**: every
> detection with its reason, every heal with its status. *(point)* There's
> the Fireworks event — APPROVED, real interaction ID, timestamped. This is
> the audit trail the cron writes on its own.

### API + RSS (4:30 – 4:45)

Open `http://localhost:3000/api/changes?breaking=true` in a new tab → then
`http://localhost:3000/feed/openai`.

> Everything the dashboard shows is a public, CORS-enabled JSON API — filter
> by vendor, type, breaking. And every vendor has an RSS feed. This is what
> your CI consumes: `check-breaking` fails the build if a breaking change
> shipped in your window.

### Close (4:45 – 5:00)

> ModelPulse — ten vendors, one schema, self-healing collectors, and a CI
> gate that catches breaking changes before your users do. The repo, the
> setup, and the full heal transcript are all public. Thanks for watching.

---

## Backup plans (if something breaks mid-record)

- **A collector shows FAILED on /health** — that's *fine*, even good: point at
  it and say "that's the circuit breaker doing its job — this vendor's
  template is regenerating server-side; the system skips it instead of
  burning heal attempts."
- **Dashboard empty** — you skipped the DB: run `npm run scrape` once (or
  `npm run seed` for instant demo data), refresh.
- **Terminal scroll lost** — the same log lines are in
  `docs/live-heal-log.md`; open it and scroll there instead.

## After recording

- Upload unlisted first, watch it once end-to-end, then make it public.
- Put the link in the README's *Live demo* section and in the submission form.
- Post the video link on LinkedIn tagging **WeMakeDevs** — that's the Daily
  Bugle track.
