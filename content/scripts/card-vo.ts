#!/usr/bin/env bun
// Voiceover for card verticals (VerticalCard, SignCardVertical), used by remotion/render-all.sh:
//
//   bun scripts/card-vo.ts seconds <key>                 how long to render the vertical, in seconds
//   bun scripts/card-vo.ts mux <key> <video.mp4> <out.mp4>  out.mp4 = video + a silent AAC track; and, when a VO take is
//                                                         available, out_vo.mp4 = video + the VO (loudness-normalised)
//
// <key> is cards/<card id> (e.g. cards/quote-closest-turn) or signs/<slug> (signs/aries). The text is
// clips/card-vo.json[<card id>] / [sign-<slug>]. The take comes from the same providers as the dial clips (clips/vo.ts,
// VO_PROVIDER): elevenlabs (default, Anna, eleven_v3) synthesises the text; files reads $VO_DIR/<key>.{wav,mp3,m4a}
// (VO_DIR defaults to clips/vo). With a take the vertical lasts VO + CARD.voLead + CARD.voTail (1.6 s); without one
// it is estimated from the text at CARD.wordsPerSecond, so a silent render is already close to the voiced length.
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { provider, ffprobeSeconds, mixVo, measure, plain, VoUnavailable } from "../clips/vo";
import { CARD } from "../timing";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEXTS = JSON.parse(readFileSync(join(CONTENT, "clips", "card-vo.json"), "utf8")) as Record<string, string>;
const [cmd, key, video, out] = process.argv.slice(2);
if (!cmd || !key || !/^(cards|signs)\/[a-z0-9-]+$/.test(key)) { console.error("usage: bun scripts/card-vo.ts seconds|mux <cards/<card id>|signs/<slug>> [video out]"); process.exit(1); }
const id = key.startsWith("signs/") ? `sign-${key.slice(6)}` : key.slice(6);
const text = TEXTS[id];

/** The take for this card, or null (silent). Never throws for "no VO available". */
async function take(): Promise<string | null> {
  if (!text) return null;
  const p = provider();
  if (p.name === "files") {
    const base = join(process.env.VO_DIR ?? join(CONTENT, "clips", "vo"), key);
    for (const e of ["wav", "mp3", "m4a"]) if (existsSync(`${base}.${e}`)) return `${base}.${e}`;
    return null;
  }
  if (p.unavailable()) return null;
  try { return await p.synth(text, { cohort: key, index: 0 }); } catch (e) { if (e instanceof VoUnavailable) return null; throw e; }
}

const words = (s: string) => plain(s).split(/\s+/).filter(Boolean).length;
const file = await take();
const seconds = file ? ffprobeSeconds(file) + CARD.voLead + CARD.voTail
  : text ? Math.max(CARD.minSeconds, words(text) / CARD.wordsPerSecond + CARD.voLead + CARD.voTail) : CARD.seconds;

if (cmd === "seconds") { console.log(seconds.toFixed(2)); process.exit(0); }
if (cmd !== "mux" || !video || !out) { console.error("mux needs <video.mp4> <out.mp4>"); process.exit(1); }
const ff = (args: string[]) => { const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };
const dur = ffprobeSeconds(video);
// silent version: a silent AAC track, like the dial clips (some schedulers reject video with no audio stream)
ff(["-i", video, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out]);
const voOut = out.replace(/\.mp4$/, "_vo.mp4");
if (file) {
  const wav = out.replace(/\.mp4$/, ".vo.wav");
  mixVo([{ file, at: CARD.voLead }], dur, wav);
  ff(["-i", video, "-i", wav, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", dur.toFixed(3), "-movflags", "+faststart", voOut]);
  rmSync(wav, { force: true });
  const m = measure(voOut);
  console.log(`  + ${voOut.replace(CONTENT + "/", "")} (VO ${m.lufs.toFixed(1)} LUFS, peak ${m.tp.toFixed(1)} dBTP)`);
} else {
  rmSync(voOut, { force: true }); // never leave a stale VO version next to a new silent one
  if (text) console.log(`  (no VO take for ${key}: silent, ${dur.toFixed(1)} s estimated from the text)`);
}
