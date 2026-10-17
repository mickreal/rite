#!/usr/bin/env bun
// Style 1 generator (docs/gtm-plan.md §2): drives the real /start flow in a 1080×1920 browser and renders it frame by
// frame on a virtual clock, with the hook and on-screen lines laid over it, then encodes content/out/clips/<cohort>.mp4
// (silent, captioned) and, when the cohort has a `vo` script and a TTS provider is available, <cohort>_vo.mp4.
//
//   bun clips/render-clip.ts                      all cohorts in clips/cohorts.json, against a local `wrangler dev`
//   bun clips/render-clip.ts --only taurus-2028   one or more ids, comma-separated
//   bun clips/render-clip.ts --only celeb-lisa-1997 --stills   also save the summary screen as a PNG (out/stills/)
//   RITE_ADMIN_KEY=… bun clips/render-clip.ts     with voiceover (POST /admin/tts on the live site; see clips/vo.ts)
//   bun clips/render-clip.ts --silent             never try VO
//   BASE_URL=http://localhost:8871 bun clips/render-clip.ts   use a server that's already running
//
// How it stays smooth (all constants in ../timing.ts):
//   - No screen recording. The page's timers, Date and rAF run on Playwright's fake clock and every CSS/Web animation is
//     paused and seeked to the frame's time, so each of the 30 frames a second is rendered exactly once; network
//     requests take zero clip time (the clock waits for them).
//   - The site swaps screens instantly; consecutive screens are crossfaded in post (old frame held, new one fading in).
//   - Captions and the end fade are drawn in the page (real fonts, sub-pixel motion), eased in and out.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { FPS, CLIP, ease, progress } from "../timing";
import { provider, synthAll, mixVo, measure, type Audio } from "./vo";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(HERE, "..");
const REPO = resolve(CONTENT, "..");
const FONTS = join(CONTENT, "fonts");
const OUT = join(CONTENT, "out", "clips");
const WORK = join(CONTENT, "out", "frames");
const require = createRequire(import.meta.url);
const { chromium } = require(join(REPO, "node_modules", "playwright")) as typeof import("playwright");
type Page = import("playwright").Page;

type Cohort = { id: string; label: string; date: string; city: string; time: string | null; hook: string; lines: string[]; vo?: { script?: string; hook: string; lines: string[] } };
const cfg = JSON.parse(readFileSync(join(HERE, "cohorts.json"), "utf8")) as { cohorts: Cohort[] };

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const silentOnly = argv.includes("--silent");
const keepFrames = argv.includes("--keep-frames");
// --stills also saves a caption-free 1080×1920 screenshot of the summary to out/stills/<id>-summary.png
// (the backdrop for a style-5 green-screen reaction)
const stills = argv.includes("--stills");
const STILLS = join(CONTENT, "out", "stills");
const cohorts = only ? cfg.cohorts.filter((c) => only.includes(c.id)) : cfg.cohorts;
if (only && cohorts.length !== only.length) { console.error(`Unknown cohort id in --only. Known: ${cfg.cohorts.map((c) => c.id).join(", ")}`); process.exit(1); }

// ---------- frame layout (px in the 1080×1920 frame) ----------
const W = 1080, H = 1920;
const BAND = 430;          // caption band at the top; the page sits below it
const ZOOM = 2.0;          // the flow is a 480px mobile column; zoom it to 960px so it reads at phone size
const PAGE_H = H - BAND - 30;
const SIDE = 84;           // caption side margin (TikTok's right-hand buttons sit inside ~120px; captions are centred)
const C = { cream: "#EDE6D6", gold: "#F2B544" };

const b64 = (f: string) => readFileSync(join(FONTS, f)).toString("base64");
const FONT_CSS = `
@font-face{font-family:'Bricolage Grotesque';src:url(data:font/ttf;base64,${b64("BricolageGrotesque-VF.ttf")}) format('truetype');font-weight:200 800;font-stretch:75% 100%;font-style:normal}
@font-face{font-family:'Hanken Grotesk';src:url(data:font/ttf;base64,${b64("HankenGrotesk-VF.ttf")}) format('truetype');font-weight:100 900;font-style:normal}`;

