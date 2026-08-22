// build-deck.js — ModelPulse demo deck (Scrape-Verse submission)
// Dark mission-control theme matching the dashboard. Run: node docs/ppt/build-deck.js
const pptxgen = require("pptxgenjs");

const C = {
  bg: "0A0E12", panel: "121A22", panel2: "0E141B",
  signal: "35F0B4", ink: "EDF2F7", dim: "8FA5B5", faint: "55697A",
  alert: "FF5C5C", azure: "5CA8FF", warn: "F5C542", line: "24313D",
};
const F = { sans: "Arial", mono: "Courier New" };

const p = new pptxgen();
p.layout = "LAYOUT_16x9";
p.author = "rajkumarpawar07";
p.title = "ModelPulse — AI API Change Intelligence";

const shadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 90, opacity: 0.35 });

function base(s, label) {
  s.background = { color: C.bg };
  if (label) s.addText(label, { x: 0.55, y: 0.32, w: 6, h: 0.3, fontFace: F.mono, fontSize: 10.5, color: C.signal, charSpacing: 2, margin: 0 });
}
function bigTitle(s, runs, y = 0.62) {
  s.addText(runs, { x: 0.55, y, w: 8.9, h: 0.75, fontFace: F.sans, fontSize: 30, bold: true, color: C.ink, margin: 0 });
}
function brackets(s, x, y, w, h, color = C.faint, width = 1.25) {
  const L = 0.09;
  const seg = (sx, sy, sw, sh) => s.addShape(p.shapes.LINE, { x: sx, y: sy, w: sw, h: sh, line: { color, width } });
  seg(x, y, L, 0); seg(x, y, 0, L);
  seg(x + w - L, y, L, 0); seg(x + w, y, 0, L);
  seg(x, y + h, L, 0); seg(x, y + h - L, 0, L);
  seg(x + w - L, y + h, L, 0); seg(x + w, y + h - L, 0, L);
}
function card(s, x, y, w, h, fill = C.panel) {
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.055, fill: { color: fill }, line: { color: C.line, width: 0.75 }, shadow: shadow() });
  brackets(s, x, y, w, h, "3A4E5E", 1);
}
function dot(s, x, y, color = C.signal, d = 0.07) {
  s.addShape(p.shapes.OVAL, { x, y, w: d, h: d, fill: { color } });
}
function ekg(s, pts, color = C.signal, width = 2.25) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    s.addShape(p.shapes.LINE, {
      x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
      flipV: y2 < y1, line: { color, width },
    });
  }
}
function arrow(s, x, y, w = 0.32) {
  s.addText("→", { x, y, w, h: 0.3, fontFace: F.sans, fontSize: 16, color: C.signal, align: "center", margin: 0 });
}

/* ── S1 · TITLE ─────────────────────────────────────────────── */
let s = p.addSlide();
base(s);
s.addText("SCRAPE-VERSE HACKATHON 2026  ·  BUILT WITH BRIGHT DATA SCRAPER STUDIO", { x: 0.55, y: 1.02, w: 8.9, h: 0.3, fontFace: F.mono, fontSize: 10, color: C.faint, charSpacing: 2, margin: 0 });
s.addText([
  { text: "MODEL", options: { color: C.ink } },
  { text: "PULSE", options: { color: C.signal } },
], { x: 0.55, y: 1.45, w: 8.9, h: 1.05, fontFace: F.sans, fontSize: 58, bold: true, charSpacing: 3, margin: 0 });
s.addText("AI API Change Intelligence", { x: 0.55, y: 2.52, w: 8.9, h: 0.4, fontFace: F.mono, fontSize: 15, color: C.dim, charSpacing: 1, margin: 0 });
s.addText("Catch breaking changes in AI vendor APIs — before your code does.", { x: 0.55, y: 2.98, w: 8.9, h: 0.35, fontFace: F.sans, fontSize: 14, color: C.dim, margin: 0 });
ekg(s, [[0.55, 4.35], [2.35, 4.35], [2.95, 3.45], [3.75, 5.15], [4.45, 3.85], [5.15, 4.35], [9.45, 4.35]]);
s.addText("github.com/rajkumarpawar07/modelpulse", { x: 0.55, y: 4.95, w: 5.5, h: 0.3, fontFace: F.mono, fontSize: 10.5, color: C.faint, margin: 0 });
s.addText("LIVE DEMO IN 3 MINUTES", { x: 6.45, y: 4.95, w: 3.0, h: 0.3, fontFace: F.mono, fontSize: 10.5, color: C.signal, align: "right", margin: 0 });

