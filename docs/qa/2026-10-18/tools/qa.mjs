// QA sweep: screenshots + automated checks for every page at 390 and 1280.
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = "http://127.0.0.1:8787";
const OUT = process.argv[2];
const ONLY = process.argv[3] ? new RegExp(process.argv[3]) : null;
const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const pages = [
  ["landing", "/"], ["second", "/second"], ["season", "/season"], ["gift", "/gift"], ["gift-thanks", "/gift/thanks/QAGIFT23"], ["gift-landing", "/gift/QAGIFT23"],
  ["result-inwindow", "/p/qaprev000001"], ["result-separating-notime", "/p/qaprev000002"], ["result-notyet", "/p/qaprev000003"], ["result-second", "/p/qaprev000004"],
  ["reading", "/r/qatokreading00000000000a"], ["reading-second", "/r/qatokreading00000000000c"], ["writing", "/r/qatokwriting00000000000a"], ["failed", "/r/qatokfailed000000000000a"],
  ["season-manage-active", "/season/manage/qatokreading00000000000a"], ["season-manage-none", "/season/manage/qatokreading00000000000b"],
  ["privacy", "/privacy"], ["terms", "/terms"], ["refunds", "/refunds"],
  ...SIGNS.map((s) => [`sign-${s}`, `/saturn-return/saturn-in/${s}`]),
];
const report = {};
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

async function audit(p) {
  return p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const r = { overflowX: document.documentElement.scrollWidth - vw, wide: [], svgNoName: [], imgNoAlt: [], unlabeled: [], noName: [], hashLinks: [], links: [], hiddenText: [], smallTargets: [] };
    const desc = (el) => (el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : "") + " «" + (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 40) + "»");
    const visible = (el) => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden") return false; const rc = el.getBoundingClientRect(); return rc.width > 0 && rc.height > 0; };
    for (const el of document.querySelectorAll("body *")) {
      const rc = el.getBoundingClientRect();
      if (visible(el) && rc.right > vw + 1 && getComputedStyle(el).position !== "fixed") {
        // only count if no ancestor clips overflow
        let a = el.parentElement, clipped = false; while (a && a !== document.body) { const o = getComputedStyle(a); if (o.overflow !== "visible" || o.overflowX !== "visible") { clipped = true; break; } a = a.parentElement; }
        if (!clipped) r.wide.push(desc(el) + ` right=${Math.round(rc.right)}`);
      }
    }
    r.wide = r.wide.slice(0, 8);
    for (const s of document.querySelectorAll("svg")) {
      if (s.closest("[aria-hidden=true]")) continue;
      const named = s.getAttribute("aria-label") || s.getAttribute("aria-labelledby") || s.querySelector(":scope > title");
      if (!named) r.svgNoName.push((s.id || s.getAttribute("class") || s.getAttribute("viewBox")) + " in " + desc(s.parentElement).slice(0, 60));
    }
    for (const i of document.querySelectorAll("img")) if (!i.hasAttribute("alt")) r.imgNoAlt.push(i.src);
    for (const i of document.querySelectorAll("input:not([type=hidden]),select,textarea")) {
      const lab = (i.id && document.querySelector(`label[for="${i.id}"]`)) || i.closest("label") || i.getAttribute("aria-label") || i.getAttribute("aria-labelledby");
      if (!lab) r.unlabeled.push(desc(i) + " name=" + i.name + " ph=" + (i.placeholder || ""));
    }
    for (const el of document.querySelectorAll("a[href],button")) {
      const name = (el.getAttribute("aria-label") || el.innerText || el.title || "").trim();
      if (!name && !el.querySelector("img[alt]:not([alt=''])")) r.noName.push(desc(el));
      if (el.tagName === "A" && el.getAttribute("href") === "#") r.hashLinks.push(desc(el));
      if (el.tagName === "A") r.links.push(el.getAttribute("href"));
      if (visible(el)) { const rc = el.getBoundingClientRect(); if ((rc.height < 24 || rc.width < 24) && getComputedStyle(el).display !== "inline") r.smallTargets.push(desc(el) + ` ${Math.round(rc.width)}x${Math.round(rc.height)}`); }
    }
    // text left invisible (opacity ~0) — e.g. reveal animations that never ran
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const t = walker.currentNode; if (!t.nodeValue.trim()) continue; const el = t.parentElement; if (!el || seen.has(el) || !visible(el)) continue;
      if (el.closest("script,style,noscript,title")) continue;
      let o = 1, a = el; while (a) { o *= parseFloat(getComputedStyle(a).opacity); a = a.parentElement; }
      if (o < 0.15) { seen.add(el); r.hiddenText.push(desc(el).slice(0, 80) + ` op=${o.toFixed(2)}`); }
    }
    r.hiddenSvg = [];
    for (const g of document.querySelectorAll("svg [class]")) { const s = getComputedStyle(g); if (g.closest('[style*="display:none"],[style*="display: none"]')) continue; if (parseFloat(s.opacity) < 0.05 && !/opacity/.test(g.getAttribute("style") || "")) r.hiddenSvg.push(g.tagName + "." + g.getAttribute("class")); }
    r.hiddenSvg = [...new Set(r.hiddenSvg)].slice(0, 10);
    r.hiddenText = r.hiddenText.slice(0, 12); r.smallTargets = r.smallTargets.slice(0, 10);
    r.links = [...new Set(r.links)];
    return r;
  });
}

