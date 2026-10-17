import { describe, it, expect, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() })); // the resvg wasm module does not load under node
// @ts-expect-error: no @types/node in this Workers project; vitest runs in Node
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
// @ts-expect-error: as above
import { execFileSync } from "node:child_process";
// @ts-expect-error: as above
import { tmpdir } from "node:os";
import worker from "../src/index";
import { parseScript, planChunks, plainText, splitForTts, ttsConfig, audioCacheKey, synthesize, modelInput, NARRATION_VERSION, PARAGRAPH_MS, DEFAULT_PAUSE_MS, MAX_CHUNKS, TTS_MODELS, DEFAULT_MODEL } from "../src/tts";
import { scanMp3, spliceMp3, silentFrame, parseFrame, frameMs } from "../src/mp3";
import { narrationText, CHAPTERS, speakDates, spokenDate, yearWords, ordinalWords } from "../src/narration";
import { SAMPLE_SCRIPT } from "../src/views/voice";
import { compute, cycle } from "../src/compute";

// Synthetic MP3s mimicking Deepgram Aura's mp3 output (22.05 kHz mono, 48 kbps CBR; MPEG-2 Layer III), made with
//   ffmpeg -f lavfi -i "sine=frequency=440:duration=1.3:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 48k a.mp3   (ID3v2 + LAME Info frame)
//   ffmpeg -f lavfi -i "sine=frequency=660:duration=0.9:sample_rate=22050" -ac 1 -c:a libmp3lame -b:a 48k -write_xing 0 -id3v2_version 0 b.mp3
//   ffmpeg -f lavfi -i "sine=frequency=330:duration=1:sample_rate=44100" -ac 2 -c:a libmp3lame -b:a 64k c.mp3   (MPEG-1 stereo, MeloTTS-like)
const fx = (n: string) => new Uint8Array(readFileSync(`test/fixtures/${n}`));
const A = fx("tts-a.mp3"), B = fx("tts-b.mp3"), C = fx("tts-c.mp3");

const hasFfmpeg = (() => { try { execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; } })();

describe("pause markup", () => {
  it("blank line = paragraph pause, [pause N] = N ms, [pause] = default; runs add up; edges dropped", () => {
    expect(parseScript("[pause 300]One.\n\nTwo. [pause 800] Three.[pause][pause 200]Four.\n  \n[pause 99999]Five.\n\n")).toEqual([
      { text: "One.", pauseMs: PARAGRAPH_MS }, { text: "Two.", pauseMs: 800 }, { text: "Three.", pauseMs: DEFAULT_PAUSE_MS + 200 },
      { text: "Four.", pauseMs: 5000 }, { text: "Five.", pauseMs: 0 },
    ]);
  });
  it("explicit pauses override the paragraph default; sentences inside a paragraph stay together; [slow] is never spoken", () => {
    expect(parseScript("Heading. [pause 1000]\n\nA. B, c — d.")).toEqual([{ text: "Heading.", pauseMs: 1000 }, { text: "A. B, c — d.", pauseMs: 0 }]);
    expect(plainText("[slow]Slowly[/slow] now.\n\nThen [pause 250ms] this.")).toBe("Slowly now. Then this.");
  });
});

describe("chunk planning", () => {
  const many = (n: number, ms: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ text: `Sentence number ${i}.`, pauseMs: ms(i) }));
  it("caps requests by dropping the shortest pauses first", () => {
    const out = planChunks(many(60, (i) => (i % 10 === 9 ? 1500 : i % 3 === 0 ? 700 : 300)), 1800, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.filter((p) => p.pauseMs === 1500).length).toBe(6); // every long pause survives (the 6th trails the last chunk; splicing ignores it)
    expect(out.every((p) => p.text.length <= 1800)).toBe(true);
    expect(out.map((p) => p.text).join(" ")).toBe(many(60, () => 0).map((p) => p.text).join(" "));
  });
  it("merges neighbours with no pause and splits over-long text at sentences (and long sentences at commas)", () => {
    const long = Array.from({ length: 50 }, (_, i) => `This is sentence ${i}, with a clause.`).join(" ");
    const out = planChunks([{ text: "Short.", pauseMs: 0 }, { text: "Also short.", pauseMs: 600 }, { text: long, pauseMs: 0 }], 300, 24);
    expect(out[0]).toEqual({ text: "Short. Also short.", pauseMs: 600 });
    expect(out.every((p) => p.text.length <= 300)).toBe(true);
    const run = splitForTts(`${"word, ".repeat(120)}end.`, 200);
    expect(run.every((p) => p.length <= 200)).toBe(true);
    expect(run.join(" ").replace(/\s+/g, " ")).toBe(`${"word, ".repeat(120)}end.`.replace(/\s+/g, " ").trim());
  });
  it("refuses text that can't fit in the request cap", () => {
    expect(() => planChunks([{ text: "x. ".repeat(3000), pauseMs: 0 }], 100, 5)).toThrow(/more than 5/);
  });
});

