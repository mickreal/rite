import { describe, it, expect } from "vitest";
import { localToUtc } from "../src/geo";
describe("localToUtc", () => {
  it("Brisbane (no DST) 12 Dec 1984 01:45 → 11 Dec 15:45Z", () => {
    expect(localToUtc("1984-12-12", "01:45", "Australia/Brisbane").toISOString()).toBe("1984-12-11T15:45:00.000Z");
  });
  it("Los Angeles DST 1 Sep 1996 12:00 → 19:00Z", () => {
    expect(localToUtc("1996-09-01", "12:00", "America/Los_Angeles").toISOString()).toBe("1996-09-01T19:00:00.000Z");
  });
  it("London winter 1 Jan 2000 12:00 → 12:00Z", () => {
    expect(localToUtc("2000-01-01", "12:00", "Europe/London").toISOString()).toBe("2000-01-01T12:00:00.000Z");
  });
  it("Sydney DST 26 Jun 1997 (winter, no DST) 13:00 → 03:00Z", () => {
    expect(localToUtc("1997-06-26", "13:00", "Australia/Sydney").toISOString()).toBe("1997-06-26T03:00:00.000Z");
  });
  it("no time → noon local", () => {
    expect(localToUtc("1996-09-01", null, "America/Los_Angeles").toISOString()).toBe("1996-09-01T19:00:00.000Z");
  });
});
