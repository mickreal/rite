import { describe, it, expect } from "vitest";
import ref from "./reference.json";
import { saturnLongitude, natalSaturn, scanReturn, phaseFor, signOf } from "../src/astro/saturn";
import { houses, houseOf } from "../src/astro/houses";

const close = (a: number, b: number, tol: number) => {
  const d = Math.abs((((a - b) % 360) + 540) % 360 - 180);
  return d <= tol;
};

describe("Saturn longitude vs Swiss Ephemeris", () => {
  for (const [name, c] of Object.entries(ref)) {
    it(name, () => {
      const lon = saturnLongitude(new Date(c.utc));
      expect(close(lon, c.saturn, 0.02), `${lon} vs ${c.saturn}`).toBe(true);
    });
  }
});

describe("Placidus houses vs Swiss Ephemeris", () => {
  for (const [name, c] of Object.entries(ref)) {
    it(name, () => {
      const h = houses(new Date(c.utc), c.lat, c.lon);
      expect(close(h.asc, c.asc, 0.05), `asc ${h.asc} vs ${c.asc}`).toBe(true);
      expect(close(h.mc, c.mc, 0.05), `mc ${h.mc} vs ${c.mc}`).toBe(true);
      for (let i = 0; i < 12; i++) {
        expect(close(h.cusps[i], c.cusps[i], 0.05), `cusp ${i + 1}: ${h.cusps[i]} vs ${c.cusps[i]}`).toBe(true);
      }
    });
  }
});

describe("Return windows — the four acceptance cases (JPL DE421 reference)", () => {
  it("born 1 Sep 1996 (no time) → Aries ~6°, single hit 3 Apr 2026", () => {
    const birth = new Date("1996-09-01T12:00:00Z");
    const n = natalSaturn(birth);
    expect(n.sign).toBe("Aries");
    expect(n.degree).toBeCloseTo(5.8, 0);
    const w = scanReturn(birth, n.lon, 1);
    expect(w.hits).toEqual(["2026-04-03"]);
    expect(w.windowStart < w.hits[0]).toBe(true);
    expect(w.windowEnd >= "2026-07").toBe(true);
    expect(phaseFor(w, n.lon, new Date("2026-10-16"))).toBe("separating");
  });

  it("born 14 Mar 1997 → Aries ~8°, three hits 22 Apr / 23 Nov / 28 Dec 2026", () => {
    const birth = new Date("1997-03-14T12:00:00Z");
    const n = natalSaturn(birth);
    expect(n.sign).toBe("Aries");
    expect(n.degree).toBeCloseTo(8.2, 0);
    const w = scanReturn(birth, n.lon, 1);
    expect(w.hits.length).toBe(3);
    expect(w.hits[0]).toBe("2026-04-22");
    expect(["2026-11-23"]).toContain(w.hits[1]);
    expect(["2026-12-28"]).toContain(w.hits[2]);
    expect(phaseFor(w, n.lon, new Date("2026-10-16"))).toBe("in_window");
  });

  it("born 15 Jun 1998 → Taurus, window opens 2028", () => {
    const birth = new Date("1998-06-15T12:00:00Z");
    const n = natalSaturn(birth);
    expect(n.sign).toBe("Taurus");
    const w = scanReturn(birth, n.lon, 1);
    expect(w.hits[0].slice(0, 4)).toBe("2028");
    expect(phaseFor(w, n.lon, new Date("2026-10-16"))).toBe("not_yet");
  });

  it("born 20 Dec 1995 → Pisces, complete by Oct 2026", () => {
    const birth = new Date("1995-12-20T12:00:00Z");
    const n = natalSaturn(birth);
    expect(n.sign).toBe("Pisces");
    const w = scanReturn(birth, n.lon, 1);
    expect(phaseFor(w, n.lon, new Date("2026-10-16"))).toBe("complete");
  });

  it("second return: born 11 Feb 1969 → Aries, hits in 2026–2027", () => {
    const birth = new Date("1969-02-11T12:00:00Z");
    const n = natalSaturn(birth);
    expect(n.sign).toBe("Aries");
    const w = scanReturn(birth, n.lon, 2);
    expect(w.hits.length).toBeGreaterThan(0);
    expect(w.hits[0].slice(0, 4)).toBe("2027"); // natal ~21° Aries
  });
});

describe("houseOf", () => {
  it("places a longitude just past cusp 10 into house 10", () => {
    const c = ref.london_2000;
    const h = houses(new Date(c.utc), c.lat, c.lon);
    expect(houseOf(h.mc + 0.5, h)).toBe(10);
    expect(houseOf(h.asc + 0.5, h)).toBe(1);
  });
});

describe("signOf", () => {
  it("boundaries", () => {
    expect(signOf(0)).toBe("Aries");
    expect(signOf(29.999)).toBe("Aries");
    expect(signOf(30)).toBe("Taurus");
    expect(signOf(359.9)).toBe("Pisces");
  });
});
