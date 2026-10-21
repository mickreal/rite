// A refunded reading closes: the page, narration, questions, calendar and Saturn Season checkout all answer 410.
import { describe, it, expect, beforeEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness } from "./helpers/worker";

const FORM = { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" };
let h: Harness;
beforeEach(() => { h = new Harness({ POSTHOG_KEY: "" } as never); h.seedPreview(); }); // no PostHog: its HTMLRewriter is absent under node

describe("refunded readings close", () => {
  it("a generated reading opens normally", async () => {
    const tok = h.seedPurchase();
    const r = await h.request(`/r/${tok}`);
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain("was refunded");
  });
  it("a refunded reading shows the closed page, and everything under it is 410", async () => {
    const tok = h.seedPurchase({ status: "refunded" });
    const page = await h.request(`/r/${tok}`);
    expect(page.status).toBe(410);
    expect(await page.text()).toContain("This reading<br>was refunded.");
    for (const p of [`/r/${tok}/audio/0.mp3`, `/r/${tok}/calendar.ics`, `/r/${tok}/status`, `/r/${tok}/year`]) {
      expect((await h.request(p)).status, p).toBe(410);
    }
    expect((await h.request(`/r/${tok}/ask`, { method: "POST", headers: FORM, body: "q=hello" })).status).toBe(410);
    expect((await h.request(`/season/${tok}`, { method: "POST", headers: FORM, body: "plan=month" })).status).toBe(410);
    expect(h.llm()).toHaveLength(0); // no question answered, nothing generated
  });
});
