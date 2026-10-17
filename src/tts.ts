// Text-to-speech pipeline shared by the reading narration (/r/:tok/audio/:ch.mp3), the admin audition page and the
// content engine's VO endpoint (POST /admin/tts). Model-independent cadence: scripts carry a small pause markup, the
// script is synthesised in chunks at the pause points, and real silence is spliced between the chunks (src/mp3.ts).
//
// Markup (see README "Narration"):
//   blank line            paragraph break → PARAGRAPH_MS of silence
//   [pause 800]           exactly 800 ms of silence (0–5000); [pause] alone = DEFAULT_PAUSE_MS
//   sentence break        no splice: the model's own short pause after "." is kept (splitting every sentence would
//                         reset the voice's intonation and cost a subrequest each)
// Several pause tokens in a row: explicit [pause N] values add up and override the paragraph default.
import { spliceMp3 } from "./mp3";

export const NARRATION_VERSION = "v2"; // bump to stop serving cached audio made by an older pipeline or script

export const PARAGRAPH_MS = 700;
export const DEFAULT_PAUSE_MS = 500;
export const MAX_PAUSE_MS = 5000;
/** Deepgram rejects more than 2,000 characters per request; stay under it. */
export const MAX_CHUNK_CHARS = 1800;
/** TTS calls per invocation. The free plan allows 50 subrequests; the audio route also makes 3 D1/KV calls. */
export const MAX_CHUNKS = 24;
/** POST /admin/tts input cap (≈ 6 minutes of speech). */
export const MAX_ADMIN_CHARS = 8000;

export interface ModelInfo { id: string; label: string; voices: string[]; defaultVoice: string; perKChars?: number; note: string }

// Voices as listed in each model's Workers AI input schema (developers.cloudflare.com/workers-ai/models/<model>/schema-input.json).
export const TTS_MODELS: ModelInfo[] = [
  { id: "@cf/deepgram/aura-1", label: "Deepgram Aura 1", defaultVoice: "luna", perKChars: 0.015, note: "$0.015 / 1k chars",
    voices: ["luna", "asteria", "athena", "hera", "stella", "angus", "arcas", "orion", "orpheus", "perseus", "helios", "zeus"] },
  { id: "@cf/deepgram/aura-2-en", label: "Deepgram Aura 2 (English)", defaultVoice: "luna", perKChars: 0.03, note: "$0.03 / 1k chars",
    voices: ["amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas", "aurora", "callista", "cora", "cordelia", "delia", "draco", "electra", "harmonia", "helena", "hera", "hermes", "hyperion", "iris", "janus", "juno", "jupiter", "luna", "mars", "minerva", "neptune", "odysseus", "ophelia", "orion", "orpheus", "pandora", "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus"] },
  { id: "@cf/myshell-ai/melotts", label: "MeloTTS (MyShell)", defaultVoice: "en", note: "$0.000205 / audio minute; one voice per language",
    voices: ["en"] },
];
export const DEFAULT_MODEL = "@cf/deepgram/aura-1";

export interface TtsConfig { model: string; voice: string }

/** Pick a model and voice: requested values if valid, else TTS_MODEL / TTS_VOICE, else the defaults. Invalid voice → model default. */
export function ttsConfig(env: { TTS_MODEL?: string; TTS_VOICE?: string }, want: { model?: unknown; voice?: unknown } = {}): TtsConfig {
  const find = (m: unknown) => TTS_MODELS.find((x) => x.id === m);
  const info = find(want.model) ?? find(env.TTS_MODEL) ?? find(DEFAULT_MODEL)!;
  const voice = [want.voice, env.TTS_VOICE].find((v): v is string => typeof v === "string" && info.voices.includes(v)) ?? info.defaultVoice;
  return { model: info.id, voice };
}

/** KV key for one chapter's audio; changes with the pipeline version, model and voice. */
export const audioCacheKey = (purchaseId: string, ch: number, cfg: TtsConfig) =>
  `audio:${NARRATION_VERSION}:${cfg.model.split("/").pop()}:${cfg.voice}:${purchaseId}:${ch}`;

// ---------- markup ----------

export interface Piece { text: string; pauseMs: number } // pauseMs = silence after this text

const TOKEN = /\[pause(?:\s+(\d+)(?:\s*ms)?)?\]|\n[ \t]*\n\s*/gi;
const tidy = (s: string) => s.replace(/\[\/?slow\]/gi, "").replace(/[ \t\r\n]+/g, " ").trim(); // [slow] is reserved (no model takes a rate yet)

/** Script → text pieces with the silence that follows each. Leading/trailing pauses are dropped. */
export function parseScript(src: string): Piece[] {
  const out: Piece[] = [];
  let last = 0; let explicit: number | null = null; let para = false;
  const flush = (text: string) => {
    const t = tidy(text);
    if (!t) return false;
    if (out.length) out[out.length - 1].pauseMs = explicit !== null ? Math.min(MAX_PAUSE_MS, explicit) : para ? PARAGRAPH_MS : 0;
    out.push({ text: t, pauseMs: 0 }); explicit = null; para = false; return true;
  };
  for (const m of src.matchAll(TOKEN)) {
    flush(src.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[0].startsWith("[")) explicit = (explicit ?? 0) + (m[1] !== undefined ? Math.min(MAX_PAUSE_MS, parseInt(m[1], 10)) : DEFAULT_PAUSE_MS);
    else para = true;
  }
  flush(src.slice(last));
  return out;
}

