#!/usr/bin/env bun
// The posted words of a plan against their posting days: fails when a caption or alt text names a date that was still
// ahead when it was written (17 Oct 2026) and has passed by the day it posts (a launch plan moved
// onto a later launch day, an old plan re-run). Fallback posts (plan-posts.ts) are checked like any other post.
// Calendar-relative wording ("today", "four weeks") is printed as a
// warning to reread, since it can still be true. clips/check-cohorts.ts covers what's on screen and in the VO.
//
//   bun scripts/check-captions.ts --plan scripts/plan-launch.json [--from YYYY-MM-DD] [--to YYYY-MM-DD]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { passed, relative } from "./stale";
import { planPosts } from "./plan-posts";

const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const planPath = arg("plan");
if (!planPath) { console.error("usage: bun scripts/check-captions.ts --plan <plan.json> [--from YYYY-MM-DD] [--to YYYY-MM-DD]"); process.exit(1); }
const from = arg("from"), to = arg("to");
const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
type Post = { date: string; slot?: string; asset?: string; ref?: string; caption?: string; alt?: string | string[] };
const posts = (planPosts(plan) as Post[]).filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
const gh = !!process.env.GITHUB_ACTIONS;
let bad = 0, warn = 0;
for (const p of posts) {
  if (!p.caption || /^(Not a post|Optional)/.test(p.caption)) continue; // backdrops, cut-ins and optional stills don't post
  const texts = [p.caption, ...(Array.isArray(p.alt) ? p.alt : [p.alt])];
  const what = `${p.date} ${p.slot ?? p.asset ?? p.ref ?? ""}`;
  const d = passed(texts, p.date, { marginDays: 0, months: false }); // "today, 24 Oct" is fine on 24 Oct
  if (d) { bad++; console.log(`${gh ? "::error::" : "✗ "}${what}: ${d} by its posting day; rewrite the caption`); }
  const r = relative(texts);
  if (r) { warn++; console.log(`${gh ? "::warning::" : "! "}${what}: ${r}; reread before it posts`); }
}
console.log(`${posts.length} post(s) checked: ${bad} stale date(s), ${warn} to reread`);
if (bad) process.exit(1);
