// Year-ahead reading (docs/automation-builds.md build 11): the next 12 months of Saturn against the chart. Pure: no D1,
// no Stripe, no model here, so every date is unit-testable.
//
// Scope, deliberately: the engine models one planet, Saturn, so this does too. Everything below comes from the same
// functions the main reading uses, so the two pages can never disagree about a date:
//   - exact passes of Saturn over the natal degree: compute().window.hits (scanReturn)
//   - Saturn's squares and opposition to its natal position: cycle().history / cycle().ahead (tensionPoints), the same
//     tension points the reading's "Your Saturn history" and "The long arc" chapters and the stage reminders use
//   - stations: stationsBetween (the reading's month table and closest turn)
//   - the window opening and closing: cycle().stageEvents
//   - sign changes: a daily scan with compute()'s convention (the sign Saturn is in at 00:00 UTC), so "Saturn enters
//     <natal sign>" lands on the same day as the reading's "your window opens"
//   - the month rows: Saturn's position on the 1st, the 15th and the last day, as the reading's month table (15th) does
// No other planets, no house transits, no new interpretation: the model only writes prose around these facts.
import { compute, cycle, fmtDay, type Birth, type Computed } from "./compute";
import { saturnLongitude, signOf, degreeInSign, orb, isRetrograde, type Sign } from "./astro/saturn";
import { stationsBetween, stageAt } from "./astro/cycle";

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The four Saturn-to-natal-Saturn points the engine computes: 0° (return), 90° (first square), 180°, 270° (closing square). */
export type Point = "return" | "square1" | "opposition" | "square2";
export const POINT_ANGLE: Record<Point, number> = { return: 0, square1: 90, opposition: 180, square2: 270 };
/** Names as the reading uses them (tensionPoints names and the history chapter's wording). */
export const POINT_NAME: Record<Point, string> = { return: "your natal Saturn", square1: "the first square to your natal Saturn", opposition: "the opposition to your natal Saturn", square2: "the closing square to your natal Saturn" };
export const POINT_SHORT: Record<Point, string> = { return: "Return", square1: "First test", opposition: "Full view", square2: "Letting go" };

export type YearEventKind = "pass" | "station" | "ingress" | "window";
export interface YearEvent {
  date: string;        // YYYY-MM-DD (UTC), from the engine
  kind: YearEventKind;
  label: string;       // written by code
  point?: Point;       // passes, and stations within 5° of a point
  pass?: { n: number; of: number };
  station?: "retrograde" | "direct";
  sign?: Sign;         // ingress: the sign entered
  orb?: number;        // stations: degrees from the nearest point (one decimal)
}
export interface YearMonth {
  ym: string; name: string; year: number;
  /** Saturn at 00:00 UTC on the 1st and on the last day, and on the 15th (the reading's month table samples the 15th). */
  first: { sign: Sign; deg: number }; last: { sign: Sign; deg: number }; mid: { sign: Sign; deg: number; lon: number };
  retro: boolean;      // on the 15th
  orb: number;         // signed orb to the natal degree on the 15th (negative = still short of it)
  near: { point: Point; dist: number }; // nearest of the four points on the 15th, unsigned degrees (one decimal)
  events: number[];    // indexes into YearAhead.events
}
export interface YearAhead {
  v: number;
  start: string; end: string;           // YYYY-MM-01, end exclusive (start + 12 months)
  year: number;                         // the start's calendar year: the page is /r/:tok/year/<year>
  natal: { lon: number; sign: Sign; deg: number };
  returnNumber: 1 | 2 | 3;
  stage: { start: string; end: string }; // stage names (the reading's wheel) at the start and at the end
  months: YearMonth[];
  events: YearEvent[];
  /** The nearest Saturn comes to any of the four points in the year, when it makes no exact pass; null when it does. */
  closest: { date: string; point: Point; orb: number } | null;
}
/** Bump when the shape or the maths changes. Stored with each year-ahead (facts_json). */
export const YEAR_FACTS_VERSION = 1;

