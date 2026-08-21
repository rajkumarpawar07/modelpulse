# Why ModelPulse — The Pitch

## The category

We are inventing a new category: **AI API Change Intelligence.**

Not "a scraper" — every hackathon has a scraper. Not "a changelog aggregator" — those are boring. ModelPulse is a new kind of product: a radar for breaking changes in AI vendor APIs, with self-healing scrapers that keep themselves current without you touching them.

## Why this is the right bet for the Scrape-Verse Hackathon

Three reasons.

### 1. The judges feel the pain personally

Bright Data's own team works on AI infrastructure. Their customers are AI developers. The people judging your submission are the people who would *use* ModelPulse the day after the hackathon. When the demo says "we caught a deprecation 3 days before your CI would have," they're nodding, not scrolling.

### 2. The long tail is the exact gap the guide tells you to target

Bright Data's "Getting Started" guide says:

> **"Build for the long tail. Bright Data already has 800+ pre-built scrapers for popular sites."**

Of those 800+ pre-built scrapers, **zero** monitor `platform.openai.com/docs/changelog`, `docs.anthropic.com/en/release-notes/overview`, or any of the other 20 sites ModelPulse watches. We are 100% in the long tail.

### 3. Self-healing writes itself

The hackathon explicitly says "Judges will be looking for [self-healing]." Most teams will fake it or skip it. ModelPulse can show a real one because AI vendor changelog pages change often — Mistral redesigned theirs in 2024, OpenAI in 2023, etc. The break is real, the heal is real, the same `c_*` ID is the proof.

## The six judging criteria, scored

| Criterion | Why ModelPulse scores high |
|-----------|---------------------------|
| **Potential impact** | Every AI developer (the audience) has been bitten by API breaking changes. The pain is universal. |
| **Creativity and innovation** | "AI API Change Intelligence" is a new category. The week-over-week diff framing is novel. |
| **Technical excellence** | 20 collectors, self-healing, time-series storage, Slack alerts, Next.js dashboard, GitHub Actions cron. All in TypeScript, all type-checked. |
| **Use of Scraper Studio** | Scraper Studio is not a side feature — it IS the data layer. 20 `c_*` IDs orchestrated into one app. |
| **Reliability and self-healing** | The headline demo. `bdata scraper heal` shown in the video, in the README, in the docs. |
| **Presentation** | 3-minute demo with a clear arc: problem → dashboard → alert → scrape flow → self-heal → close. |

## What makes it a "real" product, not a hackathon toy

A hackathon project that becomes a real product has three properties:

1. **Real users with real pain.** → AI developers, every day.
2. **Defensible technical core.** → 20 collectors + self-healing + diff engine. The competitor would need to either re-build the collectors manually or wait for Bright Data to add them to the pre-built library.
3. **A path to revenue.** → Charge teams a Slack-alert subscription. Or sell the diff feed as a JSON API to AI observability startups (LangSmith, Helicone, etc.).

The hackathon gives you a week to ship the prototype. The product is what you keep building after.

## What could go wrong (and the pivots)

| Risk | Pivot |
|------|-------|
| A specific vendor's changelog is JS-heavy and Scraper Studio can't extract it | Drop that vendor. Add a backup from the 20 in `scripts/create-collectors.sh`. |
| The self-heal demo doesn't have a real break to point at | Use the real break from `docs/self-healing.md` (Mistral 2024, OpenAI 2023). Or pick a vendor that has a known recent redesign. |
| Bright Data credits run out | Free tier is 5,000/month. We use ~600. Way under the limit. |
| Judges don't get the "category creation" angle | The video opens with a real screenshot of a broken CI. Judges feel the pain before the pitch. |
| Time pressure on Day 3 | Cut from 20 vendors to 10. Cut the dashboard to 2 pages. Ship a smaller but complete project. |

## The narrative judges will quote

> "20 collectors, all self-healing, all wired into a single Slack alert. Same `c_*` ID before and after the page changed. The scraper that fixes itself — that's what you ship in 3 days with Bright Data Scraper Studio."

That sentence is in the demo video script. It is the line that wins.
