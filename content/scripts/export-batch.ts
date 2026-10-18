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
// --from / --to YYYY-MM-DD keep only the posts dated inside that range (inclusive; default: every post).
// --allow-missing-presenter: a presenter reel (remotion/presenter.json) that hasn't been rendered is listed as missing
// instead of failing the export (those need paid ElevenLabs takes and are made by hand; the scheduled render uses this).
// Besides manifest.csv / manifest.md it writes manifest.json (one entry per post, files per platform), which
// scripts/upload-week.ts turns into the uploaded week manifest.
//
// Music: every exported mp4 gets the brand soundtrack (scripts/add-music.ts, track and offset from scripts/music.ts),
// mixed from the clean render into out/music/ and recorded per post as `music` in manifest.json / .csv / .md.
// MUSIC=off exports the clean renders; a post's `music` ("off", "<track id>", "<track id>@<seconds>") overrides.
//
// Fallbacks and interim reels (scripts/plan-posts.ts): a post's `fallback` is exported as a post of its own on the same
// day (slot "Fallback: …", `fallback_for` in manifest.json) unless the post has `"use": "original"`; a post with
// `interim` exports its `asset` when that's rendered, else the interim version (`interim: true` in manifest.json).
//
// Default order alternates a dial clip with a card, so the first week is the soft-launch mix in gtm-plan.md §2.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { planMusic, resolveOffset, type Choice } from "./music";
import { loadLibrary, mixCached, seconds } from "./add-music";
import { expandPosts } from "./plan-posts";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(CONTENT, "out");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };

// asset id → file(s) under content/out/
const files = new Map<string, string[]>();
for (const dir of ["clips", "signs", "cohorts", "quotes", "stills", "presenter"]) {
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
type Post = { date: string; asset?: string; interim?: string; platforms?: string[]; caption?: string; alt?: string | string[]; day?: string; slot?: string; kit?: string; note?: string; time?: string; ref?: string; music?: string; fallback_for?: string };
type Plan = { title?: string; notes?: string[]; posts: Post[] };
let plan: Plan;
const planPath = arg("plan");
if (planPath) { const p = JSON.parse(readFileSync(resolve(planPath), "utf8")); plan = Array.isArray(p) ? { posts: p } : p; plan = { ...plan, posts: expandPosts(plan.posts) as Post[] }; }
else {
  const start = arg("start") ?? new Date().toISOString().slice(0, 10);
  const clips = [...files.keys()].filter((k) => files.get(k)![0].includes("/clips/") && !k.endsWith("_vo"));
  const cards = [...files.keys()].filter((k) => k.startsWith("cohort-") || k.startsWith("quote-") || k.endsWith("-vertical"));
  const order: string[] = []; for (let i = 0; i < Math.max(clips.length, cards.length); i++) { if (clips[i]) order.push(clips[i]); if (cards[i]) order.push(cards[i]); }
  plan = { posts: order.map((asset, i) => ({ date: new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10), asset })) };
}
// the asset a post exports: its own when rendered, else its interim version when that is (a presenter reel waiting
// for paid takes), else its own (reported missing)
const effective = (p: Post) => p.asset && !files.has(p.asset) && p.interim && files.has(p.interim) ? p.interim : p.asset;
// music choices over the whole plan (before --from/--to), so one week of a plan gets what a full export gets
const presenterAll = new Set<string>(existsSync(join(CONTENT, "remotion", "presenter.json"))
  ? ((JSON.parse(readFileSync(join(CONTENT, "remotion", "presenter.json"), "utf8")).reels ?? []) as Array<{ id: string }>).map((r) => r.id) : []);
const musicOff = /^(off|0|false|no)$/i.test(process.env.MUSIC ?? "");
const library = musicOff ? null : loadLibrary();
const choices = new Map<Post, Choice | null>();
if (library) planMusic(plan.posts.map((p) => ({ ...p, asset: effective(p) })), library, {
  isVideo: (a) => files.get(a)?.[0]?.endsWith(".mp4") ?? false,
  ids: { cohorts: new Set(cohorts.map((c) => c.id)), presenter: presenterAll },
  env: process.env,
}).forEach((c, i) => choices.set(plan.posts[i], c));
type MusicInfo = { track: string; direction: string; use: string; offset: number; file: string; source: string; versions: Record<string, { voice: boolean; lufs: number; tp: number }> } | { off: string };
const musicOf = new Map<Post, MusicInfo>();
const MUSIC_OUT = join(OUT, "music");
// CSV column: "<track>@<offset>s" (or "off") for videos, empty for stills and text posts
const musicCol = (p: Post) => { const m = musicOf.get(p); return !m ? "" : "off" in m ? "off" : `${m.track}@${m.offset}s`; };

