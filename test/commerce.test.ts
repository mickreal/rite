// Pure money rules (src/commerce.ts): tax params, local prices, the price-test split and stop rule, gift-season dates.
import { describe, it, expect } from "vitest";
import { taxOn, sessionTax, localPrices, currencyOptions, priceKeySuffix, bumpCents, armFor, armCents, priceTestStop, priceTestWinner, giftSeasonOn, giftEmailDates, dollars, PRICE_TEST_MAX_PER_ARM } from "../src/commerce";
import { giftCardSvg } from "../src/card";

const base = { PRICE_FULL_CENTS: "2900", PRICE_NOTIME_CENTS: "1900", PRICE_TEST_B_FULL_CENTS: "3900", PRICE_TEST_B_NOTIME_CENTS: "2500" };

describe("Stripe Tax switch", () => {
  it("is on only for exactly \"on\"", () => {
    expect([taxOn({ STRIPE_TAX: "on" }), taxOn({ STRIPE_TAX: "off" }), taxOn({}), taxOn({ STRIPE_TAX: "ON" })]).toEqual([true, false, false, false]);
    expect(sessionTax({ STRIPE_TAX: "on" })).toEqual({ automatic_tax: { enabled: true }, billing_address_collection: "required" });
    expect(sessionTax({ STRIPE_TAX: "off" })).toEqual({});
  });
});

