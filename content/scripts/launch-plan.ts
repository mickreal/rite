#!/usr/bin/env bun
// The 28-day launch calendar moved onto the real launch day L, in one step, so domain day is one command:
//
//   LAUNCH=2026-11-16 bun scripts/launch-plan.ts                 → scripts/plan-launch.json (+ a list of lines to reread)
//   LAUNCH=2026-11-16 bun scripts/launch-plan.ts --render        … then the whole render (= render-batch with TODAY=L)
//
// Weeks 1–2 (plan-2026-10-weeks-1-2.json, day 1 = 19 Oct) and weeks 3–4 (plan-2026-11-weeks-3-4.json) are joined and
// every post moves by the same number of days, so day N lands on L+N−1 and each weekday slot stays on its weekday when
// L is a Monday. The date check in render-batch then runs every clip against its new posting day ("Today: N°" lines,
// spoken degrees) and fails on anything stale.
//
// What a shift can't fix by itself is wording tied to the calendar ("just over four weeks", "this year", a date that's
// now in the past). Every post whose caption, alt text, note or VO mentions a date or a relative time is listed at the
// end with its new posting date, so they can be reread before scheduling.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const L = process.env.LAUNCH ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(L)) { console.error("usage: LAUNCH=YYYY-MM-DD bun scripts/launch-plan.ts [--render] [--silent]"); process.exit(1); }
const DAY1 = "2026-10-19";
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const shift = Math.round((ms(L) - ms(DAY1)) / 86400000);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const dow = new Date(ms(L)).getUTCDay();
if (dow !== 1) console.warn(`! ${L} is not a Monday: weekday slots (Reddit on Wednesday, PH/HN on a Tuesday) will drift.`);
if (shift < 0) { console.error(`LAUNCH ${L} is before the plan's day 1 (${DAY1}).`); process.exit(1); }

type Post = { date: string; day?: string; slot?: string; caption?: string; alt?: string | string[]; note?: string; asset?: string; [k: string]: unknown };
const load = (f: string) => JSON.parse(readFileSync(join(CONTENT, "scripts", f), "utf8")) as { title: string; notes: string[]; posts: Post[] };
const w12 = load("plan-2026-10-weeks-1-2.json"), w34 = load("plan-2026-11-weeks-3-4.json");
const original = [...w12.posts, ...w34.posts];
const posts = original.map((p) => ({ ...p, date: iso(ms(p.date) + shift * 86400000) }));
const last = posts[posts.length - 1].date;

// VO text, so spoken "today" / "this year" lines are flagged too
const cohorts = JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string; vo?: { hook?: string; lines?: string[] } }>;
const cardVo = JSON.parse(readFileSync(join(CONTENT, "clips", "card-vo.json"), "utf8")) as Record<string, string>;
const voOf = (asset?: string) => {
  if (!asset) return "";
  const c = cohorts.find((x) => x.id === asset);
  if (c?.vo) return [c.vo.hook ?? "", ...(c.vo.lines ?? [])].join(" ");
  return cardVo[asset.replace(/-vertical$/, "")] ?? "";
};

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const RELATIVE = /\b(today|tonight|right now|this (week|month|year)|next (week|month|year|april|may|june|july|august|september|october|november|december|january|february|march)|weeks? (from now|away)|days? (from now|away)|\d+ weeks|four weeks|eighteen months|a year and a half|in about)\b/i;
const flags: string[] = [];
posts.forEach((p, i) => {
  const was = original[i].date;
  const text = [p.caption ?? "", ...(Array.isArray(p.alt) ? p.alt : [p.alt ?? ""]), p.note ?? "", voOf(p.asset)].join(" ");
  const why: string[] = [];
  if (RELATIVE.test(text)) why.push(`relative time ("${text.match(RELATIVE)![0]}")`);
  // A date that was still ahead on the original posting day and has passed by the new one: written as upcoming, now stale.
  // A date without a year is read as the next one on or after the original posting day.
  for (const m of text.matchAll(/\b(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?: (\d{4}))?/g)) {
    let d = Date.UTC(m[3] ? +m[3] : +was.slice(0, 4), MON[m[2].toLowerCase()], +m[1]);
    if (!m[3] && d < ms(was)) d = Date.UTC(+was.slice(0, 4) + 1, MON[m[2].toLowerCase()], +m[1]);
    if (d >= ms(was) && d < ms(p.date) + 2 * 86400000) why.push(`${m[0]} was ahead on ${was}, is behind or within 2 days on ${p.date}`);
  }
  if (why.length) flags.push(`${p.date}  ${p.slot ?? p.asset ?? ""}\n    ${[...new Set(why)].join("; ")}`);
});

const plan = {
  title: `Rite launch calendar (${L} – ${last})`,
  notes: [
    `Built by \`LAUNCH=${L} bun scripts/launch-plan.ts\` from plan-2026-10-weeks-1-2.json and plan-2026-11-weeks-3-4.json, every post moved ${shift} days (day 1 = ${L}).`,
    `Render: \`TODAY=${L} bun scripts/render-batch.ts --plan scripts/plan-launch.json --dest launch\` (or this script with --render).`,
    ...(flags.length ? ["", `Reread before scheduling (${flags.length} posts): see the list this script printed.`] : []),
  ],
  posts,
};
writeFileSync(join(CONTENT, "scripts", "plan-launch.json"), JSON.stringify(plan, null, 2) + "\n");
console.log(`✓ scripts/plan-launch.json: ${posts.length} posts, ${L} – ${last} (shifted ${shift} days)`);
if (flags.length) console.log(`\nReread these before scheduling (wording tied to the calendar):\n\n${flags.join("\n")}`);

if (process.argv.includes("--render")) {
  const r = spawnSync("bun", ["scripts/render-batch.ts", "--plan", "scripts/plan-launch.json", "--dest", "launch", ...(process.argv.includes("--silent") ? ["--silent"] : [])],
    { cwd: CONTENT, stdio: "inherit", env: { ...process.env, TODAY: L } });
  process.exit(r.status ?? 1);
}
