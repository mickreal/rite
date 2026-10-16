// The whole Saturn cycle for one chart: path points for charts, stations, month table,
// the tension points (squares and opposition) past and ahead, the stage wheel, and house weighting.
import { saturnLongitude, orb, signOf, degreeInSign, isRetrograde, type ReturnWindow, type Sign } from "./saturn";
import type { Houses } from "./houses";

const DAY = 86_400_000;
const YEAR = 365.2422 * DAY;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Signed orb samples between two dates (ms), every `stepDays`. */
export function pathPoints(natalLon: number, t0: number, t1: number, stepDays = 4): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let t = t0; t <= t1; t += stepDays * DAY) out.push([t, orb(saturnLongitude(new Date(t)), natalLon)]);
  return out;
}

export interface Station { date: string; t: number; to: "retrograde" | "direct"; lon: number }

/** Direction changes between two dates. */
export function stationsBetween(t0: number, t1: number): Station[] {
  const out: Station[] = [];
  let prev = isRetrograde(new Date(t0));
  for (let t = t0 + DAY; t <= t1; t += DAY) {
    const r = isRetrograde(new Date(t));
    if (r !== prev) { out.push({ date: iso(new Date(t)), t, to: r ? "retrograde" : "direct", lon: saturnLongitude(new Date(t)) }); prev = r; }
  }
  return out;
}

/** Catmull-Rom → cubic bezier SVG path through points already mapped to x/y. */
export function smoothPath(pts: Array<[number, number]>): string {
  if (!pts.length) return "M0 0";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export interface WindowChart {
  path: string; markPath: string; stationPath: string; y0: number; todayX: number;
  x: (t: number) => number; yearTicks: Array<{ x: number; label: string }>; t0: number; t1: number;
  contactX0: number; contactX1: number; // x of first/last hit (contact band)
}

/** Chart geometry for a return window (viewBox 1000×300, plot 40..960 × 16..260). */
export function windowChart(natalLon: number, w: ReturnWindow, today = new Date()): WindowChart {
  const t0 = Date.parse(w.windowStart) - 60 * DAY, t1 = Date.parse(w.windowEnd) + 60 * DAY;
  const pts = pathPoints(natalLon, t0, t1, 4);
  let mn = Infinity, mx = -Infinity;
  for (const [, o] of pts) { if (o < mn) mn = o; if (o > mx) mx = o; }
  mn = Math.min(mn, -1); mx = Math.max(mx, 1);
  const x = (t: number) => 40 + (t - t0) / (t1 - t0) * 920;
  const y = (o: number) => 248 - (o - mn) / (mx - mn) * 224;
  const path = smoothPath(pts.map(([t, o]) => [x(t), y(o)]));
  const y0 = y(0);
  const markPath = w.hits.map((h) => { const px = x(Date.parse(h)); return `M${(px - 7).toFixed(1)} ${y0.toFixed(1)} a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0`; }).join(" ");
  const stationPath = stationsBetween(t0, t1).map((s) => { const px = x(s.t), py = y(orb(s.lon, natalLon)); return `M${(px - 5).toFixed(1)} ${py.toFixed(1)} a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0`; }).join(" ");
  const now = today.getTime();
  const todayX = now >= t0 && now <= t1 ? x(now) : -999;
  const yearTicks: WindowChart["yearTicks"] = [];
  for (let yr = new Date(t0).getUTCFullYear() + 1; yr <= new Date(t1).getUTCFullYear(); yr++) {
    const t = Date.UTC(yr, 0, 1); if (t > t0 && t < t1) yearTicks.push({ x: x(t), label: String(yr) });
  }
  return { path, markPath, stationPath, y0, todayX, x, yearTicks, t0, t1, contactX0: x(Date.parse(w.hits[0])), contactX1: x(Date.parse(w.hits[w.hits.length - 1])) };
}

export interface MonthRow {
  ym: string; name: string; year: number; lon: number; orb: number; retro: boolean; sign: Sign; deg: number;
  tag: string; text: string; isNow: boolean;
}

/** One row per month across the window (15th of each month). */
export function monthTable(natalLon: number, w: ReturnWindow, today = new Date()): MonthRow[] {
  const start = new Date(w.windowStart), end = new Date(w.windowEnd);
  const rows: MonthRow[] = [];
  const hits = new Set(w.hits.map((h) => h.slice(0, 7)));
  const st = stationsBetween(Date.parse(w.windowStart) - 30 * DAY, Date.parse(w.windowEnd) + 30 * DAY);
  const stByMonth = new Map(st.map((s) => [s.date.slice(0, 7), s]));
  const nowYm = iso(today).slice(0, 7);
  const lastHit = w.hits[w.hits.length - 1];
  for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m++) {
    if (m > 11) { m = 0; y++; }
    const t = Date.UTC(y, m, 15);
    const lon = saturnLongitude(new Date(t)); const o = orb(lon, natalLon); const retro = isRetrograde(new Date(t));
    const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
    const station = stByMonth.get(ym);
    const a = Math.abs(o).toFixed(1);
    let tag = "", text = "";
    const afterLast = lastHit ? ym > lastHit.slice(0, 7) : false;
    if (hits.has(ym)) { tag = "Exact pass"; text = "Saturn crosses your degree this month. The most important stretch of your return: make the decision you have been circling."; }
    else if (station && station.to === "retrograde") { tag = `Turns retrograde ${parseInt(station.date.slice(8), 10)} ${MON[parseInt(station.date.slice(5, 7), 10) - 1]}`; text = "Saturn slows and stands still. Pressure peaks quietly. Finish things rather than start them."; }
    else if (station) { tag = `Turns direct ${parseInt(station.date.slice(8), 10)} ${MON[parseInt(station.date.slice(5, 7), 10) - 1]}`; text = "Saturn stands still, then moves forward again. What you reconsidered can move ahead."; }
    else if (afterLast) text = `${a}° past your degree. Build on the decision; keep promises small and kept.`;
    else if (retro && o > 0) text = `Retrograde, heading back toward your degree, ${a}° past it. Revisit what you committed to and adjust it.`;
    else if (retro) text = `Retrograde, ${a}° away. Review plans from earlier instead of forcing new ones.`;
    else if (Math.abs(o) <= 4) text = `Within ${a}° and closing. Commitments made now start to feel binding.`;
    else if (Math.abs(o) <= 10) text = `Closing in, ${a}° away. Good month to test a plan in small, real steps.`;
    else text = `Still ${a}° away. Background pressure. Name what you are carrying.`;
    if (ym === nowYm) tag = tag ? `Now · ${tag}` : "Now";
    rows.push({ ym, name: MONL[m], year: y, lon, orb: o, retro, sign: signOf(lon), deg: degreeInSign(lon), tag, text, isNow: ym === nowYm });
  }
  return rows;
}

