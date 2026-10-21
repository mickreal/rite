// A Worker can't fetch its own Custom Domain (Cloudflare answers 522), so self-calls go to SELF_URL (workers.dev) when set.
import { it, expect, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { selfUrl } from "../src/index";
it("self-calls use SELF_URL when set, SITE_URL otherwise", () => {
  expect(selfUrl({ SITE_URL: "https://rite.report", SELF_URL: "https://rite.mickreal.workers.dev/" })).toBe("https://rite.mickreal.workers.dev");
  expect(selfUrl({ SITE_URL: "https://rite.report" })).toBe("https://rite.report");
});