/* ── S2 · PROBLEM ───────────────────────────────────────────── */
s = p.addSlide();
base(s, "[01]  THE PROBLEM");
bigTitle(s, [{ text: "You find out from " }, { text: "error logs", options: { color: C.alert } }, { text: "." }]);

const probs = [
  ["WEEKLY", "AI vendors ship breaking changes — model deprecations, parameter removals, endpoint and auth changes.", C.warn],
  ["SILENTLY", "Changelog entries get rewritten after publication. Nobody diffs them. The edit never reaches you.", C.azure],
  ["TOO LATE", "By the time production throws, the outage already happened. The vendor told the internet — just not you.", C.alert],
];
probs.forEach((pr, i) => {
  const y = 1.62 + i * 1.12;
  card(s, 0.55, y, 4.55, 0.98);
  s.addText(pr[0], { x: 0.8, y: y + 0.14, w: 1.5, h: 0.28, fontFace: F.mono, fontSize: 13, bold: true, color: pr[2], margin: 0 });
  s.addText(pr[1], { x: 0.8, y: y + 0.44, w: 4.05, h: 0.5, fontFace: F.sans, fontSize: 10.5, color: C.dim, margin: 0 });
});

card(s, 5.4, 1.62, 4.05, 3.32, C.panel2);
s.addText("\u201cWHY NOT JUST SUBSCRIBE TO RSS?\u201d", { x: 5.65, y: 1.82, w: 3.6, h: 0.3, fontFace: F.mono, fontSize: 11, bold: true, color: C.ink, margin: 0 });
const rss = [
  ["Half these vendors publish no feed at all", " — Mistral, Cohere, Groq, Together, Fireworks are plain HTML pages."],
  ["Feeds are prose, not schema", " — no change_type, no breaking flag, no version. Machines can't act on them."],
  ["Feeds never show edits", " — ModelPulse diffs every field on every scrape and flags silent edits (↻ EDITED)."],
  ["Feeds can't fail your CI build", " — a normalized API can: npm run check-breaking gates your deploy."],
];
rss.forEach((r, i) => {
  const y = 2.22 + i * 0.68;
  dot(s, 5.65, y + 0.06, C.signal, 0.06);
  s.addText([
    { text: r[0], options: { bold: true, color: C.ink } },
    { text: r[1], options: { color: C.dim } },
  ], { x: 5.82, y, w: 3.45, h: 0.62, fontFace: F.sans, fontSize: 9.5, margin: 0 });
});

/* ── S3 · SOLUTION ──────────────────────────────────────────── */
s = p.addSlide();
base(s, "[02]  THE SOLUTION");
bigTitle(s, [{ text: "One radar. Ten vendors. " }, { text: "Self-healing.", options: { color: C.signal } }]);

const flow = [
  ["10 SCRAPER STUDIO COLLECTORS", "one c_* ID per vendor, created from a single prompt each"],
  ["ONE NORMALIZED SCHEMA", "title · date · change_type · impact — in SQLite"],
  ["SCORE · DIFF · ALERT", "0–100 impact, week-over-week diff, silent-edit detection"],
];
flow.forEach((f, i) => {
  const y = 1.66 + i * 1.18;
  card(s, 0.55, y, 3.9, 0.96);
  s.addText(String(i + 1).padStart(2, "0"), { x: 0.78, y: y + 0.28, w: 0.6, h: 0.4, fontFace: F.mono, fontSize: 20, bold: true, color: C.signal, margin: 0 });
  s.addText(f[0], { x: 1.38, y: y + 0.15, w: 2.95, h: 0.28, fontFace: F.mono, fontSize: 10.5, bold: true, color: C.ink, margin: 0 });
  s.addText(f[1], { x: 1.38, y: y + 0.45, w: 2.95, h: 0.45, fontFace: F.sans, fontSize: 9.5, color: C.dim, margin: 0 });
  if (i < 2) s.addText("↓", { x: 2.3, y: y + 0.94, w: 0.4, h: 0.26, fontFace: F.sans, fontSize: 13, color: C.signal, align: "center", margin: 0 });
});

