#!/usr/bin/env bun
// Lists every voiceover take a batch needs, one row per take: path<TAB>text. Generate each row as
// <VO_DIR>/<path>.mp3 (or .wav / .m4a) with ElevenLabs v3 "Anna", then re-render with VO_PROVIDER=files VO_DIR=<dir>.
//
//   bun scripts/vo-lines.ts --plan scripts/plan-2026-11-weeks-3-4.json > scripts/vo-lines-2026-11-weeks-3-4.tsv
//   bun scripts/vo-lines.ts --signs > scripts/vo-lines-signs.tsv
//
// Paths: <cohort id>/NN for a dial clip (00 = hook, 01 = first caption line …; clips/cohorts.json `vo`),
// cards/<card id> for a card vertical and signs/<slug> for a sign vertical (clips/card-vo.json).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { planPosts } from "./plan-posts";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const cohorts = (JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string; vo?: { hook: string; lines: string[] } }>);
const cards = JSON.parse(readFileSync(join(CONTENT, "clips", "card-vo.json"), "utf8")) as Record<string, string>;
const rows: string[] = ["path\ttext"];
const clean = (t: string) => t.replace(/[\t\n]+/g, " ").trim();
if (argv.includes("--signs")) {
  for (const [k, t] of Object.entries(cards)) if (k.startsWith("sign-")) rows.push(`signs/${k.slice(5)}\t${clean(t)}`);
} else {
  const i = argv.indexOf("--plan"); if (i < 0) { console.error("usage: bun scripts/vo-lines.ts --plan <plan.json> | --signs"); process.exit(1); }
  const plan = JSON.parse(readFileSync(resolve(argv[i + 1]), "utf8"));
  const assets = [...new Set(planPosts(plan).map((p) => p.asset).filter(Boolean) as string[])]; // + fallback posts
  const missing: string[] = [];
  for (const a of assets) {
    const c = cohorts.find((x) => x.id === a);
    if (c) { if (c.vo) [c.vo.hook, ...c.vo.lines].forEach((t, n) => rows.push(`${c.id}/${String(n).padStart(2, "0")}\t${clean(t)}`)); else missing.push(a); continue; }
    const v = /^((?:cohort|quote)-.+)-vertical$/.exec(a);
    if (v) { if (cards[v[1]]) rows.push(`cards/${v[1]}\t${clean(cards[v[1]])}`); else missing.push(a); }
  }
  if (missing.length) console.error(`no VO text (silent only): ${missing.join(", ")}`);
}
console.log(rows.join("\n"));
