// Birth-month search pages (docs/automation-builds.md build 7):
//   /saturn-return/born            index: who is in a return now or soon, and every birth year 1940–2005
//   /saturn-return/born/1997       one birth year, month by month
//   /saturn-return/born/1997-03    one birth month: Saturn's sign and degrees, every return, exact passes for three sample days
// Every date and degree comes from src/born.ts (the engine); the sign paragraph from content/signs.ts. Relative wording
// ("open now", "in 3 months", "passed") is worked out from `today`, which the route passes at request time, and every
// such sentence carries the "as of" date. No client JavaScript: the pages are plain HTML.
import { html, raw } from "hono/html";
import { shell, ARROW } from "./theme";
import { CSS as SIGN_CSS } from "./sign";
import { SIGN_PAGES } from "../content/signs";
import { fmtDay, fmtMonth } from "../compute";
import { untilText } from "../astro/cycle";
import { type Sign } from "../astro/saturn";
import {
  MONTHS, BORN_FROM, BORN_TO, noonUtc, isoDay, currentReturn, phaseOf, splitHits, monthReturnNumber, spanState,
  type MonthFacts, type BornSample, type BornReturn, type MonthSummary, type ReturnSpan, type SpanState,
} from "../born";

const ORD = ["first", "second", "third"] as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const YEAR_MS = 365.2422 * 86400000;
const ageAt = (birth: string, d: string) => Math.floor((Date.parse(d) - noonUtc(birth).getTime()) / YEAR_MS);
const deg = (a: number, b: number) => (Math.floor(a) === Math.floor(b) ? `${Math.floor(a)}°` : `${Math.floor(a)}° to ${Math.floor(b)}°`);
const pad = (n: number) => String(n).padStart(2, "0");
const ymOf = (y: number, m: number) => `${y}-${pad(m)}`;
const monthName = (ym: string) => `${MONTHS[parseInt(ym.slice(5, 7), 10) - 1]} ${ym.slice(0, 4)}`;
const shortDay = (iso: string) => fmtDay(iso).replace(/ \d{4}$/, ""); // "20 Mar"
/** "a, b and c" */
const and = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const hitWord = (n: number) => (n === 1 ? "one exact pass" : n === 3 ? "three exact passes" : `${n} exact passes`);

export const bornPath = (ym?: string) => (ym ? `/saturn-return/born/${ym}` : "/saturn-return/born");
/** The free preview, with the month filled in and the search ref for attribution. */
export const previewHref = (ym: string) => `/start?d=${ym}-01&r=seo`;

const CSS = SIGN_CSS + `
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px}
.days{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.days .card{display:flex;flex-direction:column;gap:12px}
.hits{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
.hits li{display:flex;justify-content:space-between;gap:12px;font-size:17px;border-bottom:1px solid rgba(237,230,214,.08);padding-bottom:6px}
.hits .past{color:#A7A196}.hits .ahead{color:#F2B544;font-weight:600}
.tag{font-size:13px;letter-spacing:.02em;color:#A7A196;white-space:nowrap}
.rets{display:flex;flex-direction:column;gap:14px;max-width:820px}
.rets .card{display:flex;flex-direction:column;gap:8px}
.rets h3,.qa h3{margin:0;font-family:'Bricolage Grotesque',serif;font-size:24px;line-height:1.15;letter-spacing:-.01em;font-weight:700}
.rets p,.qa p{margin:0;font-size:17px;line-height:1.6;color:#CFC8BA}
.qa{display:flex;flex-direction:column;gap:22px;max-width:820px}
.qa>div{display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(237,230,214,.14);padding-top:20px}
.crumbs{font-size:15px;color:#A7A196;display:flex;flex-wrap:wrap;gap:6px}.crumbs a{color:#BDB6A8}
.nb{display:flex;flex-wrap:wrap;gap:10px}
.tbl{width:100%;border-collapse:collapse;font-size:16px}
.tbl th{text-align:left;font-weight:500;color:#A7A196;font-size:14px;padding:0 12px 10px 0}
.tbl td{padding:14px 12px 14px 0;border-top:1px solid rgba(237,230,214,.1);vertical-align:top;line-height:1.45}
.tbl td a{font-weight:600}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.chipl{display:inline-block;font-size:13px;padding:2px 10px;border-radius:999px;border:1px solid rgba(237,230,214,.18);color:#CFC8BA;white-space:nowrap}
.chipl.open{border-color:#F2B544;color:#F2B544}
.yrs{display:flex;flex-wrap:wrap;gap:8px}
.yrs a{min-width:72px;justify-content:center}
.grp{display:flex;flex-direction:column;gap:12px;max-width:900px}
.grp .card{display:flex;flex-direction:column;gap:6px}
`;

