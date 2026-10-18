// Brand soundtrack: track selection, rotation, offset progression (scripts/music.ts), the mix (scripts/add-music.ts)
// and the export manifest fields (scripts/export-batch.ts). Run from content/: npm test
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dayNumber, offsetsFor, pick, planMusic, resolveOffset, STRIDE, useFor, type Library, type Track } from "../scripts/music";

const CONTENT = resolve(__dirname, "..");
const lib = JSON.parse(readFileSync(join(CONTENT, "music", "library.json"), "utf8")) as Library;
const ids = { cohorts: new Set(["aries-three-pass-1997", "taurus-2028"]), presenter: new Set(["script-6"]) };
const isVideo = (a: string) => !a.startsWith("carousel-") && !/^(cohort|quote)-[a-z0-9-]+$/.test(a) || a.endsWith("-vertical");
const T = (id: string) => lib.tracks.find((t) => t.id === id)!;

describe("library.json", () => {
  it("has the nine tracks with directions, uses and offsets inside the track", () => {
    expect(lib.tracks.map((t) => t.id).sort()).toEqual(["A1", "A2", "A3", "B1", "B2", "B3", "B4", "C1", "C2"]);
    for (const t of lib.tracks) {
      expect(t.use).toBe(t.direction === "pulse" ? "cards" : "voice");
      expect(existsSync(join(CONTENT, "music", t.file))).toBe(true);
      expect(t.offsets[0]).toBe(4);
      expect(Math.max(...t.offsets)).toBeLessThanOrEqual(t.duration - 20);
      t.offsets.slice(1).forEach((o, i) => expect(o - t.offsets[i]).toBe(8));
    }
  });
  it("offsetsFor: every 8 s from 4 s, none in the last 20 s", () => {
    expect(offsetsFor(60)).toEqual([4, 12, 20, 28, 36]);
    expect(offsetsFor(10)).toEqual([0]);
  });
});

