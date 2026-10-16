import { describe, it, expect } from "vitest";
import { datesAreGrounded, parseJsonReply } from "../src/llm";
import SIGN_PERIODS from "../src/content/sign-periods.json";
import { signPeriods } from "../src/astro/cycle";
import { compute, cycle, reportInputs } from "../src/compute";

describe("report grounding", () => {
  const allowed = ["28 Apr 2027", "25 Dec 2027", "16 Oct 2026"];
  it("accepts full and abbreviated month names for allowed dates", () => {
    expect(datesAreGrounded("One exact pass on 28 April 2027, then 25 Dec 2027.", allowed)).toBe(true);
    expect(datesAreGrounded("Sept is fine too: 16 Sept 2026? no", ["16 Sep 2026"])).toBe(true);
  });
  it("rejects dates not in the inputs", () => {
    expect(datesAreGrounded("Expect a shift on 3 March 2027.", allowed)).toBe(false);
  });
  it("parses a JSON object out of a chatty reply", () => {
    const r = parseJsonReply<{ carry: string }>('Here you go:\n{"carry":"Finish what you start."}\nHope that helps');
    expect(r.carry).toBe("Finish what you start.");
    expect(() => parseJsonReply("no json here")).toThrow();
  });
});

describe("sign periods", () => {
  it("precomputed JSON matches the ephemeris for Aries", () => {
    const live = signPeriods("Aries", 1990, 2030);
    const stored = (SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>).Aries.filter((p) => p.from >= "1990" && p.from < "2031");
    expect(stored).toEqual(live);
  });
  it("has the known Aries stretches", () => {
    const a = (SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>).Aries;
    expect(a.some((p) => p.from.startsWith("1996-04") && p.to.startsWith("1998-06"))).toBe(true);
    expect(a.some((p) => p.from.startsWith("2026-02") && p.to.startsWith("2028-04"))).toBe(true);
  });
});

describe("reading inputs", () => {
  const c = compute({ date: "1997-08-14", time: "06:40", place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } }, new Date("2026-10-16T00:00:00Z"));
  it("carries the turn, areas and history into the prompt inputs", () => {
    const i = reportInputs(c, "Sam", new Date("2026-10-16T00:00:00Z"));
    expect(i.exact_hits).toEqual(["28 Apr 2027"]);
    expect(i.turn?.date).toBe("25 Dec 2027");
    expect(i.areas).toHaveLength(2);
    expect(i.history.map((h) => h.age)).toEqual([7, 14, 22]);
  });
  it("chart exposes x/y mappers consistent with the natal line", () => {
    const cy = cycle(c, new Date("2026-10-16T00:00:00Z"));
    expect(cy.chart.y(0)).toBeCloseTo(cy.chart.y0, 6);
    expect(cy.chart.x(Date.parse("2027-04-28"))).toBeGreaterThan(cy.chart.todayX);
  });
});