async function tabWalk(p, max = 70) {
  return p.evaluate(async (max) => {
    return max;
  }, max).then(async () => {
    const out = []; const seen = new Set(); let dup = 0;
    await p.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
    for (let i = 0; i < max; i++) {
      await p.keyboard.press("Tab");
      const info = await p.evaluate(() => {
        const el = document.activeElement; if (!el || el === document.body) return null;
        const pick = (s) => [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
        const focused = pick(getComputedStyle(el));
        const key = el.tagName + (el.id || "") + (el.getAttribute("href") || "") + (el.textContent || "").trim().slice(0, 30) + (el.name || "") + (el.value || "");
        const rc = el.getBoundingClientRect();
        // compare against a non-focused clone of the same element state: temporarily blur, then refocus
        el.blur(); const plain = pick(getComputedStyle(el)); el.focus({ preventScroll: true });
        const visibleOutline = getComputedStyle(el).outlineStyle !== "none" && parseFloat(getComputedStyle(el).outlineWidth) > 0;
        return { type: el.type || '', key, tag: el.tagName.toLowerCase(), cls: (el.getAttribute("class") || ""), text: ((el.getAttribute("aria-label") || el.textContent || el.value || el.name || "").trim().replace(/\s+/g, " ").slice(0, 40)), changed: focused !== plain, outline: visibleOutline, offscreen: rc.width === 0 || rc.height === 0 };
      });
      if (!info) break;
      if (seen.has(info.key)) { if (/date|time/.test(info.type) && dup++ < 6) continue; break; } seen.add(info.key);
      out.push(info);
    }
    return out;
  });
}

for (const vw of [390, 1280]) {
  for (const [name, path] of pages) {
    if (ONLY && !ONLY.test(name)) continue;
    const ctx = await b.newContext({ viewport: { width: vw, height: vw === 390 ? 844 : 900 }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = []; const failed = [];
    p.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 200)));
    p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 200)); });
    p.on("requestfailed", (r) => failed.push(r.url().slice(0, 120) + " " + (r.failure()?.errorText ?? "")));
    p.on("response", (r) => { if (r.status() >= 400 && !r.url().endsWith(path)) failed.push(r.status() + " " + r.url().slice(0, 120)); });
    // block anything that could reach a paid/3rd-party API from the browser
    await p.route(/posthog|stripe\.com|anthropic|resend/, (r) => r.abort());
    const resp = await p.goto(BASE + path, { waitUntil: "load" });
    await p.waitForTimeout(3500);
    const motion = await audit(p);
    // scroll through to trigger IntersectionObserver reveals
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 180)); } window.scrollTo(0, 0); });
    await p.waitForTimeout(800);
    const tabs = vw === 1280 ? await tabWalk(p) : null;
    await p.emulateMedia({ reducedMotion: "reduce" });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.waitForTimeout(600);
    const reduced = await audit(p);
    await p.screenshot({ path: `${OUT}/${name}-${vw}.jpg`, fullPage: true, type: "jpeg", quality: vw === 390 ? 60 : 55 });
    report[`${name}@${vw}`] = { status: resp.status(), errs, failed, overflowX: motion.overflowX, wide: motion.wide, hiddenTextReduced: reduced.hiddenText, hiddenSvgReduced: reduced.hiddenSvg, hiddenTextMotion: motion.hiddenText, svgNoName: motion.svgNoName, imgNoAlt: motion.imgNoAlt, unlabeled: motion.unlabeled, noName: motion.noName, hashLinks: motion.hashLinks, links: motion.links, smallTargets: motion.smallTargets, tabs };
    console.log(name, vw, resp.status(), "errs", errs.length, "ovf", motion.overflowX, "hidden(reduce)", reduced.hiddenText.length);
    await ctx.close();
  }
}
fs.writeFileSync(`${OUT}/../audit.json`, JSON.stringify(report, null, 1));
await b.close();
