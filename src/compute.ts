// Everything numeric about a person's Saturn return, from birth details. No LLM here.
import { natalSaturn, scanReturn, relevantReturnNumber, phaseFor, saturnLongitude, orb, isRetrograde, nextStation, type ReturnWindow, type Phase, type Sign } from "./astro/saturn";
import { houses, houseOf, type Houses } from "./astro/houses";
import { windowChart, monthTable, tensionPoints, stageAt, areaWeights, stationsBetween, type WindowChart, type MonthRow, type TensionPoint, type StageNow } from "./astro/cycle";
import { localToUtc, type Place } from "./geo";
import { ORDINAL, SIGN_NOTES, HOUSE_NOTES } from "./content/notes";

export interface Birth { date: string; time: string | null; place: Place }

export interface Computed {
  birthUtc: string;
  natalLon: number;
  sign: Sign;
  degree: number;      // 0–30
  house: number | null;
  houseSystem: "placidus" | "whole" | null;
  housesData: Houses | null;
  returnNumber: 1 | 2 | 3;
  window: ReturnWindow;
  phase: Phase;
  todayOrb: number;    // signed, degrees; negative = applying
  retrograde: boolean;
  nextStation: { date: string; to: "retrograde" | "direct" } | null;
}

export function compute(b: Birth, today = new Date()): Computed {
  const birthUtc = localToUtc(b.date, b.time, b.place.tz);
  const n = natalSaturn(birthUtc);
  let house: number | null = null, houseSystem: Computed["houseSystem"] = null, housesData: Houses | null = null;
  if (b.time) {
    const h = houses(birthUtc, b.place.lat, b.place.lon);
    house = houseOf(n.lon, h);
    houseSystem = h.system;
    housesData = h;
  }
  const returnNumber = relevantReturnNumber(birthUtc, today);
  const window = scanReturn(birthUtc, n.lon, returnNumber);
  const phase = phaseFor(window, n.lon, today);
  const todayOrb = orb(saturnLongitude(today), n.lon);
  return {
    birthUtc: birthUtc.toISOString(),
    natalLon: n.lon, sign: n.sign, degree: n.degree,
    house, houseSystem, housesData, returnNumber, window, phase, todayOrb,
    retrograde: isRetrograde(today),
    nextStation: nextStation(today),
  };
}

