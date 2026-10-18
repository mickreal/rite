#!/usr/bin/env bun
// Uploads one exported week (render-batch.ts / export-batch.ts output) to the R2 bucket and writes the week manifest
// that auto-posting (build 5, Postiz) reads.
//
//   bun scripts/upload-week.ts --week 2026-12-14                     uploads out/week-2026-12-14/
//   bun scripts/upload-week.ts --week 2026-12-14 --dir out/launch    another export folder
//   bun scripts/upload-week.ts --week 2026-12-14 --dry-run           prints the keys and the manifest, uploads nothing
//
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default rite-content), R2_PUBLIC_BASE (the
// bucket's public URL), POST_TZ (default Australia/Brisbane) and POST_TIME (default 09:00): a post's slot is its
// plan `time` ("HH:MM" in POST_TZ) or POST_TIME on its date, stored in UTC.
//
// Layout in the bucket:
//   weeks/<week>/<16-char random id>/<date>_<asset>[_vo]-<sha12>.mp4 | <date>_<carousel>-NN-<sha12>.png
//                                                    media, one copy per post (the per-platform copies in the export
//                                                    folder are the same file); <sha12> = first 12 hex of the file's
//                                                    sha256 (media-key.ts), cached immutable for a year
//   weeks/<week>/manifest.json                       the week (format in content/README.md, "Scheduled render")
//   weeks/latest.json                                { week_start, manifest, manifest_url, updated_at } of the newest week
// The random folder keeps media URLs unguessable; a re-upload of the same week gets a new folder and a new manifest.
// Each media entry in the manifest has its full `sha256`: og-content-system's engine re-downloads the file before
// scheduling and refuses it unless the bytes, the hash and the `-<sha12>` in the file name all agree.
// A local copy of the manifest goes to out/weeks/<week>/manifest.json (rolling-plan.ts reads it when R2 isn't set).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { postMeta, type MetaData } from "./post-meta";
import { contentHashedName, IMMUTABLE_CACHE, MANIFEST_CACHE } from "./media-key";
import { publicUrl, r2FromEnv, r2GetText, r2Put } from "./r2";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const W = arg("week") ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(W)) { console.error("usage: bun scripts/upload-week.ts --week YYYY-MM-DD [--dir <export folder>] [--dry-run]"); process.exit(1); }
const dryRun = argv.includes("--dry-run");
const dirArg = arg("dir") ?? join("out", `week-${W}`);
const dir = isAbsolute(dirArg) ? dirArg : resolve(CONTENT, dirArg);
const exportManifest = join(dir, "manifest.json");
if (!existsSync(exportManifest)) { console.error(`no ${exportManifest}: export the week first (render-batch.ts / export-batch.ts write it)`); process.exit(1); }
const r2 = r2FromEnv();
if (!dryRun && !r2) { console.error("R2 credentials are not set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY); use --dry-run to preview"); process.exit(1); }
if (!dryRun && !r2!.publicBase) { console.error("R2_PUBLIC_BASE is not set (the bucket's public URL, e.g. https://pub-….r2.dev); the manifest needs it for file URLs"); process.exit(1); }

type ExportPost = { date: string; day: string | null; slot: string | null; time: string | null; ref: string | null; asset: string | null; kit: string | null; note: string | null; platforms: string[]; caption: string; alt: string[]; missing: boolean; files: Record<string, string[]> };
const exp = JSON.parse(readFileSync(exportManifest, "utf8")) as { title: string | null; from: string | null; to: string | null; posts: ExportPost[] };

// ---------- slot time in UTC ----------
const TZ = process.env.POST_TZ || "Australia/Brisbane";
const DEFAULT_TIME = process.env.POST_TIME || "09:00";
const offsetMs = (t: number) => { // TZ's offset from UTC at instant t
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
};
function slotUtc(date: string, time: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time); if (!m) throw new Error(`time "${time}" on ${date} is not HH:MM`);
  const [y, mo, d] = date.split("-").map(Number);
  const local = Date.UTC(y, mo - 1, d, +m[1], +m[2]);
  let t = local - offsetMs(local); t = local - offsetMs(t); // second pass settles a DST edge
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------- files ----------
const AUTO = new Set(["tiktok", "reels", "shorts", "instagram", "x", "threads"]);
const TYPE: Record<string, string> = { ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const ALPHA = "abcdefghijklmnopqrstuvwxyz0123456789";
const rid = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => ALPHA[b % ALPHA.length]).join("");
const prefix = `weeks/${W}/${rid}/`;
// name: the logical object name (as before, e.g. `<date>_<asset>_vo.mp4`); key/url: the content-hashed object.
type File = { url: string; key: string; name: string; type: string; bytes: number; sha256: string };
const uploads = new Map<string, { src: string; file: File }>(); // object name → upload
function fileFor(post: ExportPost, platform: string, name: string): File {
  const object = name.startsWith(`${post.date}_${platform}_`) ? `${post.date}_${name.slice(post.date.length + platform.length + 2)}` : name;
  const have = uploads.get(object); if (have) return have.file;
  const src = join(dir, name);
  if (!existsSync(src)) throw new Error(`${name} is in manifest.json but not in ${dir}`);
  const sha256 = createHash("sha256").update(readFileSync(src)).digest("hex");
  const key = prefix + contentHashedName(object, sha256);
  const file: File = { url: publicUrl(r2, key), key, name: object, type: TYPE[extname(name).toLowerCase()] ?? "application/octet-stream", bytes: statSync(src).size, sha256 };
  uploads.set(object, { src, file });
  return file;
}

