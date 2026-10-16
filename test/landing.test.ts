import { describe, it, expect } from "vitest";
import { landingPage, bornRanges } from "../src/views/landing";
import { seasonLandingPage } from "../src/views/season-landing";

const second = { sign: "Aries", born: [{ from: "1967-03-03", to: "1969-04-28" }], until: "2028-04-12" };

describe("second-return landing variant", () => {
  it("formats birth ranges from the sign-period data", () => {
    expect(bornRanges(second.born)).toBe("March 1967 and April 1969");
    expect(bornRanges([{ from: "1969-04-29", to: "1971-06-17" }, { from: "1972-01-10", to: "1972-02-20" }])).toBe("April 1969 and June 1971, or January 1972 and February 1972");
  });
  it("swaps hero, FAQ, ages emphasis and canonical; the default page is unchanged", async () => {
    const h = String(await landingPage({ siteUrl: "https://rite.test", variant: "second", second }));
    expect(h).toContain("Born between March 1967 and April 1969? Your second Saturn return is open now");
    expect(h).toContain("until April 2028");
    expect(h).toContain("I was born in 1968. Am I in it now?");
    expect(h).toContain("var FOCUS=58");
    expect(h).toContain('<link rel="canonical" href="https://rite.test/second">');
    expect(h).toContain("about 37, 44 and 51");
    const d = String(await landingPage({ siteUrl: "https://rite.test" }));
    expect(d).toContain("var FOCUS=29");
    expect(d).toContain('<link rel="canonical" href="https://rite.test/">');
    expect(d).not.toContain("second Saturn return is open now");
  });
  it("the Season row links to /season with configured prices", async () => {
    const h = String(await landingPage({ siteUrl: "x", season: { monthly: 7, yearly: 59, saturnNow: "10° Aries" } }));
    expect(h).toContain('href="/season"');
    expect(h).toContain("Saturn is at 10° Aries this week.");
    expect(h.indexOf('id="season-note"')).toBeGreaterThan(h.indexOf('id="price"'));
    expect(h.indexOf('id="season-note"')).toBeLessThan(h.indexOf('id="ages"'));
  });
});

describe("/season page", () => {
  it("labels the sample, shows both prices and sends people to a reading first", async () => {
    const h = String(await seasonLandingPage({ siteUrl: "https://rite.test", monthlyPrice: 7, yearlyPrice: 59, sample: { bornLabel: "1 Jun 1997, Melbourne", noteDate: "Mon 12 Oct 2026", windowEnd: "12 Apr 2028", position: "Saturn is at 10° Aries.", body: "Para.\nOne thing this week: x.\nOne line to carry: y.", upcoming: [], reread: "Workbook" } }));
    expect(h).toContain(">Sample<");
    expect(h).toContain("$7");
    expect(h).toContain("$59");
    expect(h).toContain("stops itself when your window closes");
    expect(h).toContain('href="/#start"');
    expect(h).toContain('<link rel="canonical" href="https://rite.test/season">');
  });
});
