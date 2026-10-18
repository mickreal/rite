#!/usr/bin/env bun
// An "Anna-light" presenter reel from its script to the rendered MP4 (remotion/presenter.json; see content/README.md
// "Presenter reels"). One command, safe to re-run: every step whose output exists is skipped.
//
//   bun scripts/presenter-prep.ts --estimate <id>   timing from the text (2.6 words a second, no network), so the
//                                                   reel and its interim version render before any take exists
//   bun scripts/presenter-prep.ts --cost <id>       what the paid steps will cost, from the estimate
//   ELEVENLABS_API_KEY=… bun scripts/presenter-prep.ts <id>      (= npm run presenter:prep -- <id>)
//     1. VO: the whole script as one take, ElevenLabs eleven_v3, voice Anna → out/presenter/<id>/vo.mp3
//     2. word timings: ElevenLabs Scribe (speech to text, word timestamps) → out/presenter/<id>/words.json
//     3. timing: each script line's start in the take, written into presenter.json (`timing`, `voSeconds`), so
//        every "@line" cue follows the voice
//     4. Anna's part: the take from her first line to the pause after her last → out/presenter/<id>/anna.mp3
//     5. lip-sync: anna.mp3 on the approved still with Creatify Aurora (720p, one generation) in the ElevenLabs flow
//        "Anna presenter" → out/presenter/<id>/anna.mp4. The flow has no public API, so this step is done there (by
//        Mick, or by Claude with the ElevenLabs connector); the command stops with exit code 3 and says what to do,
//        and running it again picks up from here.
//     6. render: bash remotion/render-presenter.sh <id> → out/presenter/<id>.mp4 (the export then uses it in place of
//        the interim version and adds the soundtrack)
// Env: ELEVENLABS_VOICE_ID (default Anna, as clips/vo.ts), ELEVENLABS_MODEL (default eleven_v3).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { unspeak } from "../clips/spoken";

const CONTENT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PJ = join(CONTENT, "remotion", "presenter.json");
const argv = process.argv.slice(2);
const id = argv.find((a) => !a.startsWith("--"));
if (!id) { console.error("usage: bun scripts/presenter-prep.ts [--estimate|--cost] <reel id>"); process.exit(1); }
type Line = { id: string; say: string; show?: string; anna?: boolean };
type Reel = { id: string; audio?: string; script?: Line[]; timing?: Record<string, number>; voSeconds?: number; anna?: { src: string; from: string; to: string }; interimOf?: string; [k: string]: unknown };
const data = JSON.parse(readFileSync(PJ, "utf8")) as { reels: Reel[] };
const reel = data.reels.find((r) => r.id === id);
if (!reel) { console.error(`no reel "${id}" in remotion/presenter.json`); process.exit(1); }
if (reel.interimOf) { console.error(`${id} is an interim reel (no Anna, no voice): render it with bash remotion/render-presenter.sh ${id}`); process.exit(1); }
if (!reel.script?.length || !reel.anna) { console.error(`${id} has no script / anna part: it was made by hand (see README)`); process.exit(1); }
const script = reel.script;
const save = () => writeFileSync(PJ, JSON.stringify(data, null, 2) + "\n");

// ---------- estimate (no network) ----------
export const WPS = 2.6, GAP = 0.38, LEAD = 0.15; // words a second (as the card verticals), pause after a line, start
const words = (t: string) => t.replace(/\[pause \d+\]/g, " ").split(/\s+/).filter(Boolean).length;
function estimate() {
  const timing: Record<string, number> = {};
  let t = LEAD;
  for (const l of script) { timing[l.id] = Math.round(t * 100) / 100; t += words(l.say) / WPS + GAP; }
  return { timing, voSeconds: Math.round((t - GAP + 0.3) * 100) / 100 };
}
const annaLines = () => { const a = script.findIndex((l) => l.id === reel.anna!.from), b = script.findIndex((l) => l.id === reel.anna!.to); return { a, b }; };
function annaSeconds(timing: Record<string, number>, vo: number) {
  const { b } = annaLines(); const next = script[b + 1];
  return (next ? timing[next.id] : vo) - (timing[reel.anna!.from] ?? 0);
}
const CREDITS_PER_SEC = 850; // Creatify Aurora 720p in ElevenLabs, measured on script 6 (≈8.5k credits per 10 s)
const USD_PER_SEC = 0.17;
function cost(timing: Record<string, number>, vo: number) {
  const chars = script.map((l) => l.say).join(" ").length;
  const anna = annaSeconds(timing, vo);
  return { chars, anna: Math.round(anna * 10) / 10, credits: Math.round(chars + anna * CREDITS_PER_SEC), usd: Math.round((anna * USD_PER_SEC + chars * 0.00018) * 100) / 100 };
}

