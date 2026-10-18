// Birth-month search pages (docs/automation-builds.md build 7): /saturn-return/born/1997-03, /saturn-return/born/1997, /saturn-return/born.
// Every fact on those pages comes from here, and everything here comes from the engine (src/astro/saturn.ts, the same
// scanReturn() that compute() and the free preview use). Two layers:
//   bornFacts(y, m)      today-independent: Saturn's sign and degree through the month, and for three sample birth days
//                        (1st, 15th, last) every return window, its exact passes and the closest turn. Cached in KV.
//   *state helpers       today-dependent: which return is current and where the cohort is in it, worked out at request time
//                        so the pages never say "upcoming" about a date that has passed.
// The year and index pages read a compact projection of bornFacts for all 792 months from content/born-summary.json
// (scripts/gen-born-summary.ts); test/born.test.ts regenerates it from the engine and fails if it has drifted.
import { natalSaturn, scanReturn, relevantReturnNumber, phaseFor, signOf, degreeInSign, saturnLongitude, type ReturnWindow, type Phase, type Sign } from "./astro/saturn";
import { closestTurn } from "./compute";

/** The range the spec names: every birth month 1940–2005 (66 years, 792 pages). */
export const BORN_FROM = 1940, BORN_TO = 2005;
/** Third returns are scanned only where the daily Saturn table covers them (it ends in 2080; a third return closes by age ~92). */
const THIRD_MAX_YEAR = 1985;
/** Bump when bornFacts' shape or maths changes: the KV key carries it, so old cached facts are never read. */
export const FACTS_VERSION = 1;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

export interface BornReturn extends ReturnWindow { turn: { date: string; orb: number } | null }
export interface BornSample { date: string; lon: number; sign: Sign; degree: number; returns: BornReturn[] }
/** A run of birth days in the month with Saturn in one sign (two runs when Saturn changed sign during the month). */
export interface SignSpan { sign: Sign; from: string; to: string; degMin: number; degMax: number }
export interface MonthFacts { v: number; ym: string; year: number; month: number; spans: SignSpan[]; samples: BornSample[] }

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Birth instant used for a date without a time: noon UTC, the same as /api/calc and the landing widget. */
export const noonUtc = (date: string) => new Date(`${date}T12:00:00Z`);

/** "1997-03" → { year, month } inside the range, else null (the route answers 404). */
export function parseYm(s: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = +m[1], month = +m[2];
  if (year < BORN_FROM || year > BORN_TO || month < 1 || month > 12) return null;
  return { year, month };
}
export function parseYear(s: string): number | null {
  if (!/^\d{4}$/.test(s)) return null;
  const y = +s;
  return y >= BORN_FROM && y <= BORN_TO ? y : null;
}

export function bornFacts(year: number, month: number): MonthFacts {
  const ym = `${year}-${pad(month)}`, last = daysIn(year, month);
  const spans: SignSpan[] = [];
  for (let d = 1; d <= last; d++) {
    const date = `${ym}-${pad(d)}`, lon = saturnLongitude(noonUtc(date)), sign = signOf(lon), deg = degreeInSign(lon);
    const s = spans[spans.length - 1];
    if (s && s.sign === sign) { s.to = date; s.degMin = Math.min(s.degMin, deg); s.degMax = Math.max(s.degMax, deg); }
    else spans.push({ sign, from: date, to: date, degMin: deg, degMax: deg });
  }
  const samples = [1, 15, last].map((d): BornSample => {
    const date = `${ym}-${pad(d)}`, birth = noonUtc(date), n = natalSaturn(birth);
    const nums: Array<1 | 2 | 3> = year <= THIRD_MAX_YEAR ? [1, 2, 3] : [1, 2];
    const returns = nums.map((k) => { const w = scanReturn(birth, n.lon, k); return { ...w, turn: closestTurn(n.lon, w) }; });
    return { date, lon: n.lon, sign: n.sign, degree: n.degree, returns };
  });
  return { v: FACTS_VERSION, ym, year, month, spans, samples };
}

