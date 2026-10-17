#!/usr/bin/env bun
// The calendar after the launch plan: one week of posts, generated from what's already written and rendered, so the
// scheduled render never runs out.
//
//   bun scripts/rolling-plan.ts --week 2026-12-14                → out/plans/week-2026-12-14.json
//   bun scripts/rolling-plan.ts --week 2026-12-14 --out x.json   elsewhere
//   --plan <launch plan> (default scripts/plan-launch.json when it exists): its posts inside the week are kept as they
//   are, and only the days after its last date are generated. --no-check skips the date check (for a quick look).
//
// A generated week:
//   - every day, one TikTok + Reels video, alternating (by day number, so it carries across weeks) a dial clip from
//     clips/cohorts.json and a card or sign vertical (cohort cards, evergreen quote cards, the twelve sign verticals);
//   - Mon, Wed, Fri: one X + Threads text post from the kit's list (docs/launch-kit-v2.md (d)), rotating;
//   - Sat: one Instagram carousel (remotion/carousels.json).
// Nothing (asset, or kit post as `ref`) repeats within 21 days: previous weeks are read from R2 (weeks/<monday>/
// manifest.json, when the R2_* credentials are set), else from local out/weeks/*/manifest.json, plus the launch plan.
// If a pool runs dry the slot takes the other kind of video, or is left out with a warning; never a repeat.
//
// Only material that isn't tied to the calendar is used: no "today" / "this year" / "right now" wording (launch-plan.ts's
// list), and no date that was still ahead when the kit was written (17 Oct 2026) and has passed (or is within 2 days)
// on the posting day (so "Saturn stops on 11 December" drops out after 9 Dec 2026). Captions are the launch plan's
// caption for the same asset when that passes the same test, else the cohort's hook / the kit text, plus "Free preview
// at rite.report". Then the week goes through clips/check-cohorts.ts --plan (TODAY = the week's Monday); a clip that
// fails on its posting day is swapped for another and the check runs again, so the output always passes.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stale } from "./stale";
import { r2FromEnv, r2GetText } from "./r2";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(CONTENT, "..");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const W = arg("week") ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(W)) { console.error("usage: bun scripts/rolling-plan.ts --week YYYY-MM-DD [--plan scripts/plan-launch.json] [--out file.json] [--no-check]"); process.exit(1); }
const DAY = 86400000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => iso(ms(d) + n * DAY);
if (new Date(ms(W)).getUTCDay() !== 1) console.warn(`! ${W} is not a Monday: the week still runs ${W} – ${addDays(W, 6)}, but the weekday slots move.`);
const days = [...Array(7)].map((_, i) => addDays(W, i));
const outPath = resolve(arg("out") ?? join(CONTENT, "out", "plans", `week-${W}.json`));

type Post = { date: string; day?: string; slot?: string; time?: string; asset?: string; ref?: string; platforms?: string[]; caption?: string; alt?: string | string[]; kit?: string; note?: string };
type Plan = { title?: string; notes?: string[]; posts: Post[] };
const readJson = <T>(f: string): T => JSON.parse(readFileSync(f, "utf8")) as T;

// ---------- the launch plan ----------
const launchPath = arg("plan") ? resolve(arg("plan")!) : join(CONTENT, "scripts", "plan-launch.json");
const launch: Plan | null = existsSync(launchPath) ? readJson<Plan>(launchPath) : null;
if (arg("plan") && !launch) { console.error(`no plan at ${launchPath}`); process.exit(1); }
const launchLast = launch?.posts.reduce((m, p) => (p.date > m ? p.date : m), "") ?? "";
const kept = (launch?.posts ?? []).filter((p) => p.date >= W && p.date <= days[6]);
const genDays = days.filter((d) => !launchLast || d > launchLast);

// ---------- what's already been posted (or planned) ----------
const keyOf = (p: { asset?: string | null; ref?: string | null; kit?: string | null }) =>
  p.ref ?? (p.asset ? p.asset.replace(/_vo$/, "") : (/\(d\) post (\d+)\b/.exec(p.kit ?? "")?.[1] ? `kit-post-${/\(d\) post (\d+)\b/.exec(p.kit!)![1]}` : null));
