// Copies rendered assets into a scheduler-ready folder: one file per platform per post, named
// <YYYY-MM-DD>_<platform>_<asset>.<ext>, plus manifest.csv (date, platform, file, caption) for Buffer / Later / Metricool.
//
//   bun scripts/export-batch.ts --start 2026-10-19                 one post a day, default order (see below)
//   bun scripts/export-batch.ts --plan scripts/plan.example.json   explicit dates and platforms
//
// Default order alternates a dial clip with a card, so the first week is the soft-launch mix in gtm-plan.md §2.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(CONTENT, "out");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

// asset id → file under content/out/
const files = new Map<string, string>();
for (const dir of ["clips", "signs", "cohorts", "quotes"]) {
  const d = join(OUT, dir); if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (/\.(mp4|png)$/.test(f)) files.set(basename(f, extname(f)), join(d, f));
}
if (!files.size) { console.error("Nothing in content/out/ yet. Render first (see content/README.md)."); process.exit(1); }

// captions: clip hooks from cohorts.json; cards get a plain line + CTA (edit in the manifest before scheduling)
const cohorts = JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string; hook: string }>;
const caption = (asset: string) => {
  const c = cohorts.find((x) => x.id === asset); if (c) return `${c.hook} Free preview at rite.report`;
  if (asset.startsWith("sign-")) { const s = asset.replace(/^sign-|-vertical$/g, ""); return `Saturn return in ${s[0].toUpperCase()}${s.slice(1)}: the dates, and who it's for. Your exact passes free at rite.report`; }
  if (asset.startsWith("cohort-")) return "Your Saturn return, dated. Free preview at rite.report";
  return "rite.report";
};

const VIDEO = ["tiktok", "reels", "shorts"], STILL = ["instagram", "x", "threads"];
type Post = { date: string; asset: string; platforms?: string[] };
let plan: Post[];
const planPath = arg("plan");
if (planPath) plan = JSON.parse(readFileSync(resolve(planPath), "utf8"));
else {
  const start = arg("start") ?? new Date().toISOString().slice(0, 10);
  const clips = [...files.keys()].filter((k) => files.get(k)!.includes("/clips/"));
  const cards = [...files.keys()].filter((k) => k.startsWith("cohort-") || k.startsWith("quote-") || k.endsWith("-vertical"));
  const order: string[] = []; for (let i = 0; i < Math.max(clips.length, cards.length); i++) { if (clips[i]) order.push(clips[i]); if (cards[i]) order.push(cards[i]); }
  plan = order.map((asset, i) => ({ date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), asset }));
}

const dest = join(OUT, "export", arg("name") ?? `batch-${plan[0]?.date ?? "empty"}`);
mkdirSync(dest, { recursive: true });
const rows = [["date", "platform", "file", "caption"]];
for (const p of plan) {
  const src = files.get(p.asset); if (!src) { console.warn(`skip ${p.date}: no rendered asset "${p.asset}"`); continue; }
  const ext = extname(src);
  for (const platform of p.platforms ?? (ext === ".mp4" ? VIDEO : STILL)) {
    const name = `${p.date}_${platform}_${p.asset}${ext}`;
    copyFileSync(src, join(dest, name));
    rows.push([p.date, platform, name, caption(p.asset)]);
  }
}
const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
writeFileSync(join(dest, "manifest.csv"), csv);
console.log(`${rows.length - 1} files + manifest.csv → ${dest.replace(CONTENT + "/", "content/")}`);