/** bornFacts through KV (no expiry needed: the ephemeris doesn't change, and FACTS_VERSION retires old entries). */
export async function bornFactsCached(kv: KVNamespace | undefined, year: number, month: number, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<MonthFacts> {
  const key = `born:v${FACTS_VERSION}:${year}-${pad(month)}`;
  if (kv) {
    try { const hit = await kv.get(key, "json") as MonthFacts | null; if (hit && hit.v === FACTS_VERSION) return hit; } catch { /* cache is optional */ }
  }
  const f = bornFacts(year, month);
  if (kv) { const p = kv.put(key, JSON.stringify(f), { expirationTtl: 60 * 60 * 24 * 365 }).catch(() => {}); if (ctx) ctx.waitUntil(p); else await p; }
  return f;
}

// ---------- today-dependent state (computed per request) ----------

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** The return compute() would pick for this birth day today (by age: first until 32, second until 62, then third). */
export function currentReturn(s: BornSample, today: Date): BornReturn {
  const n = relevantReturnNumber(noonUtc(s.date), today);
  return s.returns.find((r) => r.returnNumber === n) ?? s.returns[s.returns.length - 1];
}
export function phaseOf(s: BornSample, r: BornReturn, today: Date): Phase { return phaseFor(r, s.lon, today); }
/** Exact passes split by today: on or before today is behind you, after today is ahead. */
export function splitHits(r: ReturnWindow, today: Date) {
  const t = isoDay(today);
  return { past: r.hits.filter((h) => h <= t), ahead: r.hits.filter((h) => h > t) };
}

// ---------- compact projection for the year and index pages ----------

/** Per return number: [earliest window open, latest window close, earliest exact pass, latest exact pass, hit counts seen]
 *  across the sample birth days that fall in one sign span. */
export type ReturnSpan = [string, string, string, string, number[]];
export interface SpanSummary { sign: Sign; deg: [number, number]; from: string; to: string; r: Partial<Record<"1" | "2" | "3", ReturnSpan>> }
export interface MonthSummary { ym: string; spans: SpanSummary[] }

export function summarise(f: MonthFacts): MonthSummary {
  const min = (a: string[]) => a.reduce((x, y) => (y < x ? y : x)), max = (a: string[]) => a.reduce((x, y) => (y > x ? y : x));
  return { ym: f.ym, spans: f.spans.map((sp) => {
    const ss = f.samples.filter((s) => s.date >= sp.from && s.date <= sp.to);
    const r: SpanSummary["r"] = {};
    for (const k of [1, 2, 3] as const) {
      const rs = ss.map((s) => s.returns.find((x) => x.returnNumber === k)).filter((x): x is BornReturn => !!x);
      if (!rs.length || rs.length !== ss.length) continue;
      r[String(k) as "1"] = [min(rs.map((x) => x.windowStart)), max(rs.map((x) => x.windowEnd)), min(rs.map((x) => x.hits[0])), max(rs.map((x) => x.hits[x.hits.length - 1])), [...new Set(rs.map((x) => x.hits.length))].sort()];
    }
    return { sign: sp.sign, deg: [Math.floor(sp.degMin), Math.floor(sp.degMax)], from: sp.from, to: sp.to, r };
  }) };
}

/** Every month in the range, oldest first. */
export function allMonths(): Array<{ year: number; month: number; ym: string }> {
  const out = [];
  for (let y = BORN_FROM; y <= BORN_TO; y++) for (let m = 1; m <= 12; m++) out.push({ year: y, month: m, ym: `${y}-${pad(m)}` });
  return out;
}

/** The return number a birth month is in "now", by its mid-month day's age (what compute() picks for that day). */
export const monthReturnNumber = (ym: string, today: Date) => relevantReturnNumber(noonUtc(`${ym}-15`), today);
export type SpanState = "open" | "opens_soon" | "later" | "closed";
/** Where a birth month stands against a return's window today. "opens_soon" = opens within `soonYears`. */
export function spanState(span: ReturnSpan, today: Date, soonYears = 5): SpanState {
  const t = isoDay(today);
  if (t > span[1]) return "closed";
  if (t >= span[0]) return "open";
  const soon = isoDay(new Date(today.getTime() + soonYears * 365.25 * 86400000));
  return span[0] <= soon ? "opens_soon" : "later";
}
