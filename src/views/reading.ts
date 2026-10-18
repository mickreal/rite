import { html, raw } from "hono/html";
import { shell } from "./theme";
import type { Computed, Cycle } from "../compute";
import { fmtDay, fmtMonth } from "../compute";
import { STAGES, fmtMonYr, fmtMonYrL, untilText } from "../astro/cycle";
import { saturnLongitude } from "../astro/saturn";
import { ORDINAL } from "../content/notes";
import { yearlyAllowed, seasonAvailable } from "../season";
import { NARRATION_VERSION } from "../tts";
import { natalLabelPos, textWidth } from "./chart";

export interface ReportJson {
  cover_line: string; saturn_p1: string; saturn_p2: string; house_h3: string; house_p: string;
  chips_warm: string[]; chips_cool: string[];
  phase_approach: string; phase_contact: string; phase_integration: string;
  passes: Array<{ name: string; body: string; before: string; day: string; after: string }>;
  turn: { name: string; body: string; before: string; day: string; after: string } | null;
  areas: Array<{ h3: string; p: string }>;
  history_q: string[];
  workbook_approach: string[]; workbook_contact: string[]; workbook_integration: string[];
  carry: string;
}

const CSS = `
.strip{background:#14171D;border-radius:24px;border:1px solid rgba(237,230,214,.06);overflow:hidden}
.strip .cells{display:flex;flex-wrap:wrap}
.strip .player{display:flex;flex-wrap:wrap;align-items:center;gap:18px 24px;padding:18px 20px;border-top:1px solid rgba(237,230,214,.08)}
.strip .cell{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px;padding:18px 20px;border-right:1px solid rgba(237,230,214,.08);border-bottom:1px solid rgba(237,230,214,.08);margin-bottom:-1px}
.strip .cell:last-child{border-right:0}
.strip .cell span{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8F897E;white-space:nowrap}
.strip .cell b{font-family:'Bricolage Grotesque',serif;font-size:clamp(17px,1.45vw,22px);font-weight:700;letter-spacing:-.02em;line-height:1.1;color:#EDE6D6;white-space:nowrap;display:flex;align-items:center;gap:8px}
.strip .cell .dot{width:8px;height:8px;border-radius:50%;background:#F2B544;box-shadow:0 0 0 4px rgba(242,181,68,.18);flex:0 0 auto}
@media (max-width:720px){.strip .cell{flex:1 1 50%;min-width:50%;padding:16px 18px}.strip .cell b{white-space:normal}}
@media print{.strip{border:1px solid #ddd}.strip .cell b{color:#111}}
.prog{position:fixed;top:0;left:0;right:0;height:3px;background:#F2B544;transform-origin:left center;transform:scaleX(0);z-index:10}
@supports (animation-timeline: scroll()){.prog{animation:prog linear both;animation-timeline:scroll()}@keyframes prog{to{transform:scaleX(1)}}}
.toc{flex:1 1 220px;max-width:260px;position:sticky;top:32px;display:flex;flex-direction:column}
.toc a{display:flex;justify-content:space-between;gap:12px;padding:10px 0 10px 16px;color:#A7A196;text-decoration:none;border-left:2px solid rgba(237,230,214,.1);font-weight:500;font-size:15px;transition:color .2s,border-color .2s}
.toc a:hover{color:#EDE6D6;border-color:#F2B544}.toc a i{font-style:normal;color:#8A857B;font-size:13px}
@media (max-width:900px){.toc{position:static;max-width:none;flex-direction:row;flex-wrap:wrap;gap:4px 14px}.toc a{border-left:0;padding:6px 0}.toc a i{display:none}}
.ch{scroll-margin-top:32px;display:flex;flex-direction:column;gap:24px;padding-bottom:120px}
.ch p.body{margin:0;font-size:19px;line-height:1.72;color:#CFC8BA;max-width:660px}
.ch h2{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(40px,4.4vw,64px);line-height:1;letter-spacing:-.035em;font-weight:700;color:#EDE6D6}
.ch h3{margin:0;font-family:'Bricolage Grotesque',serif;font-size:26px;letter-spacing:-.02em;font-weight:600;color:#EDE6D6}
.kicker{font-size:15px;color:#F2B544}
.phase{display:flex;flex-direction:column;gap:12px;border-top:2px solid rgba(237,230,214,.12);padding-top:18px}.phase.cur{border-top-color:#F2B544}
.tab{min-height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(237,230,214,.2);background:none;color:#EDE6D6;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer}.tab.on{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.mrow{display:grid;grid-template-columns:120px 92px minmax(0,1fr);gap:16px;align-items:baseline;padding:18px 0;border-top:1px solid rgba(237,230,214,.1)}
.mrow.now{background:linear-gradient(90deg,rgba(242,181,68,.08),transparent 70%);border-top-color:rgba(242,181,68,.5)}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;padding:3px 10px;border-radius:999px;width:fit-content}.badge.d{background:rgba(237,230,214,.08);color:#CFC8BA}.badge.r{background:rgba(242,181,68,.14);color:#F2B544}
.meter{height:8px;border-radius:4px;background:rgba(237,230,214,.08);overflow:hidden}.meter div{height:100%;border-radius:4px;background:#F2B544;transform-origin:left center}
@supports (animation-timeline: view()){.meter div{animation:mt linear both;animation-timeline:view();animation-range:entry 30% cover 45%}@keyframes mt{from{transform:scaleX(0)}to{transform:scaleX(1)}}}
.scrub{width:100%;accent-color:#F2B544;height:44px;cursor:pointer}
.qchip{min-height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(237,230,214,.18);background:none;color:#CFC8BA;font:500 14px 'Hanken Grotesk',sans-serif;cursor:pointer;transition:all .2s}.qchip:hover{border-color:#F2B544;color:#EDE6D6}.qchip.on{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.nowrow{display:grid;grid-template-columns:120px minmax(0,1fr);gap:16px;padding:14px 0;border-top:1px solid rgba(237,230,214,.1);font-size:16px;line-height:1.55}
.tile{display:flex;flex-direction:column;gap:8px;padding:22px;border-radius:24px;background:#14171D;border:1px solid transparent;text-decoration:none;color:#EDE6D6;transition:border-color .25s,transform .25s;cursor:pointer;text-align:left;font-family:inherit}
.tile:hover{color:#EDE6D6;border-color:rgba(242,181,68,.5);transform:translateY(-3px)}.tile.now{border-color:#F2B544;background:#1A1D23}.tile.past{opacity:.82}
.st{font-size:13px;font-weight:600;padding:3px 10px;border-radius:999px;width:fit-content}.st.past{background:rgba(237,230,214,.08);color:#BDB6A8}.st.now{background:#F2B544;color:#14110A}.st.ahead{background:rgba(242,181,68,.12);color:#F2B544}
.wsat{transition:transform 1s cubic-bezier(.3,.7,.2,1)}.warc,.wseg{transition:stroke-dasharray 1s,transform 1s}
.eq span{display:inline-block;width:3px;margin-right:2px;border-radius:2px;background:#14110A;animation:eq 1s ease-in-out infinite}@keyframes eq{0%,100%{height:5px}50%{height:15px}}
.ans{border-top:1px solid rgba(237,230,214,.1);padding-top:16px;display:flex;flex-direction:column;gap:8px}.ans b{color:#F2B544;font-weight:600}
.carry{font-family:'Bricolage Grotesque',serif;font-size:clamp(26px,3vw,38px);line-height:1.2;letter-spacing:-.02em;color:#F2B544;border-left:3px solid #F2B544;padding:8px 0 8px 24px;margin:0}
@media (max-width:720px){.mrow{grid-template-columns:1fr;gap:6px}.nowrow{grid-template-columns:1fr;gap:4px}}
@media print{.toc,.prog,.scrub,.qchip,.tab,textarea,form,button{display:none!important}.ch{page-break-inside:avoid;padding-bottom:40px}.mrow{grid-template-columns:120px 92px 1fr}}
`;

