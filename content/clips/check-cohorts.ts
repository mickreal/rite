// Checks every cohort's `expect` block in cohorts.json against the site's own maths (src/compute.ts), so the dates
// burned into a clip are the dates the site shows for that birth date and city. Run: bun clips/check-cohorts.ts
// Uses a fixed coordinate table rather than live geocoding; add a city here when you add one to cohorts.json.
import { compute } from "../../src/compute";
import { saturnLongitude, signOf, degreeInSign } from "../../src/astro/saturn";
import cfg from "./cohorts.json";

export const CITIES: Record<string, { label: string; lat: number; lon: number; tz: string }> = {
  "London": { label: "London", lat: 51.5072, lon: -0.1276, tz: "Europe/London" },
  "New York": { label: "New York", lat: 40.7128, lon: -74.006, tz: "America/New_York" },
  "Los Angeles": { label: "Los Angeles", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" },
  "Sydney": { label: "Sydney", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
  "Toronto": { label: "Toronto", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" },
};

const today = process.env.TODAY ? new Date(`${process.env.TODAY}T12:00:00Z`) : new Date();
const sl = saturnLongitude(today);
console.log(`Saturn today (${today.toISOString().slice(0, 10)}): ${degreeInSign(sl).toFixed(1)}° ${signOf(sl)}`);
let bad = 0;
for (const c of cfg.cohorts) {
  const place = CITIES[c.city];
  if (!place) { console.log(`✗ ${c.id}: no coordinates for "${c.city}" in CITIES`); bad++; continue; }
  const r = compute({ date: c.date, time: c.time, place }, today);
  const got = { sign: r.sign, returnNumber: r.returnNumber, hits: r.window.hits.map((h) => h.slice(0, 10)), windowStart: r.window.windowStart.slice(0, 10), windowEnd: r.window.windowEnd.slice(0, 10) };
  const errs: string[] = [];
  for (const [k, v] of Object.entries(c.expect)) {
    const g = (got as Record<string, unknown>)[k];
    if (JSON.stringify(g) !== JSON.stringify(v)) errs.push(`${k}: expected ${JSON.stringify(v)}, site says ${JSON.stringify(g)}`);
  }
  console.log(`${errs.length ? "✗" : "✓"} ${c.id}: ${r.degree.toFixed(1)}° ${r.sign}, return ${r.returnNumber}, passes ${got.hits.join(", ")}, window ${got.windowStart} – ${got.windowEnd}`);
  for (const e of errs) console.log(`    ${e}`);
  bad += errs.length ? 1 : 0;
}
if (bad) { console.log(`${bad} cohort(s) out of date. Fix the dates in cohorts.json (lines + expect).`); process.exit(1); }
