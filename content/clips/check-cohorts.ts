// Checks every cohort's `expect` block in cohorts.json against the site's own maths (src/compute.ts), so the dates
// burned into a clip are the dates the site shows for that birth date and city. Run: bun clips/check-cohorts.ts
// Uses a fixed coordinate table rather than live geocoding; add a city here when you add one to cohorts.json.
import { compute } from "../../src/compute";
import { saturnLongitude, signOf, degreeInSign, natalSaturn, scanReturn, nextStation, type Sign } from "../../src/astro/saturn";
import SIGN_PERIODS from "../../src/content/sign-periods.json";
import { readFileSync } from "node:fs";
import cfg from "./cohorts.json";

export const CITIES: Record<string, { label: string; lat: number; lon: number; tz: string }> = {
  "London": { label: "London", lat: 51.5072, lon: -0.1276, tz: "Europe/London" },
  "New York": { label: "New York", lat: 40.7128, lon: -74.006, tz: "America/New_York" },
  "Los Angeles": { label: "Los Angeles", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" },
  "Sydney": { label: "Sydney", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
  "Toronto": { label: "Toronto", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" },
  "Buriram": { label: "Buriram", lat: 14.9930, lon: 103.1029, tz: "Asia/Bangkok" },
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
if (bad) console.log(`${bad} cohort(s) out of date. Fix the dates in cohorts.json (lines + expect).`);

// ---------- card facts: every full date typed on a carousel slide or quote card (remotion/carousels.json,
// remotion/cards.config.json) must be one of the dates verified below from src/. Cohort and sign cards need no check:
// build-data.ts computes all their dates. ----------
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmt = (iso: string) => `${parseInt(iso.slice(8, 10), 10)} ${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
const plus = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const midSign = (iso: string) => signOf(natalSaturn(new Date(`${iso}T00:00:00Z`)).lon);
const PERIODS = SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>;
const verified = new Set<string>();
let factBad = 0;
const fact = (ok: boolean, what: string, dates: string[]) => {
  console.log(`${ok ? "✓" : "✗"} ${what}`);
  if (ok) dates.forEach((d) => verified.add(d)); else factBad++;
};
// birth range: the kit's convention (launch-kit-v2 (b)) is midnight-UTC sampling: both ends are in the sign at 00:00 UTC
// and the day either side is not, which is sign-periods.json shifted a day. An end day can hold the ingress itself
// (born 7 Apr 1996 at noon UTC is already Aries), which is why every carousel says "born on a boundary day? the site checks".
const birthRange = (sign: Sign, a: string, b: string) => {
  const ok = PERIODS[sign].some((p) => plus(p.from, 1) === a && plus(p.to, 1) === b)
    && midSign(a) === sign && midSign(b) === sign && midSign(plus(a, -1)) !== sign && midSign(plus(b, 1)) !== sign;
  fact(ok, `born ${fmt(a)} – ${fmt(b)} → Saturn in ${sign}`, [fmt(a), fmt(b)]);
};
// window for a sample birth in the range (explicit return number)
const windowOf = (birth: string, rn: 1 | 2, ws: string, we: string | null) => {
  const b = new Date(`${birth}T12:00:00Z`); const w = scanReturn(b, natalSaturn(b).lon, rn);
  const ok = w.windowStart.slice(0, 10) === ws && (we === null || w.windowEnd.slice(0, 10) === we);
  fact(ok, `born ${fmt(birth)}, return ${rn}: window ${fmt(ws)}${we ? ` – ${fmt(we)}` : ""} (site: ${w.windowStart.slice(0, 10)} – ${w.windowEnd.slice(0, 10)})`, we ? [fmt(ws), fmt(we)] : [fmt(ws)]);
};
const transitEnd = (sign: Sign, iso: string) => fact(PERIODS[sign].some((p) => p.to === iso), `Saturn in ${sign} until ${fmt(iso)}`, [fmt(iso)]);
transitEnd("Aries", "2028-04-12");
birthRange("Pisces", "1994-01-29", "1996-04-07"); windowOf("1995-06-01", 1, "2023-03-08", "2026-02-13");
birthRange("Aries", "1996-04-08", "1998-06-09"); birthRange("Aries", "1998-10-26", "1999-03-01"); windowOf("1997-04-01", 1, "2025-05-25", "2028-04-12");
birthRange("Taurus", "1998-06-10", "1998-10-25"); birthRange("Taurus", "1999-03-02", "2000-08-10"); birthRange("Taurus", "2000-10-17", "2001-04-20"); windowOf("1999-04-01", 1, "2028-04-13", "2030-05-31");
birthRange("Aries", "1967-03-04", "1969-04-29"); windowOf("1967-09-01", 2, "2025-05-25", "2028-04-12");
birthRange("Taurus", "1969-04-30", "1971-06-18"); windowOf("1970-06-01", 2, "2028-04-13", null);
{ // the 11 Dec 2026 station at 7.9° Aries (quote card "closest-turn")
  const st = nextStation(new Date("2026-10-01T12:00:00Z")); const deg = degreeInSign(saturnLongitude(new Date("2026-12-11T12:00:00Z")));
  fact(st?.date.slice(0, 10) === "2026-12-11" && st.to === "direct" && deg.toFixed(1) === "7.9", `Saturn turns direct ${st?.date.slice(0, 10)} at ${deg.toFixed(1)}° Aries`, ["11 Dec 2026"]);
}
// sweep: every "D Mon YYYY" (and the "D Mon – D Mon YYYY" short form) on carousels and quote cards
const REMOTION = new URL("../remotion/", import.meta.url);
const texts: Array<[string, string]> = [];
const walk = (where: string, v: unknown) => {
  if (typeof v === "string") texts.push([where, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => walk(`${where}[${i}]`, x));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (k !== "_note" && k !== "source" && k !== "label") walk(`${where}.${k}`, x);
};
walk("carousels", JSON.parse(readFileSync(new URL("carousels.json", REMOTION), "utf8")).carousels);
walk("quotes", JSON.parse(readFileSync(new URL("cards.config.json", REMOTION), "utf8")).quotes);
const M = MON.join("|");
for (const [where, t] of texts) {
  const full = t.replace(new RegExp(`(\\d{1,2}) (${M}) – (\\d{1,2}) (${M}) (\\d{4})`, "g"), "$1 $2 $5 – $3 $4 $5");
  for (const m of full.matchAll(new RegExp(`\\b(\\d{1,2}) (${M}) (\\d{4})\\b`, "g"))) {
    if (!verified.has(m[0])) { console.log(`✗ ${where}: "${m[0]}" is not a verified date`); factBad++; }
  }
}
console.log(`${texts.length} card strings swept for dates`);
// clip captions: every full date in a hook or line is one of that cohort's passes / window ends or a verified fact
// above, and every "N° Sign" is the natal degree (floored, as the site shows it), or Saturn's today after "Today:"
// The spoken script (`vo`) is swept the same way: "N degrees Sign" is the natal degree unless followed by "today";
// "Yours is at N" is natal; "at N today" / "N degrees Sign today" is today's degree (floored); "just under N today" means
// today's degree is in [N-1, N).
type Clip = { id: string; date: string; city: string; time: string | null; hook: string; lines: string[]; vo?: { hook: string; lines: string[] } };
const CLIPS = cfg.cohorts as Clip[];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const words: Record<string, string> = Object.fromEntries(MON.map((m, i) => [LONG_MONTHS[i], m]));
function sweepClip(c: Clip, day: Date, label: string, skipToday = false): number {
  const place = CITIES[c.city]; if (!place) return 0;
  const r = compute({ date: c.date, time: c.time, place }, day);
  const lon = saturnLongitude(day); const todayDeg = degreeInSign(lon);
  const own = new Set([c.date, ...r.window.hits, r.window.windowStart, r.window.windowEnd].map((x) => fmt(x.slice(0, 10))));
  let n = 0;
  const fail = (msg: string) => { console.log(`✗ clip ${c.id}${label}: ${msg}`); n++; };
  const shown = [c.hook, ...c.lines], spoken = c.vo ? [c.vo.hook, ...c.vo.lines] : [];
  for (const t of [...shown, ...spoken]) {
    const norm = t.replace(new RegExp(`(\\d{1,2}) (${LONG_MONTHS.join("|")}) (\\d{4})`, "g"), (_, d, m, y) => `${d} ${words[m]} ${y}`);
    for (const m of norm.matchAll(new RegExp(`\\b(\\d{1,2}) (${M}) (\\d{4})\\b`, "g"))) {
      if (!own.has(m[0]) && !verified.has(m[0])) fail(`"${m[0]}" in "${t}" is not one of its dates`);
    }
  }
  for (const t of shown) for (const m of t.matchAll(/(Today: )?(\d{1,2})° ([A-Z][a-z]+)/g)) {
    if (m[1] && skipToday) continue;
    const want = m[1] ? `${Math.floor(todayDeg)}° ${signOf(lon)}` : `${Math.floor(r.degree)}° ${r.sign}`;
    if (`${m[2]}° ${m[3]}` !== want) fail(`"${m[0]}" but the site shows ${want}`);
  }
  for (const t of spoken) {
    for (const m of t.matchAll(/(\d{1,2}) degrees ([A-Z][a-z]+)( today)?/g)) {
      if (m[3] && skipToday) continue;
      const want = m[3] ? `${Math.floor(todayDeg)} ${signOf(lon)}` : `${Math.floor(r.degree)} ${r.sign}`;
      if (`${m[1]} ${m[2]}` !== want) fail(`VO "${m[0]}" but the site shows ${want}`);
    }
    for (const m of t.matchAll(/Yours is at (\d{1,2})\b/g)) if (+m[1] !== Math.floor(r.degree)) fail(`VO "${m[0]}" but natal is ${Math.floor(r.degree)}°`);
    if (skipToday) continue;
    for (const m of t.matchAll(/\bat (\d{1,2}) today/g)) if (+m[1] !== Math.floor(todayDeg)) fail(`VO "${m[0]}" but Saturn is ${todayDeg.toFixed(2)}°`);
    for (const m of t.matchAll(/just under (\d{1,2}) today/g)) if (!(todayDeg >= +m[1] - 1 && todayDeg < +m[1])) fail(`VO "${m[0]}" but Saturn is ${todayDeg.toFixed(2)}°`);
  }
  return n;
}
// with --plan, a scheduled clip's "today" statements are checked on its posting day (below), not on TODAY
const planIdx = process.argv.indexOf("--plan");
const plan = planIdx > 0 ? JSON.parse(readFileSync(process.argv[planIdx + 1], "utf8")) : null;
const posts = (plan ? (Array.isArray(plan) ? plan : plan.posts) : []) as Array<{ date: string; asset?: string }>;
const scheduled = new Set(posts.map((p) => p.asset?.replace(/_vo$/, "")));
for (const c of CLIPS) factBad += sweepClip(c, today, "", scheduled.has(c.id));
console.log(`${CLIPS.length} clips' captions and VO scripts swept for dates and degrees`);
// --plan <plan.json>: also check each clip against Saturn on the day it's scheduled to post ("Today: 10°" is only true
// for a few days; the site rounds the degree down).
if (plan) {
  let k = 0;
  for (const p of posts) {
    const c = CLIPS.find((x) => x.id === p.asset?.replace(/_vo$/, "")); if (!c) continue;
    const bad = sweepClip(c, new Date(`${p.date}T12:00:00Z`), ` (posting ${p.date})`); factBad += bad; k++;
    if (!bad) console.log(`✓ clip ${c.id} on its posting day ${p.date} (Saturn ${degreeInSign(saturnLongitude(new Date(`${p.date}T12:00:00Z`))).toFixed(2)}°)`);
  }
  console.log(`${k} scheduled clip(s) checked against their posting day`);
}
if (factBad) console.log(`${factBad} card fact(s) failed. Fix remotion/carousels.json or cards.config.json.`);
if (bad || factBad) process.exit(1);
