import { describe, it, expect } from "vitest";
import { SIGN_PAGES } from "../src/content/signs";
import { SIGNS } from "../src/astro/saturn";

const BANNED = /\b(cosmic|the universe|energies|energy|manifest|journey|vibration|align)\b/i;

describe("sign page copy", () => {
  for (const s of SIGNS) {
    const c = SIGN_PAGES[s];
    it(`${s} has the full set`, () => {
      expect(c.opener.length).toBeGreaterThan(20);
      expect(c.faq).toHaveLength(3);
      expect(c.forWhom).toContain("{firstBorn}");
      expect(c.forWhom).toContain("{secondBorn}");
      expect(c.meta).toContain("{years}");
      expect(c.meta.replace("{years}", "2025 to 2028").length).toBeLessThanOrEqual(155);
      expect(c.meta).toContain(s);
      const all = [c.opener, c.about, c.questions, c.forWhom, c.meta, ...c.faq.flat()].join(" ");
      expect(all).not.toMatch(BANNED);
      expect(all).not.toMatch(/\b29th\b|birthday/i);
    });
  }
});
