#!/usr/bin/env bun
// Mixing stage: lays a brand soundtrack (content/music/) under a finished video. export-batch.ts calls it for every
// exported mp4 (so render-batch.ts and the scheduled GitHub render get it too); it always mixes from the clean
// render and writes to content/out/music/, so music is never stacked twice.
//
//   bun scripts/add-music.ts <in.mp4> <out.mp4> --track A1 [--offset 36]   one video
//   bun scripts/add-music.ts --library                                       rebuild music/library.json from music/*.mp3
//   bun scripts/add-music.ts <in.mp4> <out.mp4> --track A1 --stems <dir>    also write the voice and ducked-music stems
//                                                                            (after the final gain) for measuring
//
// The mix:
//   - music from the start offset, trimmed to the video, fade in 0.3 s and out 1.5 s at the end (looped if the video
//     is longer than the track);
//   - with a voice (the input's audio is louder than −45 LUFS: an _vo render or a presenter reel): the bed sits at
//     BED_LUFS and is ducked by a sidechain compressor keyed on the voice track (wet/dry capped, so speech pulls it
//     down ~8 dB, i.e. roughly 18–22 LU under the voice, and it comes back up in the gaps); then two-pass loudnorm of
//     the mix to −16 LUFS integrated, −2 dBTP (≤ −1.5 after AAC), as the presenter render and the VO step do;
//   - without a voice (silent renders): the music alone, normalised to −16 LUFS the same way;
//   - video stream copied, audio AAC 192k 48 kHz, and the file is tagged `comment=rite-music:<track>@<offset>`;
//     an input that already carries the tag is refused.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { offsetsFor, type Direction, type Library, type Track, type Use } from "./music";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MUSIC_DIR = join(CONTENT, "music");
export const LIBRARY = join(MUSIC_DIR, "library.json");
export const MIX_VERSION = 2;          // bump when the mix changes, so cached mixes are redone
export const TARGET = { I: -16, TP: -2, LRA: 11 };
export const BED_LUFS = -29;           // music level before ducking (gaps between speech)
export const BED_SILENT_LUFS = -16;    // music-only videos
export const DUCK = "sidechaincompress=threshold=0.01:ratio=20:attack=15:release=350:knee=2:detection=rms:mix=0.65";
export const FADE_IN = 0.3, FADE_OUT = 1.5;
export const VOICE_FLOOR_LUFS = -45;   // quieter than this = no voice (a silent AAC track)
const TAG = "rite-music:";