describe("spoken dates", () => {
  it("writes years, ordinals and dates as words", () => {
    expect([yearWords(1997), yearWords(2000), yearWords(2005), yearWords(2010), yearWords(2026), yearWords(1905)]).toEqual(
      ["nineteen ninety-seven", "two thousand", "two thousand and five", "twenty ten", "twenty twenty-six", "nineteen oh five"]);
    expect([ordinalWords(1), ordinalWords(13), ordinalWords(20), ordinalWords(22), ordinalWords(31)]).toEqual(["first", "thirteenth", "twentieth", "twenty-second", "thirty-first"]);
    expect(spokenDate("2026-05-13")).toBe("the thirteenth of May, twenty twenty-six");
  });
  it("rewrites dates in prose consistently", () => {
    expect(speakDates("One exact pass on 28 April 2027, and a brush on 24 Dec 2027.")).toBe("One exact pass on the twenty-eighth of April, twenty twenty-seven, and a brush on the twenty-fourth of December, twenty twenty-seven.");
    expect(speakDates("From Jun 2025 to May 3, 2026; turns direct 13 Jun; by 2028.")).toBe("From June twenty twenty-five to the third of May, twenty twenty-six; turns direct the thirteenth of June; by twenty twenty-eight.");
    expect(speakDates("12.3 degrees, $2026, 20261")).toBe("12.3 degrees, $2026, 20261");
  });
});

describe("narration scripts", () => {
  const today = new Date("2026-10-16T00:00:00Z");
  const c = compute({ date: "1997-08-14", time: "06:40", place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } }, today);
  const cy = cycle(c, today);
  const long = (n: number) => Array.from({ length: n }, (_, i) => `A longer sentence of model prose, number ${i}, that runs on for a while.`).join(" ");
  const r = { cover_line: "Saturn in Aries, in your eighth house. One exact pass on 28 April 2027.", saturn_p1: long(6), saturn_p2: long(6), house_h3: "In your eighth house", house_p: long(5), chips_warm: ["patience", "nerve", "follow-through"], chips_cool: ["rigidity", "hiding", "overwork"], phase_approach: long(4), phase_contact: long(4), phase_integration: long(4), passes: [{ name: "Standing on your degree", body: long(4), before: "Clear one evening.", day: "Do one thing.", after: "Keep the promise." }], turn: { name: "The turn", body: long(3), before: "x", day: "y", after: "z" }, areas: [{ h3: "Work", p: long(3) }, { h3: "Home", p: long(3) }, { h3: "Love", p: long(3) }], history_q: ["What changed at seven?", "What did you push against?", "What did you choose?"], workbook_approach: ["What are you postponing?", "What feels heavy?"], workbook_contact: ["What will you commit to?"], workbook_integration: ["Which promise held?"], carry: "Small and kept." };
  it("every chapter fits the request cap, has headings with a pause, and no digits-as-dates", () => {
    for (let i = 0; i < CHAPTERS; i++) {
      const s = narrationText(i, c, cy, r, "Sam");
      const chunks = planChunks(parseScript(s));
      expect(chunks.length).toBeLessThanOrEqual(MAX_CHUNKS);
      expect(chunks.length).toBeGreaterThan(1);
      expect(s).not.toMatch(/°|\b(19|20)\d\d\b|\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/);
      expect(s).not.toMatch(/\.\./);
      if (i > 0) expect(s).toMatch(/^Chapter \w+ — [^.]+\. \[pause 1000\]\n\n/);
    }
    expect(narrationText(3, c, cy, r, null)).toContain("the twenty-eighth of April, twenty twenty-seven");
    expect(narrationText(0, c, cy, r, "Sam")).toMatch(/^Sam, this is your Saturn return reading/);
  });
  it("the audition sample parses into paced chunks", () => {
    const p = planChunks(parseScript(SAMPLE_SCRIPT));
    expect(p[0]).toEqual({ text: "Chapter three — the pass and the turn.", pauseMs: 1000 });
    expect(p.length).toBeGreaterThan(4);
  });
});