const from = arg("from"), to = arg("to");
for (const [n, v] of [["from", from], ["to", to]]) if (v !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { console.error(`--${n} must be YYYY-MM-DD`); process.exit(1); }
if (from || to) {
  plan = { ...plan, posts: plan.posts.filter((p) => (!from || p.date >= from) && (!to || p.date <= to)) };
  console.log(`${plan.posts.length} post(s) dated ${from ?? "…"} – ${to ?? "…"}`);
}
const presenterIds = new Set<string>(argv.includes("--allow-missing-presenter") && existsSync(join(CONTENT, "remotion", "presenter.json"))
  ? ((JSON.parse(readFileSync(join(CONTENT, "remotion", "presenter.json"), "utf8")).reels ?? []) as Array<{ id: string }>).map((r) => r.id) : []);

const destArg = arg("dest") ?? (arg("name") ? join("export", arg("name")!) : undefined);
const dest = destArg ? (isAbsolute(destArg) ? destArg : join(OUT, destArg)) : join(OUT, "export", `batch-${plan.posts[0]?.date ?? "empty"}`);
mkdirSync(dest, { recursive: true });
const rows = [["date", "platform", "file", "caption", "alt", "other_version", "music"]];
type Row = { post: Post; platform: string; names: string[]; caption: string; alt: string[] };
const out: Row[] = [];
let copied = 0, missing = 0;
const missingAssets = new Set<string>();
for (const p0 of plan.posts) {
  // p0 is the plan's post (keys the maps); p the same post with the asset it actually exports
  const p = { ...p0, asset: effective(p0) };
  const caption = p.caption ?? defaultCaption(p.asset);
  const alts = p.alt === undefined ? [] : Array.isArray(p.alt) ? p.alt : [p.alt];
  if (!p.asset) {
    for (const platform of p.platforms ?? ["x", "threads"]) { rows.push([p.date, platform, "", caption, "", "", ""]); out.push({ post: p0, platform, names: [], caption, alt: [] }); }
    continue;
  }
  const src = files.get(p.asset);
  if (!src) {
    missingAssets.add(p.asset);
    if (presenterIds.has(p.asset)) { console.warn(`! ${p.date}: presenter reel "${p.asset}" not rendered (made by hand: npm run presenter -- ${p.asset}); listed as missing`); continue; }
    console.warn(`skip ${p.date}: no rendered asset "${p.asset}"`); missing++; continue;
  }
  const ext = extname(src[0]);
  // a dial clip rendered with a voiceover has a twin <asset>_vo.mp4: export both; the CSV's `file` is the VO version
  // and `other_version` the silent one (both are captioned, both get the same music track and offset)
  const vo = ext === ".mp4" ? files.get(`${p.asset}_vo`)?.[0] : undefined;
  // what gets copied: the clean render, or its music mix in out/music/ (names in the export stay the clean ones)
  let media = src, voMedia = vo;
  if (ext === ".mp4") {
    const c = choices.get(p0);
    if (!c) musicOf.set(p0, { off: musicOff ? "MUSIC=off" : /^off$/i.test(p.music ?? "") ? "plan: off" : "none" });
    else {
      const track = library!.tracks.find((t) => t.id === c.track)!;
      const offset = resolveOffset(track, c, seconds(src[0]));
      const versions: Record<string, { voice: boolean; lufs: number; tp: number }> = {};
      const mixed = (f: string) => {
        const o = join(MUSIC_OUT, `${p.date}_${basename(f)}`);
        const r = mixCached(f, o, track, offset);
        versions[basename(f, ".mp4").endsWith("_vo") ? "vo" : "silent"] = { voice: r.voice, lufs: Math.round(r.lufs * 10) / 10, tp: Math.round(r.tp * 10) / 10 };
        console.log(`  ♪ ${p.date} ${basename(f)}: ${track.id}@${offset}s${r.voice ? ", ducked under the voice" : ", music only"} (${r.lufs.toFixed(1)} LUFS, ${r.tp.toFixed(1)} dBTP${r.cached ? ", cached" : ""})`);
        return o;
      };
      media = src.map(mixed);
      if (vo) voMedia = mixed(vo);
      musicOf.set(p0, { track: track.id, direction: track.direction, use: c.use, offset, file: `music/${track.file}`, source: c.source, versions });
    }
  }
  for (const platform of p.platforms ?? (ext === ".mp4" ? VIDEO : STILL)) {
    const names = src.map((s) => `${p.date}_${platform}_${basename(s, ext)}${ext}`);
    media.forEach((s, i) => { copyFileSync(s, join(dest, names[i])); copied++; });
    if (vo && voMedia) {
      const vn = `${p.date}_${platform}_${basename(vo, ext)}${ext}`; copyFileSync(voMedia, join(dest, vn)); copied++;
      rows.push([p.date, platform, vn, caption, alts[0] ?? "", names[0], musicCol(p0)]);
      out.push({ post: p0, platform, names: [vn, ...names], caption, alt: alts });
      continue;
    }
    names.forEach((n, i) => rows.push([p.date, platform, n, caption, alts[i] ?? alts[0] ?? "", "", musicCol(p0)]));
    out.push({ post: p0, platform, names, caption, alt: alts });
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
    if (p.fallback_for) md.push(`- **Fallback** for "${p.fallback_for}" (made by hand): goes out unless that post has \`"use": "original"\` in the plan, or is cancelled in the queue when the original is posted.`);
    if (p.interim && effective(p) === p.interim) md.push(`- **Interim version** (no Anna, no voice, music only) until \`${p.asset}\` is rendered (scripts/presenter-prep.ts).`);
    if (prs[0].names.length) {
      md.push("- **Files:**");
      const kind = (n: string) => !n.endsWith(".mp4") ? "" : n.endsWith("_vo.mp4") ? ", with voiceover" : prs[0].names.some((x) => x.endsWith("_vo.mp4")) ? ", silent" : "";
      for (const r of prs) for (const n of r.names) md.push(`  - \`${n}\`${existsSync(join(dest, n)) ? ` (${mb(statSync(join(dest, n)).size)}${kind(n)})` : ""}`);
    } else md.push("- **Files:** none (text only)");
    md.push("- **Caption to post:**", "", prs[0].caption.split("\n").map((l) => `  > ${l}`).join("\n"), "");
    if (prs[0].alt.length === 1) md.push(`- **Alt text:** ${prs[0].alt[0]}`);
    else if (prs[0].alt.length) { md.push("- **Alt text (per slide):**"); prs[0].alt.forEach((a, i) => md.push(`  ${i + 1}. ${a}`)); }
    const mu = musicOf.get(p);
    if (mu) md.push(`- **Music:** ${"off" in mu ? `none (${mu.off})` : `${mu.track} (${mu.direction}) from ${mu.offset} s${mu.source === "override" ? ", set in the plan" : ""}`}`);
    if (p.note) md.push(`- **Note:** ${p.note}`);
    md.push("");
  }
}
writeFileSync(join(dest, "manifest.md"), md.join("\n").replace(/\n{3,}/g, "\n\n"));

// manifest.json: the machine-readable version (one entry per post; `files` maps platform → file names in this folder,
// the _vo version first when there is one). scripts/upload-week.ts reads it.
const json = {
  version: 1, title: plan.title ?? null, from: from ?? plan.posts[0]?.date ?? null, to: to ?? plan.posts[plan.posts.length - 1]?.date ?? null,
  posts: plan.posts.map((p) => {
    const rs = out.filter((r) => r.post === p);
    const alts = p.alt === undefined ? [] : Array.isArray(p.alt) ? p.alt : [p.alt];
    return {
      date: p.date, day: p.day ?? null, slot: p.slot ?? null, time: p.time ?? null, ref: p.ref ?? null, asset: effective(p) ?? null,
      // the interim version went out because the finished reel (final_asset) isn't rendered yet
      ...(p.interim ? { interim: effective(p) === p.interim, final_asset: p.asset ?? null } : {}),
      // a fallback post (plan-posts.ts): the slot of the post it stands in for, which is made by hand
      ...(p.fallback_for ? { fallback_for: p.fallback_for } : {}),
      kit: p.kit ?? null, note: p.note ?? null, platforms: p.platforms ?? (rs.length ? rs.map((r) => r.platform) : []),
      caption: p.caption ?? defaultCaption(effective(p)), alt: alts,
      missing: effective(p) ? missingAssets.has(effective(p)!) : false,
      // the soundtrack this post's video(s) carry: { track, direction, use, offset (s), file, source, versions }, or
      // { off: why }; null for stills, text posts and missing assets
      music: musicOf.get(p) ?? null,
      files: Object.fromEntries(rs.map((r) => [r.platform, r.names])),
    };
  }),
};
writeFileSync(join(dest, "manifest.json"), JSON.stringify(json, null, 2) + "\n");
console.log(`${copied} files + manifest.csv + manifest.md + manifest.json → ${dest.replace(CONTENT + "/", "content/")}${missing ? ` (${missing} post(s) skipped: asset not rendered)` : ""}`);
if (missing) process.exitCode = 1;
