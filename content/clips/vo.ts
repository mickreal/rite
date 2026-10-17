// Voiceover step for the dial clips: turns each beat's spoken line into an audio file, measures it, and mixes the
// timed segments into one broadcast-safe track. Providers are pluggable (VO_PROVIDER=…):
//
//   rite-admin (default)  POST $RITE_TTS_URL (default https://rite.mickreal.workers.dev/admin/tts)
//                         {text, voice?, model?} with Authorization: Bearer $RITE_ADMIN_KEY. Same voice pipeline as
//                         the reading's narration; supports pause markup such as "[pause 800]".
//                         Optional: RITE_TTS_VOICE, RITE_TTS_MODEL.
//   elevenlabs            ElevenLabs text-to-speech with $ELEVENLABS_API_KEY (needs the Text to Speech permission).
//                         Voice: $ELEVENLABS_VOICE_ID (default Anna, warm & natural Australian, raT7q57pHznZDO2jDPDe);
//                         model: $ELEVENLABS_MODEL (default eleven_v3). Chosen by Mick on 17 Oct 2026 for the reels.
//                         Write numbers and dates in words in the VO lines ("the thirteenth of May") for the best read.
//   files                 pre-recorded takes: clips/vo/<cohort id>/<NN>.{mp3,wav,m4a} (00 = hook, 01 = first line …),
//                         e.g. Mick's own recording cut into lines.
//
// Without a key (or when the endpoint 404s) there is no VO and the clip renders silent; nothing else is tried.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CLIP } from "../timing";

export type Audio = { file: string; seconds: number };
export interface TtsProvider {
  name: string;
  /** null when usable, else why not (printed, and the clip renders silent). */
  unavailable(): string | null;
  /** One spoken line → a local audio file. Throws VoUnavailable when the service isn't there (404, 401). */
  synth(text: string, ctx: { cohort: string; index: number }): Promise<string>;
}
export class VoUnavailable extends Error {}

const HERE = new URL(".", import.meta.url).pathname;
const CACHE = join(HERE, "vo", "cache");

export function ffprobeSeconds(file: string): number {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const s = parseFloat(r.stdout);
  if (!Number.isFinite(s)) throw new Error(`ffprobe couldn't read ${file}: ${r.stderr}`);
  return s;
}

const extFor = (type: string) => /mpeg|mp3/.test(type) ? "mp3" : /wav|wave/.test(type) ? "wav" : /ogg|opus/.test(type) ? "ogg" : /aac|mp4|m4a/.test(type) ? "m4a" : /webm/.test(type) ? "webm" : "bin";