const NAV = html`<nav class="main"><a href="/">Saturn return calculator</a><a href="${bornPath()}">By birth year</a></nav>`;
const ldScript = (o: unknown) => html`<script type="application/ld+json">${raw(JSON.stringify(o).replace(/</g, "\\u003c"))}</script>`;
const faqLd = (faq: Array<[string, string]>) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

// ---------- shared wording ----------

/** One plain sentence on where a sample birth day stands in one return, as of today. `who` is "you" or "they". */
export function statusSentence(s: BornSample, r: BornReturn, today: Date, who: "you" | "they" = "you"): string {
  const ord = ORD[r.returnNumber - 1], ph = phaseOf(s, r, today), { past, ahead } = splitHits(r, today), n = r.hits.length;
  const yours = who === "you" ? "your" : "the";
  if (ph === "not_yet") return `${cap(yours)} ${ord} return window opens ${fmtMonth(r.windowStart)}, ${untilText(today, Date.parse(r.windowStart))}, and the first exact pass is ${fmtDay(r.hits[0])}.`;
  if (ph === "complete") return `${cap(yours)} ${ord} return window ran ${fmtMonth(r.windowStart)} to ${fmtMonth(r.windowEnd)}; it's over.`;
  let t = `${cap(yours)} ${ord} return window is open: it opened ${fmtMonth(r.windowStart)} and closes ${fmtMonth(r.windowEnd)}.`;
  if (!past.length) t += ` The first exact pass is ${fmtDay(ahead[0])}, ${untilText(today, Date.parse(ahead[0]))}.`;
  else if (ahead.length) t += ` Exact passes so far: ${past.length} of ${n}. The next is ${fmtDay(ahead[0])}, ${untilText(today, Date.parse(ahead[0]))}.`;
  else t += n === 1 ? ` The exact pass was ${fmtDay(past[0])}.` : ` All ${n} exact passes have happened; the last was ${fmtDay(past[n - 1])}.`;
  if (ph === "peak") t += " Saturn is within a degree of exact right now.";
  return t;
}
const lowerFirst = (t: string) => t[0].toLowerCase() + t.slice(1);
const range = (xs: string[]) => { const a = [...xs].sort(); return a[0] === a[a.length - 1] ? `on ${fmtDay(a[0])}` : `between ${fmtDay(a[0])} and ${fmtDay(a[a.length - 1])}`; };
/** One sentence for the whole birth month, as of today, when its sample days share a return and phase; null when they don't. */
export function cohortStatus(f: MonthFacts, today: Date, who: "you" | "they"): string | null {
  const rs = f.samples.map((s) => ({ s, r: currentReturn(s, today) }));
  const ph = rs.map(({ s, r }) => { const p = phaseOf(s, r, today); return p === "peak" || p === "separating" ? "in_window" : p; });
  if (new Set(rs.map((x) => x.r.returnNumber)).size > 1 || new Set(ph).size > 1 || new Set(rs.map((x) => x.s.sign)).size > 1) return null;
  const r0 = rs[1].r, ord = ORD[r0.returnNumber - 1], yours = who === "you" ? "your" : "the";
  const ws = [...new Set(rs.map((x) => x.r.windowStart))].sort(), we = [...new Set(rs.map((x) => x.r.windowEnd))].sort();
  const win = `${fmtMonth(ws[0])} to ${fmtMonth(we[we.length - 1])}`;
  const day = who === "you" ? "depending on your day" : "depending on the day";
  if (ph[0] === "not_yet") return `${cap(yours)} ${ord} return window opens ${fmtMonth(ws[0])}, ${untilText(today, Date.parse(ws[0]))}, and the first exact pass falls ${range(rs.map((x) => x.r.hits[0]))}, ${day}.`;
  if (ph[0] === "complete") return `${cap(yours)} ${ord} return is over: the window ran ${win}.`;
  const past = rs.map(({ r }) => splitHits(r, today));
  let t = `${cap(yours)} ${ord} return window is open, ${win}.`;
  if (past.every((p) => !p.past.length)) t += ` The first exact pass falls ${range(rs.map((x) => x.r.hits[0]))}, ${day}.`;
  else if (past.every((p) => !p.ahead.length)) t += ` Every exact pass has happened; the last fell ${range(rs.map((x) => x.r.hits[x.r.hits.length - 1]))}, ${day}.`;
  else t += ` Some exact passes have happened and some are ahead, ${day}.`;
  return t;
}