const used = new Map<string, string[]>(); // key → dates
const remember = (key: string | null, date: string) => { if (key) used.set(key, [...(used.get(key) ?? []), date]); };
for (const p of launch?.posts ?? []) remember(keyOf(p), p.date);
const seen = new Set<string>();
const history = (posts: Array<{ date: string; asset?: string | null; ref?: string | null; kit?: string | null }>, from: string) => {
  let n = 0;
  for (const p of posts) { const k = keyOf(p); if (!k || p.date >= W || seen.has(`${k}@${p.date}`)) continue; seen.add(`${k}@${p.date}`); remember(k, p.date); n++; }
  if (n) console.log(`history: ${n} post(s) from ${from}`);
};
const r2 = r2FromEnv();
if (r2) {
  for (const k of [1, 2, 3]) {
    const key = `weeks/${addDays(W, -7 * k)}/manifest.json`;
    const t = await r2GetText(r2, key).catch((e) => { console.warn(`! couldn't read ${key} from R2: ${e.message}`); return null; });
    if (t) history(JSON.parse(t).posts ?? [], `R2 ${key}`);
  }
} else {
  const dir = join(CONTENT, "out", "weeks");
  if (existsSync(dir)) for (const wk of readdirSync(dir).sort()) {
    const f = join(dir, wk, "manifest.json");
    if (/^\d{4}-\d{2}-\d{2}$/.test(wk) && wk < W && wk >= addDays(W, -28) && existsSync(f)) history(readJson<{ posts: Post[] }>(f).posts, `out/weeks/${wk}`);
  }
}
const lastUse = (key: string) => (used.get(key) ?? []).reduce((m, d) => (d > m ? d : m), "");
const recentlyUsed = (key: string, date: string) => (used.get(key) ?? []).some((d) => Math.abs(ms(d) - ms(date)) < 21 * DAY);

// ---------- what isn't tied to the calendar ----------
const launchCaption = new Map<string, Post>();
for (const p of launch?.posts ?? []) if (p.asset && p.caption && !/^(Optional|Not a post)/.test(p.caption) && !launchCaption.has(p.asset)) launchCaption.set(p.asset, p);
for (const f of ["plan-2026-10-weeks-1-2.json", "plan-2026-11-weeks-3-4.json"]) {
  const pf = join(CONTENT, "scripts", f); if (!existsSync(pf)) continue;
  for (const p of readJson<Plan>(pf).posts) if (p.asset && p.caption && !/^(Optional|Not a post)/.test(p.caption) && !launchCaption.has(p.asset)) launchCaption.set(p.asset, p);
}
const CTA = "Free preview at rite.report";
const withCta = (t: string) => (/rite\.report/.test(t) ? t : `${t.replace(/\s+$/, "")} ${CTA}`);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmt = (d: string, long = false) => { const [y, m, dd] = d.split("-").map(Number); return `${dd} ${(long ? LONG : SHORT)[m - 1]} ${y}`; };

type Cand = { key: string; asset?: string; ref?: string; kind: "clip" | "card" | "text" | "carousel"; texts: unknown[]; slot: string; kit: string; caption: string; alt?: string | string[]; platforms: string[] };
/** The candidate as it would post on `date`: the launch plan's caption/alt when they're still good, else the default. */
function finish(c: Cand, date: string): Cand {
  const lp = c.asset ? launchCaption.get(c.asset) : undefined;
  if (lp && !stale([lp.caption, ...(Array.isArray(lp.alt) ? lp.alt : [lp.alt])], date)) return { ...c, caption: lp.caption!, alt: lp.alt ?? c.alt };
  return c;
}

// dial clips
type Cohort = { id: string; label: string; date: string; city: string; time: string | null; hook: string; lines: string[]; vo?: { hook: string; lines: string[] } };
const cohorts = readJson<{ cohorts: Cohort[] }>(join(CONTENT, "clips", "cohorts.json")).cohorts;
const clips: Cand[] = cohorts.map((c) => ({
  key: c.id, asset: c.id, kind: "clip", platforms: ["tiktok", "reels"],
  // "Today: 10° Aries" lines are checked against the posting day by check-cohorts.ts, so they don't count as calendar wording here
  texts: [c.hook, ...c.lines.map((l) => l.replace(/Today: \d{1,2}° [A-Z][a-z]+/g, "")), c.vo?.hook, ...(c.vo?.lines ?? [])],
  slot: `TikTok + Reels: dial clip (${c.label})`, kit: "rolling: style 1 dial clip",
  caption: withCta(c.hook),
  alt: `Screen recording of the Rite site: a birth date of ${fmt(c.date, true)} and ${c.city} are entered, and the result shows the Saturn return dates. Captions: ${[c.hook, ...c.lines].join(" / ")}`,
}));

