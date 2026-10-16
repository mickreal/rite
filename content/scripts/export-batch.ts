// Copies rendered assets into a scheduler-ready folder: one file per platform per post, named
// <YYYY-MM-DD>_<platform>_<asset>.<ext> (carousel slides: <YYYY-MM-DD>_<platform>_<carousel id>-NN.png), plus
// manifest.csv (date, platform, file, caption, alt) for Buffer / Later / Metricool and manifest.md for people.
//
//   bun scripts/export-batch.ts --start 2026-10-19                 one post a day, default order (see below)
//   bun scripts/export-batch.ts --plan scripts/plan.example.json   explicit dates and platforms
//   bun scripts/export-batch.ts --plan scripts/plan-2026-10-weeks-1-2.json --dest 2026-10-weeks-1-2
//
// A plan is an array of posts, or { title, notes, posts }. A post is { date, asset?, platforms?, caption?, alt?, ... }:
// `asset` is a rendered id (a file name under content/out/{clips,signs,cohorts,quotes,stills} without extension, or a
// carousel id under out/carousels/); a post with no asset is a text post (X / Threads / Reddit) and lands in the
// manifests only. `caption` and `alt` override the defaults; `day`, `slot`, `kit` and `note` only go into manifest.md.
// --dest is a folder under content/out/ (default: out/export/batch-<first date>).
//
// Default order alternates a dial clip with a card, so the first week is the soft-launch mix in gtm-plan.md §2.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(CONTENT, "out");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

// asset id → file(s) under content/out/
const files = new Map<string, string[]>();
for (const dir of ["clips", "signs", "cohorts", "quotes", "stills"]) {
  const d = join(OUT, dir); if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (/\.(mp4|png)$/.test(f)) files.set(basename(f, extname(f)), [join(d, f)]);
}
const cdir = join(OUT, "carousels");
if (existsSync(cdir)) for (const f of readdirSync(cdir).sort()) {
  const m = /^(.*)-(\d{2})\.png$/.exec(f); if (!m) continue;
  files.set(m[1], [...(files.get(m[1]) ?? []), join(cdir, f)]);
}
if (!files.size) { console.error("Nothing in content/out/ yet. Render first (see content/README.md)."); process.exit(1); }

// captions: clip hooks from cohorts.json; cards get a plain line + CTA (edit in the manifest before scheduling)
const cohorts = JSON.parse(readFileSync(join(CONTENT, "clips", "cohorts.json"), "utf8")).cohorts as Array<{ id: string; hook: string }>;
const defaultCaption = (asset?: string) => {
  if (!asset) return "";
  const c = cohorts.find((x) => x.id === asset); if (c) return `${c.hook} Free preview at rite.report`;
  if (asset.startsWith("sign-")) { const s = asset.replace(/^sign-|-vertical$/g, ""); return `Saturn return in ${s[0].toUpperCase()}${s.slice(1)}: the dates, and who it's for. Your exact passes free at rite.report`; }
  if (asset.startsWith("cohort-")) return "Your Saturn return, dated. Free preview at rite.report";
  return "rite.report";
};

const VIDEO = ["tiktok", "reels", "shorts"], STILL = ["instagram", "x", "threads"];
type Post = { date: string; asset?: string; platforms?: string[]; caption?: string; alt?: string | string[]; day?: string; slot?: string; kit?: string; note?: string };
type Plan = { title?: string; notes?: string[]; posts: Post[] };
let plan: Plan;
const planPath = arg("plan");
if (planPath) { const p = JSON.parse(readFileSync(resolve(planPath), "utf8")); plan = Array.isArray(p) ? { posts: p } : p; }
else {
  const start = arg("start") ?? new Date().toISOString().slice(0, 10);
  const clips = [...files.keys()].filter((k) => files.get(k)![0].includes("/clips/"));
  const cards = [...files.keys()].filter((k) => k.startsWith("cohort-") || k.startsWith("quote-") || k.endsWith("-vertical"));
  const order: string[] = []; for (let i = 0; i < Math.max(clips.length, cards.length); i++) { if (clips[i]) order.push(clips[i]); if (cards[i]) order.push(cards[i]); }
  plan = { posts: order.map((asset, i) => ({ date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), asset })) };
}