/** First day of a month, UTC. */
const monthStart = (y: number, m0: number) => Date.UTC(y, m0, 1);
const addMonthsYm = (ymd: string, n: number) => { const y = +ymd.slice(0, 4), m = +ymd.slice(5, 7) - 1; return iso(monthStart(y, m + n)); };
/** Unsigned distance (0–180) from the angle Saturn has travelled since its natal position to a point. */
const dist = (lon: number, natal: number, p: Point) => Math.abs(((((lon - natal) % 360) + 360) % 360 - POINT_ANGLE[p] + 540) % 360 - 180);
const nearest = (lon: number, natal: number): { point: Point; dist: number } => {
  let best: { point: Point; dist: number } = { point: "return", dist: 999 };
  for (const p of Object.keys(POINT_ANGLE) as Point[]) { const d = dist(lon, natal, p); if (d < best.dist) best = { point: p, dist: d }; }
  return { point: best.point, dist: Math.round(best.dist * 10) / 10 };
};
const pos = (t: number) => { const lon = saturnLongitude(new Date(t)); return { sign: signOf(lon), deg: Math.round(degreeInSign(lon) * 10) / 10, lon }; };

/**
 * Where a year-ahead bought at `now` starts: the 1st of this month (UTC) up to the 15th, else the 1st of next month; never
 * before the end of the buyer's last one (`after`, a YYYY-MM-01), so a second year carries on where the first stopped.
 */
export function yearStart(now: Date, after: string | null = null): string {
  const base = iso(monthStart(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() <= 15 ? 0 : 1)));
  return after && after > base ? after : base;
}
export const yearEnd = (start: string) => addMonthsYm(start, 12);
/** How long before the last one ends the next year-ahead can be bought (and offered). */
export const RENEW_LEAD_DAYS = 60;
/** Whether a new year-ahead can be bought now, given the end of the buyer's latest live one (or null for none). */
export function canBuyNext(now: Date, latestEnd: string | null): boolean {
  return !latestEnd || Date.parse(latestEnd) - now.getTime() <= RENEW_LEAD_DAYS * DAY;
}