// card and sign verticals
const cardVo = readJson<Record<string, string>>(join(CONTENT, "clips", "card-vo.json"));
const cards = readJson<{ cohorts: Array<{ id: string; label?: string; ranges: Array<[string, string]> }>; quotes: Array<{ id: string; text?: string; signOpener?: string; footer?: string }> }>(join(CONTENT, "remotion", "cards.config.json"));
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const cardPools: Cand[][] = [
  cards.cohorts.map((c): Cand => {
    const ranges = c.ranges.map(([a, b]) => `${fmt(a)} – ${fmt(b)}`).join(", or ");
    return { key: `cohort-${c.id}-vertical`, asset: `cohort-${c.id}-vertical`, kind: "card", platforms: ["tiktok", "reels"], texts: [cardVo[`cohort-${c.id}`]],
      slot: `TikTok + Reels: cohort card, born ${ranges}`, kit: "rolling: style 2 cohort card", caption: `Born ${ranges}? Your Saturn return, dated. ${CTA}`,
      alt: `Dark card with the Rite mark and a gold orbit dial. Text: Born ${ranges}? Your Saturn return dates.` };
  }),
  cards.quotes.map((q): Cand => ({
    key: `quote-${q.id}-vertical`, asset: `quote-${q.id}-vertical`, kind: "card", platforms: ["tiktok", "reels"], texts: [q.text, q.footer, cardVo[`quote-${q.id}`]],
    slot: `TikTok + Reels: quote card (${q.id})`, kit: "rolling: style 6 quote card",
    caption: q.text ? withCta(`${q.text}${q.footer ? ` ${q.footer}.` : ""}`) : `Saturn in ${q.signOpener}: what it asks of you.${q.footer ? ` ${q.footer}.` : ""} ${CTA}`,
    alt: `Cream card with a faint gold dial. Text: ${q.text ?? `the ${q.signOpener} opener from the sign page`}${q.footer ? ` Small text: ${q.footer}.` : ""}`,
  })),
  SIGNS.map((s): Cand => ({
    key: `sign-${s.toLowerCase()}-vertical`, asset: `sign-${s.toLowerCase()}-vertical`, kind: "card", platforms: ["tiktok", "reels"], texts: [cardVo[`sign-${s.toLowerCase()}`]],
    slot: `TikTok + Reels: sign vertical (${s})`, kit: "rolling: style 2 sign card",
    caption: `Saturn return in ${s}: the dates, and who it's for. Your exact passes free at rite.report`,
    alt: `Animated dark card with the Rite mark and a gold orbit dial: Saturn in ${s}, the dates it's there and the birth dates it's a return for.`,
  })),
];
// cohort card, quote card, sign card, cohort card, …: with no history yet the kinds take turns
const verticals: Cand[] = [...Array(Math.max(...cardPools.map((p) => p.length)))].flatMap((_, i) => cardPools.map((p) => p[i]).filter(Boolean));

// kit text posts, (d) in docs/launch-kit-v2.md
const kitDoc = readFileSync(join(REPO, "docs", "launch-kit-v2.md"), "utf8");
const dSection = kitDoc.slice(kitDoc.indexOf("## (d)"), kitDoc.indexOf("\n## (e)"));
const textPosts: Cand[] = [...dSection.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => {
  const body = m[2].trim();
  const caption = /rite\.report/.test(body) || body.length + CTA.length + 1 > 280 ? body : `${body} ${CTA}`;
  return { key: `kit-post-${m[1]}`, ref: `kit-post-${m[1]}`, kind: "text", platforms: ["x", "threads"], texts: [body], slot: `X / Threads: kit post ${m[1]}`, kit: `(d) post ${m[1]}`, caption };
});
if (!textPosts.length) console.warn("! no kit posts found in docs/launch-kit-v2.md (d)");

// carousels
type Slide = { head?: string; text?: string; small?: string; tag?: string; list?: unknown[]; alt?: string };
const carousels: Cand[] = readJson<{ carousels: Array<{ id: string; title?: string; slides: Slide[] }> }>(join(CONTENT, "remotion", "carousels.json")).carousels.map((c) => ({
  key: c.id, asset: c.id, kind: "carousel", platforms: ["instagram"],
  texts: c.slides.flatMap((s) => [s.head, s.text, s.small, s.tag, ...(s.list ?? [])]),
  slot: `Instagram: carousel (${c.title ?? c.id})`, kit: "rolling: (e) carousel",
  caption: `${c.slides[0]?.head ?? c.title ?? ""} Swipe for the dates. Exact passes, free at rite.report`,
  alt: c.slides.map((s) => s.alt ?? s.head ?? ""),
}));

