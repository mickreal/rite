// Checks every cohort's `expect` block in cohorts.json against the site's own maths (src/compute.ts), so the dates
// burned into a clip are the dates the site shows for that birth date and city. Run: bun clips/check-cohorts.ts
// Uses a fixed coordinate table rather than live geocoding; add a city here when you add one to cohorts.json.
import { compute, cycle } from "../../src/compute";
import { saturnLongitude, signOf, degreeInSign, natalSaturn, scanReturn, nextStation, type Sign } from "../../src/astro/saturn";
import SIGN_PERIODS from "../../src/content/sign-periods.json";
import { readFileSync } from "node:fs";
import cfg from "./cohorts.json";
import { unspeak } from "./spoken";
import { planPosts } from "../scripts/plan-posts";
import { RAW as REELS, reelTexts } from "../remotion/src/reels";
import { passed, relative } from "../scripts/stale";

export const CITIES: Record<string, { label: string; lat: number; lon: number; tz: string }> = {
  "London": { label: "London", lat: 51.5072, lon: -0.1276, tz: "Europe/London" },
  "New York": { label: "New York", lat: 40.7128, lon: -74.006, tz: "America/New_York" },
  "Los Angeles": { label: "Los Angeles", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" },
  "Sydney": { label: "Sydney", lat: -33.8688, lon: 151.2093, tz: "Australia/Sydney" },
  "Toronto": { label: "Toronto", lat: 43.6532, lon: -79.3832, tz: "America/Toronto" },
  "Buriram": { label: "Buriram", lat: 14.9930, lon: 103.1029, tz: "Asia/Bangkok" },
  "Columbus, Ohio": { label: "Columbus", lat: 39.9612, lon: -82.9988, tz: "America/New_York" },
  "Quakertown": { label: "Quakertown", lat: 40.4418, lon: -75.3416, tz: "America/New_York" },
  "Chester, England": { label: "Chester", lat: 53.1934, lon: -2.8931, tz: "Europe/London" },
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
{ // the 27 Jul 2026 station at 14.7° Aries (carousel 3)
  const st = nextStation(new Date("2026-07-01T12:00:00Z")); const deg = degreeInSign(saturnLongitude(new Date("2026-07-27T12:00:00Z")));
  fact(st?.date.slice(0, 10) === "2026-07-27" && st.to === "retrograde" && deg.toFixed(1) === "14.7", `Saturn stops ${st?.date.slice(0, 10)} at ${deg.toFixed(1)}° Aries`, ["27 Jul 2026"]);
}
// a named birth (celebrity rows in launch-kit-v2 (h), worked examples): noon local at the city, no birth time, as the
// site computes it. Its passes become verified dates; its floored degree a verified "N degrees Sign".
const verifiedDeg = new Set<string>(["7.9 Aries", "14.7 Aries"]);
const birth = (who: string, date: string, city: string, hits: string[]) => {
  const place = CITIES[city];
  const r = compute({ date, time: null, place }, new Date("2026-11-01T12:00:00Z"));
  const got = r.window.hits.map((h) => h.slice(0, 10));
  fact(JSON.stringify(got) === JSON.stringify(hits), `${who}, born ${fmt(date)} in ${city}: ${Math.floor(r.degree)}° ${r.sign}, passes ${got.map(fmt).join(", ")}`, [fmt(date), ...hits.map(fmt)]);
  verifiedDeg.add(`${Math.floor(r.degree)} ${r.sign}`);
  return r;
};
birth("Example (kit (b))", "1997-04-01", "New York", ["2026-05-13", "2026-10-15", "2027-02-03"]);
birth("Simone Biles", "1997-03-14", "Columbus, Ohio", ["2026-04-23", "2026-11-22", "2026-12-29"]);
birth("Kylie Jenner", "1997-08-10", "Los Angeles", ["2027-04-28"]);
birth("Jennifer Aniston", "1969-02-11", "Los Angeles", ["2027-05-05", "2027-12-15", "2028-01-01"]);
birth("Daniel Craig", "1968-03-02", "Chester, England", ["2026-05-20", "2026-10-05", "2027-02-11"]);
birth("Sabrina Carpenter", "1999-05-11", "Quakertown", ["2028-06-26", "2028-10-21", "2029-03-16"]);
birth("Example (kit (b), early degrees)", "1996-09-01", "London", ["2026-04-03"]);
{ // Simone Biles: the 11 Dec 2026 station within half a degree of her natal Saturn (Script 8)
  const r = compute({ date: "1997-03-14", time: null, place: CITIES["Columbus, Ohio"] }, new Date("2026-11-01T12:00:00Z"));
  const t = cycle(r, new Date("2026-11-01T12:00:00Z")).turn;
  fact(t?.date.slice(0, 10) === "2026-12-11" && t.orb < 0.5, `Simone Biles: closest turn ${t?.date.slice(0, 10)} at ${t?.orb}° (under half a degree)`, []);
}
// a birth band: every day in it (noon UTC, London) satisfies `ok`. Band edges move by a day with birth time and place,
// which is why the cards say "born on a boundary day? the site checks"; the day either side failing is reported, not required.
const LONDON = CITIES["London"];
const band = (what: string, a: string, b: string, ok: (iso: string) => boolean) => {
  let all = true; for (let d = a; d <= b; d = plus(d, 1)) if (!ok(d)) { all = false; console.log(`    ${what}: born ${fmt(d)} does not qualify`); break; }
  const edges = [!ok(plus(a, -1)), !ok(plus(b, 1))];
  fact(all, `${what}: born ${fmt(a)} – ${fmt(b)}${edges.every(Boolean) ? "" : " (inside; a day either side also qualifies)"}`, [fmt(a), fmt(b)]);
};
const ON = new Date("2026-11-01T12:00:00Z");
const passesOf = (iso: string) => compute({ date: iso, time: null, place: LONDON }, ON).window.hits.map((h) => h.slice(0, 10));
const threeIn2026Loop = (iso: string) => { const h = passesOf(iso); return h.length === 3 && h[0] >= "2026-04-01" && h[2] <= "2027-03-31"; };
band("Three passes in the 2026 loop", "1997-03-12", "1997-05-06", threeIn2026Loop);
band("Three passes in the 2026 loop", "1997-11-10", "1998-01-21", threeIn2026Loop);
band("Three passes in the 2026 loop (second return)", "1967-05-09", "1967-10-16", threeIn2026Loop);
band("Three passes in the 2026 loop (second return)", "1968-01-30", "1968-03-30", threeIn2026Loop); // kit (b)/(e) say 29 Jan: 7.90°, one pass
const closestTurn = (iso: string) => { const r = compute({ date: iso, time: null, place: LONDON }, ON); const t = cycle(r, ON).turn; return !!t && t.date.slice(0, 10) === "2026-12-11" && t.orb <= 1.0; };
// separating: Saturn in Aries at birth, first return, every pass done by 19 Apr 2026 (presenter reel integration-1996)
const separating = (iso: string) => { const r = compute({ date: iso, time: null, place: LONDON }, ON); const h = r.window.hits.map((x) => x.slice(0, 10)); return r.sign === "Aries" && r.returnNumber === 1 && h.length > 0 && h[h.length - 1] <= "2026-04-19"; };
band("Separating, last pass by 19 Apr 2026", "1996-04-08", "1997-03-11", separating);
fact(compute({ date: "1997-03-11", time: null, place: LONDON }, ON).window.hits.some((h) => h.startsWith("2026-04-19")), "born 11 Mar 1997: last pass 19 Apr 2026 (the band's latest)", ["19 Apr 2026"]);
band("Closest turn 11 Dec 2026 within a degree", "1996-06-24", "1996-08-11", closestTurn);
band("Closest turn 11 Dec 2026 within a degree", "1997-03-04", "1997-03-19", closestTurn);
band("Closest turn 11 Dec 2026 within a degree (second return)", "1967-04-30", "1967-05-18", closestTurn);
band("Closest turn 11 Dec 2026 within a degree (second return)", "1967-10-04", "1967-10-31", closestTurn);
band("Closest turn 11 Dec 2026 within a degree (second return)", "1968-01-16", "1968-02-09", closestTurn);
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
/** Short forms to full dates: "4 Mar – 19 Mar 1997" style ranges ("12 Mar – 6 May 1997", "12 Mar and 6 May 1997",
 * "4 – 19 Mar 1997", "4 to 19 Mar 1997") get the year (and month) on both ends. */
const expand = (t: string) => t
  .replace(new RegExp(`(\\d{1,2}) (${M}) (–|to|and) (\\d{1,2}) (${M}) (\\d{4})`, "g"), "$1 $2 $6 $3 $4 $5 $6")
  .replace(new RegExp(`\\b(\\d{1,2}) (–|to) (\\d{1,2}) (${M}) (\\d{4})`, "g"), "$1 $4 $5 $2 $3 $4 $5");
for (const [where, t] of texts) {
  const full = expand(t);
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
  const shown = [c.hook, ...c.lines], spoken = c.vo ? [c.vo.hook, ...c.vo.lines].map(unspeak) : []; // VO dates and numbers are spelled out
  for (const t of [...shown, ...spoken]) {
    const norm = expand(t).replace(new RegExp(`(\\d{1,2}) (${LONG_MONTHS.join("|")}) (\\d{4})`, "g"), (_, d, m, y) => `${d} ${words[m]} ${y}`);
    for (const m of norm.matchAll(new RegExp(`\\b(\\d{1,2}) (${M}) (\\d{4})\\b`, "g"))) {
      if (!own.has(m[0]) && !verified.has(m[0])) fail(`"${m[0]}" in "${t}" is not one of its dates`);
    }
  }
  for (const t of shown) for (const m of t.matchAll(/(Today: )?(\d{1,2})° ([A-Z][a-z]+)/g)) {
    if (m[1] && skipToday) continue;
    const want = m[1] ? `${Math.floor(todayDeg)}° ${signOf(lon)}` : `${Math.floor(r.degree)}° ${r.sign}`;
    if (`${m[2]}° ${m[3]}` !== want) fail(`"${m[0]}" but the site shows ${want}`);
  }
  if (c.vo) for (const t of [c.vo.hook, ...c.vo.lines]) if (/\d/.test(t.replace(/\[pause \d+\]/g, ""))) fail(`VO "${t}" has digits: spell numbers and dates as words for the voice`);
  for (const t of spoken) {
    for (const m of t.matchAll(/(?<![\d.])(\d{1,2}) degrees ([A-Z][a-z]+)( today)?/g)) {
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
const posts = (plan ? planPosts(plan) : []) as Array<{ date: string; asset?: string; interim?: string }>; // + fallback posts
const scheduled = new Set(posts.map((p) => p.asset?.replace(/_vo$/, "")));
for (const c of CLIPS) factBad += sweepClip(c, today, "", plan ? true : scheduled.has(c.id)); // with a plan, "today" lines are checked on each posting day below (unscheduled clips are not in this batch)
console.log(`${CLIPS.length} clips' captions and VO scripts swept for dates and degrees`);
// card voiceovers (clips/card-vo.json, { "<card id>": text }): spelled out, and every full date spoken is a verified
// fact, one of the card's own birth-range ends (cohort cards, from cards.config.json) or one of the sign's transit dates
// (sign cards, from sign-periods.json); every "N degrees Sign" is a verified degree.
{
  const VO = JSON.parse(readFileSync(new URL("card-vo.json", import.meta.url), "utf8")) as Record<string, string>;
  const CARDS = JSON.parse(readFileSync(new URL("cards.config.json", REMOTION), "utf8")) as { cohorts: Array<{ id: string; ranges: Array<[string, string]> }>; quotes: Array<{ id: string }> };
  let k = 0;
  for (const [id, text] of Object.entries(VO)) {
    if (id.startsWith("_")) continue;
    k++;
    const fail = (msg: string) => { console.log(`✗ card VO ${id}: ${msg}`); factBad++; };
    const own = new Set<string>();
    const coh = CARDS.cohorts.find((c) => `cohort-${c.id}` === id);
    if (coh) coh.ranges.flat().forEach((d) => own.add(fmt(d)));
    const sg = /^sign-(.+)$/.exec(id)?.[1];
    if (sg) { const name = sg[0].toUpperCase() + sg.slice(1); const ps = PERIODS[name]; if (!ps) fail(`no sign "${name}"`); else ps.forEach((p) => { own.add(fmt(p.from)); own.add(fmt(p.to)); }); }
    if (!coh && !sg && !CARDS.quotes.some((q) => `quote-${q.id}` === id)) fail("no such card in cards.config.json");
    if (/\d/.test(text)) fail("has digits: spell numbers and dates as words for the voice");
    const norm = expand(unspeak(text));
    for (const m of norm.matchAll(new RegExp(`\\b(\\d{1,2}) (${M}) (\\d{4})\\b`, "g"))) if (!own.has(m[0]) && !verified.has(m[0])) fail(`"${m[0]}" is not a verified date`);
    for (const m of norm.matchAll(/(?<![\d.])(\d{1,2}(?:\.\d)?) degrees ([A-Z][a-z]+)/g)) if (!verifiedDeg.has(`${m[1]} ${m[2]}`)) fail(`"${m[0]}" is not a verified degree`);
  }
  console.log(`${k} card voiceovers swept for dates and degrees`);
}
// presenter reels (remotion/presenter.json, resolved by remotion/src/reels.ts): every full date shown or spoken is
// verified, every "N° Sign" / "N degrees Sign" a verified degree, and the spoken script is spelled out
{
  let k = 0;
  for (const r of REELS) {
    k++;
    const fail = (msg: string) => { console.log(`✗ presenter ${r.id}: ${msg}`); factBad++; };
    let tx: { spoken: string[]; shown: string[] };
    try { tx = reelTexts(r.id); } catch (e) { fail(String((e as Error).message)); continue; }
    for (const t of tx.spoken) if (/\d/.test(t.replace(/\[pause \d+\]/g, ""))) fail(`VO "${t}" has digits: spell numbers and dates as words for the voice`);
    for (const t of [...tx.shown, ...tx.spoken.map(unspeak)]) {
      const norm = expand(t.replace(/\u00A0/g, " ")).replace(new RegExp(`(\\d{1,2}) (${LONG_MONTHS.join("|")}) (\\d{4})`, "g"), (_, d, m, y) => `${d} ${words[m]} ${y}`);
      for (const m of norm.matchAll(new RegExp(`\\b(\\d{1,2}) (${M}) (\\d{4})\\b`, "g"))) if (!verified.has(m[0])) fail(`"${m[0]}" in "${t}" is not a verified date`);
      for (const m of norm.matchAll(/(?<![\d.])(\d{1,2}(?:\.\d)?)(?:°| degrees) ([A-Z][a-z]+)/g)) if (!verifiedDeg.has(`${m[1]} ${m[2]}`)) fail(`"${m[0]}" in "${t}" is not a verified degree`);
    }
  }
  console.log(`${k} presenter reels swept for dates and degrees`);
}

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
// --plan: a presenter reel (or its interim version) posts inside its `postBetween` range, and nothing it shows or says
// names a date that was ahead when it was written and has passed by its posting day (scripts/stale.ts, as the captions)
if (plan) {
  let k = 0;
  for (const p of posts) for (const a of [p.asset, p.interim]) {
    const r = REELS.find((x) => x.id === a); if (!r) continue;
    k++;
    const base = r.interimOf ? REELS.find((x) => x.id === r.interimOf) : r;
    const range = base?.postBetween;
    if (range && (p.date < range[0] || p.date > range[1])) { console.log(`✗ presenter ${a} (posting ${p.date}): outside ${range[0]} – ${range[1]} (${base?.postWhy ?? ""})`); factBad++; continue; }
    const tx = reelTexts(r.id);
    const d = passed([...tx.shown, ...tx.spoken], p.date, { marginDays: 0, months: false });
    if (d) { console.log(`✗ presenter ${a} (posting ${p.date}): ${d}`); factBad++; continue; }
    const rel = relative(tx.spoken.length ? tx.spoken : tx.shown);
    console.log(`✓ presenter ${a} on its posting day ${p.date}${range ? ` (inside ${range[0]} – ${range[1]})` : ""}${rel ? `; says ${rel}: true while ${base?.postWhy ?? "reread"}` : ""}`);
  }
  console.log(`${k} scheduled presenter reel(s) checked against their posting day`);
}
if (factBad) console.log(`${factBad} card fact(s) failed. Fix remotion/carousels.json or cards.config.json.`);
if (bad || factBad) process.exit(1);
