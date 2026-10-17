#!/usr/bin/env bun
// One command for a whole batch: check every date → render the plan's dial clips (silent + _vo when a TTS provider is
// available) and cards → export the scheduler folder → zip it.
//
//   TODAY=2026-10-19 bun scripts/render-batch.ts --plan scripts/plan-2026-10-weeks-1-2.json --dest 2026-10-weeks-1-2-v2
//   RITE_ADMIN_KEY=… TODAY=… bun scripts/render-batch.ts --plan … --dest …     with voiceover
//
// TODAY pins the card data ("open now", sign dial angles) and the date check; each clip's "Today: N°" line and spoken
// "today" degree are also checked against its own posting date from the plan. Clips use the site's live clock.
// Options: --silent (no VO), --skip-clips / --skip-cards (reuse what's in content/out/), --no-zip.
// Env passed through to render-clip.ts: BASE_URL (default: it starts wrangler dev --local itself), RITE_ADMIN_KEY,
// VO_PROVIDER, RITE_TTS_URL, RITE_TTS_VOICE, RITE_TTS_MODEL, CHROMIUM.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const planPath = arg("plan"); const dest = arg("dest");
if (!planPath || !dest) { console.error("usage: TODAY=YYYY-MM-DD bun scripts/render-batch.ts --plan <plan.json> --dest <folder under content/out/>"); process.exit(1); }
if (!process.env.TODAY) console.warn("TODAY is not set: card data and the date check use today's date.");
const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
const posts = (Array.isArray(plan) ? plan : plan.posts) as Array<{ asset?: string }>;
const assets = [...new Set(posts.map((p) => p.asset).filter(Boolean) as string[])];
const cohortIds = new Set((JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string }>).map((c) => c.id));

const run = (label: string, cmd: string, args: string[], env: Record<string, string> = {}) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: CONTENT, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`✗ ${label} failed`); process.exit(r.status ?? 1); }
};

run("Date check (cards, clip captions, VO scripts, each clip on its posting day)", "bun", ["clips/check-cohorts.ts", "--plan", resolve(planPath)]);

const clips = assets.filter((a) => cohortIds.has(a));
const stills = assets.filter((a) => a.endsWith("-summary") && cohortIds.has(a.replace(/-summary$/, "")));
const clipIds = [...new Set([...clips, ...stills.map((s) => s.replace(/-summary$/, ""))])];
if (clipIds.length && !argv.includes("--skip-clips")) {
  run(`Dial clips: ${clipIds.join(", ")}`, "bun", ["clips/render-clip.ts", "--only", clipIds.join(","), ...(stills.length ? ["--stills"] : []), ...(argv.includes("--silent") ? ["--silent"] : [])]);
}

const verticals = assets.filter((a) => a.endsWith("-vertical") && /^(cohort|quote)-/.test(a))
  .map((a) => `${a.startsWith("quote-") ? "QuoteCard" : "CohortCard"}:${a.replace(/^(cohort|quote)-/, "").replace(/-vertical$/, "")}`);
const groups = [
  assets.some((a) => a.startsWith("cohort-") && !a.endsWith("-vertical")) && "cohorts",
  assets.some((a) => a.startsWith("quote-") && !a.endsWith("-vertical")) && "quotes",
  assets.some((a) => a.startsWith("carousel-")) && "carousels",
  assets.some((a) => a.startsWith("sign-")) && "signs",
  verticals.length && "verticals",
].filter(Boolean) as string[];
if (groups.length && !argv.includes("--skip-cards")) run(`Cards: ${groups.join(", ")}`, "bash", ["remotion/render-all.sh"], { ONLY: groups.join(","), VERTICALS: verticals.join(" ") });

const out = join(CONTENT, "out", dest);
rmSync(out, { recursive: true, force: true }); // no stale files from an earlier export
run("Export", "bun", ["scripts/export-batch.ts", "--plan", resolve(planPath), "--dest", dest]);
if (!argv.includes("--no-zip")) {
  const zip = `${out}.zip`; rmSync(zip, { force: true });
  const r = spawnSync("zip", ["-qr", `${dest}.zip`, dest], { cwd: join(CONTENT, "out"), stdio: "inherit" });
  if (r.status !== 0 || !existsSync(zip)) { console.error("✗ zip failed"); process.exit(1); }
  console.log(`\n✓ ${out}/ and ${zip}`);
}