/** The 12 months of Saturn from `start` (YYYY-MM-01) for one chart. Throws if the start is malformed or a date fails its check. */
export function yearAhead(b: Birth, start: string): YearAhead {
  if (!/^\d{4}-\d{2}-01$/.test(start) || isNaN(Date.parse(start))) throw new Error(`year-ahead: bad start ${start}`);
  const t0 = Date.parse(start), end = yearEnd(start), t1 = Date.parse(end);
  if (new Date(t0).getUTCFullYear() < 1921 || new Date(t1).getUTCFullYear() > 2079) throw new Error("year-ahead: outside the ephemeris table");
  const at = new Date(t0);
  const comp: Computed = compute(b, at);
  const cy = cycle(comp, at);
  const natal = comp.natalLon;
  const inYear = (d: string) => d >= start && d < end;
  const events: YearEvent[] = [];

  // exact passes over the natal degree (the return): the reading's own dates
  const hits = comp.window.hits;
  hits.forEach((d, i) => { if (inYear(d)) events.push({ date: d, kind: "pass", point: "return", pass: { n: i + 1, of: hits.length },
    label: hits.length === 1 ? "Saturn crosses your natal degree: the exact pass of your Saturn return" : `Saturn crosses your natal degree: exact pass ${i + 1} of ${hits.length} of your Saturn return` }); });
  // squares and the opposition: the tension points the reading already shows, from both sides of this return
  const seen = new Set<string>();
  for (const tp of [...cy.history, ...cy.ahead]) {
    if (tp.kind === "return") continue;
    tp.hits.forEach((d, i) => {
      const k = `${tp.kind}:${d}`;
      if (!inYear(d) || seen.has(k)) return; seen.add(k);
      events.push({ date: d, kind: "pass", point: tp.kind, pass: { n: i + 1, of: tp.hits.length },
        label: `Saturn reaches ${POINT_NAME[tp.kind]} (${POINT_SHORT[tp.kind].toLowerCase()})${tp.hits.length > 1 ? `: exact ${i + 1} of ${tp.hits.length}` : ": exact"}` });
    });
  }
  // stations
  for (const s of stationsBetween(t0 - DAY, t1 - DAY)) {
    if (!inYear(s.date)) continue;
    const n = nearest(s.lon, natal);
    const near = n.dist < 5 ? n : null;
    events.push({ date: s.date, kind: "station", station: s.to, ...(near ? { point: near.point, orb: near.dist } : {}),
      label: `Saturn stands still and turns ${s.to} at ${Math.floor(degreeInSign(s.lon))}° ${signOf(s.lon)}${near ? `, ${near.dist}° from ${POINT_NAME[near.point]}` : ""}` });
  }
  // the window opening and closing, as the reading dates them
  for (const e of cy.stageEvents) if ((e.key === "approach" || e.key === "close") && inYear(e.date)) events.push({ date: e.date, kind: "window", label: e.key === "approach" ? `Saturn enters ${comp.sign}: your Saturn return window opens` : `Saturn's last day in ${comp.sign}: your Saturn return window closes` });
  // sign changes, dated the UTC day Saturn crosses into the sign (the sign at the end of the day, as the sign pages and
  // content/sign-periods.json date them). The one that opens the return window is already there, on the reading's date
  // (compute() dates the window by the sign at 00:00 UTC, so it can be the day after the crossing): no second line for it.
  let prev = signOf(saturnLongitude(new Date(t0 - 1000)));
  for (let t = t0; t < t1; t += DAY) {
    const s = signOf(saturnLongitude(new Date(t + DAY - 1000)));
    if (s !== prev) {
      const d = iso(t);
      const opens = s === comp.sign && events.some((e) => e.kind === "window" && Math.abs(Date.parse(e.date) - t) <= DAY && e.label.includes("opens"));
      if (!opens) events.push({ date: d, kind: "ingress", sign: s, label: isRetrograde(new Date(t + DAY / 2)) ? `Saturn moves back into ${s}` : `Saturn enters ${s}` });
      prev = s;
    }
  }
  const ORDER: Record<YearEventKind, number> = { window: 0, ingress: 1, station: 2, pass: 3 };
  events.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind]);

  const months: YearMonth[] = [];
  for (let i = 0; i < 12; i++) {
    const y = at.getUTCFullYear(), m0 = at.getUTCMonth() + i;
    const ms = monthStart(y, m0), me = monthStart(y, m0 + 1);
    const ym = iso(ms).slice(0, 7);
    const mid = pos(ms + 14 * DAY);
    months.push({ ym, name: MONL[new Date(ms).getUTCMonth()], year: new Date(ms).getUTCFullYear(), first: strip(pos(ms)), last: strip(pos(me - DAY)), mid,
      retro: isRetrograde(new Date(ms + 14 * DAY)), orb: Math.round(orb(mid.lon, natal) * 10) / 10, near: nearest(mid.lon, natal),
      events: events.map((e, k) => (e.date.startsWith(ym) ? k : -1)).filter((k) => k >= 0) });
  }

  let closest: YearAhead["closest"] = null;
  if (!events.some((e) => e.kind === "pass")) {
    let best = { t: t0, n: nearest(saturnLongitude(at), natal) };
    for (let t = t0 + DAY; t < t1; t += DAY) { const n = nearest(saturnLongitude(new Date(t)), natal); if (n.dist < best.n.dist) best = { t, n }; }
    closest = { date: iso(best.t), point: best.n.point, orb: best.n.dist };
  }
  const birth = new Date(comp.birthUtc);
  const out: YearAhead = {
    v: YEAR_FACTS_VERSION, start, end, year: at.getUTCFullYear(), natal: { lon: natal, sign: comp.sign, deg: Math.round(comp.degree * 10) / 10 },
    returnNumber: comp.returnNumber, stage: { start: stageAt(birth, natal, comp.window, at).name, end: stageAt(birth, natal, compute(b, new Date(t1 - DAY)).window, new Date(t1 - DAY)).name },
    months, events, closest,
  };
  checkYear(out);
  return out;
}
const strip = (p: { sign: Sign; deg: number }) => ({ sign: p.sign, deg: p.deg });