describe("selection", () => {
  it("voice-led vs cards by asset type", () => {
    expect(useFor("aries-three-pass-1997", ids)).toBe("voice");
    expect(useFor("aries-three-pass-1997_vo", ids)).toBe("voice");
    expect(useFor("script-6", ids)).toBe("voice");
    expect(useFor("quote-closest-turn-vertical", ids)).toBe("cards");
    expect(useFor("sign-leo-vertical", ids)).toBe("cards");
    expect(useFor("something-else", ids)).toBe("cards");
  });
  it("voice alternates felt-piano and orbit, cycling variations; cards cycle pulse", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => pick(lib, "voice", n).id)).toEqual(["A1", "C1", "A2", "C2", "A3", "C1", "A1"]);
    expect([0, 1, 2, 3, 4].map((n) => pick(lib, "cards", n).id)).toEqual(["B1", "B2", "B3", "B4", "B1"]);
  });

  const posts = [
    { date: "2026-10-19", asset: "aries-three-pass-1997" },
    { date: "2026-10-19", asset: "carousel-2-window-by-birth-year" },  // still: no music
    { date: "2026-10-19" },                                             // text post
    { date: "2026-10-20", asset: "taurus-2028" },
    { date: "2026-10-21", asset: "quote-closest-turn-vertical" },
    { date: "2026-10-21", asset: "quote-closest-turn" },                // still
    { date: "2026-10-22", asset: "script-6" },
    { date: "2026-10-23", asset: "sign-leo-vertical" },
    { date: "2026-10-24", asset: "aries-three-pass-1997" },
  ];

  it("rotates deterministically by posting date and skips stills and text posts", () => {
    const c = planMusic(posts, lib, { isVideo, ids });
    expect(c.map((x) => x?.track ?? null)).toEqual(["A1", null, null, "C1", "B1", null, "A2", "B2", "C2"]);
    expect(planMusic(posts, lib, { isVideo, ids })).toEqual(c); // same input, same answer
    // the same posts listed out of order get the same choices (ordered by date, then position)
    const shuffled = [...posts].reverse();
    const c2 = planMusic(shuffled, lib, { isVideo, ids });
    posts.forEach((p, i) => expect(c2[shuffled.indexOf(p)]).toEqual(c[i]));
  });

  it("advances the start offset post by post within a track", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ date: `2026-10-${String(19 + i).padStart(2, "0")}`, asset: "quote-x-vertical" }));
    const c = planMusic(many, lib, { isVideo, ids });
    const b1 = c.filter((x) => x!.track === "B1").map((x) => x!.offsetIndex);
    expect(b1).toEqual([0, STRIDE, 2 * STRIDE].map((i) => i % T("B1").offsets.length));
    // a 30 s video at B1's first three cursor positions: 4 s, 36 s, 68 s, i.e. it continues through the piece
    expect(c.filter((x) => x!.track === "B1").map((x) => resolveOffset(T("B1"), x!, 30))).toEqual([4, 36, 68]);
  });

  it("rolling weeks start further on (base from the plan's first date)", () => {
    const wk = (d: string) => planMusic([{ date: d, asset: "aries-three-pass-1997" }], lib, { isVideo, ids })[0]!;
    expect(wk("2026-10-19").track).toBe("A1");
    expect(dayNumber("2026-12-14")).toBe(56);
    expect(wk("2026-12-14").track).toBe(pick(lib, "voice", 56).id);
    expect(wk("2026-12-14").offsetIndex).toBe((8 * STRIDE) % T(pick(lib, "voice", 56).id).offsets.length);
  });

  it("MUSIC=off and per-post overrides", () => {
    expect(planMusic(posts, lib, { isVideo, ids, env: { MUSIC: "off" } }).every((x) => x === null)).toBe(true);
    const o = planMusic([
      { date: "2026-10-19", asset: "aries-three-pass-1997", music: "off" },
      { date: "2026-10-20", asset: "taurus-2028", music: "B3" },
      { date: "2026-10-21", asset: "quote-x-vertical", music: "C2@40" },
      { date: "2026-10-22", asset: "aries-three-pass-1997" },
    ], lib, { isVideo, ids });
    expect(o[0]).toBeNull();
    expect(o[1]).toMatchObject({ track: "B3", source: "override" });
    expect(o[2]).toMatchObject({ track: "C2", offset: 40, source: "override" });
    expect(resolveOffset(T("C2"), o[2]!, 30)).toBe(40);
    expect(o[3]).toMatchObject({ track: "A1", source: "rotation" }); // overrides don't use up the rotation
    expect(() => planMusic([{ date: "2026-10-19", asset: "taurus-2028", music: "Z9" }], lib, { isVideo, ids })).toThrow(/not a track/);
  });

  it("resolveOffset keeps the video inside the track", () => {
    const t: Track = { ...T("B1") };
    const late = { track: t.id, direction: t.direction, use: t.use, offsetIndex: t.offsets.length - 1, source: "rotation" as const };
    const at = resolveOffset(t, late, 40);
    expect(at + 40).toBeLessThanOrEqual(t.duration);
    expect(t.offsets).toContain(at);
    expect(resolveOffset(t, late, 500)).toBe(0); // longer than the track: from the top, looped
  });
});

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
describe.runIf(hasFfmpeg)("mix + export (ffmpeg)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "rite-music-"));
  const fixture = join(CONTENT, "out", "quotes", "quote-zz-musictest-vertical.mp4");
  const fixtureVo = fixture.replace(/\.mp4$/, "_vo.mp4");
  const ff = (args: string[]) => { const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], { encoding: "utf8" }); if (r.status) throw new Error(r.stderr); };
  beforeAll(() => {
    mkdirSync(join(CONTENT, "out", "quotes"), { recursive: true });
    // 8 s test video: silent version, and a "voice" version (a tone that speaks 1–3 s and 5–7 s at about −16 LUFS)
    ff(["-f", "lavfi", "-i", "testsrc=s=320x568:r=30:d=8", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", fixture]);
    ff(["-f", "lavfi", "-i", "testsrc=s=320x568:r=30:d=8", "-f", "lavfi", "-i", "sine=f=220:r=48000:d=8",
      "-af", "volume='if(between(t,1,3)+between(t,5,7),0.35,0)':eval=frame,aformat=channel_layouts=stereo", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "8", fixtureVo]);
  }, 60000);
  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); for (const f of [fixture, fixtureVo]) rmSync(f, { force: true }); });

  it("mixes, tags, normalises, and refuses to stack music twice", async () => {
    const { mixMusic, musicTag, loudness } = await import("../scripts/add-music");
    const out = join(tmp, "a.mp4"), out2 = join(tmp, "b.mp4");
    const r = mixMusic(fixtureVo, out, T("A1"), 4);
    expect(r.voice).toBe(true);
    expect(musicTag(out)).toBe("A1@4");
    expect(Math.abs(loudness(out).lufs - -16)).toBeLessThan(1.5);
    expect(loudness(out).tp).toBeLessThanOrEqual(-1.5);
    const s = mixMusic(fixture, out2, T("B2"), 12);
    expect(s.voice).toBe(false);
    expect(Math.abs(loudness(out2).lufs - -16)).toBeLessThan(1.5);
    expect(() => mixMusic(out, join(tmp, "c.mp4"), T("A1"), 4)).toThrow(/already has music/);
    const v = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", out], { encoding: "utf8" }).stdout.trim();
    expect(v).toBe("h264"); // video stream copied
  }, 120000);

  it("export-batch records the track and offset per post (manifest.json, csv) and MUSIC=off exports the clean render", () => {
    const plan = join(tmp, "plan.json");
    writeFileSync(plan, JSON.stringify({ posts: [
      { date: "2026-10-21", asset: "quote-zz-musictest-vertical", platforms: ["tiktok"], caption: "x" },
      { date: "2026-10-22", asset: "quote-zz-musictest-vertical", platforms: ["tiktok"], caption: "y", music: "C2@20" },
      { date: "2026-10-23", ref: "kit-post-1", platforms: ["x"], caption: "text" },
    ] }));
    const run = (dest: string, env: Record<string, string> = {}) => spawnSync("bun", ["scripts/export-batch.ts", "--plan", plan, "--dest", dest, "--from", "2026-10-22"], { cwd: CONTENT, encoding: "utf8", env: { ...process.env, ...env } });
    const d1 = join(tmp, "exp1"); const r = run(d1);
    expect(r.status, r.stderr).toBe(0);
    const m = JSON.parse(readFileSync(join(d1, "manifest.json"), "utf8"));
    expect(m.posts).toHaveLength(2);
    expect(m.posts[0].music).toMatchObject({ track: "C2", direction: "orbit", offset: 20, source: "override", file: "music/rite-theme-C2-orbit.mp3" });
    expect(m.posts[0].music.versions.vo.voice).toBe(true);
    expect(m.posts[0].music.versions.silent.voice).toBe(false);
    expect(m.posts[1].music).toBeNull();
    expect(readFileSync(join(d1, "manifest.csv"), "utf8").split("\n")[0]).toMatch(/,music$/);
    expect(readFileSync(join(d1, "manifest.csv"), "utf8")).toContain("C2@20s");
    const d2 = join(tmp, "exp2"); expect(run(d2, { MUSIC: "off" }).status).toBe(0);
    const m2 = JSON.parse(readFileSync(join(d2, "manifest.json"), "utf8"));
    expect(m2.posts[0].music).toEqual({ off: "MUSIC=off" });
    const tag = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format_tags=comment", "-of", "default=nw=1:nk=1", join(d2, "2026-10-22_tiktok_quote-zz-musictest-vertical_vo.mp4")], { encoding: "utf8" }).stdout.trim();
    expect(tag).toBe("");
  }, 180000);
});
