import { describe, it, expect } from "vitest";
import { compute } from "../src/compute";
import { windowChart, pathPoints } from "../src/astro/cycle";
import { resultPage } from "../src/views/result";
import { natalLabelPos } from "../src/views/chart";

const place = { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" };
const today = new Date("2026-10-17T00:00:00Z");
const CASES = [
  ["1997-04-01", "in window, three passes"],
  ["1996-09-01", "one pass, behind"],
  ["1999-04-01", "window in the future"],
  ["1968-09-01", "second return"],
  ["1997-08-14", "one pass ahead, with a turn"],
] as const;

describe("result chart window band", () => {
  for (const [date, what] of CASES) {
    it(`spans windowStart to windowEnd exactly (${date}, ${what})`, async () => {
      const c = compute({ date, time: null, place }, today);
      const page = String(await resultPage({ siteUrl: "https://rite.test", id: "abc", c, text: "", placeLabel: "Melbourne", birthLabel: date, hasTime: false, today }));
      const m = page.match(/<rect data-band data-start="([^"]+)" data-end="([^"]+)" x="([\d.]+)" y="16" width="([\d.]+)" height="244" rx="14" fill="rgba\(242,181,68,\.05\)"\/>/);
      expect(m, "band rect present").toBeTruthy();
      const [, start, end, x, width] = m!;
      expect(start).toBe(c.window.windowStart);
      expect(end).toBe(c.window.windowEnd);
      const chart = windowChart(c.natalLon, c.window, today);
      const x0 = chart.x(Date.parse(c.window.windowStart)), x1 = chart.x(Date.parse(c.window.windowEnd));
      expect(+x).toBeCloseTo(x0, 1);
      expect(+x + +width).toBeCloseTo(x1, 0);
      const closes = page.match(/<text x="([\d.]+)" y="288" text-anchor="middle" fill="#A7A196"[^>]*>closes<\/text>/);
      expect(closes, "closes label present").toBeTruthy();
      expect(+closes![1]).toBeCloseTo(Math.min(x1, 936), 0);
      expect(page).not.toMatch(/width="[\d.]+" height="244" rx="8"/); // old pass-span rect is gone
    });
  }
});

describe("natal label placement", () => {
  // Every ~23 days across 70 years of birthdays: the label box keeps clear of the curve and the pass rings.
  it("never sits on the curve, for any birth date", () => {
    for (let t = Date.UTC(1940, 0, 3); t < Date.UTC(2010, 0, 1); t += 23 * 86_400_000) {
      const date = new Date(t).toISOString().slice(0, 10);
      const c = compute({ date, time: null, place }, today);
      const chart = windowChart(c.natalLon, c.window, today);
      const text = `your natal Saturn, ${Math.floor(c.degree)}° ${c.sign}`;
      const { box } = natalLabelPos(chart, c.natalLon, c.window.hits, text);
      const pts = pathPoints(c.natalLon, chart.t0, chart.t1, 1).map(([tt, o]) => [chart.x(tt), chart.y(o)]);
      let min = Infinity;
      for (const [px, py] of pts) min = Math.min(min, Math.hypot(Math.max(box.x0 - px, 0, px - box.x1), Math.max(box.y0 - py, 0, py - box.y1)));
      expect(min, `${date}: label ${JSON.stringify(box)}`).toBeGreaterThan(5);
      for (const h of c.window.hits) {
        const hx = chart.x(Date.parse(h));
        const overlaps = hx + 11 > box.x0 && hx - 11 < box.x1 && chart.y0 + 11 > box.y0 && chart.y0 - 11 < box.y1;
        expect(overlaps, `${date}: pass ring at ${hx.toFixed(0)}`).toBe(false);
      }
      expect(box.y0).toBeGreaterThan(16);
      expect(box.y1).toBeLessThan(260);
    }
  });
  it("keeps the design's spot (right end, above the line) when it is clear", () => {
    const c = compute({ date: "1997-04-01", time: null, place }, today);
    const chart = windowChart(c.natalLon, c.window, today);
    const p = natalLabelPos(chart, c.natalLon, c.window.hits, `your natal Saturn, ${Math.floor(c.degree)}° ${c.sign}`);
    expect(p).toMatchObject({ x: 958, anchor: "end" });
    expect(p.y).toBeCloseTo(chart.y0 - 10, 5);
  });
});