// Capture-only CSS: layout for the 9:16 frame, plus two cosmetic fixes that only matter on video (a blinking caret is
// real-time and flickers frame to frame; the date field's blue segment highlight flashes on every key).
const LAYOUT_CSS = `
body{padding-top:${BAND}px;min-height:${H}px;box-sizing:border-box}
.flow{zoom:${ZOOM};min-height:0!important}
.step{min-height:${(PAGE_H / ZOOM).toFixed(1)}px!important;padding-top:28px!important;padding-bottom:16px!important}
html{scrollbar-width:none}::-webkit-scrollbar{display:none}
input{caret-color:transparent!important}
input:focus::-webkit-datetime-edit-day-field,input:focus::-webkit-datetime-edit-month-field,input:focus::-webkit-datetime-edit-year-field,input:focus::-webkit-datetime-edit-hour-field,input:focus::-webkit-datetime-edit-minute-field{background-color:transparent!important;color:inherit!important}
#__cap{position:fixed;left:0;top:0;width:${W}px;height:${BAND}px;z-index:2147483000;pointer-events:none}
#__cap>div{position:absolute;left:${SIDE}px;right:${SIDE}px;top:70px;bottom:0;display:flex;align-items:center;justify-content:center;text-align:center;text-wrap:balance;opacity:0;will-change:opacity,transform}
#__cap .h{font:800 74px/1.12 'Bricolage Grotesque';color:${C.cream}}
#__cap .l{font:700 72px/1.12 'Bricolage Grotesque';color:${C.gold}}
#__cap .c{font:600 52px/1.25 'Hanken Grotesk';color:${C.cream}}
#__fade{position:fixed;inset:0;z-index:2147483600;pointer-events:none;opacity:1}
`;

// In-page frame driver: pauses every animation and seeks it to clip time, applies captions / fade / camera.
function pageDriver(css: string) {
  const w = window as unknown as Record<string, unknown>;
  const add = () => {
    const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s);
    const cap = document.createElement("div"); cap.id = "__cap"; document.body.appendChild(cap);
    const fade = document.createElement("div"); fade.id = "__fade"; document.body.appendChild(fade);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
  const seen = new WeakMap<Animation, number>();
  w.__rite = {
    setCaptions(list: Array<{ text: string; cls: string }>) {
      const cap = document.getElementById("__cap")!; cap.innerHTML = "";
      for (const c of list) { const d = document.createElement("div"); d.className = c.cls; d.textContent = c.text; cap.appendChild(d); }
      document.getElementById("__fade")!.style.background = getComputedStyle(document.body).backgroundColor;
    },
    frame(t: number, st: { caps: Array<[number, number]>; fade: number; push: number }) {
      for (const a of document.getAnimations()) {
        let s = seen.get(a); if (s === undefined) { s = t; seen.set(a, s); }
        if (a.playState !== "paused") a.pause();
        a.currentTime = (t - s) * 1000;
      }
      const kids = document.getElementById("__cap")!.children;
      st.caps.forEach(([o, y], i) => { const el = kids[i] as HTMLElement; if (!el) return; el.style.opacity = String(o); el.style.transform = `translateY(${y.toFixed(2)}px)`; });
      document.getElementById("__fade")!.style.opacity = String(st.fade);
      const s5 = document.getElementById("s5")!;
      if (st.push > 1 && s5.classList.contains("on")) {
        if (!s5.dataset.origin) {
          const a = s5.getBoundingClientRect(), b = (document.getElementById("r_chips") ?? s5).getBoundingClientRect();
          s5.dataset.origin = `${(((b.left + b.width / 2) - a.left) / a.width * 100).toFixed(2)}% ${(((b.top + b.height / 2) - a.top) / a.height * 100).toFixed(2)}%`;
          s5.style.transformOrigin = s5.dataset.origin; s5.style.willChange = "transform";
        }
        s5.style.transform = `scale(${st.push.toFixed(5)})`;
      } else s5.style.transform = "";
      return document.querySelector(".step.on")?.id ?? "";
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- local server ----------
async function up(url: string, tries: number): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not yet */ }
    await sleep(1000);
  }
  return false;
}
async function startLocal(): Promise<{ base: string; child: ChildProcess }> {
  const port = process.env.PORT ?? "8871", inspector = process.env.INSPECTOR_PORT ?? "9371";
  console.log("Applying schema + migrations to the local D1 (idempotent; 'duplicate column' means already applied)…");
  for (const f of ["schema.sql", ...readdirSync(join(REPO, "migrations")).filter((m) => m.endsWith(".sql")).sort().map((m) => `migrations/${m}`)]) {
    const s = spawnSync("npx", ["wrangler", "d1", "execute", "rite", "--local", `--file=${f}`], { cwd: REPO, stdio: "pipe", encoding: "utf8" });
    if (s.status !== 0 && !/duplicate column/.test(s.stdout + s.stderr)) console.warn(`  ${f} failed; /preview may error:\n` + (s.stderr || s.stdout).slice(-600));
  }
  console.log(`Starting wrangler dev --local on :${port} (PostHog key blanked so renders don't count as visitors)…`);
  const child = spawn("npx", ["wrangler", "dev", "--local", "--port", port, "--inspector-port", inspector, "--var", "POSTHOG_KEY:"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; child.stdout?.on("data", (d) => { log += d; }); child.stderr?.on("data", (d) => { log += d; });
  const base = `http://localhost:${port}`;
  if (!(await up(`${base}/start`, 90))) { stopLocal(child); throw new Error("wrangler dev didn't come up:\n" + log.slice(-2000)); }
  return { base, child };
}
function stopLocal(child?: ChildProcess) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } }
}

