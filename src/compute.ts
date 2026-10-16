// Everything numeric about a person's Saturn return, from birth details. No LLM here.
import { natalSaturn, scanReturn, relevantReturnNumber, phaseFor, saturnLongitude, orb, isRetrograde, nextStation, type ReturnWindow, type Phase, type Sign } from "./astro/saturn";
import { houses, houseOf } from "./astro/houses";
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
  let house: number | null = null, houseSystem: Computed["houseSystem"] = null;
  if (b.time) {
    const h = houses(birthUtc, b.place.lat, b.place.lon);
    house = houseOf(n.lon, h);
    houseSystem = h.system;
  }
  const returnNumber = relevantReturnNumber(birthUtc, today);
  const window = scanReturn(birthUtc, n.lon, returnNumber);
  const phase = phaseFor(window, n.lon, today);
  const todayOrb = orb(saturnLongitude(today), n.lon);
  return {
    birthUtc: birthUtc.toISOString(),
    natalLon: n.lon, sign: n.sign, degree: n.degree,
    house, houseSystem, returnNumber, window, phase, todayOrb,
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
  };
}
