// Saturn position, return window, exact hits, phase.
// All positions: geocentric, apparent, tropical ecliptic longitude of date (what astrologers use).
// Library: astronomy-engine (pure JS, VSOP87-based; agrees with JPL DE421 to ~0.01° for Saturn).

import * as A from "astronomy-engine";
import TABLE from "../content/saturn-daily.json";

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
] as const;
export type Sign = (typeof SIGNS)[number];

const DAY_MS = 86_400_000;

/** Tropical ecliptic longitude of Saturn (0–360) at a UTC instant. Table lookup with linear interpolation
 *  (daily samples, scripts/gen-saturn-table.ts); falls back to the full ephemeris outside 1920–2080. */
export function saturnLongitude(date: Date): number {
  const i = (date.getTime() - TBL.start) / DAY_MS;
  if (!(i >= 0 && i < TBL.days - 1)) return saturnLongitudeExact(date);
  const k = Math.floor(i), f = i - k;
  const a = tbl()[k] / 1e5, b = tbl()[k + 1] / 1e5;
  let d = b - a; if (d > 180) d -= 360; else if (d < -180) d += 360; // never happens for Saturn, but keep it safe
  return (((a + d * f) % 360) + 360) % 360;
}
const TBL = TABLE as { start: number; days: number; b64: string };
let _tbl: Int32Array | null = null;
function tbl(): Int32Array {
  if (_tbl) return _tbl;
  const bin = atob(TBL.b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  _tbl = new Int32Array(u8.buffer); return _tbl;
}

/** Full ephemeris computation (astronomy-engine). ~50µs a call; used to build the table and outside its range. */
export function saturnLongitudeExact(date: Date): number {
  const t = A.MakeTime(date);
  const geo = A.GeoVector(A.Body.Saturn, t, true); // aberration-corrected
  const rot = A.Rotation_EQJ_ECT(t); // J2000 equatorial → true ecliptic of date
  const ecl = A.RotateVector(rot, geo);
  const s = A.SphereFromVector(ecl);
  return ((s.lon % 360) + 360) % 360;
}

export function signOf(lon: number): Sign {
  return SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
}

export function degreeInSign(lon: number): number {
  return (((lon % 360) + 360) % 360) % 30;
}

/** Signed angular distance from natal to transit, in (-180, 180]. Negative = applying (transit behind natal). */
export function orb(transitLon: number, natalLon: number): number {
  let d = transitLon - natalLon;
  d = ((d + 180) % 360 + 360) % 360 - 180;
  return d;
}

export type Phase = "not_yet" | "in_window" | "peak" | "separating" | "complete";

export interface ReturnWindow {
  returnNumber: 1 | 2 | 3;
  windowStart: string; // YYYY-MM-DD, first day |orb| <= 5 within the scan
  windowEnd: string;   // last day |orb| <= 5
  peakStart: string;   // first day |orb| <= 1
  peakEnd: string;     // last day |orb| <= 1
  hits: string[];      // exact crossings, 1 or 3 (occasionally 2 at edges)
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Scan daily for one Saturn return. `ageFrom`/`ageTo` bound the search in years after birth.
 * Window = |orb| <= 5°, peak = |orb| <= 1°. Hits = sign changes of orb within 2° of exact.
 * Note: with retrograde loops the |orb|<=5 region can be disjoint; we report the outer envelope.
 */
export function scanReturn(birthUtc: Date, natalLon: number, returnNumber: 1 | 2 | 3): ReturnWindow {
  const [ageFrom, ageTo] = returnNumber === 1 ? [26.5, 31] : returnNumber === 2 ? [56, 61] : [85.5, 90.5];
  const start = new Date(birthUtc.getTime() + ageFrom * 365.25 * DAY_MS);
  const end = new Date(birthUtc.getTime() + ageTo * 365.25 * DAY_MS);

  let windowStart: Date | null = null, windowEnd: Date | null = null;
  let peakStart: Date | null = null, peakEnd: Date | null = null;
  const hits: string[] = [];
  let prev: number | null = null;

  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const o = orb(saturnLongitude(d), natalLon);
    const a = Math.abs(o);
    if (a <= 5) { if (!windowStart) windowStart = d; windowEnd = d; }
    if (a <= 1) { if (!peakStart) peakStart = d; peakEnd = d; }
    if (prev !== null && (prev < 0) !== (o < 0) && a < 2) {
      // crossing between yesterday and today: linear interpolation of the instant, reported as its UTC date
      const frac = Math.abs(prev) / (Math.abs(prev) + a);
      hits.push(iso(new Date(t - DAY_MS + frac * DAY_MS)));
    }
    prev = o;
  }
  if (!windowStart || !windowEnd || !peakStart || !peakEnd || !hits.length) {
    throw new Error(`No Saturn return found in scan range for return ${returnNumber}`);
  }
  // Window = the stretch Saturn spends in the natal sign around the return (ingress → egress),
  // including an earlier brief dip into the sign within ~3 years of the first hit.
  const natalSign = signOf(natalLon);
  const firstHit = Date.parse(hits[0]), lastHit = Date.parse(hits[hits.length - 1]);
  let open = firstHit, close = lastHit;
  for (let t = firstHit - 3.2 * 365.25 * DAY_MS; t < firstHit; t += DAY_MS) { if (signOf(saturnLongitude(new Date(t))) === natalSign) { open = t; break; } }
  for (let t = lastHit + 3.2 * 365.25 * DAY_MS; t > lastHit; t -= DAY_MS) { if (signOf(saturnLongitude(new Date(t))) === natalSign) { close = t; break; } }
  return {
    returnNumber,
    windowStart: iso(new Date(open)), windowEnd: iso(new Date(close)),
    peakStart: iso(peakStart), peakEnd: iso(peakEnd),
    hits,
  };
}

/** Which return is relevant today for this birth date: the first whose window hasn't fully passed, else the last passed. */
export function relevantReturnNumber(birthUtc: Date, today = new Date()): 1 | 2 | 3 {
  const ageYears = (today.getTime() - birthUtc.getTime()) / (365.25 * DAY_MS);
  if (ageYears < 32) return 1;
  if (ageYears < 62) return 2;
  return 3;
}

/** Phase from today's actual orb, with the window envelope deciding not_yet/complete. */
export function phaseFor(w: ReturnWindow, natalLon: number, today = new Date()): Phase {
  const d = iso(today);
  if (d < w.windowStart) return "not_yet";
  if (d > w.windowEnd) return "complete";
  const o = Math.abs(orb(saturnLongitude(today), natalLon));
  if (o <= 1) return "peak";
  const lastHit = w.hits[w.hits.length - 1];
  if (lastHit && d > lastHit) return "separating";
  return "in_window";
}

/** Is Saturn retrograde at this instant? (longitude decreasing over ±12h) */
export function isRetrograde(date: Date): boolean {
  const a = saturnLongitude(new Date(date.getTime() - DAY_MS / 2));
  const b = saturnLongitude(new Date(date.getTime() + DAY_MS / 2));
  return orb(b, a) < 0;
}

/** Next station (direction change) after `date`, scanning daily up to 2 years. */
export function nextStation(date: Date): { date: string; to: "retrograde" | "direct" } | null {
  let prevDir = !isRetrograde(date);
  for (let t = date.getTime() + DAY_MS; t < date.getTime() + 730 * DAY_MS; t += DAY_MS) {
    const d = new Date(t);
    const dir = !isRetrograde(d);
    if (dir !== prevDir) return { date: iso(d), to: dir ? "direct" : "retrograde" };
    prevDir = dir;
  }
  return null;
}

export interface NatalSaturn {
  lon: number;
  sign: Sign;
  degree: number;
}

export function natalSaturn(birthUtc: Date): NatalSaturn {
  const lon = saturnLongitude(birthUtc);
  return { lon, sign: signOf(lon), degree: degreeInSign(lon) };
}