// ---------- timeline ----------
type Action = { t: number; run: (p: Page) => Promise<unknown> };
type Timeline = { actions: Action[]; tBuild: number; beats: Array<{ a: number; b: number }>; hook: { a: number; b: number }; end: number; voAt: number[] };
const words = (s: string) => s.trim().split(/\s+/).length;
const isCta = (s: string) => /rite\.report/.test(s);
const click = (sel: string) => (p: Page) => p.evaluate((s) => (document.querySelector(s) as HTMLElement).click(), sel);
const focus = (sel: string) => (p: Page) => p.evaluate((s) => (document.querySelector(s) as HTMLElement).focus(), sel);
const key = (ch: string) => (p: Page) => p.keyboard.type(ch);

/** vo: seconds of each spoken segment (hook first), when there's a voiceover. */
function layout(c: Cohort, vo?: number[]): Timeline {
  const read = (s: string) => Math.max(isCta(s) ? CLIP.ctaMin : CLIP.minBeat, CLIP.readBase + words(s) * CLIP.readPerWord);
  const build = (introHold: number) => {
    const A: Action[] = [];
    let t = introHold;
    A.push({ t, run: click('[data-go="1"]') });
    t += CLIP.focusDelay; A.push({ t, run: focus("#fd") }); t += 0.15;
    const [y, m, d] = c.date.split("-");
    for (const ch of `${d}${m}${y}`) { A.push({ t, run: key(ch) }); t += CLIP.keyDate; }
    t += CLIP.afterField; A.push({ t, run: click('#s1 [data-go="2"]') });
    t += CLIP.focusDelay; A.push({ t, run: focus("#fp") }); t += 0.15;
    [...c.city].forEach((ch, i) => { A.push({ t, run: key(ch) }); t += CLIP.keyCity * (1 + 0.25 * Math.sin(i * 2.7 + c.city.length)); });
    t += CLIP.afterField; A.push({ t, run: click('#s2 [data-go="3"]') });
    if (c.time) {
      t += CLIP.focusDelay; A.push({ t, run: focus("#ft") }); t += 0.15;
      for (const ch of c.time.replace(":", "")) { A.push({ t, run: key(ch) }); t += CLIP.keyDate; }
      t += CLIP.afterField; A.push({ t, run: click('#s3 button[type="submit"]') });
    } else { t += CLIP.timeStepHold; A.push({ t, run: click("#notime") }); }
    return { A, tBuild: t };
  };
  let { A, tBuild } = build(CLIP.introHold);
  const hookVoAt = CLIP.fadeIn * 0.8;
  if (vo) { // hook VO must finish (plus a breath) before the first beat; hold the intro longer if not
    const short = hookVoAt + vo[0] + CLIP.voTail - (tBuild + CLIP.firstBeatDelay);
    if (short > 0) ({ A, tBuild } = build(CLIP.introHold + short));
  }
  const beats: Array<{ a: number; b: number }> = [];
  let t = tBuild + CLIP.firstBeatDelay;
  c.lines.forEach((line, i) => {
    let d = vo ? Math.max(CLIP.minBeat, CLIP.voLead + vo[i + 1] + CLIP.voTail) : read(line);
    if (isCta(line)) d = Math.max(d, CLIP.ctaMin);
    if (i === 0) d = Math.max(d, tBuild + CLIP.buildToSummary + CLIP.summaryReveal - t); // pass dates are on screen before beat 2
    beats.push({ a: t, b: t + d }); t += d;
  });
  const end = t + CLIP.tail;
  const voAt = vo ? [hookVoAt, ...beats.map((b) => b.a + CLIP.voLead)] : [];
  return { actions: A.sort((x, y) => x.t - y.t), tBuild, beats, hook: { a: 0, b: beats[0].a }, end, voAt };
}