const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const ff = (args: string[]) => { const r = sh("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args]); if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-800)}`); return r; };

export function seconds(file: string): number {
  const r = sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  const s = parseFloat(r.stdout); if (!Number.isFinite(s)) throw new Error(`ffprobe couldn't read ${file}`); return s;
}
/** Integrated loudness (LUFS; -Infinity for silence) and true peak (dBTP) of a file's audio. */
export function loudness(file: string): { lufs: number; tp: number } {
  const r = sh("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const s = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const i = /I:\s+(-?[\d.]+|-inf) LUFS/.exec(s)?.[1], p = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(s)?.[1];
  const n = (v?: string) => (v === undefined ? NaN : v === "-inf" ? -Infinity : parseFloat(v));
  return { lufs: n(i), tp: n(p) };
}
/** The `rite-music:` tag of a file, or null when it has no music from this stage. */
export function musicTag(file: string): string | null {
  const r = sh("ffprobe", ["-v", "error", "-show_entries", "format_tags=comment", "-of", "default=nw=1:nk=1", file]);
  const c = r.stdout.trim(); return c.startsWith(TAG) ? c.slice(TAG.length) : null;
}

export function loadLibrary(): Library { return JSON.parse(readFileSync(LIBRARY, "utf8")); }

/** Rebuilds library.json from music/rite-theme-<id>-<direction>.mp3 (duration, loudness, offsets). */
export function buildLibrary(): Library {
  const tracks: Track[] = [];
  for (const f of readdirSync(MUSIC_DIR).filter((x) => x.endsWith(".mp3")).sort()) {
    const m = /^rite-theme-([A-Z]\d+)-(felt-piano|orbit|pulse)\.mp3$/.exec(f);
    if (!m) { console.warn(`skip ${f}: not rite-theme-<id>-<felt-piano|orbit|pulse>.mp3`); continue; }
    const file = join(MUSIC_DIR, f), duration = Math.round(seconds(file) * 1000) / 1000, { lufs } = loudness(file);
    const direction = m[2] as Direction, use: Use = direction === "pulse" ? "cards" : "voice";
    tracks.push({ id: m[1], direction, file: f, duration, lufs: Math.round(lufs * 10) / 10, use, offsets: offsetsFor(duration) });
  }
  const lib: Library = {
    version: 1,
    note: "Rite brand soundtrack. felt-piano (A) and orbit (C): voice-led pieces (dial clips, Anna presenter reels); pulse (B): card and sign verticals and other videos. offsets: usable start points in seconds (every 8 s from 4 s, none in the last 20 s). Rebuild with `bun scripts/add-music.ts --library`.",
    tracks,
  };
  writeFileSync(LIBRARY, JSON.stringify(lib, null, 2) + "\n");
  return lib;
}

/** Two-pass loudness: pass 1 measures (EBU R128, loudnorm), pass 2 applies the linear gain to TARGET.I and a
 *  4×-oversampled peak limiter at LIMIT dBFS, so the peak target holds for music-heavy mixes too (loudnorm's own
 *  linear mode falls back to dynamic compression when a gain would push peaks over, which shifted loudness). */
export const LIMIT_DB = -2.5;
export const PEAK_MAX = -1.5;   // dBTP after the AAC encode; the limiter is lowered and the encode redone if over
function twoPass(raw: string, out: string, limitDb = LIMIT_DB) {
  const r = sh("ffmpeg", ["-hide_banner", "-i", raw, "-af", `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`, "-f", "null", "-"]);
  const m = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(r.stderr); if (!m) throw new Error(`loudnorm measure failed: ${r.stderr.slice(-500)}`);
  const j = JSON.parse(m[0]) as Record<string, string>;
  const gain = TARGET.I - parseFloat(j.input_i);
  const lim = Math.pow(10, limitDb / 20).toFixed(4);
  const af = `volume=${gain.toFixed(2)}dB,aresample=192000,alimiter=limit=${lim}:attack=2:release=80:level=false:latency=true,aresample=48000`;
  ff(["-i", raw, "-af", af, "-c:a", "pcm_f32le", out]);
  return { af, measuredI: parseFloat(j.input_i), gain };
}

export type MixResult = { track: string; offset: number; voice: boolean; seconds: number; lufs: number; tp: number };

/** Mixes `track` from `offset` under the video `input` → `output` (see the header). */
export function mixMusic(input: string, output: string, track: Track, offset: number, opts: { stems?: string } = {}): MixResult {
  if (resolve(input) === resolve(output)) throw new Error("add-music: output must differ from input (mix from the clean render)");
  const have = musicTag(input); if (have) throw new Error(`${basename(input)} already has music (${have}); mix from the clean render`);
  const dur = seconds(input);
  const voice = loudness(input).lufs > VOICE_FLOOR_LUFS;
  const musicFile = join(MUSIC_DIR, track.file);
  const tmp = `${output}.work`; mkdirSync(tmp, { recursive: true });
  const fmt = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  // the part of the track this video uses, measured on its own: a track's integrated loudness says little about
  // a 30 s stretch of it (quiet intros, builds), so the bed gain is set from the segment
  const seg = join(tmp, "music.wav");
  const loop = offset + dur > track.duration ? ["-stream_loop", "-1"] : [];
  ff([...loop, "-ss", offset.toFixed(3), "-i", musicFile, "-t", dur.toFixed(3), "-af", fmt, "-c:a", "pcm_f32le", seg]);
  const segLufs = loudness(seg).lufs;
  const gain = Number.isFinite(segLufs) ? (voice ? BED_LUFS : BED_SILENT_LUFS) - segLufs : 0;
  const fade = `afade=t=in:st=0:d=${FADE_IN},afade=t=out:st=${Math.max(0, dur - FADE_OUT).toFixed(3)}:d=${FADE_OUT}`;
  const mus = `[1:a]${fmt},apad,atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS,volume=${gain.toFixed(2)}dB,${fade}`;
  const inputs = ["-i", input, "-i", seg];
  const raw = join(tmp, "mix.wav");
  try {
    if (voice) {
      const graph = `[0:a]${fmt},asplit=2[v][key];${mus}[m];[m][key]${DUCK}[d];[v][d]amix=inputs=2:normalize=0:duration=first[a]`;
      ff([...inputs, "-filter_complex", graph, "-map", "[a]", "-t", dur.toFixed(3), "-c:a", "pcm_f32le", raw]);
    } else {
      ff([...inputs, "-filter_complex", `${mus}[a]`, "-map", "[a]", "-t", dur.toFixed(3), "-c:a", "pcm_f32le", raw]);
    }
    const norm = join(tmp, "norm.wav");
    twoPass(raw, norm);
    if (opts.stems && voice) {
      // the same chain, one stem at a time, with the final (linear) loudnorm gain
      mkdirSync(opts.stems, { recursive: true });
      const stem = basename(output, ".mp4");
      const v = join(tmp, "v.wav"), d = join(tmp, "d.wav");
      ff([...inputs, "-filter_complex", `[0:a]${fmt},asplit=2[v][key];${mus}[m];[m][key]${DUCK}[d];[v]anullsink`, "-map", "[d]", "-t", dur.toFixed(3), "-c:a", "pcm_f32le", d]);
      ff(["-i", input, "-af", fmt, "-t", dur.toFixed(3), "-c:a", "pcm_f32le", v]);
      // loudnorm in linear mode is a plain gain: apply the gain the mix got (measured − target) to each stem
      const gainDb = TARGET.I - loudness(raw).lufs;
      ff(["-i", v, "-af", `volume=${gainDb.toFixed(2)}dB`, "-c:a", "pcm_f32le", join(opts.stems, `${stem}.voice.wav`)]);
      ff(["-i", d, "-af", `volume=${gainDb.toFixed(2)}dB`, "-c:a", "pcm_f32le", join(opts.stems, `${stem}.music.wav`)]);
    }
    mkdirSync(dirname(output), { recursive: true });
    const mux = () => ff(["-i", input, "-i", norm, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
      "-t", dur.toFixed(3), "-metadata", `comment=${TAG}${track.id}@${offset}`, "-movflags", "+faststart", output]);
    mux();
    // dense, heavily limited music can overshoot by 1–2 dB in the AAC encode: lower the limiter by the excess and redo
    for (let limit = LIMIT_DB, i = 0; i < 3; i++) {
      const tp = loudness(output).tp; if (!(tp > PEAK_MAX)) break;
      limit -= tp - PEAK_MAX + 0.3; twoPass(raw, norm, limit); mux();
    }
  } finally { if (!process.env.MUSIC_KEEP_WORK) rmSync(tmp, { recursive: true, force: true }); }
  const m = loudness(output);
  return { track: track.id, offset, voice, seconds: Math.round(dur * 100) / 100, lufs: m.lufs, tp: m.tp };
}

/** Cached mix for export: reuses out/music/<name> when the clean source, track, offset and mix version match. */
export function mixCached(input: string, output: string, track: Track, offset: number): MixResult & { cached: boolean } {
  const st = statSync(input);
  const key = { v: MIX_VERSION, src: resolve(input), bytes: st.size, mtimeMs: Math.round(st.mtimeMs), track: track.id, offset };
  const side = output.replace(/\.mp4$/, ".music.json");
  if (existsSync(output) && existsSync(side)) {
    const s = JSON.parse(readFileSync(side, "utf8"));
    if (JSON.stringify(s.key) === JSON.stringify(key)) return { ...s.result, cached: true };
  }
  const result = mixMusic(input, output, track, offset);
  writeFileSync(side, JSON.stringify({ key, result }, null, 2) + "\n");
  return { ...result, cached: false };
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const arg = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
  if (argv.includes("--library")) {
    const lib = buildLibrary();
    for (const t of lib.tracks) console.log(`  ${t.id} ${t.direction.padEnd(10)} ${t.duration.toFixed(1)} s  ${t.lufs} LUFS  ${t.offsets.length} offsets`);
    console.log(`✓ ${LIBRARY.replace(CONTENT + "/", "content/")}`);
    process.exit(0);
  }
  const [input, output] = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const id = arg("track");
  if (!input || !output || !id) { console.error("usage: bun scripts/add-music.ts <in.mp4> <out.mp4> --track <id> [--offset <s>] [--stems <dir>] | --library"); process.exit(1); }
  const t = loadLibrary().tracks.find((x) => x.id === id); if (!t) { console.error(`no track ${id} in music/library.json`); process.exit(1); }
  const r = mixMusic(resolve(input), resolve(output), t, arg("offset") ? +arg("offset")! : t.offsets[0], { stems: arg("stems") });
  console.log(`✓ ${output}: ${r.track}@${r.offset}s, ${r.voice ? "ducked under the voice" : "music only"}, ${r.lufs.toFixed(1)} LUFS, ${r.tp.toFixed(1)} dBTP`);
}
