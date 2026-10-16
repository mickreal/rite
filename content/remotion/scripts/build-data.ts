// Builds the data the Remotion cards render from, using the site's own code in src/ (run with bun):
//   bun remotion/scripts/build-data.ts            (from content/)   TODAY=2026-10-17 to pin "today"
// Writes remotion/data/signs.json, cohorts.json and quotes.json. Nothing here is typed by hand except the cohort
// birth ranges and quote lines in remotion/cards.config.json; every date on a card is computed.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import SIGN_PERIODS from "../../../src/content/sign-periods.json";
import { SIGN_PAGES } from "../../../src/content/signs";
import { SIGNS, type Sign, saturnLongitude, signOf, degreeInSign, scanReturn, relevantReturnNumber, natalSaturn } from "../../../src/astro/saturn";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "..", "data");
mkdirSync(DATA, { recursive: true });
const cfg = JSON.parse(readFileSync(join(HERE, "..", "cards.config.json"), "utf8")) as {
  site: string;
  cohorts: Array<{ id: string; label: string; ranges: Array<[string, string]>; note?: string }>;
  quotes: Array<{ id: string; text?: string; signOpener?: Sign; footer: string; source: string }>;
};
const SITE = process.env.SITE ?? cfg.site;
const today = process.env.TODAY ? new Date(`${process.env.TODAY}T12:00:00Z`) : new Date();
const NOW = today.toISOString().slice(0, 10);

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (iso: string) => `${parseInt(iso.slice(8, 10), 10)} ${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
const month = (iso: string) => `${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
const monthL = (iso: string) => `${MONL[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(0, 4)}`;
/** "Apr – Jun 2026", "Nov 2027 – Jan 2028", "May 2026" */
const monthRange = (a: string, b: string) => {
  if (a.slice(0, 7) === b.slice(0, 7)) return month(a);
  if (a.slice(0, 4) === b.slice(0, 4)) return `${MON[parseInt(a.slice(5, 7), 10) - 1]} – ${month(b)}`;
  return `${month(a)} – ${month(b)}`;
};
const GLYPH: Record<Sign, string> = { Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓" };
const wa = (natalLon: number) => (((saturnLongitude(today) - natalLon) % 360) + 360) % 360;

// ---------- signs: same selection logic as signData() in src/index.ts (keep in step if that changes) ----------
type Period = { from: string; to: string };
function signData(sign: Sign) {
  const periods = (SIGN_PERIODS as Record<string, Period[]>)[sign];
  const groups: Period[][] = [];
  for (const p of periods) { const g = groups[groups.length - 1]; if (g && Date.parse(p.from) - Date.parse(g[g.length - 1].to) < 548 * 86400000) g.push(p); else groups.push([p]); }
  const now = NOW;
  const inside = groups.find((g) => now >= g[0].from && now <= g[g.length - 1].to);
  const nextG = groups.find((g) => g[0].from > now), prevG = [...groups].reverse().find((g) => g[g.length - 1].to < now);
  const nearer = !nextG ? prevG! : !prevG ? nextG : Date.parse(now) - Date.parse(prevG[prevG.length - 1].to) <= Date.parse(nextG[0].from) - Date.parse(now) ? prevG : nextG;
  const cur = inside ?? nearer;
  const y = (iso: string, dy: number) => `${parseInt(iso.slice(0, 4), 10) + dy}${iso.slice(4)}`;
  const start = cur[0].from;
  const pick = (lo: number, hi: number) => groups.filter((g) => g[0].from >= y(start, lo) && g[0].from <= y(start, hi)).flat();
  return { current: cur, firstBorn: pick(-33, -26), secondBorn: pick(-63, -55) };
}
const days = (p: Period) => Date.parse(p.to) - Date.parse(p.from);
const bornText = (ps: Period[]) => {
  if (!ps.length) return { main: "No one this cycle", also: [] as string[] };
  const main = ps.reduce((a, b) => (days(b) > days(a) ? b : a));
  return { main: `${month(main.from)} – ${month(main.to)}`, also: ps.filter((p) => p !== main).map((p) => `${month(p.from)} – ${month(p.to)}`) };
};

const signs = SIGNS.map((sign, i) => {
  const d = signData(sign);
  const first = d.current[0], last = d.current[d.current.length - 1];
  const main = d.current.reduce((a, b) => (days(b) > days(a) ? b : a));
  const status = NOW >= first.from && NOW <= last.to ? "now" : NOW < first.from ? "next" : "recent";
  const statusLine = status === "now" ? `Saturn is in ${sign} until ${day(last.to)}` : status === "next" ? `Saturn enters ${sign} on ${day(first.from)}` : `Saturn left ${sign} on ${day(last.to)}`;
  // the dial: how far round the cycle someone with Saturn in the middle of this sign is today (0/360 = at the return point)
  const angle = +wa(i * 30 + 15).toFixed(1);
  return {
    sign, slug: sign.toLowerCase(), glyph: GLYPH[sign], status, statusLine, angle,
    transit: { from: day(first.from), to: day(last.to), main: `${day(main.from)} – ${day(main.to)}`, parts: d.current.map((p) => `${day(p.from)} – ${day(p.to)}`) },
    firstBorn: bornText(d.firstBorn), secondBorn: bornText(d.secondBorn),
    opener: SIGN_PAGES[sign].opener,
  };
});

// ---------- cohorts: sample every birth date in the band (noon UTC, as /api/calc does) and summarise the passes ----------
const addDay = (iso: string) => new Date(Date.parse(iso) + 86400000).toISOString().slice(0, 10);
const cohorts = cfg.cohorts.map((c) => {
  const runs: Array<{ hits: string[]; sign: Sign; rn: number; ws: string; we: string }> = [];
  for (const [a, b] of c.ranges) for (let d = a; d <= b; d = addDay(d)) {
    const birth = new Date(`${d}T12:00:00Z`);
    const n = natalSaturn(birth); const rn = relevantReturnNumber(birth, today); const w = scanReturn(birth, n.lon, rn);
    runs.push({ hits: w.hits.map((h) => h.slice(0, 10)), sign: n.sign as Sign, rn, ws: w.windowStart.slice(0, 10), we: w.windowEnd.slice(0, 10) });
  }
  // a band edge that lands in the next sign (the kit's ranges are day-rounded) is dropped, with a note
  const bySign = new Map<string, number>(); for (const r of runs) bySign.set(r.sign, (bySign.get(r.sign) ?? 0) + 1);
  const mainSign = [...bySign.entries()].sort((x, y) => y[1] - x[1])[0][0];
  if (bySign.size > 1) console.warn(`  ${c.id}: dropped ${runs.length - bySign.get(mainSign)!} edge day(s) not in ${mainSign}`);
  runs.splice(0, runs.length, ...runs.filter((r) => r.sign === mainSign));
  const signsSeen = [mainSign], rns = [...new Set(runs.map((r) => r.rn))];
  if (rns.length > 1) console.warn(`! ${c.id}: band mixes return numbers ${rns.join("/")} — check its ranges`);
  const counts = new Map<number, number>(); for (const r of runs) counts.set(r.hits.length, (counts.get(r.hits.length) ?? 0) + 1);
  const mode = [...counts.entries()].sort((x, y) => y[1] - x[1])[0][0];
  if (counts.size > 1) console.warn(`  ${c.id}: pass counts ${[...counts.entries()].map(([k, v]) => `${k}×${v}`).join(", ")}; card uses ${mode}`);
  const typical = runs.filter((r) => r.hits.length === mode);
  const spread = (hs: string[]) => (Date.parse(hs[hs.length - 1]) - Date.parse(hs[0])) / 86400000;
  const perPass = Array.from({ length: mode }, (_, k) => typical.map((r) => r.hits[k]).sort());
  // a wide band (a whole sign) has passes all over the window: say so instead of listing meaningless ranges
  const wide = perPass.some((hs) => spread(hs) > 190);
  const allHits = runs.flatMap((r) => r.hits).sort();
  const passes = wide ? [] : perPass.map((hs) => monthRange(hs[0], hs[hs.length - 1]));
  const passSpan = wide ? `One or three exact passes between ${month(allHits[0])} and ${month(allHits[allHits.length - 1])}` : null;
  const ws = runs.map((r) => r.ws).sort()[0], we = runs.map((r) => r.we).sort().reverse()[0];
  const open = NOW >= ws && NOW <= we;
  const fmtBand = ([a, b]: [string, string]) => (a.slice(0, 4) === b.slice(0, 4) ? `${day(a).replace(/ \d{4}$/, "")} – ${day(b)}` : `${day(a)} – ${day(b)}`);
  return {
    id: c.id, label: c.label, sign: signsSeen[0], returnNumber: rns[0],
    born: fmtBand(c.ranges[0]), alsoBorn: c.ranges.slice(1).map(fmtBand),
    state: open ? "open" : NOW < ws ? "opens" : "closed",
    headline: open ? "open now" : NOW < ws ? `opens ${monthL(ws)}` : `closed ${monthL(we)}`,
    window: `${day(ws)} – ${day(we)}`, passCount: mode, passes, passSpan, note: c.note ?? null,
  };
});

// ---------- quotes ----------
const quotes = cfg.quotes.map((q) => ({ id: q.id, text: q.signOpener ? SIGN_PAGES[q.signOpener].opener : q.text!, footer: q.footer, source: q.source }));

writeFileSync(join(DATA, "signs.json"), JSON.stringify({ today: NOW, site: SITE, signs }, null, 1));
writeFileSync(join(DATA, "cohorts.json"), JSON.stringify({ today: NOW, site: SITE, cohorts }, null, 1));
writeFileSync(join(DATA, "quotes.json"), JSON.stringify({ site: SITE, quotes }, null, 1));
const sl = saturnLongitude(today);
console.log(`Data for ${NOW} (Saturn ${degreeInSign(sl).toFixed(1)}° ${signOf(sl)}): ${signs.length} signs, ${cohorts.length} cohorts, ${quotes.length} quotes → remotion/data/`);
for (const c of cohorts) console.log(`  ${c.id}: born ${c.born}${c.alsoBorn.length ? ` (+${c.alsoBorn.length})` : ""} · ${c.headline} · ${c.passSpan ?? c.passes.join(" / ")}`);