describe("MP3 splicing", () => {
  it("reads the fixtures' frames and skips ID3 and the Info frame", () => {
    const a = scanMp3(A), b = scanMp3(B);
    expect(a.first).toMatchObject({ version: 2, sampleRate: 22050, bitrate: 48000, mode: 3, samplesPerFrame: 576 });
    expect(a.headerAt).toBeGreaterThan(0); // ID3v2 + Info frame skipped
    expect(b.headerAt).toBe(0);
    expect(a.frames.length).toBeGreaterThan(40);
    expect(Math.abs(a.samples / 22050 - 1.3)).toBeLessThan(0.15);
  });
  it("a silent frame copies the stream's header, drops CRC and padding, and has the CBR frame length", () => {
    const s = silentFrame(A.subarray(scanMp3(A).headerAt));
    const f = parseFrame(s, 0)!;
    expect(f).toMatchObject({ sampleRate: 22050, bitrate: 48000, mode: 3, padding: 0, protection: false });
    expect(s.length).toBe(156); // 72 × 48000 / 22050
    expect(s.subarray(4).every((x) => x === 0)).toBe(true);
  });
  it("splices with the requested silence and writes a valid Info frame", () => {
    const out = spliceMp3([{ audio: A, pauseAfterMs: 800 }, { audio: B, pauseAfterMs: 400 }, { audio: A, pauseAfterMs: 999 }]);
    expect(out.spliced).toBe(true);
    const per = frameMs({ samplesPerFrame: 576, sampleRate: 22050 });
    expect(out.silenceMs).toBe(Math.round((Math.round(800 / per) + Math.round(400 / per)) * per)); // last pause dropped
    // walk every frame: contiguous, same params throughout
    const b = out.bytes; let i = 0; let n = 0;
    while (i < b.length) { const f = parseFrame(b, i)!; expect(f).toBeTruthy(); expect([f.sampleRate, f.mode, f.version]).toEqual([22050, 3, 2]); i += f.length; n++; }
    expect(i).toBe(b.length);
    const tag = String.fromCharCode(...b.subarray(4 + 9, 4 + 9 + 4));
    const dv = new DataView(b.buffer, b.byteOffset);
    expect(tag).toBe("Info");
    expect(dv.getUint32(4 + 9 + 8)).toBe(n - 1);
    expect(dv.getUint32(4 + 9 + 12)).toBe(b.length);
    expect(scanMp3(b).frames.length).toBe(n - 1);
  });
  it("handles MPEG-1 stereo (MeloTTS-like) and falls back to plain concatenation for unknown bytes", () => {
    const st = spliceMp3([{ audio: C, pauseAfterMs: 500 }, { audio: C, pauseAfterMs: 0 }]);
    expect(st.spliced).toBe(true);
    expect(parseFrame(st.bytes, 0)).toMatchObject({ version: 1, sampleRate: 44100, samplesPerFrame: 1152 });
    const mixed = spliceMp3([{ audio: A, pauseAfterMs: 500 }, { audio: C, pauseAfterMs: 0 }]);
    expect(mixed.spliced).toBe(false);
    const junk = spliceMp3([{ audio: new Uint8Array([0, 1, 2]), pauseAfterMs: 500 }, { audio: new Uint8Array([3]), pauseAfterMs: 0 }]);
    expect([...junk.bytes]).toEqual([0, 1, 2, 3]);
  });
  it.skipIf(!hasFfmpeg)("ffprobe/ffmpeg decode the spliced stream cleanly with the silence where it belongs", () => {
    const dir = mkdtempSync(`${tmpdir()}/rite-mp3-`); const path = `${dir}/out.mp3`;
    writeFileSync(path, spliceMp3([{ audio: A, pauseAfterMs: 1000 }, { audio: B, pauseAfterMs: 0 }]).bytes);
    const dur = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).toString());
    expect(dur).toBeGreaterThan(1.3 + 0.9 + 0.95);
    expect(dur).toBeLessThan(1.3 + 0.9 + 1.0 + 0.3);
    const log = execFileSync("ffmpeg", ["-v", "info", "-nostats", "-i", path, "-af", "silencedetect=noise=-50dB:d=0.5", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    expect(log).not.toMatch(/error|invalid|Header missing/i);
    const sil = execFileSync("sh", ["-c", `ffmpeg -v info -nostats -i ${path} -af silencedetect=noise=-50dB:d=0.5 -f null - 2>&1`]).toString();
    const start = parseFloat(/silence_start: ([\d.]+)/.exec(sil)![1]), d = parseFloat(/silence_duration: ([\d.]+)/.exec(sil)![1]);
    expect(Math.abs(start - 1.3)).toBeLessThan(0.15);
    expect(d).toBeGreaterThan(0.95);
    expect(d).toBeLessThan(1.25);
  });
});

