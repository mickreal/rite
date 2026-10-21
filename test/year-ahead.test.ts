// Build 11, the year-ahead reading: the engine's twelve months against independent ephemeris values and the main reading's
// own dates, the Checkout Session (tax, Price by lookup key, local prices), fulfilment idempotency, the page, the date guard,
// refunds, the offer emails (stops, one a year, config off), the KPI line and creator attribution.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness, stripeEvent, SITE_URL, type Call } from "./helpers/worker";
import { yearAhead, yearStart, canBuyNext, yearInputs, teaser, checkYear, yearMode, yearCents, januaryDay, type YearAhead } from "../src/year-ahead";
import { compute, cycle, fmtDay, type Birth } from "../src/compute";
import { saturnLongitudeExact, signOf } from "../src/astro/saturn";
import { stationsBetween } from "../src/astro/cycle";
import { datesAreGrounded } from "../src/llm";
import { buildKpiReport } from "../src/kpi";
import { seasonCompleteEmail } from "../src/email";
import SIGN_PERIODS from "../src/content/sign-periods.json";

const MEL = { label: "Melbourne, Australia", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" };
const born = (date: string, time: string | null = "12:00"): Birth => ({ date, time, place: MEL });
const DAY = 86400000;
const dist = (lon: number, natal: number, angle: number) => Math.abs(((((lon - natal) % 360) + 360) % 360 - angle + 540) % 360 - 180);
const ANGLE = { return: 0, square1: 90, opposition: 180, square2: 270 } as const;

describe("engine: the next 12 months of Saturn", () => {
  it("1 Jun 1997 (Saturn in Aries) from Jan 2027: the reading's exact pass, both stations, twelve months", () => {
    const b = born("1997-06-01"), y = yearAhead(b, "2027-01-01");
    const c = compute(b, new Date("2027-01-01T00:00:00Z"));
    expect(y.start).toBe("2027-01-01"); expect(y.end).toBe("2028-01-01"); expect(y.year).toBe(2027);
    expect(y.months.map((m) => m.ym)).toEqual(Array.from({ length: 12 }, (_, i) => `2027-${String(i + 1).padStart(2, "0")}`));
    const passes = y.events.filter((e) => e.kind === "pass");
    expect(passes.map((e) => [e.date, e.point])).toEqual([["2027-04-05", "return"]]);
    expect(passes.map((e) => e.date)).toEqual(c.window.hits.filter((h) => h.startsWith("2027"))); // the main reading's own date
    const st = y.events.filter((e) => e.kind === "station");
    expect(st.map((e) => [e.date, e.station])).toEqual([["2027-08-10", "retrograde"], ["2027-12-25", "direct"]]);
    expect(st.map((e) => e.date)).toEqual(stationsBetween(Date.parse("2026-12-31"), Date.parse("2027-12-31")).map((s) => s.date));
    expect(y.closest).toBeNull(); // there is an exact pass
    expect(y.stage).toEqual({ start: "Your return: approach", end: "Your return: integration" });
    expect(y.months[3]).toMatchObject({ ym: "2027-04", retro: false, mid: { sign: "Aries" } });
    expect(Math.abs(y.months[3].orb)).toBeLessThan(2);
  });

  it("from Jan 2026: Saturn enters Aries on 14 Feb (the sign-period table's date), stations in July and December, no exact contact", () => {
    const y = yearAhead(born("1997-06-01"), "2026-01-01");
    const aries = (SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>).Aries.find((p) => p.from.startsWith("2026"))!;
    expect(y.events.filter((e) => e.kind === "ingress").map((e) => [e.date, e.sign])).toEqual([[aries.from, "Aries"]]);
    expect(aries.from).toBe("2026-02-14");
    expect(y.events.filter((e) => e.kind === "station").map((e) => [e.date, e.station])).toEqual([["2026-07-27", "retrograde"], ["2026-12-11", "direct"]]);
    expect(y.events.some((e) => e.kind === "pass")).toBe(false);
    expect(y.closest).toMatchObject({ point: "return" });
    expect(y.closest!.orb).toBeGreaterThan(2.4); expect(y.closest!.orb).toBeLessThan(2.8);
    // the July station is within 5° of the natal degree, so it says how close
    expect(y.events.find((e) => e.station === "retrograde")).toMatchObject({ point: "return", orb: 2.6 });
  });

  it("born 10 Mar 1990: the first square of the cycle after the return, on the reading's tension-point dates", () => {
    const b = born("1990-03-10"), y = yearAhead(b, "2026-11-01");
    const tp = cycle(compute(b, new Date("2026-11-01T00:00:00Z")), new Date("2026-11-01T00:00:00Z")).history.find((p) => p.kind === "square1")!;
    expect(y.events.filter((e) => e.kind === "pass").map((e) => [e.date, e.point, e.pass])).toEqual([["2027-05-21", "square1", { n: 1, of: 3 }]]);
    expect(tp.hits[0]).toBe("2027-05-21");
    expect(y.stage).toEqual({ start: "Planting", end: "First test" });
  });

  it("a second return (born 5 May 1968): return number 2 and its exact pass", () => {
    const y = yearAhead(born("1968-05-05"), "2026-11-01");
    expect(y.returnNumber).toBe(2);
    expect(y.events.filter((e) => e.kind === "pass").map((e) => e.date)).toEqual(["2027-04-18"]);
  });

  it("every date on 36 charts agrees with the full ephemeris (astronomy-engine, not the daily table)", () => {
    const exact = (t: number) => saturnLongitudeExact(new Date(t));
    let n = 0;
    for (let i = 0; i < 36; i++) {
      const d = new Date(Date.UTC(1964 + i, (i * 5) % 12, 1 + ((i * 7) % 27))).toISOString().slice(0, 10);
      const y = yearAhead(born(d, i % 3 ? "08:30" : null), i % 2 ? "2027-01-01" : "2026-11-01");
      for (const e of y.events) {
        const t = Date.parse(e.date);
        if (e.kind === "pass") expect(Math.min(dist(exact(t), y.natal.lon, ANGLE[e.point!]), dist(exact(t + DAY), y.natal.lon, ANGLE[e.point!]))).toBeLessThan(0.6);
        if (e.kind === "station") { // direction changes within a day or two either side of the date
          const sp = (x: number) => Math.sign(((exact(x + DAY / 2) - exact(x - DAY / 2) + 540) % 360) - 180);
          expect(sp(t - 2 * DAY)).not.toBe(sp(t + 2 * DAY));
        }
        if (e.kind === "ingress") { expect(signOf(exact(t - DAY))).not.toBe(e.sign); expect(signOf(exact(t + DAY))).toBe(e.sign); }
        n++;
      }
    }
    expect(n).toBeGreaterThan(80);
  });

  it("validates its dates: a bad start throws, and the check rejects a moved, malformed or out-of-year date", () => {
    for (const s of ["2027-01-15", "2027-13-01", "27-01-01", "2090-01-01"]) expect(() => yearAhead(born("1997-06-01"), s)).toThrow();
    const good = yearAhead(born("1997-06-01"), "2027-01-01");
    const tamper = (f: (y: YearAhead) => void) => { const y = JSON.parse(JSON.stringify(good)) as YearAhead; f(y); return () => checkYear(y); };
    expect(tamper(() => {})).not.toThrow();
    expect(tamper((y) => { y.events[0].date = "2027-05-05"; })).toThrow(/pass on 2027-05-05/); // a pass a month off
    expect(tamper((y) => { y.events[0].date = "2027-02-30"; })).toThrow(/malformed/);
    expect(tamper((y) => { y.events.push({ ...y.events[0], date: "2028-02-01" }); })).toThrow(/outside/);
    expect(tamper((y) => { const s = y.events.find((e) => e.kind === "station")!; s.date = "2027-06-01"; })).toThrow();
    expect(tamper((y) => { y.months.pop(); })).toThrow(/12 months/);
  });

  it("where a year starts: this month up to the 15th, else next month; never before the last one ends; on sale 60 days before", () => {
    expect(yearStart(new Date("2026-10-15T23:00:00Z"))).toBe("2026-10-01");
    expect(yearStart(new Date("2026-10-16T00:00:00Z"))).toBe("2026-11-01");
    expect(yearStart(new Date("2026-12-20T00:00:00Z"))).toBe("2027-01-01");
    expect(yearStart(new Date("2027-05-01T00:00:00Z"), "2027-06-01")).toBe("2027-06-01");
    expect(yearStart(new Date("2027-07-01T00:00:00Z"), "2027-06-01")).toBe("2027-07-01");
    expect(canBuyNext(new Date("2027-04-02T00:00:00Z"), "2027-06-01")).toBe(true);
    expect(canBuyNext(new Date("2027-04-01T00:00:00Z"), "2027-06-01")).toBe(false);
    expect(canBuyNext(new Date(), null)).toBe(true);
    expect([yearMode(undefined), yearMode("off"), yearMode("page"), yearMode("ON"), yearMode("yes")]).toEqual(["off", "off", "page", "on", "off"]);
    expect([yearCents(undefined), yearCents("2400"), yearCents("0")]).toEqual([1900, 2400, 1900]);
    expect([januaryDay(undefined), januaryDay("01-09"), januaryDay("02-01")]).toEqual(["01-05", "01-09", "01-05"]);
  });

  it("the date guard's list is exactly the engine's dates; the teaser has no day-level dates", () => {
    const y = yearAhead(born("1997-06-01"), "2027-01-01");
    const { inputs, allowed } = yearInputs(y, { house: 9 }, "Sam");
    expect(allowed).toEqual(["5 Apr 2027", "10 Aug 2027", "25 Dec 2027"]);
    expect(inputs.months).toHaveLength(12);
    expect(datesAreGrounded("Your pass on 5 April 2027 is the centre of the year.", allowed)).toBe(true);
    expect(datesAreGrounded("Expect something on 6 April 2027.", allowed)).toBe(false);
    expect(datesAreGrounded(teaser(y).join(" "), [])).toBe(true);
  });
});

// ---------- the Worker ----------
const TOK = "tok_test_purchase_000000000000001";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const form = (c: Call) => Object.fromEntries(new URLSearchParams(c.body)) as Record<string, string>;
let h: Harness;
function stripeStub() {
  const made = { sessions: [] as Record<string, string>[], prices: [] as Record<string, string>[], products: [] as Record<string, string>[], lists: [] as string[] };
  let n = 0;
  h.stripe = (c) => {
    const u = new URL(c.url);
    if (u.pathname === "/v1/prices" && c.method === "GET") { made.lists.push(u.search); return json({ object: "list", data: [], has_more: false }); }
    if (u.pathname === "/v1/products" && c.method === "POST") { made.products.push(form(c)); return json({ id: `prod_${++n}` }); }
    if (u.pathname === "/v1/prices" && c.method === "POST") { const f = form(c); made.prices.push(f); return json({ id: `price_ya_${++n}`, lookup_key: f.lookup_key }); }
    if (u.pathname === "/v1/checkout/sessions" && c.method === "POST") { made.sessions.push(form(c)); return json({ id: "cs_new", url: "https://checkout.stripe.test/pay/cs_new" }); }
    return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
  };
  return made;
}
const post = (path: string, body: Record<string, string> = {}) => h.request(path, { method: "POST", body: new URLSearchParams(body) });
const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
/** A model reply for the year that starts on `start`, optionally with an extra sentence in the intro. */
function yearReply(start: string, extra = "") {
  const y = yearAhead(born("1997-06-01"), start);
  return JSON.stringify({ intro: `A steady year.${extra}`, months: y.months.map((m) => ({ ym: m.ym, body: `Work for ${m.name}.` })), carry: "Keep it small and kept." });
}
const anthropicReply = (text: string) => json({ id: "msg", type: "message", role: "assistant", content: [{ type: "text", text }] });
const yearSession = (o: Record<string, unknown> = {}) => stripeEvent("checkout.session.completed.payment", { id: "cs_test_year_0001", amount_total: 1900, payment_intent: "pi_test_year_0001",
  metadata: { year_ahead: "1", purchase_id: TOK, start: "2026-11-01", year: "2026" }, ...o });
const rows = () => h.db.rows("SELECT * FROM year_aheads ORDER BY created_at");

beforeEach(() => {
  h = new Harness({ POSTHOG_KEY: undefined, YEAR_AHEAD: "page", STRIPE_TAX: "on" } as never);
  vi.stubGlobal("fetch", h.fetch);
  at("2026-11-10T00:00:00Z");
  h.seedPreview(); h.seedPurchase({ pi: "pi_test_reading_0001" });
  h.anthropic = (c) => anthropicReply(c.json().max_tokens === 4000 ? yearReply("2026-11-01") : "x");
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("checkout", () => {
  it("one tax-inclusive $19 Price under a lookup key (made once), automatic tax, the reading's email, metadata for fulfilment", async () => {
    const made = stripeStub();
    const r = await post(`/r/${TOK}/year/checkout`);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://checkout.stripe.test/pay/cs_new");
    expect(made.prices).toHaveLength(1);
    expect(made.prices[0]).toMatchObject({ unit_amount: "1900", currency: "usd", tax_behavior: "inclusive", lookup_key: "rite_year_ahead_1900_usd_test_v2" });
    expect(made.lists[0]).toContain("lookup_keys");
    expect(made.products[0]).toMatchObject({ name: "Rite — Your year ahead", tax_code: "txcd_10000000" });
    expect(made.sessions[0]).toMatchObject({ mode: "payment", "automatic_tax[enabled]": "true", billing_address_collection: "required", "line_items[0][price]": "price_ya_2", "line_items[0][quantity]": "1",
      customer_email: "reader@example.com", allow_promotion_codes: "true", "metadata[year_ahead]": "1", "metadata[purchase_id]": TOK, "metadata[start]": "2026-11-01", "metadata[year]": "2026",
      success_url: `${SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${SITE_URL}/r/${TOK}/year?c=1` });
    await post(`/r/${TOK}/year/checkout`);
    expect(made.prices).toHaveLength(1); // cached
    expect(h.events("year_ahead_checkout")[0].detail).toMatchObject({ year: 2026, amount: 1900, tax: true });
  });

  it("STRIPE_TAX off: no tax params; LOCAL_PRICES year_ahead: currency options on the Price; PRICE_YEAR_AHEAD_CENTS sets the amount", async () => {
    h.env.STRIPE_TAX = "off"; h.env.PRICE_YEAR_AHEAD_CENTS = "2400"; h.env.LOCAL_PRICES = JSON.stringify({ gbp: { year_ahead: 1500 } });
    const made = stripeStub();
    await post(`/r/${TOK}/year/checkout`);
    expect(made.prices[0]).toMatchObject({ unit_amount: "2400", "currency_options[gbp][unit_amount]": "1500" });
    expect(made.prices[0].tax_behavior).toBeUndefined();
    expect(made.prices[0].lookup_key).toMatch(/^rite_year_ahead_2400_usd_test_l[0-9a-f]{8}$/);
    expect(made.sessions[0]["automatic_tax[enabled]"]).toBeUndefined();
  });

  it("off by default: no checkout, the offer page sends you back, nothing on the reading page, no Stripe call", async () => {
    h.env.YEAR_AHEAD = undefined;
    const made = stripeStub();
    expect((await post(`/r/${TOK}/year/checkout`)).status).toBe(404);
    const g = await h.request(`/r/${TOK}/year`);
    expect(g.status).toBe(302); expect(g.headers.get("location")).toBe(`/r/${TOK}`);
    expect(await (await h.request(`/r/${TOK}`)).text()).not.toContain('id="year"');
    expect(made.sessions).toHaveLength(0); expect(h.stripeCalls()).toHaveLength(0);
  });

  it("only for a written, unrefunded reading; and one per reading per year", async () => {
    const made = stripeStub();
    h.db.prepare("UPDATE purchases SET status='refunded'").runSync();
    expect((await post(`/r/${TOK}/year/checkout`)).status).toBe(410); // a refunded reading is closed (test/refund-close.test.ts)
    h.db.prepare("UPDATE purchases SET status='generated'").runSync();
    h.db.prepare("INSERT INTO year_aheads (id, purchase_id, year, start_date, end_date, created_at, email, amount_cents, status) VALUES ('ya1',?,2026,'2026-11-01','2027-11-01',?, 'reader@example.com', 1900, 'generated')").bind(TOK, new Date().toISOString()).runSync();
    // this year's is running until Nov 2027: the next one isn't on sale, so checkout sends you to the offer page, which says when
    expect((await post(`/r/${TOK}/year/checkout`)).headers.get("location")).toBe(`/r/${TOK}/year`);
    expect(made.sessions).toHaveLength(0);
    const page = await (await h.request(`/r/${TOK}/year`)).text();
    expect(page).toContain("2 Sep 2027"); // 60 days before it ends
    expect(page).toContain(`href="/r/${TOK}/year/2026"`);
    expect(page).not.toContain("Get my year ahead");
  });

  it("the offer page and the reading page show it with a code-only teaser and the price", async () => {
    const offer = await (await h.request(`/r/${TOK}/year`)).text();
    expect(offer).toContain("Get my year ahead, $19");
    expect(offer).toContain("November 2026 to October 2027");
    for (const l of teaser(yearAhead(born("1997-06-01"), "2026-11-01"))) expect(offer).toContain(l.replace(/"/g, "&quot;"));
    const reading = await (await h.request(`/r/${TOK}`)).text();
    expect(reading).toContain(`href="/r/${TOK}/year"`);
    expect(reading).toContain("$19, once.");
  });
});

describe("fulfilment", () => {
  it("writes it once, under the date guard, emails the link; a redelivered event and /thanks change nothing", async () => {
    expect((await h.webhook(yearSession())).status).toBe(200);
    expect(rows()).toHaveLength(1);
    const ya = rows()[0];
    expect(ya).toMatchObject({ purchase_id: TOK, year: 2026, start_date: "2026-11-01", end_date: "2027-11-01", status: "generated", amount_cents: 1900, stripe_payment_intent: "pi_test_year_0001", email: "reader@example.com" });
    expect(JSON.parse(ya.facts_json as string).months).toHaveLength(12);
    expect(h.selfCalls().map((c) => c.url)).toEqual([`${SITE_URL}/internal/year/${ya.id}`]);
    expect(h.llm()).toEqual([expect.objectContaining({ model: "test-report-model", max_tokens: 4000 })]);
    const mail = h.emails();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: ["reader@example.com"], subject: "Your year ahead: November 2026 to October 2027" });
    expect(mail[0].text).toContain(`${SITE_URL}/r/${TOK}/year/2026`);
    expect(h.events("year_ahead_paid")).toHaveLength(1);
    // no reading regenerated, purchases untouched
    expect(h.db.rows("SELECT * FROM purchases")).toHaveLength(1);

    h.clearCalls();
    await h.webhook(yearSession());
    expect(rows()).toHaveLength(1); expect(h.llm()).toHaveLength(0); expect(h.emails()).toHaveLength(0);
    const t = await h.request("/thanks?session_id=cs_test_year_0001");
    expect(t.headers.get("location")).toBe(`/r/${TOK}/year/2026`);
  });

  it("a second payment for the same reading and year writes nothing and tells Mick", async () => {
    await h.webhook(yearSession());
    h.clearCalls();
    await h.webhook(yearSession({ id: "cs_test_year_0002", payment_intent: "pi_test_year_0002" }));
    expect(rows()).toHaveLength(1);
    expect(h.events("error").map((e) => e.detail.where)).toContain("year-ahead-duplicate");
    expect(h.emails().map((m) => m.to[0])).toEqual(["admin@rite.test"]);
  });

  it("the page: every month, the engine's dates and the prose; other years and other readings 404", async () => {
    await h.webhook(yearSession());
    const res = await h.request(`/r/${TOK}/year/2026`);
    expect(res.status).toBe(200);
    const page = await res.text();
    const y = yearAhead(born("1997-06-01"), "2026-11-01");
    for (const m of y.months) expect(page).toContain(`${m.name} ${m.year}`);
    for (const e of y.events) expect(page).toContain(fmtDay(e.date));
    expect(page).toContain("Work for March.");
    expect(page).toContain("It doesn&#39;t look at other planets.");
    expect((await h.request(`/r/${TOK}/year/2027`)).status).toBe(404);
    expect((await h.request(`/r/tok_nobody_000000000000000000000000/year/2026`)).status).toBe(404);
    expect(await (await h.request(`/r/${TOK}`)).text()).toContain(`/r/${TOK}/year/2026`);
  });

  it("the date guard: a reply with a date the engine didn't compute is retried, then the year-ahead fails (no email); a retry that's grounded succeeds", async () => {
    h.anthropic = (c) => anthropicReply(c.json().max_tokens === 4000 ? yearReply("2026-11-01", " Something shifts on 3 March 2027.") : "x");
    await h.webhook(yearSession());
    expect(rows()[0].status).toBe("failed");
    expect(h.llm()).toHaveLength(2);
    expect(h.events("error").map((e) => e.detail.where)).toEqual(["year-ahead-dates-ungrounded", "year-ahead-dates-ungrounded"]);
    expect(h.emails()).toHaveLength(0);
    expect((await h.request(`/r/${TOK}/year/2026`)).status).toBe(500);
    h.anthropic = (c) => anthropicReply(c.json().max_tokens === 4000 ? yearReply("2026-11-01", " The station on 11 December 2026 is the turn.") : "x");
    await h.request(`/r/${TOK}/year/2026?retry=1`);
    expect(rows()[0].status).toBe("generated");
    expect(h.emails()).toHaveLength(1);
  });

  it("a reply missing a month is rejected too", async () => {
    h.anthropic = () => anthropicReply(JSON.stringify({ intro: "x", months: [{ ym: "2026-11", body: "y" }], carry: "z" }));
    await h.webhook(yearSession());
    expect(rows()[0].status).toBe("failed");
    expect(h.events("error").map((e) => e.detail.where)).toEqual(["year-ahead-shape", "year-ahead-shape"]);
  });

  it("a full refund in Stripe closes it (and the year can be bought again); a partial one changes nothing", async () => {
    await h.webhook(yearSession());
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_test_year_0001", amount: 1900, amount_refunded: 500, refunded: false }));
    expect(rows()[0].status).toBe("generated");
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_test_year_0001", amount: 1900, amount_refunded: 1900, refunded: true }));
    expect(rows()[0].status).toBe("refunded");
    expect(h.events("refund")[0]).toMatchObject({ ref: rows()[0].id, detail: { year_ahead: true } });
    expect(h.db.row("SELECT status FROM purchases")!.status).toBe("generated"); // the reading itself stays
    expect((await h.request(`/r/${TOK}/year/2026`)).status).toBe(404);
    const made = stripeStub();
    await post(`/r/${TOK}/year/checkout`);
    expect(made.sessions).toHaveLength(1);
  });

  it("creator attribution: a session from a creator's link is credited like any sale (30% net of tax)", async () => {
    h.db.prepare("INSERT INTO creators (id, handle, email, created_at, status, token) VALUES ('cr_1','shay','shay@example.com','2026-11-01T00:00:00Z','active','tokcr00000000000000000000000000000')").runSync();
    await h.webhook(yearSession({ metadata: { year_ahead: "1", purchase_id: TOK, start: "2026-11-01", year: "2026", creator: "cr_1" } }));
    const sale = h.db.row("SELECT * FROM creator_sales");
    expect(sale).toMatchObject({ creator_id: "cr_1", purchase_id: rows()[0].id, amount_cents: 1900, via: "link" });
    expect(h.db.row("SELECT amount_cents FROM creator_ledger")!.amount_cents).toBe(570);
  });
});

describe("offer emails", () => {
  const MEL_9AM_20NOV = "2026-11-19T22:30:00Z"; // 09:30 on 20 Nov in Melbourne (UTC+11)
  const anniv = () => { h.env.YEAR_AHEAD = "on"; h.db.prepare("UPDATE purchases SET created_at='2025-11-20T03:00:00.000Z', amount_cents=2900").runSync(); };
  const offers = () => h.emails().filter((m) => m.to[0] === "reader@example.com");

  it("on the reading's anniversary, from 09:00 local: one email with the offer link, the stop link and List-Unsubscribe; once", async () => {
    anniv();
    at("2026-11-19T21:30:00Z"); await h.scheduled(); // 08:30 local
    expect(offers()).toHaveLength(0);
    at(MEL_9AM_20NOV); await h.scheduled();
    const m = offers();
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("A year since your Saturn return reading");
    expect(m[0].text).toContain(`${SITE_URL}/r/${TOK}/year`);
    expect(m[0].text).toContain("$19");
    expect(m[0].text).toContain(`${SITE_URL}/stop/${TOK}`);
    expect((m[0] as unknown as { headers: Record<string, string> }).headers).toMatchObject({ "List-Unsubscribe": `<${SITE_URL}/stop/${TOK}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    expect(datesAreGrounded(m[0].text, [])).toBe(true); // counts and months, no day-level dates
    at("2026-11-20T01:30:00Z"); await h.scheduled();
    expect(offers()).toHaveLength(1);
    expect(h.events("year_ahead_offer")[0].detail).toMatchObject({ kind: "anniversary", campaign: "year-ahead-anniversary-2026", start: "2026-12-01" });
  });

  it("not after a stop, not with \"page\" or \"off\", not to someone who bought one this year, not before migration 010", async () => {
    anniv();
    for (const mode of ["page", "off"]) { h.env.YEAR_AHEAD = mode; at(MEL_9AM_20NOV); await h.scheduled(); }
    expect(offers()).toHaveLength(0);
    h.env.YEAR_AHEAD = "on";
    h.db.prepare("INSERT INTO year_aheads (id, purchase_id, year, start_date, end_date, created_at, email, amount_cents, status) VALUES ('ya1',?,2026,'2026-01-01','2027-01-01','2026-01-03T00:00:00Z','reader@example.com',1900,'generated')").bind(TOK).runSync();
    at(MEL_9AM_20NOV); await h.scheduled();
    expect(offers()).toHaveLength(0);
    h.db.prepare("DELETE FROM year_aheads").runSync();
    await h.request(`/stop/${TOK}`, { method: "POST" });
    at(MEL_9AM_20NOV); await h.scheduled();
    expect(offers()).toHaveLength(0);
    h.db.prepare("DELETE FROM events WHERE kind='stopped'").runSync();
    h.db.db.exec("DROP TABLE year_aheads");
    at(MEL_9AM_20NOV); await h.scheduled();
    expect(offers()).toHaveLength(0);
    expect(h.events("error").filter((e) => String(e.detail?.where).startsWith("year-ahead"))).toHaveLength(0);
  });

  it("in early January (YEAR_AHEAD_JANUARY), once; never within 60 days of another year-ahead offer", async () => {
    h.env.YEAR_AHEAD = "on";
    h.db.prepare("UPDATE purchases SET created_at='2026-06-10T03:00:00.000Z'").runSync();
    at("2027-01-04T22:30:00Z"); await h.scheduled(); // 09:30 on 5 Jan in Melbourne
    const m = offers();
    expect(m).toHaveLength(1);
    expect(m[0].subject).toBe("Your Saturn year: January 2027 to December 2027");
    at("2027-01-05T03:30:00Z"); await h.scheduled();
    expect(offers()).toHaveLength(1);
    // a second buyer whose anniversary email went out 20 days ago gets no January one
    h.db.prepare("INSERT INTO campaign_sends (campaign, email, purchase_id, sent_at) VALUES ('year-ahead-anniversary-2026','other@example.com','x','2026-12-16T00:00:00Z')").runSync();
    h.seedPreview({ id: "pv_test_0002" }); h.seedPurchase({ id: "tok_test_purchase_000000000000002", previewId: "pv_test_0002", email: "other@example.com" });
    h.db.prepare("UPDATE purchases SET created_at='2026-06-11T03:00:00.000Z' WHERE id='tok_test_purchase_000000000000002'").runSync();
    at("2027-01-05T04:30:00Z"); await h.scheduled();
    expect(h.emails().filter((x) => x.to[0] === "other@example.com")).toHaveLength(0);
  });
});

describe("KPI email and Season", () => {
  it("counts year-ahead sales net of tax in revenue and has its own line", async () => {
    at("2026-11-16T00:00:00Z"); // Monday 10:00 Brisbane
    h.db.prepare("INSERT INTO year_aheads (id, purchase_id, year, start_date, end_date, created_at, email, amount_cents, tax_cents, status) VALUES ('ya1',?,2026,'2026-11-01','2027-11-01','2026-11-12T00:00:00Z','reader@example.com',1900,173,'generated')").bind(TOK).runSync();
    const r = await buildKpiReport(h.env.DB, new Date(), { yearAheadMode: "page" });
    expect(r.text).toMatch(/Year ahead: 1 sold \(\$17 net of tax\) vs 0 \(\$0\)/);
    expect(r.text).toContain("year ahead $17");
    h.db.db.exec("DROP TABLE year_aheads");
    const r2 = await buildKpiReport(h.env.DB, new Date(), { yearAheadMode: "on" });
    expect(r2.text).toContain("migration 010 isn't applied");
    expect(r2.text).not.toContain("year ahead $");
  });

  it("the Season-complete email points to the year ahead only when it's on", () => {
    expect(seasonCompleteEmail({ firstName: "Sam", yearAheadUrl: `${SITE_URL}/r/${TOK}/year` }).text).toContain(`picks up from here: ${SITE_URL}/r/${TOK}/year`);
    expect(seasonCompleteEmail({ firstName: "Sam" }).text).not.toContain("year-ahead");
  });
});