/** The sample day standing for a sign span: the one nearest mid-month. */
function repSample(f: MonthFacts, sign: Sign): BornSample {
  const ss = f.samples.filter((s) => s.sign === sign);
  return ss.reduce((a, b) => (Math.abs(+b.date.slice(8) - 15) < Math.abs(+a.date.slice(8) - 15) ? b : a));
}
/** The returns worth listing for a day: the first two always, the third once the second is over (or current). */
function shownReturns(s: BornSample, today: Date): BornReturn[] {
  const cur = currentReturn(s, today), t = isoDay(today);
  return s.returns.filter((r) => r.returnNumber <= 2 || cur.returnNumber === 3 || (s.returns[1] && t > s.returns[1].windowEnd));
}
const nextAfter = (s: BornSample, r: BornReturn) => s.returns.find((x) => x.returnNumber === r.returnNumber + 1) ?? null;
const hitsText = (r: BornReturn) => and(r.hits.map(fmtDay));

// ---------- /saturn-return/born/1997-03 ----------

export function monthFaq(f: MonthFacts, today: Date): Array<[string, string]> {
  const name = monthName(f.ym), asOf = fmtDay(isoDay(today));
  const mid = f.samples[1], cur = currentReturn(mid, today), ord = ORD[cur.returnNumber - 1];
  const split = f.spans.length > 1;
  const signLine = split
    ? `Saturn changed sign during ${name}: it was in ${f.spans[0].sign} until ${fmtDay(f.spans[0].to)} and in ${f.spans[1].sign} from ${fmtDay(f.spans[1].from)}, so your return falls in whichever sign it was in on your day.`
    : `Saturn was at ${deg(f.spans[0].degMin, f.spans[0].degMax)} ${f.spans[0].sign} through ${name}, so your ${ord} Saturn return is Saturn's stretch back through ${f.spans[0].sign}, ${fmtMonth(cur.windowStart)} to ${fmtMonth(cur.windowEnd)}.`;
  const prev = mid.returns.filter((r) => r.returnNumber < cur.returnNumber);
  const prevLine = prev.length && !split ? ` ${prev.map((r) => `Your ${ORD[r.returnNumber - 1]} return ran ${fmtMonth(r.windowStart)} to ${fmtMonth(r.windowEnd)}.`).join(" ")}` : "";
  const byDay = f.samples.map((s) => { const r = currentReturn(s, today); return `born ${fmtDay(s.date)}: ${hitsText(r)}`; });
  const q1: [string, string] = [`When is my Saturn return if I was born in ${name}?`, `${signLine}${prevLine} The exact passes depend on your day. ${cap(byDay.join("; "))}. Enter your birth date in the free preview for yours.`];
  const co = cohortStatus(f, today, "they");
  const q2: [string, string] = [`Is it happening now for people born in ${name}?`, co
    ? `As of ${asOf}, ${lowerFirst(co)}`
    : `As of ${asOf} it depends on the day. ${f.samples.map((s) => `Born ${fmtDay(s.date)}: ${lowerFirst(statusSentence(s, currentReturn(s, today), today, "they"))}`).join(" ")}`];
  const counts = [...new Set(f.samples.map((s) => currentReturn(s, today).hits.length))];
  const q3: [string, string] = counts.length > 1
    ? [`Why do some people born in ${name} get one exact pass and others three?`, `Each year Saturn appears to stop, back up for a few months and move forward again. If your birth degree sits inside one of those loops, Saturn crosses it three times; otherwise once. Across ${name} the birth degree moves past the edge of a loop, so ${and(f.samples.map((s) => `${fmtDay(s.date)} gets ${hitWord(currentReturn(s, today).hits.length)}`))}.`]
    : [`How many exact passes do people born in ${name} get?`, `${cap(hitWord(counts[0]))} in the ${ord} return, for each of the sample days on this page. ${counts[0] === 3 ? "Saturn crosses the birth degree forward, backs over it while retrograde, and crosses forward again." : "Saturn crosses the birth degree once, without a retrograde loop over it."} Days in between can differ slightly, so check yours.`];
  const moved = f.spans.reduce((a, s) => a + (s.degMax - s.degMin), 0);
  const q4: [string, string] = split
    ? ["Do I need my birth time?", `Only if you were born on ${fmtDay(f.spans[1].from)} or the day before: Saturn changed sign around then, and your birth time and place decide which side you fall on. Otherwise your dates hold without one; noon is used here.`]
    : ["Do I need my birth time?", `No. Saturn moved ${moved < 1 ? "less than a degree" : `about ${Math.round(moved)}°`} across the whole of ${name}, so your day matters far more than your hour. Noon is used on this page; the free preview takes a time if you have one.`];
  const nx = nextAfter(mid, cur);
  const q5: [string, string] | null = nx ? [`When is the ${ORD[nx.returnNumber - 1]} Saturn return for people born in ${name}?`, `Saturn is back in ${mid.sign} from ${fmtMonth(nx.windowStart)} to ${fmtMonth(nx.windowEnd)}, around age ${ageAt(mid.date, nx.hits[0])}. For someone born ${fmtDay(mid.date)} the exact ${nx.hits.length === 1 ? "pass is" : "passes are"} ${hitsText(nx)}.`] : null;
  return [q1, q2, q3, q4, ...(q5 ? [q5] : [])];
}

