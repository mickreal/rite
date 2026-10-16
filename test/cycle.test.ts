import { describe, it, expect } from "vitest";
import { natalSaturn, scanReturn } from "../src/astro/saturn";
import { windowChart, monthTable, tensionPoints, stageAt, stationsBetween } from "../src/astro/cycle";

const birth = new Date("1997-08-13T20:40:00Z"); // the design's sample: 14 Aug 1997 06:40 Melbourne
const n = natalSaturn(birth);
const w = scanReturn(birth, n.lon, 1);

describe("cycle", () => {
  it("sample chart matches the design's numbers (20° Aries, pass Apr 2027)", () => {
    expect(n.sign).toBe("Aries");
    expect(Math.floor(n.degree)).toBe(20);
    expect(w.hits[0].slice(0, 7)).toBe("2027-04");
  });
  it("window chart has a path and hit marks", () => {
    const c = windowChart(n.lon, w, new Date("2026-10-16"));
    expect(c.path.startsWith("M")).toBe(true);
    expect(c.markPath.length).toBeGreaterThan(10);
    expect(c.todayX).toBeGreaterThan(40);
  });
  it("month table covers the window and flags the pass month", () => {
    const rows = monthTable(n.lon, w, new Date("2026-10-16"));
    expect(rows.length).toBeGreaterThan(20);
    expect(rows.some((r) => r.tag.includes("Exact pass"))).toBe(true);
    expect(rows.some((r) => r.isNow)).toBe(true);
  });
  it("tension points: squares near 7 and 21, opposition near 14, return near 29", () => {
    const tp = tensionPoints(birth, n.lon, birth.getTime());
    const byKind = Object.fromEntries(tp.map((p) => [p.kind, p]));
    expect(byKind.square1.from.slice(0, 4)).toBe("2004");
    expect(byKind.opposition.from.slice(0, 4)).toBe("2011");
    expect(byKind.square2.from.slice(0, 4)).toBe("2019");
    expect(byKind.return.from.slice(0, 4)).toBe("2027");
  });
  it("stage today is approach for the sample chart", () => {
    const s = stageAt(birth, n.lon, w, new Date("2026-10-16"));
    expect(s.key).toBe("ra");
    expect(s.age).toBe(29);
  });
  it("stations 2026–2027 match the ephemeris", () => {
    const st = stationsBetween(Date.UTC(2026, 0, 1), Date.UTC(2027, 11, 31));
    expect(st.map((s) => s.date.slice(0, 7))).toEqual(["2026-07", "2026-12", "2027-08", "2027-12"]);
  });
});
