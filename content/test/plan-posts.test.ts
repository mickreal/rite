// Fallback posts, interim presenter reels and pinned music (scripts/plan-posts.ts, scripts/music.ts,
// remotion/src/reels.ts). Run from content/: npm test
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { assetsOf, expandPosts, planPosts } from "../scripts/plan-posts";
import { planMusic, type Library } from "../scripts/music";
import { postMeta } from "../scripts/post-meta";
import { getReel, reelTexts, RAW } from "../remotion/src/reels";

const CONTENT = resolve(__dirname, "..");
const lib = JSON.parse(readFileSync(join(CONTENT, "music", "library.json"), "utf8")) as Library;

describe("fallback posts", () => {
  const post = { date: "2026-11-07", slot: "TikTok + Reels: reader's line", platforms: ["tiktok", "reels"], caption: "", time: "18:00",
    fallback: { asset: "quote-aries-opener-vertical", caption: "c", alt: "a", music: "B1@52" } };
  it("become a post of their own after the original, same day, platforms and time", () => {
    const out = expandPosts([post, { date: "2026-11-08", asset: "x" }]);
    expect(out).toHaveLength(3);
    expect(out[0]).toBe(post);
    expect(out[1]).toMatchObject({ date: "2026-11-07", time: "18:00", asset: "quote-aries-opener-vertical", platforms: ["tiktok", "reels"], caption: "c", alt: "a", music: "B1@52", slot: "Fallback: TikTok + Reels: reader's line", fallback_for: "TikTok + Reels: reader's line" });
    expect(out[1]).not.toHaveProperty("fallback");
  });
  it('are dropped with "use": "original", kept with "both"', () => {
    expect(expandPosts([{ ...post, use: "original" as const }])).toHaveLength(1);
    expect(expandPosts([{ ...post, use: "both" as const }])).toHaveLength(2);
  });
  it("count as assets to render, as do interim reels", () => {
    expect(assetsOf(expandPosts([post, { date: "2026-11-02", asset: "script-7", interim: "script-7-interim" }]))).toEqual(["quote-aries-opener-vertical", "script-7", "script-7-interim"]);
  });
  it("every fallback in the launch plans is a video with caption and alt text", () => {
    for (const f of ["plan-2026-10-weeks-1-2.json", "plan-2026-11-weeks-3-4.json"]) {
      const plan = JSON.parse(readFileSync(join(CONTENT, "scripts", f), "utf8"));
      for (const p of planPosts(plan).filter((x) => x.fallback_for)) {
        expect(p.caption, p.slot).toMatch(/rite\.report/);
        expect(p.alt, p.slot).toBeTruthy();
        expect(p.asset, p.slot).toMatch(/-vertical$|^[a-z]+-[a-z0-9-]+$/);
      }
    }
  });
});

describe("pinned music", () => {
  it('a "track@seconds" pin leaves every other post\'s track and offset as they were', () => {
    const ids = { cohorts: new Set(["c1", "c2", "c3"]), presenter: new Set<string>() };
    const isVideo = () => true;
    const base = [{ date: "2026-10-26", asset: "c1" }, { date: "2026-10-28", asset: "c2" }, { date: "2026-10-30", asset: "c3" }];
    const before = planMusic(base, lib, { isVideo, ids });
    const pinned = planMusic([base[0], { date: "2026-10-27", asset: "c9", music: "A2@100" }, base[1], base[2]], lib, { isVideo, ids });
    expect([pinned[0], pinned[2], pinned[3]]).toEqual(before);
    expect(pinned[1]).toMatchObject({ track: "A2", offset: 100, source: "override" });
  });
});

describe("presenter reels", () => {
  it("resolve @line times from the timing table, in order", () => {
    for (const r of RAW.filter((x) => x.script)) {
      const reel = getReel(r.id);
      const froms = reel.segments.map((s) => s.from);
      expect(froms, r.id).toEqual([...froms].sort((a, b) => a - b));
      expect(reel.voSeconds).toBeGreaterThan(froms[froms.length - 1]);
    }
  });
  it("interim versions have no Anna, no audio, and the parent's cut", () => {
    for (const r of RAW.filter((x) => x.interimOf)) {
      const i = getReel(r.id), p = getReel(r.interimOf!);
      expect(i.audio).toBeUndefined();
      expect(i.segments.some((s) => s.kind === "presenter")).toBe(false);
      expect(i.segments.map((s) => [s.from, s.to])).toEqual(p.segments.map((s) => [s.from, s.to]));
      expect(reelTexts(r.id).spoken).toEqual([]);
      expect(postMeta(r.id, "x.", { cohorts: [], carousels: [], presenter: RAW }).presenter).toBe(false); // no AI presenter in it
      expect(postMeta(r.interimOf!, "x.", { cohorts: [], carousels: [], presenter: RAW }).presenter).toBe(true);
    }
  });
  it("Anna's part of an Anna-light reel is at most 10 s", () => {
    for (const r of RAW.filter((x) => x.anna)) {
      const reel = getReel(r.id);
      const pres = reel.segments.filter((s) => s.kind === "presenter");
      const secs = pres.reduce((n, s) => n + ((s.to ?? reel.voSeconds) - s.from), 0);
      expect(secs, r.id).toBeLessThanOrEqual(10);
    }
  });
});