// ---------- formatting helpers shared by views, prompts, emails ----------

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (iso: string) => `${parseInt(iso.slice(8, 10), 10)} ${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
export const fmtMonth = (iso: string) => `${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
export const fmtDeg = (d: number) => `${Math.floor(d)}°`;

export const phaseLabel: Record<Phase, string> = {
  not_yet: "Approaching",
  in_window: "In it",
  peak: "Peak",
  separating: "Separating",
  complete: "Done",
};

export function phaseSentence(c: Computed): string {
  const w = c.window;
  switch (c.phase) {
    case "not_yet": return `Your window opens ${fmtMonth(w.windowStart)}. You're on the approach.`;
    case "in_window": return `Your window runs ${fmtMonth(w.windowStart)} to ${fmtMonth(w.windowEnd)}. You're in it now.`;
    case "peak": return `Your window runs ${fmtMonth(w.windowStart)} to ${fmtMonth(w.windowEnd)}, and you're within a degree of exact right now.`;
    case "separating": return `Your window runs ${fmtMonth(w.windowStart)} to ${fmtMonth(w.windowEnd)}. The last exact hit is behind you; you're on the way out.`;
    case "complete": return `Your window ran ${fmtMonth(w.windowStart)} to ${fmtMonth(w.windowEnd)}. It's over.`;
  }
}

export function hitSentence(c: Computed): string {
  const h = c.window.hits.map(fmtDay);
  if (h.length === 1) return `One exact hit: ${h[0]}.`;
  if (h.length === 3) return `Three exact hits: ${h[0]}, ${h[1]} and ${h[2]}.`;
  return `Exact hits: ${h.join(", ")}.`;
}

export function houseLabel(c: Computed): string | null {
  return c.house ? `${ORDINAL[c.house]} house` : null;
}

export function reportInputs(c: Computed, firstName: string | null, today = new Date()) {
  const cy = cycle(c, today);
  return {
    first_name: firstName,
    natal_saturn_sign: c.sign,
    natal_saturn_degree: Math.round(c.degree * 10) / 10,
    natal_saturn_house: c.house,
    return_number: c.returnNumber,
    window_start: fmtMonth(c.window.windowStart),
    window_end: fmtMonth(c.window.windowEnd),
    peak_start: fmtMonth(c.window.peakStart),
    peak_end: fmtMonth(c.window.peakEnd),
    exact_hits: c.window.hits.map(fmtDay),
    today: fmtDay(today.toISOString().slice(0, 10)),
    phase: c.phase,
    sign_work: SIGN_NOTES[c.sign].work,
    house_area: c.house ? HOUSE_NOTES[c.house].area : null,
    turn: cy.turn ? { date: fmtDay(cy.turn.date), orb: cy.turn.orb } : null,
    areas: cy.areas.slice(0, 2).map((a) => ({ area: a.name, house: a.house })),
    history: cy.history.map((h) => ({ kind: h.kind, age: h.ageApprox, when: h.from === h.to ? fmtMonth(h.from) : `${fmtMonth(h.from)} to ${fmtMonth(h.to)}` })),
  };
}


// ---------- the whole cycle, for the reading ----------
export interface Cycle {
  chart: WindowChart;
  months: MonthRow[];
  history: TensionPoint[];   // tension points of the cycle leading INTO this return (past)
  ahead: TensionPoint[];     // tension points of the cycle AFTER this return
  stage: StageNow;
  areas: ReturnType<typeof areaWeights>;
  turn: { date: string; orb: number } | null; // nearest station to the natal degree that did NOT cross (the "closest turn")
  pct: number;               // how far round the cycle Saturn is today (0–100)
  stageEvents: Array<{ key: string; label: string; date: string }>; // every stage opening, in date order (past and future)
}

export function cycle(c: Computed, today = new Date()): Cycle {
  const birth = new Date(c.birthUtc);
  const w = c.window;
  const chart = windowChart(c.natalLon, w, today);
  const months = monthTable(c.natalLon, w, today);
  const prevReturnT = c.returnNumber === 1 ? birth.getTime() : Date.parse(w.hits[0]) - 29.457 * 365.2422 * 86400000;
  const history = tensionPoints(birth, c.natalLon, prevReturnT).filter((p) => p.kind !== "return");
  const ahead = tensionPoints(birth, c.natalLon, Date.parse(w.hits[0]));
  const stage = stageAt(birth, c.natalLon, w, today);
  const areas = areaWeights(c.house, c.housesData);
  const st = stationsBetween(Date.parse(w.windowStart), Date.parse(w.windowEnd));
  let turn: Cycle["turn"] = null;
  for (const s of st) {
    const o = Math.abs(((s.lon - c.natalLon + 540) % 360) - 180);
    if (o < 5 && (!turn || o < Math.abs(turn.orb))) turn = { date: s.date, orb: Math.round(o * 10) / 10 };
  }
  const pct = Math.round(stage.wa / 360 * 100);
  const stageEvents: Cycle["stageEvents"] = [
    { key: "approach", label: "Approach: your window opens", date: w.windowStart },
    { key: "contact", label: "Contact: your first exact pass", date: w.hits[0] },
    ...(w.hits.length > 1 ? [{ key: "integration", label: "Integration: your last exact pass", date: w.hits[w.hits.length - 1] }] : []),
    { key: "close", label: `Saturn leaves ${c.sign}: your window closes`, date: w.windowEnd },
    ...ahead.filter((p) => p.kind !== "return").map((p) => ({ key: p.kind, label: `${p.name}, around age ${p.ageApprox}`, date: p.from })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return { chart, months, history, ahead, stage, areas, turn, pct, stageEvents };
}