// title + presenter per post (post-meta.ts): read by auto-posting for YouTube/TikTok titles and the AI flags.
const readJson = (rel: string) => JSON.parse(readFileSync(join(CONTENT, rel), "utf8"));
const metaData: MetaData = {
  cohorts: readJson("clips/cohorts.json").cohorts,
  carousels: readJson("remotion/carousels.json").carousels,
  presenter: readJson("remotion/presenter.json").reels,
};

const posts = exp.posts.map((p, i) => {
  const first = Object.entries(p.files).find(([, names]) => names.length);
  let media: null | { type: "video"; vo: File | null; silent: File } | { type: "image"; files: File[] } = null;
  if (first) {
    const [platform, names] = first;
    const files = names.map((n) => fileFor(p, platform, n));
    if (files[0].type.startsWith("video/")) {
      const vo = files.find((f) => /_vo\.mp4$/.test(f.name)) ?? null;
      media = { type: "video", vo, silent: files.find((f) => f !== vo) ?? files[0] };
    } else media = { type: "image", files };
  }
  const textOnly = !p.asset;
  // auto: build 5 may post it without a person (every platform is one Postiz posts to, the media is there, or it's a
  // text post for X / Threads). Everything else (Reddit, email, creator reposts, talking heads, backdrops, cut-ins,
  // an unrendered presenter reel) stays in the manifest for Mick, with auto: false.
  const auto = p.platforms.length > 0 && p.platforms.every((x) => AUTO.has(x)) && !!p.caption.trim()
    && (textOnly ? p.platforms.every((x) => x === "x" || x === "threads") : !!media && !p.missing);
  return {
    id: `${p.date}-${String(i + 1).padStart(2, "0")}`,
    date: p.date, at: slotUtc(p.date, p.time ?? DEFAULT_TIME), day: p.day, slot: p.slot, kit: p.kit, note: p.note,
    asset: p.asset, ref: p.ref, platforms: p.platforms, auto, missing: p.missing,
    ...postMeta(p.asset, p.caption, metaData),
    caption: p.caption, alt: p.alt, media,
  };
});

const manifestKey = `weeks/${W}/manifest.json`;
const manifest = {
  version: 1,
  week_start: W,
  week_end: new Date(Date.parse(`${W}T00:00:00Z`) + 6 * 86400000).toISOString().slice(0, 10),
  generated_at: new Date().toISOString(),
  title: exp.title,
  tz: TZ, default_time: DEFAULT_TIME,
  base: publicUrl(r2, prefix).replace(/\/$/, ""),
  posts,
};
const body = JSON.stringify(manifest, null, 2) + "\n";
const total = [...uploads.values()].reduce((n, u) => n + u.file.bytes, 0);

if (dryRun) {
  console.log(`DRY RUN: nothing uploaded. Bucket ${r2?.bucket ?? process.env.R2_BUCKET ?? "rite-content"}, ${uploads.size} file(s), ${(total / 1048576).toFixed(1)} MB:`);
  for (const u of uploads.values()) console.log(`  PUT ${u.file.key}  (${(u.file.bytes / 1048576).toFixed(2)} MB, ${u.file.type}, sha256 ${u.file.sha256})`);
  console.log(`  PUT ${manifestKey}\n  PUT weeks/latest.json (if ${W} is the newest week)\n\n${body}`);
  process.exit(0);
}

let n = 0;
for (const u of uploads.values()) {
  const data = new Uint8Array(readFileSync(u.src));
  if (createHash("sha256").update(data).digest("hex") !== u.file.sha256) throw new Error(`${u.src} changed during the upload; run it again`);
  await r2Put(r2!, u.file.key, data, u.file.type, IMMUTABLE_CACHE);
  console.log(`  ↑ ${u.file.key} (${(u.file.bytes / 1048576).toFixed(1)} MB) ${++n}/${uploads.size}`);
}
await r2Put(r2!, manifestKey, body, "application/json", MANIFEST_CACHE);
const prev = await r2GetText(r2!, "weeks/latest.json").then((t) => (t ? JSON.parse(t) as { week_start?: string } : null)).catch(() => null);
if (!prev?.week_start || prev.week_start <= W) {
  await r2Put(r2!, "weeks/latest.json", JSON.stringify({ week_start: W, manifest: manifestKey, manifest_url: publicUrl(r2, manifestKey), updated_at: manifest.generated_at }, null, 2) + "\n", "application/json", MANIFEST_CACHE);
  console.log(`  ↑ weeks/latest.json → ${manifestKey}`);
} else console.log(`  weeks/latest.json left on ${prev.week_start} (newer than ${W})`);
const local = join(CONTENT, "out", "weeks", W);
mkdirSync(local, { recursive: true });
writeFileSync(join(local, "manifest.json"), body);
console.log(`✓ ${uploads.size} file(s), ${(total / 1048576).toFixed(1)} MB → ${r2!.bucket}/${prefix}; manifest ${publicUrl(r2, manifestKey)} (local copy out/weeks/${W}/manifest.json)`);