export const riteAdmin: TtsProvider = {
  name: "rite-admin",
  unavailable: () => process.env.RITE_ADMIN_KEY ? null : "RITE_ADMIN_KEY is not set",
  async synth(text) {
    const url = process.env.RITE_TTS_URL ?? "https://rite.mickreal.workers.dev/admin/tts";
    const body: Record<string, string> = { text };
    if (process.env.RITE_TTS_VOICE) body.voice = process.env.RITE_TTS_VOICE;
    if (process.env.RITE_TTS_MODEL) body.model = process.env.RITE_TTS_MODEL;
    const key = createHash("sha1").update(JSON.stringify([url, body])).digest("hex").slice(0, 16);
    mkdirSync(CACHE, { recursive: true });
    for (const e of ["mp3", "wav", "ogg", "m4a", "webm", "bin"]) { const f = join(CACHE, `${key}.${e}`); if (existsSync(f)) return f; }
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${process.env.RITE_ADMIN_KEY}` }, body: JSON.stringify(body) });
    if (r.status === 404) throw new VoUnavailable(`${url} returned 404 (the /admin/tts endpoint isn't deployed yet)`);
    if (r.status === 401 || r.status === 403) throw new VoUnavailable(`${url} returned ${r.status} (check RITE_ADMIN_KEY)`);
    if (!r.ok) throw new Error(`${url} returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const type = r.headers.get("content-type") ?? "";
    if (/json|text/.test(type)) throw new Error(`${url} returned ${type}, not audio: ${(await r.text()).slice(0, 300)}`);
    const f = join(CACHE, `${key}.${extFor(type)}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    ffprobeSeconds(f); // fail now if it isn't audio
    return f;
  },
};

export const elevenlabs: TtsProvider = {
  name: "elevenlabs",
  unavailable: () => process.env.ELEVENLABS_API_KEY ? null : "ELEVENLABS_API_KEY is not set",
  async synth(text) {
    const voice = process.env.ELEVENLABS_VOICE_ID ?? "raT7q57pHznZDO2jDPDe";
    const body = { text: plain(text), model_id: process.env.ELEVENLABS_MODEL ?? "eleven_v3", voice_settings: { stability: 0.5, similarity_boost: 0.75 } };
    const key = createHash("sha1").update(JSON.stringify(["elevenlabs", voice, body])).digest("hex").slice(0, 16);
    mkdirSync(CACHE, { recursive: true });
    const f = join(CACHE, `${key}.mp3`);
    if (existsSync(f)) return f;
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: "POST", headers: { "content-type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY! }, body: JSON.stringify(body) });
    if (r.status === 401 || r.status === 403) throw new VoUnavailable(`ElevenLabs returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
    if (!r.ok) throw new Error(`ElevenLabs returned ${r.status}: ${(await r.text()).slice(0, 300)}`);
    writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    ffprobeSeconds(f);
    return f;
  },
};

export const files: TtsProvider = {
  name: "files",
  unavailable: () => null,
  async synth(_text, { cohort, index }) {
    const base = join(process.env.VO_DIR ?? join(HERE, "vo"), cohort, String(index).padStart(2, "0"));
    for (const e of ["wav", "mp3", "m4a"]) if (existsSync(`${base}.${e}`)) return `${base}.${e}`;
    throw new VoUnavailable(`no take at ${base}.{wav,mp3,m4a}`);
  },
};

export function provider(): TtsProvider {
  const name = process.env.VO_PROVIDER ?? "elevenlabs";
  const p = ({ "rite-admin": riteAdmin, elevenlabs, files } as Record<string, TtsProvider>)[name];
  if (!p) throw new Error(`Unknown VO_PROVIDER "${name}" (rite-admin | elevenlabs | files)`);
  return p;
}

/** Spoken text → what the caption logic should count (pause markup removed). */
export const plain = (s: string) => s.replace(/\[pause \d+\]/g, " ").replace(/\s+/g, " ").trim();

/** All segments for one clip, or null (with the reason) when VO isn't available. */
export async function synthAll(p: TtsProvider, cohort: string, lines: string[]): Promise<{ audio: Audio[] } | { skip: string }> {
  const why = p.unavailable(); if (why) return { skip: why };
  const audio: Audio[] = [];
  try {
    for (let i = 0; i < lines.length; i++) {
      const file = await p.synth(lines[i], { cohort, index: i });
      audio.push({ file, seconds: ffprobeSeconds(file) });
    }
  } catch (e) {
    if (e instanceof VoUnavailable) return { skip: e.message };
    throw e;
  }
  return { audio };
}

/**
 * Places each segment at its start time (s) on a silent bed of `duration` s, then loudness-normalises the whole track
 * (two-pass loudnorm to CLIP.loudnessLUFS integrated, CLIP.truePeak dBTP) and fades the last CLIP.fadeOut s.
 * Writes a 48 kHz stereo WAV.
 */
export function mixVo(segments: Array<{ file: string; at: number }>, duration: number, out: string) {
  const args = ["-y", "-hide_banner", "-loglevel", "error"];
  segments.forEach((s) => args.push("-i", s.file));
  const parts = segments.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(s.at * 1000)}:all=1[a${i}]`);
  const mix = `${segments.map((_, i) => `[a${i}]`).join("")}amix=inputs=${segments.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration.toFixed(3)}[m]`;
  const raw = out.replace(/\.wav$/, ".raw.wav");
  let r = spawnSync("ffmpeg", [...args, "-filter_complex", [...parts, mix].join(";"), "-map", "[m]", "-ar", "48000", "-c:a", "pcm_s16le", raw], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`VO mix failed: ${r.stderr}`);
  const ln = `loudnorm=I=${CLIP.loudnessLUFS}:TP=${CLIP.truePeak}:LRA=${CLIP.loudnessRange}`;
  r = spawnSync("ffmpeg", ["-hide_banner", "-i", raw, "-af", `${ln}:print_format=json`, "-f", "null", "-"], { encoding: "utf8" });
  const m = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(r.stderr);
  if (!m) throw new Error(`loudnorm measure failed: ${r.stderr.slice(-500)}`);
  const j = JSON.parse(m[0]) as Record<string, string>;
  const pass2 = `${ln}:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", raw, "-af", `${pass2},aresample=48000,afade=t=out:st=${(duration - CLIP.fadeOut).toFixed(3)}:d=${CLIP.fadeOut}`, "-c:a", "pcm_s16le", out], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`loudnorm failed: ${r.stderr}`);
  return out;
}

/** Integrated loudness and true peak of a file (for the render log). */
export function measure(file: string): { lufs: number; tp: number } {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" });
  const s = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  return { lufs: parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1] ?? "NaN"), tp: parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(s)?.[1] ?? "NaN") };
}
