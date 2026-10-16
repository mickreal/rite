// Placidus house cusps + Ascendant/MC. Whole Sign fallback for |lat| > 66°.
// Inputs: UTC instant, geographic lat (north +), lon (east +). Output: 12 cusp longitudes (tropical, of date).
// Verified against Swiss Ephemeris swe_houses('P') in test/houses.test.ts.

import * as A from "astronomy-engine";

const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const norm = (x: number) => ((x % 360) + 360) % 360;

/** True obliquity of the ecliptic (degrees). */
function obliquity(t: A.AstroTime): number {
  return A.e_tilt(t).tobl;
}

/** Right ascension of the MC = local apparent sidereal time in degrees. */
function armc(t: A.AstroTime, lonEast: number): number {
  return norm(A.SiderealTime(t) * 15 + lonEast);
}

/** Ecliptic longitude of the point on the ecliptic with right ascension `ra`. */
function raToLon(ra: number, eps: number): number {
  return norm(Math.atan2(Math.sin(ra * D2R), Math.cos(ra * D2R) * Math.cos(eps * D2R)) * R2D);
}

function ascendant(ramc: number, eps: number, lat: number): number {
  const r = ramc * D2R, e = eps * D2R, p = lat * D2R;
  return norm(Math.atan2(Math.cos(r), -(Math.sin(r) * Math.cos(e) + Math.tan(p) * Math.sin(e))) * R2D);
}

/**
 * Placidus cusp. A point on the ecliptic with RA α has declination δ = atan(tan ε · sin α)
 * and diurnal semi-arc SA = acos(-tan φ · tan δ). Cusps sit at fixed fractions of the semi-arc
 * measured from the meridian:
 *   11: RA = RAMC + SA/3        12: RA = RAMC + 2·SA/3
 *    2: RA = RAMC + 60 + 2·SA/3  3: RA = RAMC + 120 + SA/3
 * (the nocturnal forms simplify to these because SA_n = 180 − SA_d). Solve by fixed-point iteration.
 */
function placidus(ramc: number, eps: number, lat: number, offset: number, frac: number): number {
  let ra = norm(ramc + offset + frac * 90); // start from the equator solution
  for (let i = 0; i < 60; i++) {
    const dec = Math.atan(Math.tan(eps * D2R) * Math.sin(ra * D2R));
    let x = -Math.tan(lat * D2R) * Math.tan(dec);
    x = Math.max(-1, Math.min(1, x));
    const sa = Math.acos(x) * R2D;
    const next = norm(ramc + offset + frac * sa);
    const delta = Math.abs(norm(next - ra + 180) - 180);
    ra = next;
    if (delta < 1e-7) break;
  }
  return raToLon(ra, eps);
}

export interface Houses {
  system: "placidus" | "whole";
  asc: number;
  mc: number;
  cusps: number[]; // index 0 = cusp 1 … index 11 = cusp 12
}

export function houses(date: Date, lat: number, lonEast: number): Houses {
  const t = A.MakeTime(date);
  const eps = obliquity(t);
  const ramc = armc(t, lonEast);
  const asc = ascendant(ramc, eps, lat);
  const mc = raToLon(ramc, eps);

  if (Math.abs(lat) > 66) {
    const start = Math.floor(asc / 30) * 30;
    return { system: "whole", asc, mc, cusps: Array.from({ length: 12 }, (_, i) => norm(start + i * 30)) };
  }

  const c11 = placidus(ramc, eps, lat, 0, 1 / 3);
  const c12 = placidus(ramc, eps, lat, 0, 2 / 3);
  const c2 = placidus(ramc, eps, lat, 60, 2 / 3);
  const c3 = placidus(ramc, eps, lat, 120, 1 / 3);
  const cusps = [
    asc, c2, c3, norm(mc + 180), norm(c11 + 180), norm(c12 + 180),
    norm(asc + 180), norm(c2 + 180), norm(c3 + 180), mc, c11, c12,
  ];
  return { system: "placidus", asc, mc, cusps };
}

/** House number (1–12) containing ecliptic longitude `lon`. */
export function houseOf(lon: number, h: Houses): number {
  for (let i = 0; i < 12; i++) {
    const a = h.cusps[i], b = h.cusps[(i + 1) % 12];
    const span = norm(b - a), off = norm(lon - a);
    if (off < span) return i + 1;
  }
  return 12;
}