const feats = [
  ["IMPACT SCORING", "every change scored 0–100 — type, breaking flag, risk keywords", C.signal],
  ["SILENT-EDIT DETECTION", "field-level diffs recorded per scrape — ↻ EDITED badges", C.azure],
  ["WATCHES + ALERTS", "keyword filters → Slack / Discord / generic webhooks", C.warn],
  ["RSS · JSON API · CI GATE", "feeds per vendor, CORS API, builds fail on breaking changes", C.azure],
];
feats.forEach((f, i) => {
  const x = 4.75 + (i % 2) * 2.38, y = 1.66 + Math.floor(i / 2) * 1.72;
  card(s, x, y, 2.22, 1.56, C.panel2);
  dot(s, x + 0.2, y + 0.24, f[2], 0.08);
  s.addText(f[0], { x: x + 0.38, y: y + 0.15, w: 1.75, h: 0.5, fontFace: F.mono, fontSize: 9.5, bold: true, color: C.ink, margin: 0 });
  s.addText(f[1], { x: x + 0.2, y: y + 0.68, w: 1.85, h: 0.8, fontFace: F.sans, fontSize: 9, color: C.dim, margin: 0 });
});

/* ── S4 · ARCHITECTURE ──────────────────────────────────────── */
s = p.addSlide();
base(s, "[03]  ARCHITECTURE");
bigTitle(s, [{ text: "Cron to alert — " }, { text: "unattended", options: { color: C.signal } }, { text: "." }]);

// Bright Data zone (dashed) around the collectors stage
s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 2.28, y: 1.78, w: 2.4, h: 1.62, rectRadius: 0.08, fill: { color: C.panel2, transparency: 40 }, line: { color: C.signal, width: 1, dashType: "dash" } });
s.addText("BRIGHT DATA SCRAPER STUDIO", { x: 2.28, y: 3.42, w: 2.4, h: 0.22, fontFace: F.mono, fontSize: 8, color: C.signal, align: "center", charSpacing: 1, margin: 0 });

const stages = [
  ["GITHUB ACTIONS", "cron 09:00 UTC", 0.55],
  ["10 × c_* COLLECTORS", "run + auto-heal", 2.44],
  ["NORMALIZER", "one schema", 4.56],
  ["SQLITE", "+ heal history", 6.2],
  ["DIFF · ALERT", "Slack / CI", 7.96],
];
stages.forEach((st, i) => {
  const x = st[2];
  card(s, x, 2.0, i === 1 ? 2.08 : 1.5, 1.2, i === 1 ? C.panel : C.panel2);
  s.addText(st[0], { x: x + 0.12, y: 2.24, w: (i === 1 ? 1.84 : 1.26), h: 0.5, fontFace: F.mono, fontSize: i === 1 ? 10 : 9.5, bold: true, color: i === 1 ? C.signal : C.ink, align: "center", margin: 0 });
  s.addText(st[1], { x: x + 0.12, y: 2.74, w: (i === 1 ? 1.84 : 1.26), h: 0.26, fontFace: F.sans, fontSize: 8.5, color: C.dim, align: "center", margin: 0 });
});
arrow(s, 2.06, 2.45); arrow(s, 4.53, 2.45); arrow(s, 6.05, 2.45, 0.24); arrow(s, 7.7, 2.45, 0.24);

