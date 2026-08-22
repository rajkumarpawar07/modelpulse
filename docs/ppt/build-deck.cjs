// build-deck.cjs — ModelPulse demo deck v2 (4 slides, visual-first)
// Dark mission-control theme matching the deployed dashboard.
// Run: node docs/ppt/build-deck.cjs
const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaBolt, FaEyeSlash, FaBug, FaSlack, FaCodeBranch, FaRss, FaPlug,
  FaMagnifyingGlass, FaWrench, FaCircleCheck, FaRotateLeft, FaSatelliteDish, FaDatabase,
} = require("react-icons/fa6");

const C = {
  bg: "0A0E12", panel: "121A22", panel2: "0D141B",
  signal: "35F0B4", ink: "EDF2F7", dim: "8FA5B5", faint: "55697A",
  alert: "FF5C5C", azure: "5CA8FF", warn: "F5C542", line: "24313D",
};
const F = { sans: "Arial", mono: "Courier New" };
const SITE = "modelpulse-ruby.vercel.app";

async function icon(Comp, color, size = 256) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { color, size: String(size) }));
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

const shadow = () => ({ type: "outer", color: "000000", blur: 8, offset: 3, angle: 90, opacity: 0.35 });

(async () => {
  const I = {
    bolt: await icon(FaBolt, "#" + C.warn),
    eyeslash: await icon(FaEyeSlash, "#" + C.azure),
    bug: await icon(FaBug, "#" + C.alert),
    slack: await icon(FaSlack, "#" + C.ink),
    ci: await icon(FaCodeBranch, "#" + C.signal),
    rss: await icon(FaRss, "#" + C.warn),
    api: await icon(FaPlug, "#" + C.azure),
    detect: await icon(FaMagnifyingGlass, "#" + C.warn),
    heal: await icon(FaWrench, "#" + C.azure),
    approve: await icon(FaCircleCheck, "#" + C.ink),
    recover: await icon(FaRotateLeft, "#" + C.signal),
    dish: await icon(FaSatelliteDish, "#" + C.signal),
    db: await icon(FaDatabase, "#" + C.signal),
  };

  const p = new pptxgen();
  p.layout = "LAYOUT_16x9";
  p.author = "rajkumarpawar07";
  p.title = "ModelPulse — AI API Change Intelligence";

  function base(s) {
    s.background = { color: C.bg };
  }
  function brackets(s, x, y, w, h, color = "3A4E5E", width = 1) {
    const L = 0.09;
    const seg = (sx, sy, sw, sh) => s.addShape(p.shapes.LINE, { x: sx, y: sy, w: sw, h: sh, line: { color, width } });
    seg(x, y, L, 0); seg(x, y, 0, L);
    seg(x + w - L, y, L, 0); seg(x + w, y, 0, L);
    seg(x, y + h, L, 0); seg(x, y + h - L, 0, L);
    seg(x + w - L, y + h, L, 0); seg(x + w, y + h - L, 0, L);
  }
  function card(s, x, y, w, h, fill = C.panel) {
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.06, fill: { color: fill }, line: { color: C.line, width: 0.75 }, shadow: shadow() });
  }
  function ekg(s, pts, color = C.signal, width = 2.5) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      s.addShape(p.shapes.LINE, {
        x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1),
        flipV: y2 < y1, line: { color, width },
      });
    }
  }

  /* ── S1 · TITLE ─────────────────────────────────────────────── */
  let s = p.addSlide();
  base(s);
  s.addImage({ data: I.dish, x: 8.85, y: 0.5, w: 0.5, h: 0.5, transparency: 35 });
  s.addText("SCRAPE-VERSE HACKATHON 2026 · BRIGHT DATA SCRAPER STUDIO", { x: 0.55, y: 0.55, w: 8, h: 0.3, fontFace: F.mono, fontSize: 10, color: C.faint, charSpacing: 2, margin: 0 });
  s.addText([
    { text: "MODEL", options: { color: C.ink } },
    { text: "PULSE", options: { color: C.signal } },
  ], { x: 0.55, y: 1.5, w: 8.9, h: 1.15, fontFace: F.sans, fontSize: 66, bold: true, charSpacing: 3, margin: 0 });
  s.addText("Catch breaking changes in AI vendor APIs — before your code does.", { x: 0.55, y: 2.72, w: 8.9, h: 0.35, fontFace: F.sans, fontSize: 15, color: C.dim, margin: 0 });
  // EKG with a soft glow underlay
  const ekgPts = [[0.55, 3.9], [2.5, 3.9], [3.15, 2.8], [4.05, 5.0], [4.85, 3.35], [5.55, 3.9], [9.45, 3.9]];
  ekg(s, ekgPts, "1B5C45", 7);
  ekg(s, ekgPts, C.signal, 3);
  s.addText(SITE, { x: 0.55, y: 4.85, w: 4.5, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.dim, margin: 0 });
  s.addText("LIVE DEMO IN 90 SECONDS", { x: 6.15, y: 4.85, w: 3.3, h: 0.3, fontFace: F.mono, fontSize: 11, color: C.signal, align: "right", charSpacing: 2, margin: 0 });

  /* ── S2 · THE SYSTEM ────────────────────────────────────────── */
  s = p.addSlide();
  base(s);
  s.addText("One radar. Fifteen vendors.", { x: 0.55, y: 0.42, w: 8.9, h: 0.6, fontFace: F.sans, fontSize: 30, bold: true, color: C.ink, margin: 0 });

  // Problem chips (top edge, ultra-short)
  const probs = [
    [I.bolt, "Weekly breaking changes"],
    [I.eyeslash, "Silent edits"],
    [I.bug, "Found out from error logs"],
  ];
  probs.forEach((pr, i) => {
    const x = 0.55 + i * 3.05;
    card(s, x, 1.12, 2.85, 0.52, C.panel2);
    s.addImage({ data: pr[0], x: x + 0.14, y: 1.24, w: 0.28, h: 0.28 });
    s.addText(pr[1], { x: x + 0.52, y: 1.12, w: 2.28, h: 0.52, fontFace: F.sans, fontSize: 10.5, color: C.dim, valign: "middle", margin: 0 });
  });

  // Bright Data zone
  s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: 1.85, y: 2.12, w: 2.75, h: 1.95, rectRadius: 0.08, fill: { color: C.panel2, transparency: 30 }, line: { color: C.signal, width: 1.25, dashType: "dash" } });
  s.addText("BRIGHT DATA SCRAPER STUDIO", { x: 1.85, y: 4.1, w: 2.75, h: 0.22, fontFace: F.mono, fontSize: 8.5, color: C.signal, align: "center", charSpacing: 1, margin: 0 });

  // vendors node
  card(s, 0.55, 2.5, 1.1, 1.2);
  s.addText("15", { x: 0.55, y: 2.62, w: 1.1, h: 0.5, fontFace: F.sans, fontSize: 24, bold: true, color: C.ink, align: "center", margin: 0 });
  s.addText("VENDORS", { x: 0.55, y: 3.14, w: 1.1, h: 0.24, fontFace: F.mono, fontSize: 8.5, color: C.dim, align: "center", margin: 0 });

  // collectors node (inside Bright Data zone)
  card(s, 2.1, 2.5, 2.25, 1.2, C.panel);
  brackets(s, 2.1, 2.5, 2.25, 1.2, C.signal);
  s.addText("c_*", { x: 2.1, y: 2.6, w: 2.25, h: 0.55, fontFace: F.mono, fontSize: 26, bold: true, color: C.signal, align: "center", margin: 0 });
  s.addText("15 SELF-HEALING COLLECTORS", { x: 2.1, y: 3.2, w: 2.25, h: 0.24, fontFace: F.mono, fontSize: 8, color: C.dim, align: "center", margin: 0 });

  // normalize node
  card(s, 4.95, 2.5, 1.7, 1.2);
  s.addText("NORMALIZE", { x: 4.95, y: 2.66, w: 1.7, h: 0.28, fontFace: F.mono, fontSize: 10.5, bold: true, color: C.ink, align: "center", margin: 0 });
  s.addText("one schema · impact 0–100", { x: 4.95, y: 2.98, w: 1.7, h: 0.55, fontFace: F.sans, fontSize: 9.5, color: C.dim, align: "center", margin: 0 });

  // db node
  card(s, 7.0, 2.5, 1.0, 1.2);
  s.addImage({ data: I.db, x: 7.28, y: 2.66, w: 0.44, h: 0.44 });
  s.addText("SQLite history", { x: 6.95, y: 3.18, w: 1.1, h: 0.4, fontFace: F.sans, fontSize: 9, color: C.dim, align: "center", margin: 0 });

  // arrows between nodes
  [1.62, 4.36, 6.66].forEach((x) => {
    s.addText("→", { x, y: 2.9, w: 0.4, h: 0.4, fontFace: F.sans, fontSize: 18, color: C.signal, align: "center", margin: 0 });
  });

  // outcomes (bottom, icon + one word)
  const outs = [
    [I.slack, "SLACK ALERTS"],
    [I.ci, "FAILS CI"],
    [I.rss, "RSS"],
    [I.api, "JSON API"],
  ];
  outs.forEach((o, i) => {
    const x = 1.0 + i * 2.15;
    s.addShape(p.shapes.ROUNDED_RECTANGLE, { x: x - 0.25, y: 4.35, w: 1.5, h: 0.95, rectRadius: 0.08, fill: { color: C.panel2 }, line: { color: C.line, width: 0.75 } });
    s.addImage({ data: o[0], x: x + 0.19, y: 4.47, w: 0.38, h: 0.38 });
    s.addText(o[1], { x: x - 0.25, y: 4.92, w: 1.5, h: 0.24, fontFace: F.mono, fontSize: 8.5, color: C.dim, align: "center", margin: 0 });
  });

  /* ── S3 · SELF-HEALING PROOF ────────────────────────────────── */
  s = p.addSlide();
  base(s);
  s.addText("Detect. Heal. Recover. Unattended.", { x: 0.55, y: 0.42, w: 8.9, h: 0.6, fontFace: F.sans, fontSize: 30, bold: true, color: C.ink, margin: 0 });

  const steps = [
    [I.detect, "01", "DETECT", "29/29 rows missing change_type", C.warn],
    [I.heal, "02", "HEAL", "one prompt · same c_* ID", C.azure],
    [I.approve, "03", "APPROVE", "at the gate · never half-written", C.ink],
    [I.recover, "04", "RECOVER", "29 rows back · 0 code changes", C.signal],
  ];
  steps.forEach((st, i) => {
    const x = 0.55 + i * 2.32;
    card(s, x, 1.35, 2.05, 2.3, C.panel2);
    s.addText(st[1], { x: x + 0.18, y: 1.5, w: 1, h: 0.35, fontFace: F.mono, fontSize: 15, bold: true, color: C.faint, margin: 0 });
    s.addShape(p.shapes.OVAL, { x: x + 0.63, y: 1.85, w: 0.8, h: 0.8, fill: { color: C.panel }, line: { color: st[4], width: 1.5 } });
    s.addImage({ data: st[0], x: x + 0.83, y: 2.05, w: 0.4, h: 0.4 });
    s.addText(st[2], { x: x, y: 2.78, w: 2.05, h: 0.3, fontFace: F.mono, fontSize: 13, bold: true, color: st[4], align: "center", margin: 0 });
    s.addText(st[3], { x: x + 0.1, y: 3.1, w: 1.85, h: 0.5, fontFace: F.sans, fontSize: 9.5, color: C.dim, align: "center", margin: 0 });
    if (i < 3) s.addText("→", { x: x + 2.0, y: 2.2, w: 0.4, h: 0.4, fontFace: F.sans, fontSize: 20, color: C.signal, align: "center", margin: 0 });
  });

  // proof chips
  const chips = [
    ["COLLECTOR", "c_mt36bqzoxmjmuuk6y"],
    ["HEAL JOB", "ia_mt3bwk3f1l3wyn63hq"],
    ["SCHEDULE", "daily 09:00 UTC"],
    ["AUDIT", "every attempt on /health"],
  ];
  chips.forEach((c, i) => {
    const x = 0.55 + i * 2.32;
    card(s, x, 4.05, 2.05, 0.78, C.panel);
    s.addText(c[0], { x: x + 0.15, y: 4.14, w: 1.8, h: 0.2, fontFace: F.mono, fontSize: 8, color: C.faint, charSpacing: 1, margin: 0 });
    s.addText(c[1], { x: x + 0.15, y: 4.34, w: 1.85, h: 0.4, fontFace: F.mono, fontSize: 9.5, color: C.ink, margin: 0 });
  });

  s.addText("Real event, real collector — recorded in docs/live-heal-log.md", { x: 0.55, y: 5.05, w: 8.9, h: 0.28, fontFace: F.sans, fontSize: 10, italic: true, color: C.faint, margin: 0 });

  /* ── S4 · CLOSING ───────────────────────────────────────────── */
  s = p.addSlide();
  base(s);
  s.addText([
    { text: "The scraper that ", options: { color: C.ink } },
    { text: "fixes itself", options: { color: C.signal } },
    { text: ".", options: { color: C.ink } },
  ], { x: 0.55, y: 1.55, w: 8.9, h: 0.95, fontFace: F.sans, fontSize: 44, bold: true, margin: 0 });
  s.addText("github.com/rajkumarpawar07/modelpulse", { x: 0.55, y: 2.6, w: 6, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.dim, margin: 0 });
  s.addText(SITE + "  ·  /health", { x: 0.55, y: 2.95, w: 6, h: 0.3, fontFace: F.mono, fontSize: 12, color: C.faint, margin: 0 });
  ekg(s, [[0.55, 4.0], [2.2, 4.0], [2.8, 3.3], [3.5, 4.7], [4.2, 3.6], [4.8, 4.0], [9.45, 4.0]], C.signal, 2.5);
  s.addText("NOW — LIVE.", { x: 6.9, y: 4.55, w: 2.55, h: 0.4, fontFace: F.mono, fontSize: 18, bold: true, color: C.signal, align: "right", charSpacing: 3, margin: 0 });

  await p.writeFile({ fileName: "docs/modelpulse-demo-deck.pptx" });
  console.log("deck v2 written");
})();