export interface TensionPoint { kind: "square1" | "opposition" | "square2" | "return"; ageApprox: number; from: string; to: string; hits: string[]; name: string }

/**
 * The tension points of one 29.5-year cycle after `cycleStart` (a return or birth):
 * first square (~7), opposition (~14), closing square (~21), next return (~29).
 * Each is a range from first to last exact crossing (retrograde loops give 1–3 crossings).
 */
export function tensionPoints(birthUtc: Date, natalLon: number, cycleStartT: number): TensionPoint[] {
  const targets: Array<[TensionPoint["kind"], number, number, string]> = [
    ["square1", 90, 7, "First test"], ["opposition", 180, 14, "Full view"], ["square2", 270, 21, "Letting go"], ["return", 360, 29, "Return"],
  ];
  const out: TensionPoint[] = [];
  for (const [kind, angle, age, name] of targets) {
    const centre = cycleStartT + (age * YEAR * 29.46 / 29); // rough centre; scan ±3.2y
    const hits: string[] = []; let prev: number | null = null;
    for (let t = centre - 3.2 * YEAR; t <= centre + 3.2 * YEAR; t += DAY) {
      const a = (((saturnLongitude(new Date(t)) - natalLon) % 360) + 360) % 360; // 0..360 travelled
      const diff = ((a - (angle % 360) + 540) % 360) - 180;
      if (prev !== null && (prev < 0) !== (diff < 0) && Math.abs(diff) < 2) hits.push(iso(new Date(t)));
      prev = diff;
    }
    if (!hits.length) continue;
    const ageAt = Math.round((Date.parse(hits[0]) - birthUtc.getTime()) / YEAR);
    out.push({ kind, ageApprox: ageAt, from: hits[0], to: hits[hits.length - 1], hits, name });
  }
  return out;
}