/** Title and meta description: absolute dates only, so a cached search snippet never goes stale. */
export function monthMeta(f: MonthFacts, today: Date) {
  const name = monthName(f.ym);
  const title = `Born ${name}? Saturn return dates and exact passes · Rite`;
  let description: string;
  if (f.spans.length > 1) {
    description = `Born ${name}: Saturn was in ${f.spans[0].sign}, then ${f.spans[1].sign} from ${shortDay(f.spans[1].from)}. Saturn return windows and exact passes for each. Find your day free.`;
  } else {
    const mid = f.samples[1], r = currentReturn(mid, today), sp = f.spans[0];
    const first = f.samples.map((s) => currentReturn(s, today).hits[0]).sort()[0];
    const last = f.samples.map((s) => { const x = currentReturn(s, today); return x.hits[x.hits.length - 1]; }).sort().pop()!;
    const passes = first.slice(0, 7) === last.slice(0, 7) ? fmtMonth(first) : `${fmtMonth(first)} to ${fmtMonth(last)}`;
    description = `Born ${name}: Saturn at ${deg(sp.degMin, sp.degMax)} ${sp.sign}. ${cap(ORD[r.returnNumber - 1])} return ${fmtMonth(r.windowStart)} to ${fmtMonth(r.windowEnd)}, exact passes ${passes}. Find your day free.`;
    if (description.length > 155) description = description.replace(/ Find your day free\.$/, "");
  }
  return { title, description };
}

function dayCard(s: BornSample, r: BornReturn, today: Date) {
  const t = isoDay(today);
  return html`<div class="card">
    <span class="muted" style="font-size:14px">Born ${fmtDay(s.date)}, noon</span>
    <span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">Saturn at ${Math.floor(s.degree)}° ${s.sign}</span>
    <span class="muted" style="font-size:15px">${cap(ORD[r.returnNumber - 1])} return window ${fmtMonth(r.windowStart)} to ${fmtMonth(r.windowEnd)}</span>
    <ul class="hits">${r.hits.map((h) => html`<li><span class="${h <= t ? "past" : "ahead"}">${fmtDay(h)}</span><span class="tag">${h < t ? "passed" : h === t ? "today" : "ahead"}</span></li>`)}</ul>
    ${r.turn ? html`<span style="font-size:15px;color:#BDB6A8">Closest turn: Saturn stands still ${r.turn.orb}° from this degree on ${fmtDay(r.turn.date)}${r.turn.date < t ? " (passed)" : ""}.</span>` : ""}
    <span style="font-size:16px;line-height:1.5;color:#CFC8BA">${statusSentence(s, r, today, "they")}</span>
  </div>`;
}