describe("model + voice config and cache key", () => {
  it("defaults to aura-1 / luna; honours TTS_MODEL and TTS_VOICE; invalid voice → model default", () => {
    expect(ttsConfig({})).toEqual({ model: DEFAULT_MODEL, voice: "luna" });
    expect(ttsConfig({ TTS_VOICE: "orion" })).toEqual({ model: "@cf/deepgram/aura-1", voice: "orion" });
    expect(ttsConfig({ TTS_MODEL: "@cf/deepgram/aura-2-en", TTS_VOICE: "thalia" })).toEqual({ model: "@cf/deepgram/aura-2-en", voice: "thalia" });
    expect(ttsConfig({ TTS_MODEL: "@cf/deepgram/aura-2-en", TTS_VOICE: "stella" })).toEqual({ model: "@cf/deepgram/aura-2-en", voice: "luna" });
    expect(ttsConfig({ TTS_MODEL: "nope" })).toEqual({ model: DEFAULT_MODEL, voice: "luna" });
    expect(ttsConfig({}, { model: "@cf/myshell-ai/melotts", voice: "luna" })).toEqual({ model: "@cf/myshell-ai/melotts", voice: "en" });
    expect(TTS_MODELS.find((m) => m.id === "@cf/deepgram/aura-2-en")!.voices).toHaveLength(40);
    expect(modelInput("@cf/myshell-ai/melotts", "en", "Hi.")).toEqual({ prompt: "Hi.", lang: "en" });
    expect(modelInput("@cf/deepgram/aura-1", "luna", "Hi.")).toEqual({ text: "Hi.", speaker: "luna", encoding: "mp3" });
  });
  it("cache key carries the pipeline version, model and voice, so old v1 audio is never served", () => {
    const k = audioCacheKey("pu1", 3, { model: "@cf/deepgram/aura-1", voice: "luna" });
    expect(k).toBe(`audio:${NARRATION_VERSION}:aura-1:luna:pu1:3`);
    expect(NARRATION_VERSION).not.toBe("v1");
    expect(k).not.toBe("audio:v1:pu1:3");
    expect(audioCacheKey("pu1", 3, { model: "@cf/deepgram/aura-2-en", voice: "luna" })).not.toBe(k);
    expect(audioCacheKey("pu1", 3, { model: "@cf/deepgram/aura-1", voice: "orion" })).not.toBe(k);
  });
});

describe("synthesize", () => {
  it("one TTS call per chunk, in order, with the chosen model, spliced into one stream", async () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    const ai = { run: async (m: string, input: Record<string, unknown>) => { calls.push([m, input]); return new Response(calls.length % 2 ? A : B).body; } } as unknown as Ai;
    const out = await synthesize(ai, "One. [pause 800]\n\nTwo.\n\nThree.", { model: "@cf/deepgram/aura-2-en", voice: "thalia" });
    expect(calls.map((c) => c[1].text).sort()).toEqual(["One.", "Three.", "Two."]);
    expect(calls.every((c) => c[0] === "@cf/deepgram/aura-2-en" && c[1].speaker === "thalia")).toBe(true);
    expect(out).toMatchObject({ chunks: 3, spliced: true });
    expect(out.silenceMs).toBeGreaterThan(800 + PARAGRAPH_MS - 30);
  });
  it("decodes MeloTTS's base64 JSON", async () => {
    let bin = ""; for (const x of A) bin += String.fromCharCode(x);
    const ai = { run: async () => ({ audio: btoa(bin) }) } as unknown as Ai;
    expect((await synthesize(ai, "Hi.", { model: "@cf/myshell-ai/melotts", voice: "en" })).spliced).toBe(true);
  });
});

