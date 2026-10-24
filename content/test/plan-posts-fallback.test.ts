import { describe, it, expect } from "vitest";
import { expandPosts, fallbackPlatforms } from "../scripts/plan-posts";

describe("fallback posts", () => {
  it("go to Shorts and Facebook too when the slot is a short-video slot", () => {
    expect(fallbackPlatforms(["tiktok", "reels"])).toEqual(["tiktok", "reels", "shorts", "facebook"]);
    expect(fallbackPlatforms(["reddit"])).toEqual(["reddit"]);
    const out = expandPosts([{ date: "2026-11-05", slot: "Creator duet", platforms: ["tiktok", "reels"], caption: "x",
      fallback: { asset: "aries-three-pass-1998", caption: "y" } } as never]);
    expect(out[1].platforms).toEqual(["tiktok", "reels", "shorts", "facebook"]);
  });
});