/**
 * The year's own check, run on every build: twelve consecutive months; every date a real YYYY-MM-DD inside the year, in
 * order; every pass within a degree of its point on that day; every station a real change of direction around its day.
 * A failure throws, so nothing half-right is sold or written up.
 */
export function checkYear(y: YearAhead): void {
  const bad = (why: string) => { throw new Error(`year-ahead check failed: ${why}`); };
  if (y.months.length !== 12) bad("not 12 months");
  y.months.forEach((m, i) => { if (m.ym !== addMonthsYm(y.start, i).slice(0, 7)) bad(`month ${i} is ${m.ym}`); });
  let last = "";
  for (const e of y.events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || iso(Date.parse(e.date)) !== e.date) bad(`malformed date ${e.date}`);
    if (e.date < y.start || e.date >= y.end) bad(`${e.date} outside ${y.start}–${y.end}`);
    if (e.date < last) bad("events out of order");
    last = e.date;
    const t = Date.parse(e.date);
    if (e.kind === "pass") {
      const p = e.point!;
      const a = Math.min(dist(saturnLongitude(new Date(t)), y.natal.lon, p), dist(saturnLongitude(new Date(t + DAY)), y.natal.lon, p), dist(saturnLongitude(new Date(t - DAY)), y.natal.lon, p));
      if (a > 1) bad(`pass on ${e.date} is ${a.toFixed(2)}° from ${p}`);
    }
    if (e.kind === "station" && isRetrograde(new Date(t - 2 * DAY)) === isRetrograde(new Date(t + 2 * DAY))) bad(`no change of direction around ${e.date}`);
  }
}

