// WCAG contrast of every rendered text colour against its effective background, on every page.
// fg alpha and element opacity are composited onto the nearest opaque-ish ancestor background (alpha layers blended).
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8787";
const OUT = process.argv[2];
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const pages = ["/", "/second", "/season", "/gift", "/gift/thanks/QAGIFT23", "/gift/QAGIFT23", "/p/qaprev000001", "/p/qaprev000002", "/p/qaprev000003", "/p/qaprev000004",
  "/r/qatokreading00000000000a", "/r/qatokreading00000000000c", "/r/qatokwriting00000000000a", "/r/qatokfailed000000000000a", "/season/manage/qatokreading00000000000a", "/season/manage/qatokreading00000000000b",
  "/privacy", "/terms", "/refunds", "/start", ...SIGNS.map((s) => `/saturn-return/saturn-in/${s}`)];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const pairs = new Map();
for (const vw of [1280, 390]) for (const path of pages) {
  const ctx = await b.newContext({ viewport: { width: vw, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  await p.route(/posthog|stripe\.com|anthropic|resend/, (r) => r.abort());
  await p.goto(BASE + path); await p.waitForTimeout(1200);
  // open every FAQ answer so its colours are measured too
  await p.evaluate(() => document.querySelectorAll(".faqa").forEach((a) => a.classList.add("open")));
  const found = await p.evaluate(() => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]; };
    const over = (top, bot) => { const a = top[3]; return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1]; };
    const bgOf = (el) => { const layers = []; let a = el; while (a) { const s = getComputedStyle(a); const c = parse(s.backgroundColor); if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } if (s.backgroundImage && s.backgroundImage !== "none" && !/gradient/.test(s.backgroundImage)) return null; a = a.parentElement; } let base = [14, 16, 20, 1]; for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base); return base; };
    const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    const hex = (c) => "#" + c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = []; const seen = new Set();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) {
      const t = w.currentNode; if (!t.nodeValue.trim()) continue; const el = t.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
      if (el.closest("script,style,svg,[aria-hidden=true]")) continue;
      const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") continue;
      const rc = el.getBoundingClientRect(); if (!rc.width || !rc.height) continue;
      if (el.matches("input,textarea,select,option")) continue;
      let op = 1, a = el; while (a) { op *= parseFloat(getComputedStyle(a).opacity); a = a.parentElement; }
      if (op < 0.05) continue;
      const bg = bgOf(el); if (!bg) continue;
      const fg0 = parse(s.color); if (!fg0) continue;
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
      const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const r = ratio(fg, bg);
      const sel = el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "");
      res.push({ fg: hex(fg), fgRaw: s.color + (op < 1 ? ` @op${op.toFixed(2)}` : ""), bg: hex(bg), r: +r.toFixed(2), large, size, sel, text: t.nodeValue.trim().slice(0, 40) });
    }
    // SVG <text>: fill against the nearest HTML background (chart rects behind text are not composited; noted in the report)
    for (const el of document.querySelectorAll("svg text")) {
      if (el.closest("[aria-hidden=true]") && !el.closest("svg[role=img]")) { /* decorative, still measured below */ }
      const s = getComputedStyle(el); if (s.display === "none" || !el.textContent.trim()) continue;
      const rc = el.getBoundingClientRect(); if (!rc.width) continue;
      let op = parseFloat(s.fillOpacity || "1"), a = el; while (a) { op *= parseFloat(getComputedStyle(a).opacity); a = a.parentElement; }
      if (op < 0.05) continue;
      const bg = bgOf(el.closest("svg").parentElement); if (!bg) continue;
      const f0 = parse(s.fill); if (!f0) continue;
      const fg = over([f0[0], f0[1], f0[2], f0[3] * op], bg);
      const size = parseFloat(s.fontSize), bold = parseInt(s.fontWeight) >= 700;
      res.push({ fg: hex(fg), fgRaw: "svg fill " + s.fill + (op < 1 ? ` @op${op.toFixed(2)}` : ""), bg: hex(bg), r: +ratio(fg, bg).toFixed(2), large: size >= 24 || (size >= 18.66 && bold), size, sel: "svg text" + (el.closest("[aria-hidden=true]") ? " (aria-hidden)" : ""), text: el.textContent.trim().slice(0, 30) });
    }
    return res;
  });
  for (const f of found) {
    const k = `${f.fgRaw}|${f.bg}|${f.large}`;
    const e = pairs.get(k) ?? { ...f, pages: new Set(), count: 0, sels: new Set() };
    e.count++; e.pages.add(path); if (e.sels.size < 4) e.sels.add(`${f.sel} «${f.text}»`); e.size = Math.min(e.size, f.size);
    pairs.set(k, e);
  }
  await ctx.close();
}
await b.close();
const rows = [...pairs.values()].map((e) => ({ ...e, pages: [...e.pages], sels: [...e.sels], need: e.large ? 3 : 4.5 })).sort((a, b) => a.r - b.r);
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
for (const r of rows) console.log((r.r < r.need ? "FAIL" : "ok  "), r.r.toFixed(2).padStart(6), r.need, r.fg, "on", r.bg, "|", r.fgRaw, "|", r.count, "|", r.sels[0], "|", r.pages.slice(0, 3).join(" "));
