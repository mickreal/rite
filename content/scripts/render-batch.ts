#!/usr/bin/env bun
// One command for a whole batch: check every date → render the plan's dial clips (silent + _vo when a TTS provider is
// available) and cards → export the scheduler folder (every video gets the brand soundtrack there, scripts/add-music.ts;
// MUSIC=off to skip) → zip it.
//
//   TODAY=2026-10-19 bun scripts/render-batch.ts --plan scripts/plan-2026-10-weeks-1-2.json --dest 2026-10-weeks-1-2-v2
//   RITE_ADMIN_KEY=… TODAY=… bun scripts/render-batch.ts --plan … --dest …     with voiceover
//
// TODAY pins the card data ("open now", sign dial angles) and the date check; each clip's "Today: N°" line and spoken
// "today" degree are also checked against its own posting date from the plan. Clips use the site's live clock.
// Options: --silent (no VO), --skip-clips / --skip-cards (reuse what's in content/out/), --no-zip.
//   --from / --to YYYY-MM-DD: only the posts dated inside that range (inclusive) are checked, rendered and exported
//   (default: the whole plan). The scheduled render uses them to do one week of a longer plan.
//   --scale 2 (or SCALE=2): 4K masters (README "4K masters"). Everything renders at twice the layout size into
//   content/out/master/, scripts/downscale.ts makes the 1080 upload renders in content/out/ (same names), the upload
//   folder <dest>/ is exported from those exactly as before, and the masters are exported (with the same music) to
//   <dest>-master/ for YouTube Shorts and the archive (not zipped unless --zip-master).
//   --allow-missing-presenter: passed to export-batch (an unrendered presenter reel is listed as missing, not fatal).
// Env passed through to render-clip.ts: BASE_URL (default: it starts wrangler dev --local itself), RITE_ADMIN_KEY,
// VO_PROVIDER, RITE_TTS_URL, RITE_TTS_VOICE, RITE_TTS_MODEL, CHROMIUM.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assetsOf, expandPosts, type PlanPost } from "./plan-posts";
import { renderScale } from "./scale";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const planPath = arg("plan"); const dest = arg("dest");
if (!planPath || !dest) { console.error("usage: TODAY=YYYY-MM-DD bun scripts/render-batch.ts --plan <plan.json> --dest <folder under content/out/>"); process.exit(1); }
if (arg("scale") !== undefined) process.env.SCALE = arg("scale");
const scale = renderScale(); // throws on anything but 1 or 2
if (scale > 1) process.env.SCALE = String(scale); else delete process.env.SCALE;
if (!process.env.TODAY) console.warn("TODAY is not set: card data and the date check use today's date.");
const plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
const from = arg("from"), to = arg("to");
for (const [n, v] of [["from", from], ["to", to]]) if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { console.error(`--${n} must be YYYY-MM-DD`); process.exit(1); }
const allPosts = (Array.isArray(plan) ? plan : plan.posts) as PlanPost[];
const rawPosts = allPosts.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
const posts = expandPosts(rawPosts); // + fallback posts (plan-posts.ts)
if (from || to) {
  console.log(`${posts.length} of ${allPosts.length} post(s) dated ${from ?? "…"} – ${to ?? "…"}`);
  if (!posts.length) { console.error("✗ no posts in that range"); process.exit(1); }
}
// the date check gets just the posts being rendered (each clip against its own posting day)
let checkPlan = resolve(planPath);
if (from || to) {
  mkdirSync(join(CONTENT, "out", "plans"), { recursive: true });
  checkPlan = join(CONTENT, "out", "plans", `${dest.replace(/[^\w.-]+/g, "_")}.check.json`);
  writeFileSync(checkPlan, JSON.stringify({ ...(Array.isArray(plan) ? {} : plan), posts: rawPosts }, null, 2));
}
const range = [...(from ? ["--from", from] : []), ...(to ? ["--to", to] : [])];
const assets = assetsOf(posts); // assets, interim versions and fallbacks
const cohortIds = new Set((JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string }>).map((c) => c.id));

const run = (label: string, cmd: string, args: string[], env: Record<string, string> = {}) => {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, { cwd: CONTENT, stdio: "inherit", env: { ...process.env, ...env } });
  if (r.status !== 0) { console.error(`✗ ${label} failed`); process.exit(r.status ?? 1); }
};

