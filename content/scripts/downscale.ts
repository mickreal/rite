#!/usr/bin/env bun
// 4K masters → upload renders (README "4K masters"). For every render in content/out/master/<group>/ (cards, verticals,
// dial clips, stills, presenter reels, carousel slides) writes the 1080-wide copy with the same name to
// content/out/<group>/, where export-batch.ts reads. Videos: H.264 high, CRF 18, lanczos, audio copied untouched (the
// brand soundtrack is mixed once, at export); stills: PNG, lanczos. Up-to-date copies are skipped.
//
//   bun scripts/downscale.ts              everything in out/master/
//   bun scripts/downscale.ts --force      redo every copy
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GROUPS, downscaleStillArgs, downscaleVideoArgs, fitWidth, staleUploads } from "./scale";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MASTER = join(CONTENT, "out", "master");
const force = process.argv.includes("--force");

function size(file: string): { w: number; h: number } {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [w, h] = r.stdout.trim().split(",").map(Number);
  if (!w || !h) throw new Error(`ffprobe couldn't read ${file}`);
  return { w, h };
}

if (!existsSync(MASTER)) { console.error("No content/out/master/ yet: render with SCALE=2 first."); process.exit(1); }
const pairs: Array<{ master: string; upload: string; masterMtime: number; uploadMtime: number | null }> = [];
for (const g of GROUPS) {
  const d = join(MASTER, g); if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) {
    if (!/\.(mp4|png)$/.test(f)) continue;
    const master = join(d, f), upload = join(CONTENT, "out", g, f);
    pairs.push({ master, upload, masterMtime: statSync(master).mtimeMs, uploadMtime: !force && existsSync(upload) ? statSync(upload).mtimeMs : null });
  }
}
const todo = new Set(staleUploads(pairs));
let made = 0;
for (const p of pairs) {
  if (!todo.has(p.master)) continue;
  mkdirSync(dirname(p.upload), { recursive: true });
  const from = size(p.master), to = fitWidth(from.w, from.h);
  const args = extname(p.master) === ".mp4" ? downscaleVideoArgs(p.master, p.upload, to) : downscaleStillArgs(p.master, p.upload, to);
  const r = spawnSync("ffmpeg", args, { encoding: "utf8" });
  if (r.status !== 0) { console.error(`✗ ${p.master}: ${r.stderr.slice(-400)}`); process.exit(1); }
  console.log(`  ${p.master.replace(CONTENT + "/", "")} ${from.w}×${from.h} → ${p.upload.replace(CONTENT + "/", "")} ${to.w}×${to.h}`);
  made++;
}
console.log(`✓ ${made} upload cop${made === 1 ? "y" : "ies"} made, ${pairs.length - made} up to date (${pairs.length} masters)`);