card(s, 0.55, 3.85, 8.9, 1.32, C.panel);
s.addText("THE DASHBOARD READS THE SAME DATABASE", { x: 0.8, y: 4.02, w: 5.6, h: 0.26, fontFace: F.mono, fontSize: 10, bold: true, color: C.ink, margin: 0 });
s.addText("Next.js mission-control UI — overview, timeline, analytics, and /health (collector uptime + self-healing log). The daily workflow commits the DB back to the repo, so a deployed dashboard always serves fresh data with full history.", { x: 0.8, y: 4.3, w: 5.5, h: 0.75, fontFace: F.sans, fontSize: 9.5, color: C.dim, margin: 0 });
s.addText([
  { text: "DETECTION SIGNALS\n", options: { fontFace: F.mono, fontSize: 9, bold: true, color: C.signal, breakLine: true } },
  { text: "error · 0 rows · partial breakage\n(missing fields on live rows)", options: { fontFace: F.sans, fontSize: 9, color: C.dim } },
], { x: 6.55, y: 4.02, w: 2.7, h: 1.0, margin: 0 });

/* ── S5 · BRIGHT DATA EVERYWHERE ────────────────────────────── */
s = p.addSlide();
base(s, "[04]  BRIGHT DATA, EVERYWHERE");
bigTitle(s, [{ text: "Three commands. " }, { text: "Zero servers.", options: { color: C.signal } }]);

const cols = [
  ["CREATE", "bdata scraper create <url> \"<schema>\"", "POST /dca/collector\n+ automate_template", "10 collectors, one prompt each — the AI writes the scraper, you own the code.", C.azure],
  ["RUN AS AN API", "POST /dca/trigger?collector=c_*", "GET /dca/dataset?id=j_*", "Clean JSON from GitHub Actions. No proxies, no retries, no browsers to run.", C.signal],
  ["SELF-HEAL", "refactor_template {prompt}", "progress → resume_automation_job", "Same c_* ID before and after. Nothing downstream ever changes.", C.warn],
];
cols.forEach((c2, i) => {
  const x = 0.55 + i * 3.05;
  card(s, x, 1.6, 2.85, 2.62, C.panel2);
  s.addText(c2[0], { x: x + 0.22, y: 1.78, w: 2.4, h: 0.3, fontFace: F.mono, fontSize: 12.5, bold: true, color: c2[4], margin: 0 });
  s.addText(c2[1], { x: x + 0.22, y: 2.12, w: 2.42, h: 0.52, fontFace: F.mono, fontSize: 9, color: C.ink, margin: 0 });
  s.addText(c2[2], { x: x + 0.22, y: 2.68, w: 2.42, h: 0.42, fontFace: F.mono, fontSize: 8.5, color: C.faint, margin: 0 });
  s.addText(c2[3], { x: x + 0.22, y: 3.16, w: 2.42, h: 0.92, fontFace: F.sans, fontSize: 9.5, color: C.dim, margin: 0 });
});

card(s, 0.55, 4.42, 8.9, 0.78, C.panel);
s.addText([
  { text: "Every scraper is instantly a production API. ", options: { bold: true, color: C.ink } },
  { text: "The c_* collector is a stable endpoint — triggered daily by cron, healed by prompt, never redeployed.", options: { color: C.dim } },
], { x: 0.8, y: 4.52, w: 8.4, h: 0.58, fontFace: F.sans, fontSize: 11, margin: 0 });

/* ── S6 · PROOF ─────────────────────────────────────────────── */
s = p.addSlide();
base(s, "[05]  PROOF, NOT PROMISES");
bigTitle(s, [{ text: "It healed itself. " }, { text: "For real.", options: { color: C.signal } }]);