/** Caption [opacity, rise] for a caption shown from a to b (b = end of clip for the last one). */
function capState(t: number, a: number, b: number, last: boolean): [number, number] {
  const aa = a - CLIP.captionGap;
  const pin = progress(t, aa, aa + CLIP.captionIn, ease.outCubic);
  const pout = last ? 0 : progress(t, b - CLIP.captionOut, b, ease.inOutCubic);
  return [+(pin * (1 - pout)).toFixed(4), (1 - pin) * CLIP.captionRise];
}

// ---------- capture ----------
async function capture(browser: import("playwright").Browser, base: string, c: Cohort, tl: Timeline, dir: string) {
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: "en-GB", timezoneId: "Europe/London", reducedMotion: "no-preference" });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: FONT_CSS }));
  await ctx.route(/fonts\.gstatic\.com|posthog\.com/, (r) => r.abort());
  await ctx.addInitScript(pageDriver, LAYOUT_CSS);
  const page = await ctx.newPage();
  let inflight = 0;
  page.on("request", () => { inflight++; });
  page.on("requestfinished", () => { inflight--; });
  page.on("requestfailed", () => { inflight--; });
  const settle = async () => {
    const t0 = Date.now();
    while (inflight > 0) { if (Date.now() - t0 > 60000) throw new Error(`${c.id}: a request never finished`); await sleep(15); }
    for (let i = 0; i < 3; i++) await page.evaluate(() => new Promise<void>((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); }));
  };
  const wall = Date.now();
  await page.clock.install({ time: wall });
  await page.goto(`${base}/start?r=content-render`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await settle();
  const caps = [{ text: c.hook, cls: "h" }, ...c.lines.map((l) => ({ text: l, cls: isCta(l) ? "c" : "l" }))]
    .map((x) => ({ ...x, text: x.text.replace(/(\d{1,2}) ([A-Z][a-z]{2,8}) (\d{4})/g, "$1 $2 $3").replace(/(\d+°) ([A-Z])/g, "$1 $2") }));
  await page.evaluate((list) => (window as unknown as { __rite: { setCaptions: (l: unknown) => void } }).__rite.setCaptions(list), caps);
  const t0ms = (await page.evaluate(() => Date.now())) + 200;
  await page.clock.pauseAt(t0ms);
  const cdp = await ctx.newCDPSession(page);

  const N = Math.ceil(tl.end * FPS);
  const spans = [tl.hook, ...tl.beats];
  let ai = 0, lastStep = "", clockMs = 0, tSummary = Infinity;
  const switches: number[] = [];
  for (let n = 0; n < N; n++) {
    const t = n / FPS;
    while (ai < tl.actions.length && tl.actions[ai].t <= t + 1e-6) { await tl.actions[ai].run(page); ai++; }
    const target = Math.round(t * 1000);
    if (target > clockMs) { await page.clock.runFor(target - clockMs); clockMs = target; }
    await settle();
    const fade = Math.max(1 - progress(t, 0, CLIP.fadeIn, ease.inOutSine), progress(t, tl.end - CLIP.fadeOut, tl.end, ease.inOutSine));
    const push = 1 + (CLIP.pushScale - 1) * progress(t, tSummary + CLIP.summaryReveal, tl.end - CLIP.fadeOut, ease.inOutSine);
    const st = { caps: spans.map((s, i) => capState(t, s.a, i + 1 < spans.length ? spans[i + 1].a : tl.end, i === spans.length - 1)), fade, push: Number.isFinite(tSummary) ? push : 1 };
    const step = await page.evaluate(([tt, s]) => (window as unknown as { __rite: { frame: (t: number, s: unknown) => string } }).__rite.frame(tt as number, s), [t, st] as const);
    if (n > 0 && step !== lastStep) { switches.push(n); if (step === "s5") tSummary = t; }
    if (step !== "s5" && t > tl.tBuild + 12) {
      const err = await page.evaluate(() => Array.from(document.querySelectorAll(".err")).map((e) => (e as HTMLElement).style.display !== "none" ? e.textContent : "").filter(Boolean).join(" | "));
      await ctx.close();
      throw new Error(`summary step never showed for ${c.id} (${err || "no error on page"}). If geocoding is blocked locally, run with BASE_URL=https://rite.mickreal.workers.dev`);
    }
    lastStep = step;
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    writeFileSync(join(dir, `${String(n).padStart(5, "0")}.png`), Buffer.from(shot.data, "base64"));
    if (n % 60 === 0) process.stdout.write(".");
  }
  if (!Number.isFinite(tSummary)) { await ctx.close(); throw new Error(`${c.id}: the summary never showed within the clip`); }
  if (stills) {
    mkdirSync(STILLS, { recursive: true });
    await page.addStyleTag({ content: `body{padding-top:120px!important}#__cap,#__fade{display:none!important}` });
    await page.clock.runFor(100);
    await page.evaluate(([tt]) => (window as unknown as { __rite: { frame: (t: number, s: unknown) => string } }).__rite.frame(tt as number, { caps: [], fade: 0, push: 1 }), [tl.end + 10] as const);
    const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(STILLS, `${c.id}-summary.png`), Buffer.from(shot.data, "base64"));
  }
  await ctx.close();
  return { frames: N, switches, tSummary };
}

