import { describe, it, expect } from "vitest";
// @ts-expect-error: no @types/node in this Workers project; vitest runs in Node
import { readFileSync } from "node:fs";
import { shareCardSvg, ogSvg, signOgSvg, FONT_DISPLAY, FONT_TEXT } from "../src/card";
import { compute } from "../src/compute";

// The family name stored in a TTF's name table (ID 16 if present, else ID 1), as resvg matches it.
function familyName(path: string): string {
  const b: Uint8Array = readFileSync(path); // relative to the repo root (vitest cwd)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const numTables = v.getUint16(4);
  for (let i = 0; i < numTables; i++) {
    const r = 12 + i * 16;
    if (String.fromCharCode(b[r], b[r + 1], b[r + 2], b[r + 3]) !== "name") continue;
    const off = v.getUint32(r + 8), count = v.getUint16(off + 2), strings = off + v.getUint16(off + 4);
    const names: Record<number, string> = {};
    for (let j = 0; j < count; j++) {
      const e = off + 6 + j * 12;
      if (v.getUint16(e) !== 3) continue; // Windows, UTF-16BE
      const id = v.getUint16(e + 6), len = v.getUint16(e + 8), at = strings + v.getUint16(e + 10);
      let s = ""; for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(at + k));
      names[id] = s;
    }
    return names[16] ?? names[1];
  }
  throw new Error("no name table");
}

describe("share card + OG SVG", () => {
  const c = compute({ date: "1995-06-15", time: "14:30", place: { label: "London", lat: 51.5, lon: -0.12, tz: "Europe/London" } });

  it("uses the bundled font families, in a stylesheet resvg can parse", () => {
    for (const svg of [shareCardSvg(c, { site: "rite.report", angle: 120 }), ogSvg(), signOgSvg("Aries", "2025–2028", true)]) {
      expect(svg).toContain(`.d{font-family:'${FONT_DISPLAY}'`);
      expect(svg).toContain(`.h{font-family:'${FONT_TEXT}'`);
      // the class rules must not share a <style> with the @import (resvg drops rules after it)
      const sheet = svg.match(/<style>([^<]*\.d\{[^<]*)<\/style>/)?.[1] ?? "";
      expect(sheet).toContain(".h{");
      expect(sheet).not.toContain("@import");
    }
  });

  it("font files carry those family names", () => {
    expect(familyName("src/fonts/bricolage-700.bin")).toBe(FONT_DISPLAY);
    expect(familyName("src/fonts/bricolage-800.bin")).toBe(FONT_DISPLAY);
    expect(familyName("src/fonts/hanken-400.bin")).toBe(FONT_TEXT);
    expect(familyName("src/fonts/hanken-600.bin")).toBe(FONT_TEXT);
  });
});