const WHEEL_LABELS = ["Return", "Planting", "First test", "Building", "Full view", "Proving", "Letting go", "Clearing"];
const WHEEL_POS: Array<[number, number]> = [[250, 88], [367, 141], [406, 250], [363, 363], [250, 412], [137, 363], [94, 250], [131, 143]];

export function readingPage(opts: { siteUrl: string; token: string; c: Computed; cy: Cycle; r: ReportJson; firstName: string | null; birthLabel: string; placeLabel: string; askLeft: number; asks: Array<{ q: string; a: string }>; subscribed: boolean; today?: Date;
  /** The gift code bought with this reading (order bump), if any. */ bumpGift?: { code: string; used: boolean } | null; banner?: boolean;
  /** Build 11: year-aheads bought for this reading, and the offer when one can be bought now (YEAR_AHEAD not "off"). */
  yearAhead?: { bought: Array<{ year: number; label: string; ready: boolean }>; offer: { label: string; price: string } | null } | null }) {
  const { c, cy, r } = opts; const w = c.window; const today = opts.today ?? new Date();
  const Cw = 2 * Math.PI * 200;
  // Natal label placed clear of the curve, the pass rings and the Approach / Contact labels.
  const natalText = `your natal Saturn, ${Math.floor(c.degree)}° ${c.sign}`;
  const natal = natalLabelPos(cy.chart, c.natalLon, w.hits, natalText, { boxes: [{ x0: 48, x1: 48 + textWidth("Approach", 13), y0: 26, y1: 40 }, { x0: cy.chart.contactX0 + 8, x1: cy.chart.contactX0 + 8 + textWidth("Contact", 13), y0: 26, y1: 40 }] });
  const stage = cy.stage; const seg = [[345, 30], [15, 65], [80, 20], [100, 70], [170, 20], [190, 70], [260, 20], [280, 65]][stage.idx];
  const now = today.getTime(), open = Date.parse(w.windowStart), close = Date.parse(w.windowEnd);
  const frac = Math.max(0, Math.min(1, (now - open) / (close - open)));
  const whereNow = now < open ? "Approach" : now > close ? "Done" : stage.key === "ra" ? `Approach, ${Math.round(frac * 100)}% in` : stage.key === "rc" ? `Contact, ${Math.round(frac * 100)}% in` : `Integration, ${Math.round(frac * 100)}% in`;
  const years = Array.from(new Set(cy.months.map((m) => m.year)));
  const curYear = cy.months.find((m) => m.isNow)?.year ?? years[0];
  const moments = [
    ...w.hits.map((h, i) => ({ label: w.hits.length === 1 ? "Exact pass" : `Pass ${["one", "two", "three"][i]}`, date: h, ...(r.passes[i] ?? r.passes[r.passes.length - 1]) })),
    ...(cy.turn && r.turn ? [{ label: "Closest turn", date: cy.turn.date, ...r.turn }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  // long arc: past checkpoints + this return + next cycle
  const arc = [
    ...cy.history.map((p) => ({ age: p.ageApprox, name: p.name, from: p.from, to: p.to })),
    { age: Math.floor((Date.parse(w.hits[0]) - Date.parse(c.birthUtc)) / (365.2422 * 86400000)), name: c.returnNumber === 1 ? "Your return" : c.returnNumber === 2 ? "Second return" : "Third return", from: w.windowStart, to: w.windowEnd },
    ...cy.ahead.filter((p) => p.kind !== "return").map((p) => ({ age: p.ageApprox, name: p.name, from: p.from, to: p.to })),
    ...cy.ahead.filter((p) => p.kind === "return").map((p) => ({ age: p.ageApprox, name: c.returnNumber === 1 ? "Second return" : "Third return", from: p.from, to: p.to })),
  ];
  const d = today.toISOString().slice(0, 10);
  const saturnPast = cy.turn ? (((saturnLongitude(new Date(cy.turn.date + 'T12:00:00Z')) - c.natalLon + 540) % 360) - 180) > 0 : false;
  const stageText = (k: string) => STAGES[k as keyof typeof STAGES];

  const nav = html`<nav class="main" style="gap:10px"><a href="javascript:window.print()" class="ghost">Printable PDF</a><a href="/card/r/${opts.token}.png" class="ghost" download="rite-saturn-return.png">Share card</a></nav>`;

  const body = html`
<div class="prog" aria-hidden="true"></div>
<section class="wrap" style="padding-top:32px;padding-bottom:72px;display:flex;flex-direction:column;gap:36px">
  <div style="display:flex;flex-direction:column;gap:18px">
    <p class="muted" style="margin:0;font-size:17px">${opts.firstName ? `Prepared for ${opts.firstName}. ` : ""}Born ${opts.birthLabel}, ${opts.placeLabel}.</p>
    <h1 class="disp" style="margin:0;font-size:clamp(60px,9vw,150px);line-height:.86;letter-spacing:-.05em;font-weight:800"><span style="display:block;overflow:hidden;padding-bottom:.04em"><span class="w">Your Saturn</span></span><span style="display:block;overflow:hidden;padding-bottom:.06em"><span class="w" style="animation-delay:.1s;color:#F2B544">return.</span></span></h1>
    <p class="disp" style="margin:0;max-width:820px;font-size:clamp(22px,2.2vw,30px);line-height:1.3">${r.cover_line}</p>
  </div>
  <div class="strip">
    <div class="cells">
      <div class="cell"><span>Natal Saturn</span><b>${Math.floor(c.degree)}° ${c.sign}</b></div>
      <div class="cell"><span>House</span><b>${c.house ? ORDINAL[c.house].replace(/(\d+)(st|nd|rd|th)/, "$1$2") : "—"}</b></div>
      <div class="cell"><span>Window</span><b>${fmtMonYr(open)} – ${fmtMonYr(close)}</b></div>
      ${w.hits.map((h, i) => html`<div class="cell"><span>${w.hits.length === 1 ? "Exact pass" : `Pass ${i + 1}`}</span><b style="color:#F2B544">${fmtDay(h)}</b></div>`)}
      ${cy.turn ? html`<div class="cell"><span>Closest turn</span><b>${fmtDay(cy.turn.date)}</b></div>` : ""}
      <div class="cell"><span>Where you are</span><b><i class="dot"></i>${whereNow.replace(", ", " · ")}</b></div>
    </div>
    <div class="player noprint">
      <button type="button" id="playBtn" class="solid" aria-label="Play narration" style="width:56px;height:56px;padding:0;justify-content:center;flex:0 0 auto">
        <span id="playEq" class="eq" aria-hidden="true" style="display:none;align-items:center;height:16px"><span></span><span style="animation-delay:.2s"></span><span style="animation-delay:.4s"></span></span>
        <svg id="playIco" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3l10 6-10 6z" fill="#14110A"/></svg>
      </button>
      <div style="flex:1 1 200px;min-width:0;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><span class="disp" style="font-size:19px;font-weight:600">Listen to your reading</span><span id="playMeta" class="muted" aria-live="polite" style="font-size:14px">Narrated, about 20 minutes</span></div>
        <div style="height:6px;border-radius:3px;background:rgba(237,230,214,.1);overflow:hidden"><div id="playBar" style="height:100%;width:0;background:#F2B544;transition:width .4s linear"></div></div>
      </div>
      <a href="/r/${opts.token}/calendar.ics" class="ghost" download="rite-saturn-return.ics">Add every date to my calendar</a>
    </div>
  </div>
</section>

<div class="wrap" style="padding-bottom:80px;display:flex;flex-wrap:wrap;gap:64px;align-items:flex-start">
<nav class="toc" aria-label="Chapters">
  ${["Where you are now", "Your Saturn", "The window", "The pass and the turn", "Where it shows up", "Month by month", "Your Saturn history", "Workbook", "The long arc", "Ask about your reading"].map((t, i) => html`<a href="#c${i}">${t} <i>${i}</i></a>`)}
</nav>
<main style="flex:999 1 600px;min-width:0">

<section id="c0" class="ch rv">
  <span class="kicker">Updates as you move through the cycle</span>
  <h2>Where you are now</h2>
  <p class="body">Saturn takes about 29 years to come home, and every stretch of that loop asks something different. This page changes with it. Come back as you approach each age and it will meet you where you are.</p>
  <div style="display:flex;flex-wrap:wrap;gap:28px;align-items:center">
    <div style="flex:1 1 340px;max-width:460px;margin:0 auto">
      <svg viewBox="0 0 500 500" style="width:100%;display:block" role="img" aria-label="Saturn cycle wheel">
        <circle cx="250" cy="250" r="200" fill="none" stroke="rgba(237,230,214,.12)" stroke-width="2"/>
        <circle id="wseg" class="wseg" cx="250" cy="250" r="200" fill="none" stroke="#F2B544" stroke-width="14" stroke-opacity=".22" style="stroke-dasharray:${(seg[1] / 360 * Cw).toFixed(1)} 2000;transform:rotate(${(seg[0] - 90).toFixed(1)}deg);transform-origin:250px 250px"/>
        <circle id="warc" class="warc" cx="250" cy="250" r="200" fill="none" stroke="#F2B544" stroke-width="2.5" stroke-linecap="round" style="stroke-dasharray:${(stage.wa / 360 * Cw).toFixed(1)} 2000;transform:rotate(-90deg);transform-origin:250px 250px"/>
        <g stroke="rgba(237,230,214,.35)" stroke-width="2"><line x1="250" y1="38" x2="250" y2="62"/><line x1="462" y1="250" x2="438" y2="250"/><line x1="250" y1="462" x2="250" y2="438"/><line x1="38" y1="250" x2="62" y2="250"/></g>
        <g font-family="Hanken Grotesk, sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">${WHEEL_LABELS.map((l, i) => html`<text class="wl" data-i="${i}" x="${WHEEL_POS[i][0]}" y="${WHEEL_POS[i][1]}" fill="${i === stage.idx ? "#F2B544" : "#8A857B"}">${l}</text>`)}</g>
        <text id="ageNow" x="250" y="232" text-anchor="middle" fill="#EDE6D6" font-family="Bricolage Grotesque, serif" font-size="64" font-weight="800" letter-spacing="-2">${stage.age}</text>
        <text x="250" y="276" text-anchor="middle" fill="#A7A196" font-family="Hanken Grotesk, sans-serif" font-size="15">years old</text>
        <g id="wsat" class="wsat" style="transform:rotate(${stage.wa.toFixed(1)}deg);transform-origin:250px 250px"><circle cx="250" cy="50" r="22" fill="#F2B544" opacity=".16"/><circle cx="250" cy="50" r="11" fill="#EDE6D6"/><ellipse cx="250" cy="50" rx="21" ry="5.5" fill="none" stroke="#F2B544" stroke-width="2" transform="rotate(-22 250 50)"/></g>
        <circle cx="250" cy="50" r="4" fill="#0E1014" stroke="#F2B544" stroke-width="2"/>
      </svg>
    </div>
    <div id="stageCard" class="card swap" style="flex:1 1 380px;display:flex;flex-direction:column;gap:14px">
      <span id="stKicker" class="kicker">Right now, age ${stage.age}</span>
      <h3 id="stName" style="font-size:34px;letter-spacing:-.03em">${stage.name}</h3>
      <p id="stTheme" style="margin:0;font-size:17px;line-height:1.65;color:#CFC8BA">${stage.theme}</p>
      <div>
        <div class="nowrow"><span class="muted">In the sky</span><span id="stSky">${stage.sky}</span></div>
        <div class="nowrow"><span class="muted">Focus on</span><span id="stFocus">${stage.focus}</span></div>
        <div class="nowrow"><span class="muted">Let go of</span><span id="stRelease">${stage.release}</span></div>
        <div class="nowrow"><span class="muted">Ask yourself</span><span id="stQ" style="color:#F2B544">${stage.question}</span></div>
        <div class="nowrow" style="border-bottom:1px solid rgba(237,230,214,.1)"><span class="muted">Next</span><span id="stNext"></span></div>
      </div>
    </div>
  </div>
  <div class="card noprint" style="display:flex;flex-direction:column;gap:14px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><label for="scrub" class="disp" style="font-size:20px;font-weight:600">See your reading on another date</label><span id="dateLabel" style="font-size:15px;color:#F2B544">Showing ${fmtMonYr(now)}, today</span></div>
    <input id="scrub" class="scrub" type="range" min="0" max="431" step="1" value="${(today.getUTCFullYear() - 2025) * 12 + today.getUTCMonth()}" aria-valuetext="${fmtMonYr(now)}">
    <div aria-hidden="true" style="position:relative;height:18px;font-size:13px;color:#8A857B">${[2025, 2035, 2045, 2060].map((y, i, a) => html`<span style="position:absolute;left:${(((y - 2025) * 12) / 431 * 100).toFixed(1)}%;${i === 0 ? "" : i === a.length - 1 ? "transform:translateX(-100%)" : "transform:translateX(-50%)"}">${y}</span>`)}</div>
    <div id="jumps" style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="qchip on" data-t="today" aria-pressed="true">Today</button>${w.hits.map((h, i) => html`<button type="button" class="qchip" aria-pressed="false" data-t="${h}">${w.hits.length === 1 ? "Exact pass" : `Pass ${i + 1}`}</button>`)}${cy.turn ? html`<button type="button" class="qchip" aria-pressed="false" data-t="${cy.turn.date}">The turn</button>` : ""}${cy.ahead.map((p) => html`<button type="button" class="qchip" aria-pressed="false" data-t="${p.from}">Age ${p.ageApprox}</button>`)}</div>
  </div>
</section>

<section id="c1" class="ch rv">
  <span class="kicker">Chapter one</span><h2>Your Saturn</h2>
  <p class="body">${r.saturn_p1}</p><p class="body">${r.saturn_p2}</p>
  <h3 style="margin-top:12px">${r.house_h3}</h3><p class="body">${r.house_p}</p>
  <div style="display:flex;flex-wrap:wrap;gap:8px">${r.chips_warm.map((x) => html`<span class="chip warm">${x}</span>`)}${r.chips_cool.map((x) => html`<span class="chip">${x}</span>`)}</div>
</section>

<section id="c2" class="ch rv">
  <span class="kicker">Chapter two</span><h2>The window</h2>
  <p class="body">Saturn ${now > open ? "entered" : "enters"} ${c.sign} on ${fmtDay(w.windowStart)} and ${now > close ? "left" : "leaves"} on ${fmtDay(w.windowEnd)}. Here is its actual path against your natal degree.</p>
  <div class="card" style="padding:clamp(16px,2.4vw,28px);overflow-x:auto">
    <svg viewBox="0 0 1000 300" style="width:100%;min-width:620px;display:block" role="img" aria-label="Saturn's path against your natal degree">
      <rect x="40" y="16" width="${(cy.chart.contactX0 - 40).toFixed(1)}" height="244" fill="rgba(237,230,214,.025)"/>
      <rect x="${cy.chart.contactX0.toFixed(1)}" y="16" width="${(cy.chart.contactX1 - cy.chart.contactX0 + 6).toFixed(1)}" height="244" fill="rgba(242,181,68,.07)"/>
      <line x1="40" y1="${cy.chart.y0.toFixed(1)}" x2="960" y2="${cy.chart.y0.toFixed(1)}" stroke="rgba(237,230,214,.4)" stroke-dasharray="4 6"/>
      <text x="${natal.x.toFixed(1)}" y="${natal.y.toFixed(1)}" text-anchor="${natal.anchor}" fill="#A7A196" font-size="13" font-family="Hanken Grotesk, sans-serif">${natalText}</text>
      <text x="48" y="36" fill="#8A857B" font-size="13" font-family="Hanken Grotesk, sans-serif">Approach</text>
      <text x="${(cy.chart.contactX0 + 8).toFixed(1)}" y="36" fill="#F2B544" font-size="13" font-family="Hanken Grotesk, sans-serif">Contact</text>
      ${cy.chart.todayX > 0 ? html`<line x1="${cy.chart.todayX.toFixed(1)}" y1="16" x2="${cy.chart.todayX.toFixed(1)}" y2="260" stroke="#EDE6D6" stroke-width="1.2" stroke-dasharray="2 4"/><text x="${cy.chart.todayX.toFixed(1)}" y="278" text-anchor="middle" fill="#EDE6D6" font-size="12" font-family="Hanken Grotesk, sans-serif">today</text>` : ""}
      <path class="draw" pathLength="1000" d="${cy.chart.path}" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${cy.chart.stationPath}" fill="#0E1014" stroke="#EDE6D6" stroke-width="2"/>
      ${w.hits.map((h) => html`<circle class="pulse" cx="${cy.chart.x(Date.parse(h)).toFixed(1)}" cy="${cy.chart.y0.toFixed(1)}" r="9" fill="#F2B544"/>`)}
      <path d="${cy.chart.markPath}" fill="#0E1014" stroke="#F2B544" stroke-width="3"/>
      ${cy.turn ? html`<circle cx="${cy.chart.x(Date.parse(cy.turn.date)).toFixed(1)}" cy="${cy.chart.y(cy.turn.orb * (saturnPast ? 1 : -1)).toFixed(1)}" r="7" fill="#0E1014" stroke="#F2B544" stroke-width="2.5" stroke-dasharray="3 3"/>` : ""}
      ${cy.chart.yearTicks.map((t) => html`<text x="${t.x.toFixed(1)}" y="296" fill="#8A857B" font-size="12" font-family="Hanken Grotesk, sans-serif">${t.label}</text>`)}
    </svg>
    <p class="muted" style="margin:14px 0 0;font-size:14px">Gold ring${w.hits.length > 1 ? "s" : ""}: exact pass${w.hits.length > 1 ? "es" : ""}.${cy.turn ? ` Dashed ring: Saturn turns ${cy.turn.orb}° from your degree without crossing.` : ""} Small rings: Saturn standing still before changing direction.</p>
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:28px;margin-top:8px">
    <div class="phase ${stage.key === "ra" ? "cur" : ""}"><span class="kicker">${fmtMonYr(open)} to ${fmtMonYr(Date.parse(w.hits[0]))}${stage.key === "ra" ? ", you are here" : ""}</span><h3>Approach</h3><p style="margin:0;color:#CFC8BA;line-height:1.6">${r.phase_approach}</p></div>
    <div class="phase ${stage.key === "rc" ? "cur" : ""}"><span class="kicker">${w.hits.length === 1 ? fmtMonYr(Date.parse(w.hits[0])) : `${fmtMonYr(Date.parse(w.hits[0]))} to ${fmtMonYr(Date.parse(w.hits[w.hits.length - 1]))}`}${stage.key === "rc" ? ", you are here" : ""}</span><h3>Contact</h3><p style="margin:0;color:#CFC8BA;line-height:1.6">${r.phase_contact}</p></div>
    <div class="phase ${stage.key === "ri" ? "cur" : ""}"><span class="kicker">${fmtMonYr(Date.parse(w.hits[w.hits.length - 1]))} to ${fmtMonYr(close)}${stage.key === "ri" ? ", you are here" : ""}</span><h3>Integration</h3><p style="margin:0;color:#CFC8BA;line-height:1.6">${r.phase_integration}</p></div>
  </div>
</section>

<section id="c3" class="ch rv">
  <span class="kicker">Chapter three</span><h2>The pass and the turn</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
    ${moments.map((m) => html`<div class="card" style="display:flex;flex-direction:column;gap:16px">
      <span class="muted" style="font-size:15px">${m.label}</span>
      <span class="disp" style="font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1;color:#F2B544">${fmtDay(m.date)}</span>
      <h3>${m.name}</h3><p style="margin:0;font-size:17px;line-height:1.65;color:#CFC8BA">${m.body}</p>
      <div style="display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(237,230,214,.1);padding-top:16px">
        <div style="display:flex;gap:14px"><span class="muted" style="flex:0 0 104px;font-size:14px">The week before</span><span style="font-size:15px;line-height:1.5;color:#CFC8BA">${m.before}</span></div>
        <div style="display:flex;gap:14px"><span class="muted" style="flex:0 0 104px;font-size:14px">On the day</span><span style="font-size:15px;line-height:1.5;color:#CFC8BA">${m.day}</span></div>
        <div style="display:flex;gap:14px"><span class="muted" style="flex:0 0 104px;font-size:14px">The month after</span><span style="font-size:15px;line-height:1.5;color:#CFC8BA">${m.after}</span></div>
      </div>
      <div class="noprint"><a class="ghost" href="/r/${opts.token}/calendar.ics?only=${m.date}" download="rite-${m.date}.ics">Add to calendar</a></div>
    </div>`)}
  </div>
</section>

<section id="c4" class="ch rv">
  <span class="kicker">Chapter four</span><h2>Where it shows up</h2>
  <p class="body">${c.house ? "Weighted from Saturn's house and the houses whose cusps fall in Saturn's own signs. The top three are where to put your attention." : "Without a birth time the houses can't be set, so this is weighted from Saturn's classic territory: career, work and committed relationships. Add a birth time later and this chapter sharpens."}</p>
  <div class="card" style="display:flex;flex-direction:column;gap:22px">
    ${cy.areas.map((a, i) => html`<div style="display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr) 48px;gap:16px;align-items:center"><span style="font-size:16px;color:${i < 3 ? "#F2B544" : "#CFC8BA"}">${a.name}</span><div class="meter"><div style="width:${a.v}%"></div></div><span class="muted" style="font-size:14px;text-align:right">${a.v}</span></div>`)}
  </div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px">
    ${r.areas.map((a) => html`<div style="display:flex;flex-direction:column;gap:10px"><h3>${a.h3}</h3><p style="margin:0;color:#CFC8BA;line-height:1.65">${a.p}</p></div>`)}
  </div>
</section>

<section id="c5" class="ch rv">
  <span class="kicker">Chapter five</span><h2>Month by month</h2>
  <p class="body">All ${cy.months.length} months of your window, with Saturn's real position and what each one is good for.</p>
  <div class="noprint" style="display:flex;gap:8px;flex-wrap:wrap">${years.map((y) => html`<button type="button" class="tab ${y === curYear ? "on" : ""}" data-y="${y}" aria-pressed="${y === curYear}">${y}</button>`)}</div>
  <div style="border-bottom:1px solid rgba(237,230,214,.1)">
    ${cy.months.map((m) => html`<div class="mrow ${m.isNow ? "now" : ""}" data-y="${m.year}" style="${m.year === curYear ? "" : "display:none"}">
      <div style="display:flex;flex-direction:column;gap:4px"><span class="disp" style="font-size:20px;font-weight:600">${m.name}</span><span style="font-size:13px;color:#F2B544">${m.tag}</span></div>
      <div style="display:flex;flex-direction:column;gap:6px"><span class="badge ${m.retro ? "r" : "d"}">${m.retro ? "Retrograde" : "Direct"}</span><span class="muted" style="font-size:13px">${Math.floor(m.deg * 10) / 10}° ${m.sign}</span></div>
      <span style="font-size:16px;line-height:1.55;color:#CFC8BA">${m.text}</span>
    </div>`)}
  </div>
</section>

<section id="c6" class="ch rv">
  <span class="kicker">Chapter six</span><h2>Your Saturn history</h2>
  <p class="body">Saturn hit three tension points with its own position before coming home. Each one lines up with something you can probably remember. Write it down; the pattern is usually clearer than you expect. What you write stays in this browser.</p>
  <div style="display:flex;flex-direction:column;gap:14px">
    ${cy.history.map((h, i) => html`<div class="card" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px;align-items:start">
      <div style="display:flex;flex-direction:column;gap:8px"><span class="disp" style="font-size:44px;font-weight:800;letter-spacing:-.03em;line-height:1">Age ${h.ageApprox}</span><span style="color:#F2B544;font-size:15px">${h.from === h.to ? fmtMonYrL(Date.parse(h.from)) : `${fmtMonYr(Date.parse(h.from))} to ${fmtMonYr(Date.parse(h.to))}`}</span><span style="font-size:16px;line-height:1.55;color:#CFC8BA">${h.kind === "square1" ? "First square. Often the first real taste of rules and limits." : h.kind === "opposition" ? "Opposition. Pushing against the structures around you." : `Closing square${h.hits.length > 1 ? `, hit ${h.hits.length} times` : ""}. The choices that set up this return.`}</span></div>
      <div style="display:flex;flex-direction:column;gap:8px"><label class="muted" for="h${i}" style="font-size:14px">${r.history_q[i] ?? "What do you remember from then?"}</label><textarea id="h${i}" class="ta" data-store="h${i}" placeholder="A few lines is enough"></textarea></div>
    </div>`)}
  </div>
</section>

<section id="c7" class="ch rv">
  <span class="kicker">Chapter seven</span><h2>Workbook</h2>
  <p class="body">Prompts for the phase you are in now. The next set unlocks as each phase opens, and a reminder lands the week before. Your answers stay in this browser.</p>
  ${([["approach", "Approach prompts", r.workbook_approach, w.windowStart], ["contact", "Contact prompts", r.workbook_contact, w.hits[0]], ["integration", "Integration prompts", r.workbook_integration, w.hits[w.hits.length - 1]]] as Array<[string, string, string[], string]>).map(([k, title, qs, opens]) => {
    const open = k === "approach" || d >= opens;
    const isCur = (stage.key === "ra" && k === "approach") || (stage.key === "rc" && k === "contact") || (stage.key === "ri" && k === "integration");
    return open ? html`<div class="card" style="display:flex;flex-direction:column;gap:22px;${isCur ? "border:1px solid rgba(242,181,68,.45)" : ""}">
    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:baseline"><h3>${title}</h3><span class="muted" style="font-size:14px"><span data-count="${k}">0</span> of ${qs.length} answered</span></div>
    ${qs.map((q, i) => html`<div style="display:flex;flex-direction:column;gap:10px"><label for="w${k}${i}" style="font-size:17px;line-height:1.5">${q}</label><textarea id="w${k}${i}" class="ta" data-store="w${k}${i}" data-group="${k}" placeholder="Write as much or as little as you like"></textarea></div>`)}
  </div>` : html`<div class="card" style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:center;opacity:.82">
    <div style="display:flex;flex-direction:column;gap:6px"><h3>${title}</h3><span class="muted" style="font-size:15px">${qs.length} prompts. Unlocks ${fmtDay(opens)}; a reminder lands the week before.</span></div>
    <span class="badge d" style="font-size:14px;padding:6px 14px">Locked until ${fmtMonYr(Date.parse(opens))}</span>
  </div>`; })}
</section>

<section id="c8" class="ch rv">
  <span class="kicker">Chapter eight</span><h2>The long arc</h2>
  <p class="body">Every turning point of your Saturn cycle, past and ahead. A reminder lands the week before each one opens. Tap one to see your reading as it will read then.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px">
    ${arc.map((m) => { const st = d > m.to ? "past" : d >= m.from ? "now" : "ahead"; return html`<button type="button" class="tile ${st}" data-t="${m.from}"><span class="st ${st}">${st === "past" ? "Look back" : st === "now" ? "You are here" : "Opens " + untilText(today, Date.parse(m.from))}</span><span class="disp" style="font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1;margin-top:6px">Age ${m.age}</span><span class="disp" style="font-size:20px;font-weight:600">${m.name}</span><span class="muted" style="font-size:14px">${m.from === m.to ? fmtMonYr(Date.parse(m.from)) : `${fmtMonYr(Date.parse(m.from))} to ${fmtMonYr(Date.parse(m.to))}`}</span></button>`; })}
  </div>
  <p class="carry">${r.carry}</p>
</section>

<section id="c9" class="ch rv noprint">
  <span class="kicker">Chapter nine</span><h2>Ask about your reading</h2>
  <p class="body">Five follow-up questions are included, answered from your chart and the dates above.</p>
  <div class="card" style="display:flex;flex-direction:column;gap:18px">
    <div id="askList" style="display:flex;flex-direction:column;gap:16px">${opts.asks.map((a) => html`<div class="ans"><b>${a.q}</b><span style="color:#CFC8BA;line-height:1.6">${a.a}</span></div>`)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${[w.hits[0] ? `What should I do before ${fmtMonYr(Date.parse(w.hits[0]))}?` : "", cy.turn ? `Why does ${fmtMonYr(Date.parse(cy.turn.date))} matter?` : "", "How do I use the retrograde months?"].filter(Boolean).map((q) => html`<button type="button" class="chip askq" style="background:none;cursor:pointer;font-family:inherit">${q}</button>`)}</div>
    <form id="askForm" style="display:flex;gap:10px;flex-wrap:wrap"><label for="askq" style="position:absolute;left:-9999px">Your question</label><input id="askq" class="inp" type="text" maxlength="300" placeholder="Ask anything about your return"><button id="askBtn" type="submit" class="solid" ${opts.askLeft <= 0 ? "disabled" : ""}>Ask</button></form>
    <p id="askErr" role="alert" class="swap" style="margin:0;font-size:15px;color:#F2B544;display:none"></p>
    <span class="muted" style="font-size:14px"><span id="askLeft">${opts.askLeft}</span> questions left</span>
  </div>
</section>

<p class="muted" style="margin:-60px 0 60px;font-size:14px">Tropical zodiac${c.house ? `, ${c.houseSystem === "whole" ? "whole-sign" : "Placidus"} houses` : ""}. Dates are UTC and exact to the day. Your reading stays at this link.</p>

${opts.bumpGift ? html`<section id="gift" class="ch rv noprint" style="padding-bottom:80px">
  <div class="card" style="display:flex;flex-direction:column;gap:12px;border:1px solid rgba(242,181,68,.35)">
    <span class="kicker">The reading you added for someone else</span>
    ${opts.bumpGift.used ? html`<h3>They've opened it.</h3><p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">Code ${opts.bumpGift.code} has been used. The reading is theirs now.</p>`
    : html`<h3>Their code is <span style="color:#F2B544">${opts.bumpGift.code}</span></h3>
    <p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">Send them the code or this link: <a href="${opts.siteUrl}/gift/${opts.bumpGift.code}" style="white-space:nowrap">${opts.siteUrl.replace(/^https?:\/\//, "")}/gift/${opts.bumpGift.code}</a>. They open it with their own birth details, with or without a birth time. One use, no expiry.</p>
    <div><a href="/gift/card/${opts.bumpGift.code}.png" download="rite-gift-card.png" class="ghost">Download a gift card</a></div>`}
  </div>
</section>` : ""}

${opts.yearAhead && (opts.yearAhead.bought.length || opts.yearAhead.offer) ? html`<section id="year" class="ch rv noprint" style="padding-bottom:80px">
  <div class="card" style="display:flex;flex-direction:column;gap:12px${opts.yearAhead.offer ? ";border:1px solid rgba(242,181,68,.35)" : ""}">
    <span class="kicker">Your year ahead</span>
    ${opts.yearAhead.bought.map((b) => html`<p style="margin:0;color:#CFC8BA;line-height:1.6"><a href="/r/${opts.token}/year/${b.year}">${b.label}</a>${b.ready ? "" : " (being written)"}</p>`)}
    ${opts.yearAhead.offer ? html`<h3>The next twelve months of Saturn against your chart.</h3>
    <p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">${opts.yearAhead.offer.label}, month by month: where Saturn is each month relative to your natal Saturn, every date that matters, and what each month is good for. From the birth details you already gave us. $${opts.yearAhead.offer.price}, once.</p>
    <div><a href="/r/${opts.token}/year" class="ghost">See what's in your year</a></div>` : ""}
  </div>
</section>` : ""}

<section id="season" class="ch rv noprint" style="padding-bottom:80px">
  ${!opts.subscribed && !seasonAvailable(w.windowStart, w.windowEnd, today) ? (today.getTime() >= Date.parse(w.windowEnd) ? "" : html`<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="kicker">Saturn Season</span><h3>A weekly note, once your window opens.</h3><p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">Your window opens ${fmtMonYrL(Date.parse(w.windowStart))}. Saturn Season is a short note every Monday through the window itself, so there's nothing to send yet. It becomes available here two months before it opens.</p></div>`)
  : opts.subscribed ? html`<div class="card" style="display:flex;flex-direction:column;gap:10px"><span class="kicker">Saturn Season</span><h3>Your weekly note is on.</h3><p style="margin:0;color:#CFC8BA;line-height:1.6">Every Monday morning until your window closes, then it stops itself. <a href="/season/manage/${opts.token}">Manage it</a>: change plan or stop it any time.</p></div>`
  : html`<div class="card" style="display:flex;flex-direction:column;gap:14px;border:1px solid rgba(242,181,68,.35)">
    <span class="kicker">Saturn Season</span>
    <h3>A weekly note through your window.</h3>
    <p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">Every Monday: where Saturn is this week relative to your chart, whether it's applying or separating, and one thing to do. It stops itself when your window closes.</p>
    <form method="post" action="/season/${opts.token}" style="display:flex;gap:12px;flex-wrap:wrap;align-items:center"><button type="submit" name="plan" value="month" class="solid">$7 a month</button>${yearlyAllowed(w.windowEnd, today) ? html`<button type="submit" name="plan" value="year" class="ghost">$59 for the year</button>` : ""}<span class="muted" style="font-size:14px">Cancel any time. It stops itself when your window closes${yearlyAllowed(w.windowEnd, today) ? ", and a yearly plan refunds the unused months then" : ""}.</span></form>
  </div>`}
</section>

<section id="story" class="ch rv noprint" style="padding-bottom:80px">
  <div class="card" style="display:flex;flex-direction:column;gap:16px">
    <span class="kicker">Optional</span>
    <h3>Tell us how your return is going.</h3>
    <p style="margin:0;color:#CFC8BA;line-height:1.6;max-width:620px">What's changed, what you're deciding, what the dates lined up with. A person reads every one. Nothing is published unless you tick the box.</p>
    <form id="storyForm" style="display:flex;flex-direction:column;gap:14px">
      <label for="storyText" style="position:absolute;left:-9999px">Your story</label>
      <textarea id="storyText" class="ta" maxlength="2000" rows="5" placeholder="A few lines is plenty" required></textarea>
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;gap:10px;align-items:center;font-size:15px;color:#CFC8BA;cursor:pointer;min-height:44px"><input id="storyQuote" type="checkbox" style="width:20px;height:20px;accent-color:#F2B544;margin:0"> Rite can quote this, first name only</label>
        <span class="muted" style="font-size:13px"><span id="storyCount">0</span> / 2,000</span>
      </div>
      <div><button id="storyBtn" type="submit" class="solid">Send it</button></div>
    </form>
    <p id="storyMsg" role="status" class="swap" style="margin:0;font-size:16px;line-height:1.6;display:none"></p>
  </div>
</section>
</main>
</div>`;

  const script = `
(function(){
var TOK=${JSON.stringify(opts.token)};var $=function(s){return document.querySelector(s)};function T(n,p){try{window.rite&&window.rite.track(n,p)}catch(e){}}var Cw=${Cw.toFixed(3)};
document.querySelectorAll('a[href$="calendar.ics"]').forEach(function(a){a.addEventListener('click',function(){T('calendar')})});document.querySelectorAll('form[action^="/season/"]').forEach(function(f){f.addEventListener('submit',function(){T('season_click')})});
// month tabs
document.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});document.querySelectorAll('.mrow').forEach(function(r){r.style.display=r.dataset.y===b.dataset.y?'':'none'})})});
// localStorage for textareas
document.querySelectorAll('textarea[data-store]').forEach(function(t){var k='rite:'+TOK+':'+t.dataset.store;try{t.value=localStorage.getItem(k)||''}catch(e){}t.addEventListener('input',function(){try{localStorage.setItem(k,t.value)}catch(e){}count()})});
function count(){['approach','contact','integration'].forEach(function(g){var n=0;document.querySelectorAll('textarea[data-group="'+g+'"]').forEach(function(t){if(t.value.trim())n++});var el=document.querySelector('[data-count="'+g+'"]');if(el)el.textContent=n})}count();
// stage scrub
var SEG=[[345,30],[15,65],[80,20],[100,70],[170,20],[190,70],[260,20],[280,65]];var timer=null;
function setStage(t,label){clearTimeout(timer);timer=setTimeout(function(){fetch('/r/'+TOK+'/stage?t='+encodeURIComponent(t)).then(function(r){return r.ok?r.json():null}).then(function(s){if(!s)return;
 $('#wsat').style.transform='rotate('+s.wa.toFixed(1)+'deg)';$('#warc').style.strokeDasharray=(s.wa/360*Cw).toFixed(1)+' 2000';var sg=SEG[s.idx];$('#wseg').style.strokeDasharray=(sg[1]/360*Cw).toFixed(1)+' 2000';$('#wseg').style.transform='rotate('+(sg[0]-90).toFixed(1)+'deg)';
 document.querySelectorAll('.wl').forEach(function(l){l.setAttribute('fill',+l.dataset.i===s.idx?'#F2B544':'#8A857B')});$('#ageNow').textContent=s.age;
 $('#stKicker').textContent=(s.isToday?'Right now':'On '+s.when)+', age '+s.age;$('#stName').textContent=s.name;$('#stTheme').textContent=s.theme;$('#stSky').textContent=s.sky;$('#stFocus').textContent=s.focus;$('#stRelease').textContent=s.release;$('#stQ').textContent=s.question;$('#stNext').textContent=s.next;$('#dateLabel').textContent='Showing '+s.when+(s.isToday?', today':'');$('#scrub').setAttribute('aria-valuetext',s.when);
 var c=$('#stageCard');c.classList.remove('swap');void c.offsetWidth;c.classList.add('swap');
 if(s.slider!=null)$('#scrub').value=s.slider;document.querySelectorAll('#jumps .qchip').forEach(function(q){q.classList.toggle('on',q.dataset.t===label);q.setAttribute('aria-pressed',q.dataset.t===label)})}).catch(function(){})},120)}