// ---------- post: crossfade screen changes (hold the last frame of the old screen, fade the new one in) ----------
function crossfade(dir: string, switches: number[], frames: number) {
  const n = Math.round(CLIP.xfade * FPS);
  const f = (i: number) => join(dir, `${String(i).padStart(5, "0")}.png`);
  for (const k of switches) {
    const held = join(dir, `held-${k}.png`); renameSync(f(k - 1), held); spawnSync("cp", [held, f(k - 1)]);
    for (let i = 0; i < n && k + i < frames; i++) {
      const a = ease.inOutCubic((i + 1) / (n + 1));
      const out = join(dir, `x.png`);
      // blend below the caption band only (captions run on their own timing)
      const g = `[0:v]format=gbrp[o];[1:v]format=gbrp,split[n1][n2];[o][n1]blend=all_expr='A*${(1 - a).toFixed(4)}+B*${a.toFixed(4)}'[m];[n2]crop=${W}:${BAND}:0:0[top];[m][top]overlay=0:0,format=rgb24`;
      const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", held, "-i", f(k + i), "-filter_complex", g, "-frames:v", "1", out]);
      if (r.status !== 0) throw new Error(`crossfade failed at frame ${k + i}: ${r.stderr}`);
      renameSync(out, f(k + i));
    }
    rmSync(held, { force: true });
  }
}