export const STAGES = {
  ra: ["Your return: approach", 0, "Saturn is closing in on the degree it held when you were born. Pressure builds before anything is exact.", "Notice what feels heavy and what you keep postponing.", "The idea that you can keep every option open.", "What am I carrying out of habit rather than choice?"],
  rc: ["Your return: contact", 0, "Saturn is on or near your natal degree. This is the part people mean when they say Saturn return.", "Make the decision you have been circling, and commit to it in one concrete way.", "Waiting for certainty before you act.", "What would I build if I knew I had to finish it?"],
  ri: ["Your return: integration", 0, "Saturn is moving on. What you chose during contact becomes structure.", "Keep the promises you made, small and often.", "Reopening decisions that have already held.", "What survived the backtrack, and what does it need from me now?"],
  p1: ["Planting", 1, "The new cycle is young. You are laying foundations you will live in for decades.", "Routines and commitments that match the choices of your return.", "Proving yourself to people who are not part of the plan.", "What does a good ordinary week look like now?"],
  p2: ["First test", 2, "Saturn squares its own position. What you started at your return meets its first real resistance.", "Fix what is not working rather than starting again.", "All-or-nothing thinking.", "What is this pressure asking me to strengthen?"],
  p3: ["Building", 3, "Effort compounds. This is the long middle, where steady work starts to show.", "Depth over novelty.", "Comparing your timeline with anyone else's.", "Where am I quietly getting good at something?"],
  p4: ["Full view", 4, "Saturn opposes its own position. You see clearly what you have built, and how others see it.", "An honest review, especially of relationships and roles.", "Defending things that no longer fit.", "If I were starting today, would I choose this again?"],
  p5: ["Proving", 5, "Results arrive. What you built either holds weight or shows its cracks.", "Consolidate, and share what you know.", "Taking on more than the structure can carry.", "What am I ready to be responsible for?"],
  p6: ["Letting go", 6, "Saturn's last tension point before your next return. What will not make the next cycle starts to fall away.", "Choose what to finish and what to close.", "Old roles you have outgrown.", "What am I clearing space for?"],
  p7: ["Clearing", 7, "The quiet run-up to your next return. Endings now make room for what comes next.", "Simplify. Rest is part of the work.", "Starting big new commitments too early.", "What do I want my next return to find?"],
} as const;
export type StageKey = keyof typeof STAGES;
export const STAGE_SEG: Array<[number, number]> = [[345, 30], [15, 65], [80, 20], [100, 70], [170, 20], [190, 70], [260, 20], [280, 65]];

export interface StageNow {
  key: StageKey; name: string; idx: number; theme: string; focus: string; release: string; question: string;
  wa: number; age: number; sky: string; transitLon: number; retro: boolean; orb: number;
}

/** Where the person is on the wheel at instant `t`. Needs the current/nearest return window to split approach/contact/integration. */
export function stageAt(birthUtc: Date, natalLon: number, w: ReturnWindow | null, t: Date): StageNow {
  const lonT = saturnLongitude(t);
  const wa = (((lonT - natalLon) % 360) + 360) % 360;
  const retro = isRetrograde(t);
  const o = orb(lonT, natalLon);
  const d = iso(t);
  let key: StageKey;
  if (w && d >= w.windowStart && d <= w.windowEnd) {
    key = d < w.hits[0] ? "ra" : d <= w.hits[w.hits.length - 1] ? "rc" : "ri";
  } else if (wa >= 345 || wa < 15) key = "p7";
  else if (wa < 80) key = "p1"; else if (wa < 100) key = "p2"; else if (wa < 170) key = "p3"; else if (wa < 190) key = "p4";
  else if (wa < 260) key = "p5"; else if (wa < 280) key = "p6"; else key = "p7";
  const s = STAGES[key];
  const age = Math.floor((t.getTime() - birthUtc.getTime()) / YEAR);
  const rel = Math.abs(o) <= 30 ? `${Math.abs(o).toFixed(1)}° ${o < 0 ? "short of" : "past"} your natal degree.`
    : Math.abs(Math.abs(o) - 180) < 12 ? "opposite your natal Saturn."
    : Math.abs(Math.abs(o) - 90) < 12 ? "square to your natal Saturn."
    : `about ${Math.round(wa)}° of the way round your cycle.`;
  const sky = `Saturn at ${Math.floor(degreeInSign(lonT))}° ${signOf(lonT)}, ${retro ? "retrograde" : "moving forward"}, ${rel}`;
  return { key, name: s[0], idx: s[1], theme: s[2], focus: s[3], release: s[4], question: s[5], wa, age, sky, transitLon: lonT, retro, orb: o };
}

