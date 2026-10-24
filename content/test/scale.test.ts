// 4K masters (scripts/scale.ts): the SCALE switch, where renders go, and the ffmpeg args of the 1080 upload copies.
import { describe, it, expect } from "vitest";
import { renderScale, renderRoot, x264Level, masterCrf, fitWidth, downscaleVideoArgs, downscaleStillArgs, staleUploads, GROUPS } from "../scripts/scale";

describe("SCALE switch", () => {
  it("defaults to 1, takes 2, refuses anything else", () => {
    expect(renderScale({})).toBe(1);
    expect(renderScale({ SCALE: "" })).toBe(1);
    expect(renderScale({ SCALE: "1" })).toBe(1);
    expect(renderScale({ SCALE: " 2 " })).toBe(2);
    for (const bad of ["3", "4k", "1.5", "two"]) expect(() => renderScale({ SCALE: bad })).toThrow(/SCALE must be 1 or 2/);
  });
  it("1 keeps renders in out/ exactly as before; 2 puts masters in out/master/", () => {
    expect(renderRoot("/c", 1)).toBe("/c/out");
    expect(renderRoot("/c", 2)).toBe("/c/out/master");
  });
  it("masters encode at CRF 14 and level 5.1 at 2160×3840; 1080 renders keep their values", () => {
    expect(masterCrf(1, 20)).toBe(20);
    expect(masterCrf(2, 20)).toBe(14);
    expect(x264Level(1080, 1920)).toBe("4.2");
    expect(x264Level(2160, 3840)).toBe("5.1");
  });
  it("covers every render group export-batch reads", () => {
    expect([...GROUPS].sort()).toEqual(["carousels", "clips", "cohorts", "presenter", "quotes", "signs", "stills"]);
  });
});

describe("upload copies", () => {
  it("bring 2160-wide masters to 1080 wide with the aspect kept and an even height", () => {
    expect(fitWidth(2160, 3840)).toEqual({ w: 1080, h: 1920 });
    expect(fitWidth(2160, 2700)).toEqual({ w: 1080, h: 1350 });
    expect(fitWidth(1080, 1350)).toEqual({ w: 1080, h: 1350 }); // never upscales
    expect(fitWidth(2161, 3841).h % 2).toBe(0);
  });
  it("videos: lanczos to 1080, H.264 high CRF 18 level 4.2, faststart, audio copied (no second loudness pass)", () => {
    const a = downscaleVideoArgs("in.mp4", "out.mp4", { w: 1080, h: 1920 });
    const j = a.join(" ");
    expect(j).toContain("scale=1080:1920:flags=lanczos");
    expect(j).toContain("-c:v libx264");
    expect(j).toContain("-crf 18");
    expect(j).toContain("-profile:v high");
    expect(j).toContain("-level 4.2");
    expect(j).toContain("-c:a copy");
    expect(j).not.toMatch(/loudnorm|-af /);
    expect(j).toContain("+faststart");
    expect(a.at(-1)).toBe("out.mp4");
  });
  it("stills: one lanczos frame", () => {
    expect(downscaleStillArgs("a.png", "b.png", { w: 1080, h: 1350 }).join(" ")).toContain("scale=1080:1350:flags=lanczos");
  });
  it("redoes only copies that are missing or older than their master", () => {
    expect(staleUploads([
      { master: "a", upload: "ua", masterMtime: 10, uploadMtime: null },
      { master: "b", upload: "ub", masterMtime: 10, uploadMtime: 5 },
      { master: "c", upload: "uc", masterMtime: 10, uploadMtime: 20 },
    ])).toEqual(["a", "b"]);
  });
});