// ---------- text, written by code (page, model inputs, emails) ----------
export const fmtYm = (ym: string) => `${MONL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
export const periodLabel = (y: Pick<YearAhead, "start" | "end">) => `${fmtYm(y.start.slice(0, 7))} to ${fmtYm(addMonthsYm(y.end, -1).slice(0, 7))}`;

/** One line on where Saturn is in a month relative to the chart (the 15th), e.g. "3.2° past your natal Saturn". */
export function relationText(m: YearMonth): string {
  if (Math.abs(m.orb) <= 10) return Math.abs(m.orb) < 0.5 ? "on your natal Saturn" : `${Math.abs(m.orb).toFixed(1)}° ${m.orb < 0 ? "short of" : "past"} your natal Saturn`;
  return `${m.near.dist.toFixed(1)}° from ${POINT_NAME[m.near.point]}`;
}

export function motionText(m: YearMonth, events: YearEvent[]): string {
  const st = m.events.map((k) => events[k]).find((e) => e.kind === "station");
  if (st) return `Turns ${st.station} ${dayMonth(st.date)}`;
  return m.retro ? "Retrograde" : "Direct";
}
const dayMonth = (d: string) => `${parseInt(d.slice(8, 10), 10)} ${MONL[+d.slice(5, 7) - 1].slice(0, 3)}`;

/** The model's inputs: every number and date already computed and formatted. `allowed` is the date guard's list. */
export function yearInputs(y: YearAhead, c: Pick<Computed, "house">, firstName: string | null) {
  const ev = (e: YearEvent) => ({ date: fmtDay(e.date), what: e.label });
  const allowed = [...new Set(y.events.map((e) => fmtDay(e.date)).concat(y.closest ? [fmtDay(y.closest.date)] : []))];
  return {
    inputs: {
      first_name: firstName, natal_saturn_sign: y.natal.sign, natal_saturn_degree: y.natal.deg, natal_saturn_house: c.house, return_number: y.returnNumber,
      period: periodLabel(y), stage_at_start: y.stage.start, stage_at_end: y.stage.end,
      months: y.months.map((m) => ({ ym: m.ym, month: `${m.name} ${m.year}`, saturn: `${Math.floor(m.mid.deg)}° ${m.mid.sign}`, motion: motionText(m, y.events), relation: relationText(m), events: m.events.map((k) => ev(y.events[k])) })),
      events: y.events.map(ev),
      closest: y.closest ? { date: fmtDay(y.closest.date), to: POINT_NAME[y.closest.point], orb: y.closest.orb } : null,
      allowed_dates: allowed,
    },
    allowed,
  };
}

/** What the model writes (validated before it's stored). */
export interface YearReport { intro: string; months: Array<{ ym: string; body: string }>; carry: string }
/** The reply has every key, twelve months in the year's order, and non-empty text throughout. */
export function yearReportOk(r: YearReport, y: YearAhead): boolean {
  if (!r || typeof r.intro !== "string" || !r.intro.trim() || typeof r.carry !== "string" || !r.carry.trim() || !Array.isArray(r.months) || r.months.length !== 12) return false;
  return r.months.every((m, i) => m && m.ym === y.months[i].ym && typeof m.body === "string" && !!m.body.trim());
}

/** A short code-only teaser for the offer page: counts and months, no dates. */
export function teaser(y: YearAhead): string[] {
  const months = (kind: YearEventKind) => [...new Set(y.events.filter((e) => e.kind === kind).map((e) => MONL[+e.date.slice(5, 7) - 1]))];
  const out: string[] = [];
  const passes = y.events.filter((e) => e.kind === "pass");
  if (passes.length) out.push(`${passes.length === 1 ? "One exact contact" : `${passes.length} exact contacts`} with your natal Saturn (${months("pass").join(", ")}).`);
  else if (y.closest) out.push(`No exact contact this year; the nearest Saturn comes is ${y.closest.orb}° from ${POINT_NAME[y.closest.point]}, in ${MONL[+y.closest.date.slice(5, 7) - 1]}.`);
  const st = months("station");
  if (st.length) out.push(`Saturn stands still and changes direction ${st.length === 1 ? "once" : `${st.length} times`} (${st.join(", ")}).`);
  const ing = y.events.filter((e) => e.kind === "ingress" || e.kind === "window");
  if (ing.length) out.push(`${ing.length === 1 ? "One sign change" : `${ing.length} sign changes`} (${months("ingress").concat(months("window")).join(", ")}).`);
  out.push(`You start the year in "${y.stage.start}"${y.stage.end !== y.stage.start ? ` and end it in "${y.stage.end}"` : ""}.`);
  return out;
}

// ---------- config ----------
/** YEAR_AHEAD: "off" (default: nothing sold or offered), "page" (sold, offered on the reading page; no offer emails), "on" (also the emails). */
export type YearMode = "off" | "page" | "on";
export function yearMode(v: string | undefined): YearMode { const s = (v ?? "").trim().toLowerCase(); return s === "on" ? "on" : s === "page" ? "page" : "off"; }
export function yearCents(v: string | undefined): number { const n = parseInt(v ?? "", 10); return n > 0 ? n : 1900; }
/** The January offer day (UTC date of the year, MM-DD), default 5 Jan; the anniversary one is the reading's purchase date. */
export function januaryDay(v: string | undefined): string { return v && /^01-(0[1-9]|1[0-9]|2[0-9]|3[01])$/.test(v) ? v : "01-05"; }
/** No more than one year-ahead offer email per address in this many days (anniversary and January can fall close together). */
export const OFFER_GAP_DAYS = 60;
export const OFFER_HOUR = 9;