run("Date check (cards, clip captions, VO scripts, each clip on its posting day)", "bun", ["clips/check-cohorts.ts", "--plan", checkPlan]);

const clips = assets.filter((a) => cohortIds.has(a));
const stills = assets.filter((a) => a.endsWith("-summary") && cohortIds.has(a.replace(/-summary$/, "")));
const clipIds = [...new Set([...clips, ...stills.map((s) => s.replace(/-summary$/, ""))])];
if (clipIds.length && !argv.includes("--skip-clips")) {
  run(`Dial clips: ${clipIds.join(", ")}`, "bun", ["clips/render-clip.ts", "--only", clipIds.join(","), ...(stills.length ? ["--stills"] : []), ...(argv.includes("--silent") ? ["--silent"] : [])]);
}

const verticals = assets.filter((a) => a.endsWith("-vertical") && /^(cohort|quote)-/.test(a))
  .map((a) => `${a.startsWith("quote-") ? "QuoteCard" : "CohortCard"}:${a.replace(/^(cohort|quote)-/, "").replace(/-vertical$/, "")}`);
// sign verticals (sign-<slug>-vertical) are render-all.sh's "videos" group, picked by sign name
const signVideos = assets.filter((a) => /^sign-[a-z]+-vertical$/.test(a)).map((a) => { const s = a.slice(5, -9); return s[0].toUpperCase() + s.slice(1); });
const groups = [
  assets.some((a) => a.startsWith("cohort-") && !a.endsWith("-vertical")) && "cohorts",
  assets.some((a) => a.startsWith("quote-") && !a.endsWith("-vertical")) && "quotes",
  assets.some((a) => a.startsWith("carousel-")) && "carousels",
  assets.some((a) => a.startsWith("sign-") && !a.endsWith("-vertical")) && "signs",
  signVideos.length && "videos",
  verticals.length && "verticals",
].filter(Boolean) as string[];
if (groups.length && !argv.includes("--skip-cards")) run(`Cards: ${groups.join(", ")}`, "bash", ["remotion/render-all.sh"], { ONLY: groups.join(","), VERTICALS: verticals.join(" "), ...(signVideos.length ? { VIDEOS: signVideos.join(" ") } : {}) });

// presenter reels that need no paid media (no Anna clip, no VO: the interim versions in remotion/presenter.json) render
// here like a card; the others are made by hand (scripts/presenter-prep.ts) and only exported
const reels = existsSync(join(CONTENT, "remotion", "presenter.json")) ? (JSON.parse(readFileSync(join(CONTENT, "remotion", "presenter.json"), "utf8")).reels as Array<{ id: string; interimOf?: string; audio?: string }>) : [];
const selfContained = assets.filter((a) => reels.some((r) => r.id === a && r.interimOf));
if (selfContained.length && !argv.includes("--skip-cards")) for (const id of selfContained) run(`Presenter reel (no Anna, no VO): ${id}`, "bash", ["remotion/render-presenter.sh", id]);

if (scale > 1) run("Upload copies from the 4K masters (1080 wide)", "bun", ["scripts/downscale.ts"]);

const exportArgs = (d: string, extra: string[] = []) => ["scripts/export-batch.ts", "--plan", resolve(planPath), "--dest", d, ...range, ...(argv.includes("--allow-missing-presenter") ? ["--allow-missing-presenter"] : []), ...extra];
const zipUp = (d: string) => {
  const o = join(CONTENT, "out", d), zip = `${o}.zip`; rmSync(zip, { force: true });
  const r = spawnSync("zip", ["-qr", `${d}.zip`, d], { cwd: join(CONTENT, "out"), stdio: "inherit" });
  if (r.status !== 0 || !existsSync(zip)) { console.error("✗ zip failed"); process.exit(1); }
  console.log(`\n✓ ${o}/ and ${zip}`);
};
const out = join(CONTENT, "out", dest);
rmSync(out, { recursive: true, force: true }); // no stale files from an earlier export
run("Export", "bun", exportArgs(dest));
if (!argv.includes("--no-zip")) zipUp(dest);
if (scale > 1) {
  const md = `${dest}-master`;
  rmSync(join(CONTENT, "out", md), { recursive: true, force: true });
  run("Export the 4K masters", "bun", exportArgs(md, ["--source", "master"]));
  if (argv.includes("--zip-master")) zipUp(md); else console.log(`✓ ${join(CONTENT, "out", md)}/ (4K masters, not zipped; --zip-master to zip)`);
}