// ---------- encode ----------
function encode(dir: string, frames: number, out: string, audio?: string) {
  const dur = (frames / FPS).toFixed(3);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-framerate", String(FPS), "-i", join(dir, "%05d.png")];
  if (audio) args.push("-i", audio); else args.push("-f", "lavfi", "-t", dur, "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-map", "0:v", "-map", "1:a",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv:flags=lanczos+accurate_rnd+full_chroma_int,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
    "-r", String(FPS), "-fps_mode", "cfr", "-g", String(FPS * 2), "-bf", "2",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-t", dur, "-movflags", "+faststart", out);
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg encode failed for ${out}`);
}

// ---------- main ----------
let child: ChildProcess | undefined;
const cleanup = () => stopLocal(child);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
const notes: string[] = [];
try {
  let base = process.env.BASE_URL?.replace(/\/$/, "");
  if (!base) ({ base, child } = await startLocal());
  else if (!/localhost|127\.0\.0\.1/.test(base)) console.log(`Recording ${base} (note: every clip writes a real preview row there, tagged ref=content-render)`);
  // --lang makes the native date field dd/mm/yyyy (the context locale alone doesn't change it). On Linux Chromium
  // ignores --lang for the field order and follows LC_ALL/LANG, so set those too.
  const browser = await chromium.launch({ args: ["--lang=en-GB", "--hide-scrollbars"], env: { ...process.env, LC_ALL: "en_GB.UTF-8", LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" } as Record<string, string>, executablePath: process.env.CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  mkdirSync(OUT, { recursive: true });
  const tts = provider();
  for (const c of cohorts) {
    process.stdout.write(`● ${c.id}: `);
    let audio: Audio[] | undefined;
    if (c.vo && !silentOnly) {
      const r = await synthAll(tts, c.id, [c.vo.hook, ...c.vo.lines]);
      if ("skip" in r) { const m = `${c.id}: NO VOICEOVER (${tts.name}: ${r.skip}); rendered silent only`; notes.push(m); process.stdout.write(`no VO (${r.skip}) · `); }
      else audio = r.audio;
    }
    const tl = layout(c, audio?.map((a) => a.seconds));
    const dir = join(WORK, c.id);
    process.stdout.write(`capturing ${Math.ceil(tl.end * FPS)} frames `);
    const { frames, switches, tSummary } = await capture(browser, base!, c, tl, dir);
    process.stdout.write(` crossfading ${switches.length} screen changes… `);
    crossfade(dir, switches, frames);
    const out = join(OUT, `${c.id}.mp4`);
    encode(dir, frames, out);
    const dur = frames / FPS;
    let line = `${out.replace(REPO + "/", "")} (${dur.toFixed(1)}s, silent)`;
    if (audio) {
      const wav = join(dir, "vo.wav");
      mixVo(audio.map((a, i) => ({ file: a.file, at: tl.voAt[i] })), dur, wav);
      const vout = join(OUT, `${c.id}_vo.mp4`);
      encode(dir, frames, vout, wav);
      const m = measure(vout);
      line += ` + ${vout.replace(REPO + "/", "")} (VO ${m.lufs.toFixed(1)} LUFS, peak ${m.tp.toFixed(1)} dBTP)`;
    } else rmSync(join(OUT, `${c.id}_vo.mp4`), { force: true }); // never leave a stale VO version next to a new silent one
    if (dur > CLIP.maxDuration || dur < CLIP.minDuration) notes.push(`${c.id}: ${dur.toFixed(1)} s is outside the kit's ${CLIP.minDuration}–${CLIP.maxDuration} s`);
    if (tSummary > tl.beats[1]?.a) notes.push(`${c.id}: the summary showed at ${tSummary.toFixed(1)} s, after beat 2 started (${tl.beats[1].a.toFixed(1)} s)`);
    if (!keepFrames) rmSync(dir, { recursive: true, force: true });
    console.log(line);
  }
  await browser.close();
  if (!keepFrames && existsSync(WORK) && !readdirSync(WORK).length) rmSync(WORK, { recursive: true, force: true });
  if (notes.length) { console.log("\nNotes:"); for (const n of notes) console.log(`  ${n}`); }
} finally {
  cleanup();
}