// ---------- build the week ----------
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function build(banned: Set<string>): { posts: Post[]; warnings: string[] } {
  const picks = new Map<string, string[]>(); // this week's own picks
  const warnings: string[] = [];
  const free = (c: Cand, date: string) => !banned.has(`${c.key}@${date}`) && !recentlyUsed(c.key, date) && !(picks.get(c.key) ?? []).some((d) => Math.abs(ms(d) - ms(date)) < 21 * DAY) && !stale(c.texts, date);
  const order = (a: Cand, b: Cand) => (lastUse(a.key) || "0").localeCompare(lastUse(b.key) || "0");
  const pick = (pools: Cand[][], date: string): Cand | null => {
    for (const pool of pools) {
      const ok = pool.filter((c) => free(c, date)).sort(order);
      if (ok.length) { picks.set(ok[0].key, [...(picks.get(ok[0].key) ?? []), date]); return finish(ok[0], date); }
    }
    return null;
  };
  const toPost = (c: Cand, date: string): Post => ({ date, slot: c.slot, ...(c.asset ? { asset: c.asset } : {}), ...(c.ref ? { ref: c.ref } : {}), platforms: c.platforms, caption: c.caption, ...(c.alt ? { alt: c.alt } : {}), kit: c.kit });
  const posts: Post[] = [];
  for (const date of genDays) {
    const dow = new Date(ms(date)).getUTCDay();
    const clipDay = Math.round(ms(date) / DAY) % 2 === 0;
    const v = pick(clipDay ? [clips, verticals] : [verticals, clips], date);
    if (v) posts.push({ ...toPost(v, date), day: `${DOW[dow]} (rolling)` });
    else warnings.push(`${date}: no video left that isn't stale or used in the last 21 days; the TikTok/Reels slot is empty`);
    if (dow === 1 || dow === 3 || dow === 5) {
      const t = pick([textPosts], date);
      if (t) posts.push(toPost(t, date)); else warnings.push(`${date}: every kit post is stale or used in the last 21 days; no X/Threads post`);
    }
    if (dow === 6) {
      const c = pick([carousels], date);
      if (c) posts.push(toPost(c, date)); else warnings.push(`${date}: every carousel is stale or used in the last 21 days; no carousel`);
    }
  }
  return { posts, warnings };
}

const banned = new Set<string>();
let result = build(banned);
const write = (posts: Post[], warnings: string[]) => {
  const plan: Plan = {
    title: `Rite rolling calendar, week of ${fmt(W)} (${W} – ${days[6]})`,
    notes: [
      `Built by \`bun scripts/rolling-plan.ts --week ${W}\`${kept.length ? `; ${kept.length} post(s) from ${launchPath.replace(CONTENT + "/", "")} kept as they are (it ends ${launchLast})` : ""}.`,
      "Generated posts reuse rendered assets and written captions; nothing repeats within 21 days and nothing tied to the calendar is used.",
      ...warnings.map((w) => `! ${w}`),
    ],
    posts: [...kept, ...posts].sort((a, b) => a.date.localeCompare(b.date)),
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(plan, null, 2) + "\n");
  return plan;
};
let plan = write(result.posts, result.warnings);
if (!argv.includes("--no-check")) {
  for (let round = 1; ; round++) {
    const r = spawnSync("bun", ["clips/check-cohorts.ts", "--plan", outPath], { cwd: CONTENT, encoding: "utf8", env: { ...process.env, TODAY: W } });
    if (r.status === 0) { console.log(`✓ date check passes for the week (check-cohorts.ts --plan, TODAY=${W})`); break; }
    const out = (r.stdout ?? "") + (r.stderr ?? "");
    const fails = [...out.matchAll(/^✗ clip (\S+) \(posting (\d{4}-\d{2}-\d{2})\)/gm)].map((m) => `${m[1]}@${m[2]}`)
      .filter((f) => !kept.some((p) => `${p.asset}@${p.date}` === f));
    if (!fails.length || round > 12) { console.log(out); console.error("✗ the date check fails for reasons a swap can't fix (see above)"); process.exit(1); }
    for (const f of fails) { console.log(`  swap: ${f.replace("@", " on ")} fails the date check`); banned.add(f); }
    result = build(banned);
    plan = write(result.posts, result.warnings);
  }
}
for (const w of result.warnings) console.warn(`! ${w}`);
const gen = plan.posts.filter((p) => !kept.includes(p));
console.log(`✓ ${outPath.replace(CONTENT + "/", "content/")}: ${plan.posts.length} post(s), ${W} – ${days[6]} (${kept.length} from the launch plan, ${gen.length} generated)`);
for (const p of gen) console.log(`  ${p.date}  ${(p.platforms ?? []).join(",").padEnd(12)} ${p.asset ?? p.ref ?? ""}`);