if (argv.includes("--estimate") || argv.includes("--cost")) {
  const e = estimate();
  if (argv.includes("--estimate")) {
    reel.timing = e.timing; reel.voSeconds = e.voSeconds; reel.timed = "estimate (2.6 words/s): re-timed from the take by scripts/presenter-prep.ts";
    save();
    console.log(`✓ ${id}: estimated timing, ${e.voSeconds} s of voice (+ tail) written to remotion/presenter.json`);
  }
  const c = cost(reel.timing ?? e.timing, reel.voSeconds ?? e.voSeconds);
  console.log(`  cost: VO ${c.chars} characters (≈${c.chars} credits, eleven_v3) + Anna ${c.anna} s lip-sync (≈${Math.round(c.anna * CREDITS_PER_SEC)} credits) ≈ ${c.credits} credits, ≈ $${c.usd}`);
  process.exit(0);
}

// ---------- the paid steps ----------
const KEY = process.env.ELEVENLABS_API_KEY;
const dir = join(CONTENT, "out", "presenter", id);
mkdirSync(dir, { recursive: true });
const vo = join(dir, reel.audio ?? "vo.mp3"), wordsFile = join(dir, "words.json"), annaMp3 = join(dir, "anna.mp3"), annaMp4 = join(dir, reel.anna.src);
const need = (what: string) => { if (!KEY) { console.error(`✗ ${what} needs ELEVENLABS_API_KEY (credits). Nothing was spent.`); const c = cost(reel.timing ?? estimate().timing, reel.voSeconds ?? estimate().voSeconds); console.error(`  this reel: ≈ ${c.credits} credits, ≈ $${c.usd}`); process.exit(2); } };
const API = "https://api.elevenlabs.io/v1";
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "raT7q57pHznZDO2jDPDe", MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_v3";
const probe = (f: string) => parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout);