describe("LOCAL_PRICES", () => {
  it("is off when unset, empty, \"off\" or not JSON", () => {
    for (const v of [undefined, "", "off", "{nope", "[]", "{}"]) expect(localPrices({ LOCAL_PRICES: v })).toBeNull();
  });
  it("keeps 3-letter currencies other than the base and positive integer amounts", () => {
    const lp = localPrices({ LOCAL_PRICES: JSON.stringify({ GBP: { full: 2300, notime: 1500, bump: 0 }, usd: { full: 1 }, eur: { full: 26.5 }, xx: { full: 1 } }) });
    expect(lp).toEqual({ gbp: { full: 2300, notime: 1500 } });
  });
  it("builds currency_options per product, with tax_behavior when tax is on, and gift falls back to full", () => {
    const lp = localPrices({ LOCAL_PRICES: JSON.stringify({ gbp: { full: 2300 }, eur: { full: 2700, bump: 1300 } }) });
    expect(currencyOptions(lp, "gift", true)).toEqual({ gbp: { unit_amount: 2300, tax_behavior: "inclusive" }, eur: { unit_amount: 2700, tax_behavior: "inclusive" } });
    expect(currencyOptions(lp, "bump", false)).toEqual({ eur: { unit_amount: 1300 } });
    expect(currencyOptions(lp, "season_month", true)).toBeUndefined();
    expect(currencyOptions(null, "full", true)).toBeUndefined();
  });
  it("lookup-key suffix: empty for today's Prices, _v2 for tax-inclusive, _l<hash> for local prices", () => {
    expect(priceKeySuffix(false, undefined)).toBe("");
    expect(priceKeySuffix(true, undefined)).toBe("_v2");
    const a = priceKeySuffix(true, { gbp: { unit_amount: 2300 } }), b = priceKeySuffix(true, { gbp: { unit_amount: 2400 } });
    expect(a).toMatch(/^_v2_l[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
});

describe("order bump price", () => {
  it("is PRICE_BUMP_CENTS, and 0 (no bump) when unset or 0", () => {
    expect([bumpCents({ PRICE_BUMP_CENTS: "1500" }), bumpCents({ PRICE_BUMP_CENTS: "0" }), bumpCents({})]).toEqual([1500, 0, 0]);
  });
});

describe("price test arms", () => {
  it("splits about 50/50 and the same preview id always gets the same arm", () => {
    const ids = Array.from({ length: 4000 }, (_, i) => `pv${i.toString(36)}x${(i * 7919).toString(36)}`);
    const b = ids.filter((x) => armFor(x) === "B").length;
    expect(b / ids.length).toBeGreaterThan(0.47);
    expect(b / ids.length).toBeLessThan(0.53);
    for (const x of ids.slice(0, 200)) expect(armFor(x)).toBe(armFor(x));
    // 12-char ids like the Worker's own
    const real = Array.from({ length: 2000 }, (_, i) => (i * 2654435761 >>> 0).toString(36).padStart(12, "a").slice(0, 12));
    const rb = real.filter((x) => armFor(x) === "B").length / real.length;
    expect(Math.abs(rb - 0.5)).toBeLessThan(0.04);
  });
  it("prices by arm: B uses the B vars, anything else (A, null, old previews) the configured price", () => {
    expect([armCents(base, "B", "full"), armCents(base, "B", "notime"), armCents(base, "A", "full"), armCents(base, null, "notime")]).toEqual([3900, 2500, 2900, 1900]);
    expect(armCents({ ...base, PRICE_TEST_B_FULL_CENTS: undefined }, "B", "full")).toBe(2900);
  });
  it("stops after 14 days from the first assignment, or 600 previews in each arm", () => {
    const now = new Date("2026-11-20T00:00:00Z");
    const s = (first: string | null, a: number, b: number) => ({ first, A: { previews: a, purchases: 0, cents: 0 }, B: { previews: b, purchases: 0, cents: 0 } });
    expect(priceTestStop(s(null, 0, 0), now)).toBeNull();
    expect(priceTestStop(s("2026-11-07T00:00:00Z", 10, 10), now)).toBeNull();
    expect(priceTestStop(s("2026-11-06T00:00:00Z", 10, 10), now)).toBe("days");
    expect(priceTestStop(s("2026-11-15T00:00:00Z", PRICE_TEST_MAX_PER_ARM, PRICE_TEST_MAX_PER_ARM - 1), now)).toBeNull();
    expect(priceTestStop(s("2026-11-15T00:00:00Z", PRICE_TEST_MAX_PER_ARM, PRICE_TEST_MAX_PER_ARM), now)).toBe("previews");
  });
  it("the winner is the higher revenue per preview; a tie stays on A", () => {
    const st = (ac: number, bc: number) => ({ first: "x", A: { previews: 100, purchases: 5, cents: ac }, B: { previews: 100, purchases: 4, cents: bc } });
    expect(priceTestWinner(st(14500, 15600))).toBe("B");
    expect(priceTestWinner(st(14500, 11700))).toBe("A");
    expect(priceTestWinner(st(10000, 10000))).toBe("A");
  });
});

describe("gift season dates", () => {
  const env = { GIFT_SEASON_START: "2026-11-15", GIFT_SEASON_END: "2026-12-22" };
  it("the banner is on from the start date to the end date inclusive", () => {
    expect(["2026-11-14", "2026-11-15", "2026-12-01", "2026-12-22", "2026-12-23"].map((d) => giftSeasonOn(env, d))).toEqual([false, true, true, true, false]);
    expect(giftSeasonOn({}, "2026-11-20")).toBe(true); // defaults
    expect(giftSeasonOn({ GIFT_SEASON_START: "bad", GIFT_SEASON_END: "2026-12-22" }, "2026-11-14")).toBe(false);
  });
  it("emails go out on 1 and 15 Dec, only inside the season", () => {
    expect(giftEmailDates(env)).toEqual(["2026-12-01", "2026-12-15"]);
    expect(giftEmailDates({ GIFT_SEASON_START: "2026-12-05", GIFT_SEASON_END: "2026-12-22" })).toEqual(["2026-12-15"]);
  });
});

describe("display", () => {
  it("formats cents", () => { expect([dollars(2900), dollars(2950), dollars(1500)]).toEqual(["29", "29.50", "15"]); });
  it("gift card SVG carries the code, the link and an escaped name", () => {
    const s = giftCardSvg({ code: "ABCD2345", from: "Al & <Bo>", site: "rite.report" });
    expect(s).toContain("ABCD2345");
    expect(s).toContain("rite.report/gift/ABCD2345");
    expect(s).toContain("A gift from Al &amp; &lt;Bo&gt;");
    expect(giftCardSvg({ code: "ABCD2345", from: null, site: "rite.report" })).toContain("A gift for you");
  });
});