$('#scrub').addEventListener('input',function(e){var v=+e.target.value;setStage((2025+Math.floor(v/12))+'-'+String(v%12+1).padStart(2,'0')+'-15','')});
document.querySelectorAll('#jumps .qchip,.tile').forEach(function(b){b.addEventListener('click',function(){setStage(b.dataset.t,b.dataset.t);if(b.classList.contains('tile'))document.getElementById('c0').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})});
setStage('today','today');
// narration: chapters 0..8 play back to back; each MP3 is generated on first request and cached
var CH=9,cur=0,au=new Audio(),playing=false,ready=false,durs=[];
var btn=$('#playBtn'),ico=$('#playIco'),eqEl=$('#playEq'),bar=$('#playBar'),meta=$('#playMeta');
function src(i){return '/r/'+TOK+'/audio/'+i+'.mp3?v=${NARRATION_VERSION}'}
function setUI(){ico.style.display=playing?'none':'';eqEl.style.display=playing?'flex':'none';btn.setAttribute('aria-label',playing?'Pause narration':'Play narration')}
function load(i,play){cur=i;au.src=src(i);meta.textContent='Chapter '+i+' of 8'+(i===0?', preparing':'');if(play){au.play().catch(function(){playing=false;setUI()})}if(i+1<CH){fetch(src(i+1)).catch(function(){})}}
au.addEventListener('playing',function(){playing=true;setUI();meta.textContent='Chapter '+cur+' of 8'});
au.addEventListener('pause',function(){playing=false;setUI()});
au.addEventListener('timeupdate',function(){if(au.duration){bar.style.width=((cur+au.currentTime/au.duration)/CH*100).toFixed(1)+'%'}});
au.addEventListener('ended',function(){if(cur+1<CH)load(cur+1,true);else{playing=false;setUI();bar.style.width='100%';meta.textContent='Finished'}});
au.addEventListener('error',function(){playing=false;setUI();meta.textContent='Narration unavailable right now; try again in a moment.'});
btn.addEventListener('click',function(){if(playing){au.pause();return}if(!ready){T('play');ready=true;meta.textContent='Preparing the first chapter\u2026';load(0,true)}else{au.play()}});
// share your story (opt-in; quoting only with the box ticked)
var sf=$('#storyForm'),st=$('#storyText');st.addEventListener('input',function(){$('#storyCount').textContent=st.value.length});
sf.addEventListener('submit',function(e){e.preventDefault();var t=st.value.trim();if(!t)return;var q=$('#storyQuote').checked,b=$('#storyBtn'),m=$('#storyMsg');T('story_submit',{can_quote:q,len:t.length});b.disabled=true;b.textContent='Sending\u2026';
 fetch('/r/'+TOK+'/story',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:t,can_quote:q})}).then(function(r){return r.json()}).then(function(d){m.style.display='';if(d.error){b.disabled=false;b.textContent='Send it';m.style.color='#E08A7A';m.textContent=d.error;return}
 sf.style.display='none';m.style.color='#F2B544';m.textContent=q?'Thank you. We read every one, and if we quote you it will be your first name only.':'Thank you. We read every one; this stays between us.'}).catch(function(){b.disabled=false;b.textContent='Send it';m.style.display='';m.style.color='#E08A7A';m.textContent="Couldn't reach the server. Check your connection and try again."})});