// 1. the take
if (!existsSync(vo)) {
  need("The VO take");
  const text = script.map((l) => l.say.trim()).join(" ");
  console.log(`▶ VO: ${text.length} characters, ${MODEL}, voice ${VOICE}`);
  const r = await fetch(`${API}/text-to-speech/${VOICE}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": KEY!, "content-type": "application/json" }, body: JSON.stringify({ text, model_id: MODEL }) });
  if (!r.ok) { console.error(`✗ text-to-speech ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  writeFileSync(vo, Buffer.from(await r.arrayBuffer()));
  console.log(`  ${vo.replace(CONTENT + "/", "")} (${probe(vo).toFixed(2)} s). Listen to it before the lip-sync: a bad read is cheap to redo here (delete vo.mp3), not after.`);
}
// 2. word timings
if (!existsSync(wordsFile)) {
  need("Scribe word timings");
  const fd = new FormData();
  fd.append("model_id", "scribe_v1"); fd.append("timestamps_granularity", "word"); fd.append("language_code", "en");
  fd.append("file", new Blob([readFileSync(vo)], { type: "audio/mpeg" }), "vo.mp3");
  const r = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": KEY! }, body: fd });
  if (!r.ok) { console.error(`✗ speech-to-text ${r.status}: ${(await r.text()).slice(0, 300)}`); process.exit(1); }
  const j = await r.json() as { words: Array<{ text: string; start: number; end: number; type: string }> };
  writeFileSync(wordsFile, JSON.stringify(j.words.filter((w) => w.type === "word"), null, 1));
}
// 3. timing: align the script's words to the transcript (LCS on normalised tokens; numbers compared as digits)
{
  const heard = JSON.parse(readFileSync(wordsFile, "utf8")) as Array<{ text: string; start: number; end: number }>;
  const norm = (t: string) => unspeak(t).toLowerCase().replace(/rite\.report|rite dot report/g, "rite report").replace(/[^a-z0-9.\s]/g, " ").replace(/\.(?!\d)/g, " ").split(/\s+/).filter(Boolean);
  const H = heard.flatMap((w, i) => norm(w.text).map((tok) => ({ tok, i })));
  const S = script.flatMap((l) => norm(l.say).map((tok) => ({ tok, line: l.id })));
  const n = S.length, m = H.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let a = n - 1; a >= 0; a--) for (let b = m - 1; b >= 0; b--) dp[a][b] = S[a].tok === H[b].tok ? dp[a + 1][b + 1] + 1 : Math.max(dp[a + 1][b], dp[a][b + 1]);
  const at = new Map<number, number>(); // script token → transcript word index
  for (let a = 0, b = 0; a < n && b < m;) { if (S[a].tok === H[b].tok) { at.set(a, H[b].i); a++; b++; } else if (dp[a + 1][b] >= dp[a][b + 1]) a++; else b++; }
  const timing: Record<string, number> = {};
  for (const l of script) {
    const idx = S.map((s, k) => (s.line === l.id ? k : -1)).filter((k) => k >= 0);
    const hit = idx.find((k) => at.has(k));
    if (hit === undefined) { console.error(`✗ line ${l.id} ("${l.say}") not found in the transcript: listen to vo.mp3, fix or delete it and re-run`); process.exit(1); }
    timing[l.id] = Math.round(Math.max(0, heard[at.get(hit)!].start - (hit - idx[0]) * 0.3) * 100) / 100;
  }
  const voSeconds = Math.round(probe(vo) * 100) / 100;
  reel.timing = timing; reel.voSeconds = voSeconds; reel.timed = "vo.mp3 (Scribe word timings)";
  save();
  console.log(`✓ timing from the take: ${Object.entries(timing).map(([k, v]) => `${k} ${v}`).join(", ")}; ${voSeconds} s`);
}
// 4. Anna's part, cut in the pause after her last line
if (!existsSync(annaMp3)) {
  const { b } = annaLines(); const next = script[b + 1];
  const end = next ? reel.timing![next.id] - 0.05 : reel.voSeconds!;
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", vo, "-t", end.toFixed(3), "-af", "afade=t=out:st=" + Math.max(0, end - 0.08).toFixed(3) + ":d=0.08", annaMp3]);
  if (r.status !== 0) { console.error(`✗ cutting anna.mp3: ${r.stderr}`); process.exit(1); }
  console.log(`✓ ${annaMp3.replace(CONTENT + "/", "")}: 0 – ${end.toFixed(2)} s (≈${Math.round(end * CREDITS_PER_SEC)} credits to lip-sync)`);
}
// 5. lip-sync (in the ElevenLabs flow)
if (!existsSync(annaMp4)) {
  console.log(`\n⏸ Lip-sync needed: in the ElevenLabs flow "Anna presenter", add ${annaMp3.replace(CONTENT + "/", "content/")} as an asset, connect it`);
  console.log(`  with the approved vertical still to a Creatify Aurora node (720p, ONE generation), run it, and download the MP4 to`);
  console.log(`  ${annaMp4.replace(CONTENT + "/", "content/")}. Then run this command again: it renders.`);
  process.exit(3);
}
// 6. render
const r = spawnSync("bash", ["remotion/render-presenter.sh", id], { cwd: CONTENT, stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`✓ out/presenter/${id}.mp4: the export now uses it in place of ${id}-interim (re-run the week's export / upload).`);
