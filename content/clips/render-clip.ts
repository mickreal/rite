#!/usr/bin/env bun
// Style 1 generator (docs/gtm-plan.md §2): drives the real /start flow in a 1080×1920 browser, records it, then
// burns in the hook and on-screen lines with the brand fonts and writes content/out/clips/<cohort>.mp4.
//
//   bun clips/render-clip.ts                      all cohorts in clips/cohorts.json, against a local `wrangler dev`
//   bun clips/render-clip.ts --only taurus-2028   one or more ids, comma-separated
//   bun clips/render-clip.ts --only taurus-2028 --vo vo/taurus-2028.mp3   mux a voiceover
//   bun clips/render-clip.ts --only celeb-lisa-1997 --stills   also save the summary screen as a PNG (out/stills/)
//   BASE_URL=https://rite.mickreal.workers.dev bun clips/render-clip.ts   record the live site instead
//
// A voiceover is also picked up automatically from clips/vo/<cohort id>.mp3 when it exists.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, renameSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTENT = resolve(HERE, "..");
const REPO = resolve(CONTENT, "..");
const FONTS = join(CONTENT, "fonts");
const OUT = join(CONTENT, "out", "clips");
const RAW = join(CONTENT, "out", "raw");
const require = createRequire(import.meta.url);
const { chromium } = require(join(REPO, "node_modules", "playwright")) as typeof import("playwright");

type Cohort = { id: string; label: string; date: string; city: string; time: string | null; hook: string; lines: string[] };
const cfg = JSON.parse(readFileSync(join(HERE, "cohorts.json"), "utf8")) as { cohorts: Cohort[] };

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
const only = arg("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const voArg = arg("vo");
const keepRaw = argv.includes("--keep-raw");
// --stills also saves a caption-free 1080×1920 screenshot of the summary to out/stills/<id>-summary.png
// (the backdrop for a style-5 green-screen reaction)
const stills = argv.includes("--stills");
const STILLS = join(CONTENT, "out", "stills");
const cohorts = only ? cfg.cohorts.filter((c) => only.includes(c.id)) : cfg.cohorts;
if (only && cohorts.length !== only.length) { console.error(`Unknown cohort id in --only. Known: ${cfg.cohorts.map((c) => c.id).join(", ")}`); process.exit(1); }
if (voArg && cohorts.length !== 1) { console.error("--vo needs exactly one cohort (use --only <id>), or drop files in clips/vo/<id>.mp3"); process.exit(1); }

// ---------- frame layout (px in the 1080×1920 frame) ----------
const W = 1080, H = 1920;
const BAND = 430;          // caption band at the top; the page sits below it
const ZOOM = 2.0;          // the flow is a 480px mobile column; zoom it to 960px so it reads at phone size
const PAGE_H = H - BAND - 30;
const SIDE = 84;           // caption side margin (TikTok's right-hand buttons sit inside ~120px; captions are centred)
const C = { cream: "#EDE6D6", gold: "#F2B544", muted: "#A7A196" };

const LAYOUT_CSS = `
body{padding-top:${BAND}px;min-height:${H}px;box-sizing:border-box}
.flow{zoom:${ZOOM};min-height:0!important}
.step{min-height:${(PAGE_H / ZOOM).toFixed(1)}px!important;padding-top:28px!important;padding-bottom:16px!important}
html{scrollbar-width:none}::-webkit-scrollbar{display:none}
`;

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
  const port = process.env.PORT ?? "8791";
  console.log("Applying schema to the local D1 (idempotent)…");
  const s = spawnSync("npx", ["wrangler", "d1", "execute", "rite", "--local", "--file=schema.sql"], { cwd: REPO, stdio: "pipe", encoding: "utf8" });
  if (s.status !== 0) console.warn("  schema apply failed; /preview may error:\n" + (s.stderr || s.stdout).slice(-800));
  console.log(`Starting wrangler dev --local on :${port} (PostHog key blanked so renders don't count as visitors)…`);
  const child = spawn("npx", ["wrangler", "dev", "--local", "--port", port, "--var", "POSTHOG_KEY:"], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let log = ""; child.stdout?.on("data", (d) => { log += d; }); child.stderr?.on("data", (d) => { log += d; });
  const base = `http://localhost:${port}`;
  if (!(await up(`${base}/start`, 90))) { stopLocal(child); throw new Error("wrangler dev didn't come up:\n" + log.slice(-2000)); }
  return { base, child };
}
function stopLocal(child?: ChildProcess) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { /* gone */ } }
}