const destArg = arg("dest") ?? (arg("name") ? join("export", arg("name")!) : undefined);
const dest = destArg ? (isAbsolute(destArg) ? destArg : join(OUT, destArg)) : join(OUT, "export", `batch-${plan.posts[0]?.date ?? "empty"}`);
mkdirSync(dest, { recursive: true });
const rows = [["date", "platform", "file", "caption", "alt"]];
type Row = { post: Post; platform: string; names: string[]; caption: string; alt: string[] };
const out: Row[] = [];
let copied = 0, missing = 0;
for (const p of plan.posts) {
  const caption = p.caption ?? defaultCaption(p.asset);
  const alts = p.alt === undefined ? [] : Array.isArray(p.alt) ? p.alt : [p.alt];
  if (!p.asset) {
    for (const platform of p.platforms ?? ["x", "threads"]) { rows.push([p.date, platform, "", caption, ""]); out.push({ post: p, platform, names: [], caption, alt: [] }); }
    continue;
  }
  const src = files.get(p.asset); if (!src) { console.warn(`skip ${p.date}: no rendered asset "${p.asset}"`); missing++; continue; }
  const ext = extname(src[0]);
  for (const platform of p.platforms ?? (ext === ".mp4" ? VIDEO : STILL)) {
    const names = src.map((s) => `${p.date}_${platform}_${basename(s, ext)}${ext}`);
    src.forEach((s, i) => { copyFileSync(s, join(dest, names[i])); copied++; });
    names.forEach((n, i) => rows.push([p.date, platform, n, caption, alts[i] ?? alts[0] ?? ""]));
    out.push({ post: p, platform, names, caption, alt: alts });
  }
}
const csv = rows.map((r) => r.map((v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(",")).join("\n") + "\n";
writeFileSync(join(dest, "manifest.csv"), csv);

// manifest.md: one section per day, one block per post
const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const md: string[] = [`# ${plan.title ?? `Content batch from ${plan.posts[0]?.date}`}`, ""];
for (const n of plan.notes ?? []) md.push(n);
if (plan.notes?.length) md.push("");
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const byDate = new Map<string, Row[]>(); for (const r of out) byDate.set(r.post.date, [...(byDate.get(r.post.date) ?? []), r]);
for (const [date, rs] of byDate) {
  const d = new Date(`${date}T12:00:00Z`);
  md.push(`## ${rs[0].post.day ? `${rs[0].post.day} · ` : ""}${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]} ${d.getUTCFullYear()}`, "");
  // group platforms of the same post
  const posts = [...new Set(rs.map((r) => r.post))];
  for (const p of posts) {
    const prs = rs.filter((r) => r.post === p);
    md.push(`### ${p.slot ?? (p.asset ? p.asset : "Text post")}: ${prs.map((r) => r.platform).join(", ")}`, "");
    if (p.kit) md.push(`- **Kit:** ${p.kit}`);
    if (prs[0].names.length) {
      md.push("- **Files:**");
      for (const r of prs) for (const n of r.names) md.push(`  - \`${n}\`${existsSync(join(dest, n)) ? ` (${mb(statSync(join(dest, n)).size)})` : ""}`);
    } else md.push("- **Files:** none (text only)");
    md.push("- **Caption to post:**", "", prs[0].caption.split("\n").map((l) => `  > ${l}`).join("\n"), "");
    if (prs[0].alt.length === 1) md.push(`- **Alt text:** ${prs[0].alt[0]}`);
    else if (prs[0].alt.length) { md.push("- **Alt text (per slide):**"); prs[0].alt.forEach((a, i) => md.push(`  ${i + 1}. ${a}`)); }
    if (p.note) md.push(`- **Note:** ${p.note}`);
    md.push("");
  }
}
writeFileSync(join(dest, "manifest.md"), md.join("\n").replace(/\n{3,}/g, "\n\n"));
console.log(`${copied} files + manifest.csv + manifest.md → ${dest.replace(CONTENT + "/", "content/")}${missing ? ` (${missing} post(s) skipped: asset not rendered)` : ""}`);
if (missing) process.exitCode = 1;