/** Life-area weighting from Saturn's house and the houses whose cusps fall in Saturn's signs (Capricorn, Aquarius). */
export function areaWeights(house: number | null, h: Houses | null): Array<{ name: string; v: number; house: number }> {
  const NAMES: Record<number, string> = { 1: "Identity and how you show up", 2: "Money and self-worth", 3: "Communication and daily environment", 4: "Home and family", 5: "Creativity, romance, children", 6: "Daily work and routines", 7: "Committed relationships", 8: "Shared resources and intimacy", 9: "Beliefs and direction", 10: "Career and reputation", 11: "Friends and long-term goals", 12: "Solitude and the inner life" };
  const w: Record<number, number> = {};
  for (let i = 1; i <= 12; i++) w[i] = 18 + ((i * 7) % 11);
  if (house) w[house] += 70;
  if (h) {
    h.cusps.forEach((c, i) => { const s = signOf(c); if (s === "Capricorn") w[i + 1] += 40; if (s === "Aquarius") w[i + 1] += 28; });
  } else {
    // no houses: fall back to the classic Saturn themes
    w[10] += 30; w[6] += 18; w[7] += 12;
  }
  const max = Math.max(...Object.values(w));
  return Object.entries(w).map(([k, v]) => ({ house: +k, name: NAMES[+k], v: Math.round(v / max * 100) })).sort((a, b) => b.v - a.v).slice(0, 6);
}

export const fmtMonYr = (t: number) => { const d = new Date(t); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const fmtMonYrL = (t: number) => { const d = new Date(t); return `${MONL[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export function untilText(from: Date, to: number): string {
  const m = Math.round((to - from.getTime()) / (YEAR / 12));
  if (m < 1) return "within a month";
  if (m < 18) return `in ${m} month${m === 1 ? "" : "s"}`;
  return `in about ${Math.round(m / 12)} years`;
}

/** Small chart for the landing card (viewBox 520×220). */
export function smallChart(natalLon: number, w: ReturnWindow, today = new Date()) {
  const t0 = Date.parse(w.windowStart) - 60 * DAY, t1 = Date.parse(w.windowEnd) + 60 * DAY;
  const pts = pathPoints(natalLon, t0, t1, 6);
  let mn = Infinity, mx = -Infinity;
  for (const [, o] of pts) { if (o < mn) mn = o; if (o > mx) mx = o; }
  mn = Math.min(mn, -1); mx = Math.max(mx, 1);
  const x = (t: number) => 20 + (t - t0) / (t1 - t0) * 485;
  const y = (o: number) => 204 - (o - mn) / (mx - mn) * 180;
  const path = pts.map(([t, o], i) => (i ? "L" : "M") + x(t).toFixed(1) + " " + y(o).toFixed(1)).join(" ");
  const y0 = y(0);
  const mark = w.hits.map((h) => { const px = x(Date.parse(h)); return `M${(px - 6).toFixed(1)} ${y0.toFixed(1)} a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0`; }).join(" ");
  const now = today.getTime();
  return { path, mark, y0: +y0.toFixed(1), todayX: now >= t0 && now <= t1 ? +x(now).toFixed(1) : -999 };
}

/** Every stretch Saturn spends in `sign` between two years (UTC dates, inclusive). Daily scan, so ±1 day. */
export function signPeriods(sign: Sign, fromYear: number, toYear: number): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let inSign = false, start = "";
  let prev = "";
  for (let t = Date.UTC(fromYear, 0, 1); t <= Date.UTC(toYear, 11, 31); t += DAY) {
    const d = iso(new Date(t));
    const s = signOf(saturnLongitude(new Date(t))) === sign;
    if (s && !inSign) { inSign = true; start = d; }
    if (!s && inSign) { inSign = false; out.push({ from: start, to: prev }); }
    prev = d;
  }
  if (inSign) out.push({ from: start, to: prev });
  return out;
}