// ask
document.querySelectorAll('.askq').forEach(function(b){b.addEventListener('click',function(){$('#askq').value=b.textContent;$('#askq').focus()})});
$('#askForm').addEventListener('submit',function(e){e.preventDefault();var q=$('#askq').value.trim();if(!q)return;T('ask_submit');var btn=$('#askBtn');btn.disabled=true;btn.textContent='Thinking\\u2026';
 fetch('/r/'+TOK+'/ask',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({q:q})}).then(function(r){return r.json()}).then(function(d){btn.textContent='Ask';var er=$('#askErr');if(d.error){btn.disabled=d.left<=0;er.textContent=d.error;er.style.display='';return}er.style.display='none';
 var el=document.createElement('div');el.className='ans swap';el.innerHTML='<b></b><span style="color:#CFC8BA;line-height:1.6"></span>';el.querySelector('b').textContent=q;el.querySelector('span').textContent=d.a;$('#askList').appendChild(el);$('#askq').value='';$('#askLeft').textContent=d.left;btn.disabled=d.left<=0}).catch(function(){btn.textContent='Ask';btn.disabled=false;var er=$('#askErr');er.textContent="Couldn't reach the server. Check your connection and try again.";er.style.display=''})});
})();`;

  return shell({ title: `Your Saturn return · Rite`, body, extraCss: CSS, script, nav, description: r.cover_line, banner: opts.banner });

}