// ---------- fonts for the browser (the page asks Google Fonts; we serve the same families from content/fonts) ----------
const b64 = (f: string) => readFileSync(join(FONTS, f)).toString("base64");
const FONT_CSS = `
@font-face{font-family:'Bricolage Grotesque';src:url(data:font/ttf;base64,${b64("BricolageGrotesque-VF.ttf")}) format('truetype');font-weight:200 800;font-stretch:75% 100%;font-style:normal}
@font-face{font-family:'Hanken Grotesk';src:url(data:font/ttf;base64,${b64("HankenGrotesk-VF.ttf")}) format('truetype');font-weight:100 900;font-style:normal}`;

// ---------- caption wrapping, measured with the real fonts in the browser ----------
type Styled = { text: string; font: string; size: number; color: string; weight: number; family: string };
async function wrap(browser: import("playwright").Browser, items: Array<Omit<Styled, "text"> & { text: string }>, maxW: number): Promise<string[][]> {
  const p = await browser.newPage();
  await p.setContent(`<style>${FONT_CSS}</style><div style="font-family:'Bricolage Grotesque';font-weight:800">.</div><div style="font-family:'Hanken Grotesk';font-weight:600">.</div>`);
  await p.evaluate(() => document.fonts.ready);
  const out = await p.evaluate(({ items, maxW }) => {
    const cv = document.createElement("canvas").getContext("2d")!;
    return items.map((it) => {
      cv.font = `${it.weight} ${it.size}px '${it.family}'`;
      // keep "13 May 2026" and "10° Aries" together on one line
      const glued = it.text.replace(/(\d{1,2}) ([A-Z][a-z]{2,8}) (\d{4})/g, "$1 $2 $3").replace(/(\d+°) ([A-Z])/g, "$1 $2");
      const words = glued.split(/ +/); const lines: string[] = []; let cur = "";
      for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (cv.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      if (cur) lines.push(cur);
      return lines;
    });
  }, { items, maxW });
  await p.close();
  return out;
}

// ---------- record one cohort ----------
type Marks = { load: number; input: number; build: number; summary: number; end: number };
async function record(browser: import("playwright").Browser, base: string, c: Cohort): Promise<{ video: string; marks: Marks }> {
  mkdirSync(RAW, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: "en-GB", timezoneId: "Europe/London",
    recordVideo: { dir: RAW, size: { width: W, height: H } }, reducedMotion: "no-preference",
  });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: FONT_CSS }));
  await ctx.route(/fonts\.gstatic\.com|posthog\.com/, (r) => r.abort());
  await ctx.addInitScript((css: string) => {
    const add = () => { const s = document.createElement("style"); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
  }, LAYOUT_CSS);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const at = () => (Date.now() - t0) / 1000;
  await page.goto(`${base}/start?r=content-render`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const load = at();
  await sleep(2900);                                    // intro animation + hook title

  const input = at();
  await page.click('[data-go="1"]');
  await sleep(700);
  const [y, m, d] = c.date.split("-");
  await page.click("#fd");
  await page.keyboard.type(`${d}${m}${y}`, { delay: 170 });  // en-GB date field: dd/mm/yyyy
  if ((await page.inputValue("#fd")) !== c.date) { // other locales/field orders: correct it, but the typing on screen was wrong
    console.warn(`\n  ${c.id}: typed date didn't land as dd/mm/yyyy (got "${await page.inputValue("#fd")}"); fixed with fill(), re-check the clip`);
    await page.fill("#fd", c.date);
  }
  await sleep(700);
  await page.click('#s1 [data-go="2"]');
  await sleep(650);
  await page.click("#fp");
  await page.keyboard.type(c.city, { delay: 85 });
  await sleep(600);
  await page.click('#s2 [data-go="3"]');
  await sleep(800);
  if (c.time) {
    await page.click("#ft");
    await page.keyboard.type(c.time.replace(":", ""), { delay: 150 });
    if ((await page.inputValue("#ft")) !== c.time) await page.fill("#ft", c.time);
    await sleep(500);
  }
  const build = at();
  if (c.time) await page.click('#s3 button[type="submit"]'); else await page.click("#notime");
  try {
    await page.waitForSelector("#s5.on", { timeout: 45000 });
  } catch {
    const err = await page.evaluate(() => Array.from(document.querySelectorAll(".err")).map((e) => (e as HTMLElement).style.display !== "none" ? e.textContent : "").filter(Boolean).join(" | "));
    await ctx.close();
    throw new Error(`summary step never showed for ${c.id} (${err || "no error on page"}). If geocoding is blocked locally, run with BASE_URL=https://rite.mickreal.workers.dev`);
  }
  const summary = at();
  await sleep(7200);                                     // hold on the summary while the cards pop in
  const end = at();
  if (stills) {                                          // after `end`, so none of this is in the clip
    mkdirSync(STILLS, { recursive: true });
    await page.addStyleTag({ content: `body{padding-top:120px!important}` });
    await sleep(300);
    await page.screenshot({ path: join(STILLS, `${c.id}-summary.png`) });
  }
  const video = await page.video()!.path();
  await ctx.close();                                     // flushes the .webm
  return { video, marks: { load, input, build, summary, end } };
}

// ---------- ffmpeg ----------
const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
function alphaExpr(a: number, b: number, f = 0.22) {
  return `if(lt(t,${a.toFixed(2)}),0,if(lt(t,${(a + f).toFixed(2)}),(t-${a.toFixed(2)})/${f},if(lt(t,${(b - f).toFixed(2)}),1,if(lt(t,${b.toFixed(2)}),(${b.toFixed(2)}-t)/${f},0))))`;
}

async function compose(browser: import("playwright").Browser, c: Cohort, video: string, mk: Marks, vo?: string) {
  mkdirSync(OUT, { recursive: true });
  const start = mk.load + 0.15;                          // trim the white/blank frames before first paint
  const dur = mk.end - start;
  const HOOK_END = 2.5;
  // first line runs while the date and city are typed; the rest share the build + summary time evenly
  const tA = Math.max(HOOK_END + 0.2, mk.input - start);
  const tB = Math.max(tA + 2.2, mk.build - start + 1.4);
  const rest = c.lines.slice(1);
  const seg = rest.length ? (dur - 0.4 - tB) / rest.length : 0;
  const spans: Array<[number, number]> = [[tA, tB], ...rest.map((_, i) => [tB + i * seg, tB + (i + 1) * seg] as [number, number])];
  if (spans.length) spans[spans.length - 1][1] = dur - 0.35;

  const isCta = (s: string) => /rite\.report/.test(s);
  const styles = [
    { text: c.hook, family: "Bricolage Grotesque", weight: 800, size: 74, color: C.cream, font: "BricolageGrotesque-ExtraBold.ttf" },
    ...c.lines.map((t) => isCta(t)
      ? { text: t, family: "Hanken Grotesk", weight: 600, size: 52, color: C.cream, font: "HankenGrotesk-SemiBold.ttf" }
      : { text: t, family: "Bricolage Grotesque", weight: 700, size: 72, color: C.gold, font: "BricolageGrotesque-Bold.ttf" }),
  ];
  const wrapped = await wrap(browser, styles, W - 2 * SIDE);

  const tmp = join(OUT, `.${c.id}.tmp`); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const filters: string[] = [];
  let n = 0;
  const block = (idx: number, a: number, b: number) => {
    const st = styles[idx]; const lines = wrapped[idx]; const lh = Math.round(st.size * 1.12);
    const top = Math.round(BAND / 2 + 40 - (lines.length * lh) / 2);   // centred in the band, nudged below TikTok's top bar
    lines.forEach((ln, i) => {
      const f = join(tmp, `t${n++}.txt`); writeFileSync(f, ln);
      filters.push(`drawtext=fontfile='${esc(join(FONTS, st.font))}':textfile='${esc(f)}':fontsize=${st.size}:fontcolor=${st.color}:x=(w-text_w)/2:y=${top + i * lh}:alpha='${alphaExpr(a, b)}':enable='between(t,${a.toFixed(2)},${b.toFixed(2)})'`);
    });
  };
  block(0, 0, HOOK_END);
  spans.forEach(([a, b], i) => block(i + 1, a, b));

  const chain = [
    `scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, "fps=30", "setsar=1",
    ...filters,
    "fade=t=in:st=0:d=0.4", `fade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4`, "format=yuv420p",
  ].join(",");
  const graph = join(tmp, "graph.txt");
  writeFileSync(graph, `[0:v]${chain}[v]`);
  const out = join(OUT, `${c.id}.mp4`);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-ss", start.toFixed(2), "-t", dur.toFixed(2), "-i", video];
  if (vo) args.push("-i", vo); else args.push("-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-filter_complex_script", graph, "-map", "[v]", "-map", "1:a");
  if (vo) args.push("-af", `apad,afade=t=out:st=${(dur - 0.4).toFixed(2)}:d=0.4`, "-t", dur.toFixed(2));
  args.push("-c:v", "libx264", "-preset", "medium", "-crf", "21", "-profile:v", "high", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out);
  const r = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${c.id}`);
  rmSync(tmp, { recursive: true, force: true });
  if (vo) {
    const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", vo], { encoding: "utf8" });
    const vd = parseFloat(probe.stdout); if (vd > dur) console.warn(`  voiceover is ${vd.toFixed(1)}s, clip is ${dur.toFixed(1)}s: the end of the VO was cut. Shorten the VO or lengthen the summary hold.`);
  }
  return { out, dur };
}

// ---------- main ----------
let child: ChildProcess | undefined;
const cleanup = () => stopLocal(child);
process.on("SIGINT", () => { cleanup(); process.exit(130); });
try {
  let base = process.env.BASE_URL?.replace(/\/$/, "");
  if (!base) ({ base, child } = await startLocal());
  else console.log(`Recording ${base} (note: every clip writes a real preview row there, tagged ref=content-render)`);
  // --lang makes the native date field dd/mm/yyyy (the context locale alone doesn't change it). On Linux Chromium
  // ignores --lang for the field order and follows LC_ALL/LANG, so set those too (otherwise it records mm/dd/yyyy
  // and "01/04/1997" reads as 4 January on screen).
  const browser = await chromium.launch({ args: ["--lang=en-GB"], env: { ...process.env, LC_ALL: "en_GB.UTF-8", LANG: "en_GB.UTF-8", LANGUAGE: "en_GB" } as Record<string, string>, executablePath: process.env.CHROMIUM ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined) });
  for (const c of cohorts) {
    process.stdout.write(`● ${c.id}: recording… `);
    const { video, marks } = await record(browser, base!, c);
    process.stdout.write("composing… ");
    const vo = voArg ? resolve(voArg) : existsSync(join(HERE, "vo", `${c.id}.mp3`)) ? join(HERE, "vo", `${c.id}.mp3`) : undefined;
    const { out, dur } = await compose(browser, c, video, marks, vo);
    if (keepRaw) renameSync(video, join(RAW, `${c.id}.webm`)); else rmSync(video, { force: true });
    console.log(`${out.replace(REPO + "/", "")} (${dur.toFixed(1)}s${vo ? ", with VO" : ""})`);
  }
  await browser.close();
  if (!keepRaw) for (const f of existsSync(RAW) ? readdirSync(RAW) : []) if (f.endsWith(".webm")) rmSync(join(RAW, f), { force: true });
} finally {
  cleanup();
}