export function monthPage(opts: { siteUrl: string; f: MonthFacts; today: Date }) {
  const { f, today } = opts; const name = monthName(f.ym), asOf = fmtDay(isoDay(today));
  const split = f.spans.length > 1;
  const mid = f.samples[1], cur = currentReturn(mid, today), ord = ORD[cur.returnNumber - 1];
  const co = cohortStatus(f, today, "you");
  const faq = monthFaq(f, today);
  const { title, description } = monthMeta(f, today);
  const prevYm = f.month === 1 ? ymOf(f.year - 1, 12) : ymOf(f.year, f.month - 1);
  const nextYm = f.month === 12 ? ymOf(f.year + 1, 1) : ymOf(f.year, f.month + 1);
  const hasPrev = +prevYm.slice(0, 4) >= BORN_FROM, hasNext = +nextYm.slice(0, 4) <= BORN_TO;
  const opener = split
    ? `Saturn changed sign during ${name}. Born ${shortDay(f.spans[0].from)} to ${fmtDay(f.spans[0].to)}, it was at ${deg(f.spans[0].degMin, f.spans[0].degMax)} ${f.spans[0].sign}; born ${shortDay(f.spans[1].from)} to ${fmtDay(f.spans[1].to)}, at ${deg(f.spans[1].degMin, f.spans[1].degMax)} ${f.spans[1].sign}. Your return is in that sign, about 29 and a half years on.`
    : `Saturn was at ${deg(f.spans[0].degMin, f.spans[0].degMax)} ${f.spans[0].sign} all through ${name}. Your ${ord} Saturn return is its stretch back through ${f.spans[0].sign}: ${fmtMonth(cur.windowStart)} to ${fmtMonth(cur.windowEnd)}.`;
  const lede = co
    ? `As of ${asOf}, ${lowerFirst(co)}`
    : `As of ${asOf}, where you are depends on your day of birth. The three days below show the spread.`;
  const signs = f.spans.map((s) => s.sign);
  const body = html`
<section class="wrap" style="padding-top:28px;padding-bottom:56px;display:flex;flex-direction:column;gap:26px">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Rite</a><span>/</span><a href="${bornPath()}">Saturn return by birth year</a><span>/</span><a href="${bornPath(String(f.year))}">${f.year}</a><span>/</span><span aria-current="page">${MONTHS[f.month - 1]}</span></nav>
  <h1 class="disp" style="margin:0;font-size:clamp(52px,8vw,128px);line-height:.88;letter-spacing:-.05em;font-weight:800">Born ${name}<br><span style="color:#F2B544">Saturn return dates</span></h1>
  <p class="disp" style="margin:0;max-width:760px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">${opener}</p>
  <p style="margin:0;max-width:700px;font-size:20px;line-height:1.6;color:#BDB6A8">${lede}</p>
  <div style="display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center"><a href="${previewHref(f.ym)}" class="cta">Get the dates for your day ${raw(ARROW)}</a><span style="font-size:14px;color:#A7A196">Free. Your birth date and place, ten seconds.</span></div>
</section>
<section class="wrap" style="padding-bottom:28px">
  <div class="facts">
    ${f.spans.map((s) => html`<div class="fact"><span class="muted" style="font-size:14px">Saturn ${split ? `for births ${shortDay(s.from)} to ${shortDay(s.to)}` : `through ${MONTHS[f.month - 1]}`}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${deg(s.degMin, s.degMax)} ${s.sign}</span></div>`)}
    ${split ? "" : html`<div class="fact"><span class="muted" style="font-size:14px">${cap(ord)} return window</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${fmtMonth(cur.windowStart)} to ${fmtMonth(cur.windowEnd)}</span><span class="muted" style="font-size:14px">Saturn's stretch through ${f.spans[0].sign}</span></div>`}
    <div class="fact"><span class="muted" style="font-size:14px">Exact passes</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${(() => { const c = [...new Set(f.samples.map((s) => currentReturn(s, today).hits.length))].sort(); return c.length > 1 ? `${cap(and(c.map((k) => (k === 1 ? "one" : k === 3 ? "three" : String(k)))).replace(" and ", " or "))}, by day` : cap(hitWord(c[0])); })()}</span><span class="muted" style="font-size:14px">at age ${(() => { const a = f.samples.flatMap((s) => { const r = currentReturn(s, today); return [ageAt(s.date, r.hits[0]), ageAt(s.date, r.hits[r.hits.length - 1])]; }); const lo = Math.min(...a), hi = Math.max(...a); return lo === hi ? `${lo}` : `${lo} to ${hi}`; })()}</span></div>
  </div>
</section>
<section class="wrap" style="padding-top:40px;padding-bottom:28px;display:flex;flex-direction:column;gap:16px">
  <h2 class="disp" style="margin:0;font-size:clamp(30px,3.2vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Exact passes, by day of birth</h2>
  <p style="margin:0;max-width:720px;font-size:18px;line-height:1.6;color:#BDB6A8">The passes are the days Saturn crosses the exact degree it held when you were born. They shift across the month, so here are three days of ${name}, worked out at noon. Yours sit near the day closest to your own; the free preview gives them exactly. Status as of ${asOf}.</p>
  <div class="days">${f.samples.map((s) => dayCard(s, currentReturn(s, today), today))}</div>
</section>
<section class="wrap" style="padding-top:40px;padding-bottom:28px;display:flex;flex-direction:column;gap:16px">
  <h2 class="disp" style="margin:0;font-size:clamp(30px,3.2vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Every return for ${name}</h2>
  <div class="rets">${signs.map((sg) => { const s = repSample(f, sg); return shownReturns(s, today).map((r) => html`<div class="card">
    <h3>${cap(ORD[r.returnNumber - 1])} return${split ? `, born ${fmtDay(s.date)} (Saturn in ${sg})` : ""}</h3>
    <p>Saturn in ${s.sign}, ${fmtMonth(r.windowStart)} to ${fmtMonth(r.windowEnd)}. ${cap(hitWord(r.hits.length))} for ${fmtDay(s.date)}: ${hitsText(r)}, at age ${ageAt(s.date, r.hits[0])}${r.hits.length > 1 && ageAt(s.date, r.hits[r.hits.length - 1]) !== ageAt(s.date, r.hits[0]) ? ` to ${ageAt(s.date, r.hits[r.hits.length - 1])}` : ""}.</p>
    <p class="muted" style="font-size:15px">${statusSentence(s, r, today, "they")} (as of ${asOf})</p>
  </div>`); })}</div>
</section>
<article class="art wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:22px">
  ${signs.map((sg) => html`<h2>What Saturn in ${sg} asks</h2><p>${SIGN_PAGES[sg].about}</p><p>${SIGN_PAGES[sg].questions} <a href="/saturn-return/saturn-in/${sg.toLowerCase()}">Saturn return in ${sg}</a>.</p>`)}
  <p>Saturn describes the work, not the outcome. Nothing on this page predicts events; it dates the stretch and says what it tends to ask.</p>
  <div><a href="${previewHref(f.ym)}" class="cta">Find your exact passes ${raw(ARROW)}</a></div>
</article>
<section id="faq" class="wrap" style="padding-bottom:96px;display:flex;flex-direction:column;gap:22px">
  <h2 class="disp" style="margin:0;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Questions from people born in ${name}</h2>
  <div class="qa">${faq.map(([q, a]) => html`<div><h3>${q}</h3><p>${a}</p></div>`)}</div>
</section>
${ldScript(faqLd(faq))}
<section class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:16px">
  <h2 class="disp" style="margin:0;font-size:26px;font-weight:600">Nearby birth months</h2>
  <div class="nb">
    ${hasPrev ? html`<a class="sign" href="${bornPath(prevYm)}" rel="prev">${monthName(prevYm)}</a>` : ""}
    ${hasNext ? html`<a class="sign" href="${bornPath(nextYm)}" rel="next">${monthName(nextYm)}</a>` : ""}
    <a class="sign" href="${bornPath(String(f.year))}">All of ${f.year}</a>
    ${f.year - 1 >= BORN_FROM ? html`<a class="sign" href="${bornPath(ymOf(f.year - 1, f.month))}">${monthName(ymOf(f.year - 1, f.month))}</a>` : ""}
    ${f.year + 1 <= BORN_TO ? html`<a class="sign" href="${bornPath(ymOf(f.year + 1, f.month))}">${monthName(ymOf(f.year + 1, f.month))}</a>` : ""}
  </div>
  <p class="related" style="margin:0;font-size:17px;line-height:1.6;color:#A7A196">Related: <a href="/saturn-return/when">When is my Saturn return?</a> · <a href="/saturn-return/first-vs-second">First, second and third returns compared</a></p>
</section>`;
  return shell({ title, description, canonical: `${opts.siteUrl}${bornPath(f.ym)}`, og: `${opts.siteUrl}/og/${(split ? f.spans[0].sign : mid.sign).toLowerCase()}.png`, body, extraCss: CSS, nav: NAV });
}

// ---------- /saturn-return/born/1997 ----------

const STATE_LABEL = (st: SpanState, span: ReturnSpan, today: Date) =>
  st === "open" ? "Open now" : st === "closed" ? `Ran ${fmtMonth(span[0])} to ${fmtMonth(span[1])}` : `Opens ${untilText(today, Date.parse(span[0]))}`;

export function yearPage(opts: { siteUrl: string; year: number; months: MonthSummary[]; today: Date }) {
  const { year, months, today } = opts; const asOf = fmtDay(isoDay(today));
  const signs = [...new Set(months.flatMap((m) => m.spans.map((s) => s.sign)))];
  const title = `Saturn return for people born in ${year}, month by month · Rite`;
  const description = `Born in ${year}: Saturn was in ${and(signs)}. Saturn return windows and exact passes for every month of ${year}, from the ephemeris. Find your day free.`;
  const rows = months.map((m) => {
    const n = monthReturnNumber(m.ym, today);
    const cells = m.spans.flatMap((s) => { const span = s.r[String(n) as "1"]; return span ? [{ s, span, st: spanState(span, today) }] : []; });
    return { m, n, cells };
  });
  const body = html`
<section class="wrap" style="padding-top:28px;padding-bottom:48px;display:flex;flex-direction:column;gap:26px">
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Rite</a><span>/</span><a href="${bornPath()}">Saturn return by birth year</a><span>/</span><span aria-current="page">${year}</span></nav>
  <h1 class="disp" style="margin:0;font-size:clamp(52px,8vw,128px);line-height:.88;letter-spacing:-.05em;font-weight:800">Born in ${year}<br><span style="color:#F2B544">Saturn return dates</span></h1>
  <p class="disp" style="margin:0;max-width:760px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">Saturn was in ${and(signs)} during ${year}. Each month below has its own page with the exact passes for three days of that month.</p>
  <p style="margin:0;max-width:700px;font-size:18px;line-height:1.6;color:#BDB6A8">The return shown is the one each month is in or heading for as of ${asOf}. Exact passes are the range across the month; your own day sets yours.</p>
</section>
<section class="wrap" style="padding-bottom:80px">
  <div class="card scroll"><table class="tbl">
    <thead><tr><th scope="col">Born</th><th scope="col">Saturn</th><th scope="col">Return</th><th scope="col">Window</th><th scope="col">Exact passes</th><th scope="col">As of ${asOf}</th></tr></thead>
    <tbody>${rows.map(({ m, n, cells }) => html`<tr>
      <td><a href="${bornPath(m.ym)}">${MONTHS[parseInt(m.ym.slice(5), 10) - 1]}</a></td>
      <td>${cells.map((c, i) => html`${i ? html`<br>` : ""}${c.s.deg[0] === c.s.deg[1] ? `${c.s.deg[0]}°` : `${c.s.deg[0]}° to ${c.s.deg[1]}°`} ${c.s.sign}${cells.length > 1 ? html` <span class="muted">(from ${shortDay(c.s.from)})</span>` : ""}`)}</td>
      <td>${cap(ORD[n - 1])}</td>
      <td>${cells.map((c, i) => html`${i ? html`<br>` : ""}${fmtMonth(c.span[0])} to ${fmtMonth(c.span[1])}`)}</td>
      <td>${cells.map((c, i) => html`${i ? html`<br>` : ""}${c.span[2].slice(0, 7) === c.span[3].slice(0, 7) ? fmtMonth(c.span[2]) : `${fmtMonth(c.span[2])} to ${fmtMonth(c.span[3])}`}`)}</td>
      <td>${cells.map((c, i) => html`${i ? html`<br>` : ""}<span class="chipl ${c.st === "open" ? "open" : ""}">${STATE_LABEL(c.st, c.span, today)}</span>`)}</td>
    </tr>`)}</tbody>
  </table></div>
  <div style="margin-top:28px;display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center"><a href="/start?r=seo" class="cta">Get the dates for your day ${raw(ARROW)}</a><span style="font-size:14px;color:#A7A196">Free. No account, no email.</span></div>
</section>
<article class="art wrap" style="padding-bottom:64px;display:flex;flex-direction:column;gap:22px">
  <h2>Why one birth year has different dates</h2>
  <p>Saturn moves about 12° a year, so its position on the day you were born shifts month by month, and so do the days it comes back to that degree. Where a birth degree falls inside one of Saturn's yearly retrograde loops, there are three exact passes; elsewhere, one. Saturn describes the work, not the outcome: the dates say when, not what happens.</p>
</article>
<section class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:16px">
  <div class="nb">
    ${year - 1 >= BORN_FROM ? html`<a class="sign" href="${bornPath(String(year - 1))}" rel="prev">Born ${year - 1}</a>` : ""}
    ${year + 1 <= BORN_TO ? html`<a class="sign" href="${bornPath(String(year + 1))}" rel="next">Born ${year + 1}</a>` : ""}
    <a class="sign" href="${bornPath()}">All birth years</a>
    ${signs.map((s) => html`<a class="sign" href="/saturn-return/saturn-in/${s.toLowerCase()}">Saturn return in ${s}</a>`)}
  </div>
</section>`;
  return shell({ title, description, canonical: `${opts.siteUrl}${bornPath(String(year))}`, og: `${opts.siteUrl}/og.png`, body, extraCss: CSS, nav: NAV });
}

// ---------- /saturn-return/born ----------

export interface Group { n: 1 | 2 | 3; sign: Sign; st: SpanState; from: string; to: string; ws: string; we: string }
/** Consecutive birth months (sign spans) in the same return, sign and state, as of today. Only "open" and "opens_soon". */
export function activeGroups(all: MonthSummary[], today: Date): Group[] {
  const out: Group[] = [];
  for (const m of all) {
    const n = monthReturnNumber(m.ym, today);
    for (const s of m.spans) {
      const span = s.r[String(n) as "1"]; if (!span) continue;
      const st = spanState(span, today);
      if (st !== "open" && st !== "opens_soon") continue;
      const g = out[out.length - 1];
      if (g && g.n === n && g.sign === s.sign && g.st === st && g.to.slice(0, 7) >= monthBefore(m.ym)) { g.to = s.to; g.ws = g.ws < span[0] ? g.ws : span[0]; g.we = g.we > span[1] ? g.we : span[1]; }
      else out.push({ n, sign: s.sign, st, from: s.from, to: s.to, ws: span[0], we: span[1] });
    }
  }
  return out;
}
const monthBefore = (ym: string) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 1 ? ymOf(y - 1, 12) : ymOf(y, m - 1); };

export function indexPage(opts: { siteUrl: string; all: MonthSummary[]; today: Date }) {
  const { all, today } = opts; const asOf = fmtDay(isoDay(today));
  const groups = activeGroups(all, today);
  const open = groups.filter((g) => g.st === "open"), soon = groups.filter((g) => g.st === "opens_soon");
  const years: number[] = []; for (let y = BORN_FROM; y <= BORN_TO; y++) years.push(y);
  const decades = [...new Set(years.map((y) => Math.floor(y / 10) * 10))];
  const born = (g: Group) => `${fmtDay(g.from)} to ${fmtDay(g.to)}`;
  const card = (g: Group) => html`<div class="card"><span class="muted" style="font-size:14px">${cap(ORD[g.n - 1])} return · Saturn in ${g.sign}</span><span class="disp" style="font-size:24px;font-weight:700;line-height:1.2">Born ${born(g)}</span><span style="font-size:16px;color:#CFC8BA">Window ${fmtMonth(g.ws)} to ${fmtMonth(g.we)}${g.st === "opens_soon" ? `, opening ${untilText(today, Date.parse(g.ws))}` : ""}. <a href="${bornPath(g.from.slice(0, 7))}">${monthName(g.from.slice(0, 7))}</a>${g.from.slice(0, 7) !== g.to.slice(0, 7) ? html` to <a href="${bornPath(g.to.slice(0, 7))}">${monthName(g.to.slice(0, 7))}</a>` : ""}</span></div>`;
  const body = html`
<section class="wrap" style="padding-top:40px;padding-bottom:56px;display:flex;flex-direction:column;gap:26px">
  <h1 class="disp" style="margin:0;font-size:clamp(52px,8vw,128px);line-height:.88;letter-spacing:-.05em;font-weight:800">Saturn return<br><span style="color:#F2B544">by birth year</span></h1>
  <p class="disp" style="margin:0;max-width:760px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">Every birth month from ${BORN_FROM} to ${BORN_TO}, with Saturn's sign, the return windows and the exact passes, worked out from the ephemeris.</p>
  <p style="margin:0;max-width:700px;font-size:18px;line-height:1.6;color:#BDB6A8">Birth ranges below run to the day (noon UTC); right at a boundary, your birth time and place decide. Status as of ${asOf}.</p>
</section>
<section class="wrap" style="padding-bottom:48px;display:flex;flex-direction:column;gap:16px">
  <h2 class="disp" style="margin:0;font-size:clamp(30px,3.2vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:700">In a return window now</h2>
  <div class="grp">${open.length ? open.map(card) : html`<p class="muted">No birth months in this range have a window open as of ${asOf}.</p>`}</div>
</section>
<section class="wrap" style="padding-bottom:64px;display:flex;flex-direction:column;gap:16px">
  <h2 class="disp" style="margin:0;font-size:clamp(30px,3.2vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Opening in the next five years</h2>
  <div class="grp">${soon.length ? soon.map(card) : html`<p class="muted">None as of ${asOf}.</p>`}</div>
</section>
<section class="wrap" style="padding-bottom:80px;display:flex;flex-direction:column;gap:22px">
  <h2 class="disp" style="margin:0;font-size:clamp(30px,3.2vw,44px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Every birth year</h2>
  ${decades.map((d) => html`<div style="display:flex;flex-direction:column;gap:10px"><span class="muted" style="font-size:14px">${d}s</span><div class="yrs">${years.filter((y) => Math.floor(y / 10) * 10 === d).map((y) => html`<a class="sign" href="${bornPath(String(y))}">${y}</a>`)}</div></div>`)}
  <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center"><a href="/start?r=seo" class="cta">Get the dates for your day ${raw(ARROW)}</a><span style="font-size:14px;color:#A7A196">Free. No account, no email.</span></div>
  <p class="related" style="margin:0;font-size:17px;line-height:1.6;color:#A7A196">Related: <a href="/saturn-return/when">When is my Saturn return?</a> · <a href="/saturn-return/first-vs-second">First, second and third returns compared</a></p>
</section>`;
  return shell({
    title: `Saturn return by birth year and month, ${BORN_FROM} to ${BORN_TO} · Rite`,
    description: `Saturn return dates for every birth month from ${BORN_FROM} to ${BORN_TO}: Saturn's sign, the return windows and the exact passes, and who is in theirs now.`,
    canonical: `${opts.siteUrl}${bornPath()}`, og: `${opts.siteUrl}/og.png`, body, extraCss: CSS, nav: NAV,
  });
}