describe("/admin/voice and /admin/tts", () => {
  const KEY = "admin_key_for_voice_tests";
  const ai = { calls: 0, run: async () => { ai.calls++; return A; } };
  const env = (over: Record<string, unknown> = {}) => ({ STRIPE_WEBHOOK_SECRET: "whsec_not_the_admin_key_000", ADMIN_KEY: KEY, SITE_URL: "https://rite.test", AI: ai, POSTHOG_KEY: "phc_test", ...over });
  const call = (path: string, init: RequestInit = {}, e = env()) => worker.fetch(new Request(`https://rite.test${path}`, init), e as never, { waitUntil() {} } as unknown as ExecutionContext);
  const post = (path: string, body: unknown, headers: Record<string, string> = {}, e = env()) => call(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, e);

  it("404 without ADMIN_KEY set, without a key, with a wrong key, and with the webhook secret", async () => {
    const noKey = env({ ADMIN_KEY: undefined });
    for (const r of [
      await call("/admin/voice"), await call("/admin/voice?key=wrong"), await call(`/admin/voice?key=${KEY}`, {}, noKey),
      await call("/admin/voice", { headers: { authorization: "Bearer whsec_not_the_admin_key_000" } }),
      await post("/admin/tts", { text: "Hi." }), await post("/admin/tts?key=wrong", { text: "Hi." }),
      await post("/admin/tts", { text: "Hi." }, { authorization: `Bearer ${KEY}` }, noKey),
      await post("/admin/tts", { text: "Hi." }, { authorization: "Bearer whsec_not_the_admin_key_000" }, noKey),
    ]) expect(r.status).toBe(404);
    expect(ai.calls).toBe(0);
  });
  it("GET /admin/voice: the audition page, no-store / noindex / no-referrer, no PostHog", async () => {
    const r = await call(`/admin/voice?key=${KEY}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const h = await r.text();
    expect(h).toContain("<textarea");
    expect(h).toContain("[pause 1000]");
    for (const m of TTS_MODELS) if (m.id.startsWith("elevenlabs/")) expect(h).not.toContain(m.id); else expect(h).toContain(m.id); // no ELEVENLABS_API_KEY here
    expect(h).toContain('"thalia"');
    expect(h).not.toContain("posthog");
  });
  it("POST /admin/tts returns spliced audio/mpeg (bearer or ?key=) and validates input", async () => {
    const r = await post("/admin/tts", { text: "One. [pause 600] Two.", model: "@cf/deepgram/aura-2-en", voice: "orion" }, { authorization: `Bearer ${KEY}` });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("audio/mpeg");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect([r.headers.get("x-tts-model"), r.headers.get("x-tts-voice"), r.headers.get("x-tts-chunks"), r.headers.get("x-tts-spliced")]).toEqual(["@cf/deepgram/aura-2-en", "orion", "2", "true"]);
    expect(scanMp3(new Uint8Array(await r.arrayBuffer())).frames.length).toBeGreaterThan(2 * scanMp3(A).frames.length);
    expect((await post(`/admin/tts?key=${KEY}`, { text: "Hi." })).status).toBe(200);
    expect((await post(`/admin/tts?key=${KEY}`, { text: " " })).status).toBe(400);
    expect((await post(`/admin/tts?key=${KEY}`, { text: "x".repeat(9000) })).status).toBe(413);
    expect((await post(`/admin/tts?key=${KEY}`, { text: "Hi." }, {}, env({ AI: undefined }))).status).toBe(503);
  });

  it("with ELEVENLABS_API_KEY: ElevenLabs v3 + Anna is the default, and /admin/tts calls ElevenLabs", async () => {
    expect(ttsConfig({})).toEqual({ model: DEFAULT_MODEL, voice: "luna" });
    expect(ttsConfig({ ELEVENLABS_API_KEY: "xi" })).toEqual({ model: "elevenlabs/eleven_v3", voice: "anna" });
    expect(ttsConfig({}, { model: "elevenlabs/eleven_v3" }).model).toBe(DEFAULT_MODEL); // not offered without a key
    const seen: Request[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => { const r = new Request(input, init); seen.push(r); return new Response(A, { status: 200, headers: { "content-type": "audio/mpeg" } }); });
    try {
      const e = env({ ELEVENLABS_API_KEY: "xi_test" });
      const r = await post("/admin/tts", { text: "One. [pause 600] Two." }, { authorization: `Bearer ${KEY}` }, e);
      expect(r.status).toBe(200);
      expect(r.headers.get("x-tts-model")).toBe("elevenlabs/eleven_v3");
      expect(r.headers.get("x-tts-voice")).toBe("anna");
      expect(seen).toHaveLength(2);
      expect(seen[0].url).toContain("api.elevenlabs.io/v1/text-to-speech/raT7q57pHznZDO2jDPDe");
      expect(seen[0].headers.get("xi-api-key")).toBe("xi_test");
      expect(((await seen[0].json()) as { model_id: string }).model_id).toBe("eleven_v3");
      const page = await (await call(`/admin/voice?key=${KEY}`, {}, e)).text();
      expect(page).toContain("elevenlabs/eleven_v3");
    } finally { vi.unstubAllGlobals(); }
  });
});