const steps = [
  ["DETECT", "Scrape returns 29 rows — but 29/29 have change_type: null. Partial breakage: rows flow, meaning is gone.", C.warn],
  ["HEAL", "POST refactor_template {prompt} on c_mt36bqzoxmjmuuk6y — \u201cthe page likely changed under the scraper\u201d", C.azure],
  ["APPROVE", "resume_automation_job → ia_mt3bwk3f1l3wyn63hq — approved at the gate, never half-written", C.azure],
  ["RECOVER", "Re-run on the SAME c_* ID: 29 rows back, fields restored. No code change. No redeploy.", C.signal],
];
steps.forEach((st, i) => {
  const y = 1.58 + i * 0.92;
  card(s, 0.55, y, 5.6, 0.8);
  s.addText(st[0], { x: 0.78, y: y + 0.12, w: 1.15, h: 0.26, fontFace: F.mono, fontSize: 10.5, bold: true, color: st[2], margin: 0 });
  s.addText(st[1], { x: 0.78, y: y + 0.38, w: 5.2, h: 0.4, fontFace: F.sans, fontSize: 9.5, color: C.dim, margin: 0 });
  if (i < 3) s.addText("↓", { x: 3.15, y: y + 0.76, w: 0.3, h: 0.2, fontFace: F.sans, fontSize: 11, color: C.signal, align: "center", margin: 0 });
});

card(s, 6.35, 1.58, 3.1, 2.56, C.panel2);
s.addText("SAME RUN, UNSUPERVISED", { x: 6.58, y: 1.76, w: 2.7, h: 0.26, fontFace: F.mono, fontSize: 9.5, bold: true, color: C.ink, margin: 0 });
const also = [
  "Repair cooldown — one attempt per vendor per window, no wasted heals",
  "Template regeneration queued for 4 collectors missing templates",
  "Transient 502s retried, not fatal",
];
also.forEach((a, i) => {
  const y = 2.12 + i * 0.62;
  dot(s, 6.58, y + 0.05, C.signal, 0.06);
  s.addText(a, { x: 6.74, y, w: 2.55, h: 0.58, fontFace: F.sans, fontSize: 9, color: C.dim, margin: 0 });
});
s.addText("Full transcript → docs/live-heal-log.md", { x: 6.58, y: 3.78, w: 2.7, h: 0.26, fontFace: F.mono, fontSize: 8.5, color: C.faint, margin: 0 });

s.addText("Every attempt is recorded in the heals table and rendered on the dashboard's /health page — the audit trail you'll see in the demo.", { x: 0.55, y: 5.12, w: 8.9, h: 0.3, fontFace: F.sans, fontSize: 9.5, italic: true, color: C.faint, margin: 0 });

/* ── S7 · CLOSING ───────────────────────────────────────────── */
s = p.addSlide();
base(s);
s.addText([
  { text: "The scraper that ", options: { color: C.ink } },
  { text: "fixes itself", options: { color: C.signal } },
  { text: ".", options: { color: C.ink } },
], { x: 0.55, y: 1.7, w: 8.9, h: 0.9, fontFace: F.sans, fontSize: 40, bold: true, margin: 0 });
s.addText("10 vendors · one schema · impact-scored · mutation-aware · CI-ready", { x: 0.55, y: 2.62, w: 8.9, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.dim, margin: 0 });
ekg(s, [[0.55, 3.5], [2.0, 3.5], [2.5, 2.95], [3.1, 4.05], [3.7, 3.28], [4.2, 3.5], [9.45, 3.5]], C.signal, 2);
s.addText("github.com/rajkumarpawar07/modelpulse", { x: 0.55, y: 4.35, w: 5.0, h: 0.3, fontFace: F.mono, fontSize: 11, color: C.dim, margin: 0 });
s.addText("docs/live-heal-log.md  ·  /health", { x: 0.55, y: 4.68, w: 5.0, h: 0.3, fontFace: F.mono, fontSize: 11, color: C.faint, margin: 0 });
s.addText("NOW — LIVE.", { x: 6.9, y: 4.45, w: 2.55, h: 0.4, fontFace: F.mono, fontSize: 16, bold: true, color: C.signal, align: "right", charSpacing: 2, margin: 0 });

p.writeFile({ fileName: "docs/modelpulse-demo-deck.pptx" }).then(() => console.log("deck written"));