/** Strip markup to plain text (what a reader would see). */
export const plainText = (src: string) => parseScript(src).map((p) => p.text).join(" ");

/** Split on sentence boundaries to ≤ max chars; a single over-long sentence is cut at a comma or space. */
export function splitForTts(text: string, max = MAX_CHUNK_CHARS): string[] {
  const out: string[] = []; let cur = "";
  const push = (s: string) => { if (s.trim()) out.push(s.trim()); };
  for (let sent of text.split(/(?<=[.!?])\s+/)) {
    while (sent.length > max) {
      const cut = Math.max(sent.lastIndexOf(", ", max), sent.lastIndexOf(" ", max));
      const at = cut > max / 2 ? cut + 1 : max;
      push(cur); cur = ""; push(sent.slice(0, at)); sent = sent.slice(at).trim();
    }
    if ((cur + " " + sent).length > max && cur) { push(cur); cur = ""; }
    cur += (cur ? " " : "") + sent;
  }
  push(cur);
  return out;
}

/**
 * Pieces → TTS chunks. Over-long pieces are split at sentences (no pause between the parts); neighbours with no
 * pause between them are merged; then, while there are more than maxChunks, the shortest pause is dropped and its
 * two sides merged (the text keeps its punctuation). Throws if the text can't fit in maxChunks requests.
 */
export function planChunks(pieces: Piece[], maxChars = MAX_CHUNK_CHARS, maxChunks = MAX_CHUNKS): Piece[] {
  const split: Piece[] = [];
  for (const p of pieces) {
    const parts = splitForTts(p.text, maxChars);
    parts.forEach((t, i) => split.push({ text: t, pauseMs: i === parts.length - 1 ? p.pauseMs : 0 }));
  }
  const fits = (a: Piece, b: Piece) => a.text.length + 1 + b.text.length <= maxChars;
  const merged: Piece[] = [];
  for (const p of split) {
    const prev = merged[merged.length - 1];
    if (prev && prev.pauseMs === 0 && fits(prev, p)) merged[merged.length - 1] = { text: `${prev.text} ${p.text}`, pauseMs: p.pauseMs };
    else merged.push({ ...p });
  }
  while (merged.length > maxChunks) {
    // shortest pause first; among equal pauses, the shortest combined text, so merges spread evenly instead of piling up at the start
    let best = -1;
    const len = (i: number) => merged[i].text.length + merged[i + 1].text.length;
    for (let i = 0; i < merged.length - 1; i++) {
      if (!fits(merged[i], merged[i + 1])) continue;
      if (best < 0 || merged[i].pauseMs < merged[best].pauseMs || (merged[i].pauseMs === merged[best].pauseMs && len(i) < len(best))) best = i;
    }
    if (best < 0) throw new Error(`script needs more than ${maxChunks} TTS requests`);
    merged.splice(best, 2, { text: `${merged[best].text} ${merged[best + 1].text}`, pauseMs: merged[best + 1].pauseMs });
  }
  return merged;
}

// ---------- synthesis ----------

export function modelInput(model: string, voice: string, text: string): Record<string, unknown> {
  if (model === "@cf/myshell-ai/melotts") return { prompt: text, lang: voice || "en" };
  return { text, speaker: voice, encoding: "mp3" }; // Deepgram mp3: 22.05 kHz, 48 kbps by default
}

const b64 = (s: string): Uint8Array => {
  const from = (Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array }).fromBase64;
  if (from) return from(s); // native where available; the loop below costs ~1 ms per 100 kB of CPU
  const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out;
};

export async function toBytes(res: unknown): Promise<Uint8Array> {
  if (res instanceof Uint8Array) return res;
  if (res instanceof ArrayBuffer) return new Uint8Array(res);
  if (res instanceof ReadableStream) return new Uint8Array(await new Response(res).arrayBuffer());
  if (res instanceof Response) return new Uint8Array(await res.arrayBuffer());
  if (res && typeof res === "object" && "audio" in (res as Record<string, unknown>)) return b64(String((res as Record<string, unknown>).audio)); // MeloTTS JSON
  throw new Error("unexpected TTS response shape");
}

export interface Synth { bytes: Uint8Array; chunks: number; chars: number; spliced: boolean; durationMs: number; silenceMs: number }

/** Script (with markup) → one MP3. Up to `concurrency` TTS calls in flight; order is preserved. */
export async function synthesize(ai: Ai, script: string, cfg: TtsConfig, opts: { concurrency?: number; maxChunks?: number } = {}): Promise<Synth> {
  const chunks = planChunks(parseScript(script), MAX_CHUNK_CHARS, opts.maxChunks ?? MAX_CHUNKS);
  if (!chunks.length) throw new Error("nothing to say");
  const audio: Uint8Array[] = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const i = next++;
      audio[i] = await toBytes(await ai.run(cfg.model as never, modelInput(cfg.model, cfg.voice, chunks[i].text) as never));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 3, chunks.length) }, worker));
  const r = spliceMp3(chunks.map((c, i) => ({ audio: audio[i], pauseAfterMs: c.pauseMs })));
  return { bytes: r.bytes, chunks: chunks.length, chars: chunks.reduce((n, c) => n + c.text.length, 0), spliced: r.spliced, durationMs: r.durationMs, silenceMs: r.silenceMs };
}

