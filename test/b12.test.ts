// Builds 1 + 2 end to end (docs/automation-builds.md): Stripe Tax on the Checkout Sessions, tax recorded, the order bump
// (gift code, delivery email, refunds), the price test, the gift-season banner and emails, and the gift card PNG.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new TextEncoder().encode("PNGDATA") }));
import { Harness, stripeEvent, SITE_URL, type Call } from "./helpers/worker";
import { armFor } from "../src/commerce";
import { adminMoney } from "../src/admin";
import { adminPage } from "../src/views/admin";

const TOK = "tok_test_purchase_000000000000001", SUB = "sub_test_0001", BUMP = "price_bump_test";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const form = (c: Call) => Object.fromEntries(new URLSearchParams(c.body)) as Record<string, string>;

let h: Harness;
/** A Stripe stub for the calls these flows make; records created sessions, prices and products. */
function stripeStub(o: { lineItems?: unknown[]; subPriceTax?: string } = {}) {
  const made = { sessions: [] as Record<string, string>[], prices: [] as Record<string, string>[], products: [] as Record<string, string>[], lists: [] as string[], updates: [] as Record<string, string>[] };
  let n = 0;
  h.stripe = (c) => {
    const u = new URL(c.url);
    if (u.pathname === "/v1/prices" && c.method === "GET") { made.lists.push(u.search); return json({ object: "list", data: [], has_more: false }); }
    if (u.pathname === "/v1/products" && c.method === "POST") { made.products.push(form(c)); return json({ id: `prod_${++n}` }); }
    if (u.pathname === "/v1/prices" && c.method === "POST") { const f = form(c); made.prices.push(f); return json({ id: f.lookup_key?.startsWith("rite_bump_") ? BUMP : `price_${++n}`, lookup_key: f.lookup_key, product: f.product }); }
    if (u.pathname === "/v1/checkout/sessions" && c.method === "POST") { made.sessions.push(form(c)); return json({ id: "cs_new", url: "https://checkout.stripe.test/pay/cs_new" }); }
    if (/^\/v1\/checkout\/sessions\/[^/]+\/line_items$/.test(u.pathname)) return json({ object: "list", data: o.lineItems ?? [], has_more: false });
    if (u.pathname === `/v1/subscriptions/${SUB}` && c.method === "GET") return json({ id: SUB, status: "active", items: { data: [{ id: "si_1", price: { id: "price_old", tax_behavior: o.subPriceTax ?? "unspecified" } }] } });
    if (u.pathname === `/v1/subscriptions/${SUB}` && c.method === "POST") { made.updates.push(form(c)); return json({ id: SUB, status: "active" }); }
    if (u.pathname === "/v1/refunds") return json({ id: "re_1" });
    return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
  };
  return made;
}
const lineItem = (price: string, amount: number) => ({ id: `li_${price}`, object: "item", amount_total: amount, quantity: 1, price: { id: price, object: "price" } });
const post = (path: string, body: Record<string, string>) => h.request(path, { method: "POST", body: new URLSearchParams(body) });

beforeEach(() => { h = new Harness({ POSTHOG_KEY: undefined, PRICE_BUMP_CENTS: "1500", PRICE_TEST_B_FULL_CENTS: "3900", PRICE_TEST_B_NOTIME_CENTS: "2500" } as never); vi.stubGlobal("fetch", h.fetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Stripe Tax on the Checkout Sessions", () => {
  it("STRIPE_TAX=on: the reading session has automatic tax, billing address auto, tax-inclusive price_data and the tax code; the bump is an optional item", async () => {
    h.env.STRIPE_TAX = "on"; h.seedPreview();
    const made = stripeStub();
    const r = await post("/checkout", { preview: "pv_test_0001" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("https://checkout.stripe.test/pay/cs_new");
    const s = made.sessions[0];
    expect(s).toMatchObject({ "automatic_tax[enabled]": "true", billing_address_collection: "auto", "line_items[0][price_data][tax_behavior]": "inclusive",
      "line_items[0][price_data][product_data][tax_code]": "txcd_10000000", "line_items[0][price_data][unit_amount]": "2900", "line_items[0][price_data][currency]": "usd",
      "optional_items[0][price]": BUMP, "optional_items[0][quantity]": "1", "metadata[bump_price]": BUMP, "metadata[preview_id]": "pv_test_0001" });
    // the bump Price: created once, tax-inclusive, $15, under a lookup key that says so; then cached in KV
    expect(made.prices).toHaveLength(1);
    expect(made.prices[0]).toMatchObject({ unit_amount: "1500", currency: "usd", tax_behavior: "inclusive", lookup_key: "rite_bump_1500_usd_test_v2" });
    expect(made.products[0]).toMatchObject({ tax_code: "txcd_10000000" });
    await post("/checkout", { preview: "pv_test_0001" });
    expect(made.prices).toHaveLength(1);
    expect(made.lists).toHaveLength(1);
    expect(h.events("checkout")[0].detail).toMatchObject({ tier: "full", amount: 2900, bump: true, tax: true });
  });

  it("STRIPE_TAX=off: no tax parameters anywhere (today's session), and the bump Price carries no tax_behavior", async () => {
    h.env.STRIPE_TAX = "off"; h.seedPreview({ time: null });
    const made = stripeStub();
    await post("/checkout", { preview: "pv_test_0001" });
    const s = made.sessions[0];
    for (const k of Object.keys(s)) expect(k).not.toMatch(/automatic_tax|billing_address_collection|tax_behavior|tax_code/);
    expect(s).toMatchObject({ "line_items[0][price_data][unit_amount]": "1900", "metadata[tier]": "notime", "optional_items[0][price]": BUMP });
    expect(made.prices[0].tax_behavior).toBeUndefined();
    expect(made.prices[0].lookup_key).toBe("rite_bump_1500_usd_test");
  });

  it("with PRICE_BUMP_CENTS=0 there is no optional item and no Price is made", async () => {
    h.env.PRICE_BUMP_CENTS = "0"; h.seedPreview();
    const made = stripeStub();
    await post("/checkout", { preview: "pv_test_0001" });
    expect(Object.keys(made.sessions[0]).some((k) => k.startsWith("optional_items"))).toBe(false);
    expect(made.prices).toHaveLength(0);
  });

  it.each([["on"], ["off"]])("the gift session follows STRIPE_TAX=%s", async (tax) => {
    h.env.STRIPE_TAX = tax;
    const made = stripeStub();
    await post("/checkout", { gift: "1" });
    const s = made.sessions[0];
    expect(s["metadata[gift]"]).toBe("1");
    expect(Object.keys(s).some((k) => k.startsWith("optional_items"))).toBe(false);
    if (tax === "on") expect(s).toMatchObject({ "automatic_tax[enabled]": "true", billing_address_collection: "auto", "line_items[0][price_data][tax_behavior]": "inclusive", "line_items[0][price_data][product_data][tax_code]": "txcd_10000000" });
    else for (const k of Object.keys(s)) expect(k).not.toMatch(/automatic_tax|billing_address_collection|tax_behavior|tax_code/);
  });

  it("LOCAL_PRICES set: the reading line is a real Price with currency_options, so Checkout can show the buyer's currency", async () => {
    h.env.STRIPE_TAX = "on"; h.env.LOCAL_PRICES = JSON.stringify({ gbp: { full: 2300, bump: 1200 }, eur: { full: 2700 } });
    h.seedPreview();
    const made = stripeStub();
    await post("/checkout", { preview: "pv_test_0001" });
    const reading = made.prices.find((p) => p.lookup_key.startsWith("rite_full_"))!;
    expect(reading).toMatchObject({ unit_amount: "2900", tax_behavior: "inclusive", "currency_options[gbp][unit_amount]": "2300", "currency_options[gbp][tax_behavior]": "inclusive", "currency_options[eur][unit_amount]": "2700" });
    expect(reading.lookup_key).toMatch(/^rite_full_2900_usd_test_v2_l[0-9a-f]{8}$/);
    const bump = made.prices.find((p) => p.lookup_key.startsWith("rite_bump_"))!;
    expect(bump["currency_options[gbp][unit_amount]"]).toBe("1200");
    expect(bump["currency_options[eur][unit_amount]"]).toBeUndefined();
    expect(made.sessions[0]["line_items[0][price]"]).toMatch(/^price_/);
    expect(made.sessions[0]["line_items[0][price_data][unit_amount]"]).toBeUndefined();
  });

  it("Season: STRIPE_TAX=on makes v2 tax-inclusive Prices under new lookup keys and turns on automatic tax; off keeps the original keys", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T00:00:00Z")); // inside the 1997 Aries window
    h.seedPreview(); h.seedPurchase();
    h.env.STRIPE_TAX = "on";
    let made = stripeStub();
    await post(`/season/${TOK}`, { plan: "month" });
    expect(decodeURIComponent(made.lists[0])).toContain("rite_season_month_700_usd_test_v2");
    expect(made.prices.map((p) => [p.lookup_key, p.tax_behavior])).toEqual([["rite_season_month_700_usd_test_v2", "inclusive"], ["rite_season_year_5900_usd_test_v2", "inclusive"]]);
    expect(made.products[0].tax_code).toBe("txcd_10000000");
    expect(made.sessions[0]).toMatchObject({ mode: "subscription", "automatic_tax[enabled]": "true", billing_address_collection: "auto" });
    expect(JSON.parse(h.kv.store.get("stripe:season:prices:_v2")!)).toEqual({ month: made.sessions[0]["line_items[0][price]"], year: expect.any(String) });

    h.env.STRIPE_TAX = "off"; made = stripeStub();
    await post(`/season/${TOK}`, { plan: "month" });
    expect(made.prices.map((p) => [p.lookup_key, p.tax_behavior])).toEqual([["rite_season_month_700_usd_test", undefined], ["rite_season_year_5900_usd_test", undefined]]);
    for (const k of Object.keys(made.sessions[0])) expect(k).not.toMatch(/automatic_tax|billing_address_collection/);
    expect(h.kv.store.has("stripe:season:prices")).toBe(true); // the original KV key, as before
  });

  it.each([["unspecified", "rite_season_year_5900_usd_test"], ["inclusive", "rite_season_year_5900_usd_test_v2"]])(
    "a plan switch keeps a subscription on its own Price family (current tax_behavior %s) with STRIPE_TAX on", async (tb, key) => {
      vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
      h.env.STRIPE_TAX = "on"; h.seedPreview(); h.seedPurchase(); h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "month" });
      const made = stripeStub({ subPriceTax: tb });
      const r = await post(`/season/plan/${TOK}`, { plan: "year" });
      expect(r.headers.get("location")).toBe(`/season/manage/${TOK}?ok=switched`);
      const yearPrice = made.prices.find((p) => p.lookup_key === key);
      expect(yearPrice).toBeTruthy();
      expect(made.prices.every((p) => (tb === "inclusive" ? p.tax_behavior === "inclusive" : p.tax_behavior === undefined))).toBe(true);
      expect(made.updates[0]).toMatchObject({ "items[0][id]": "si_1", proration_behavior: "create_prorations", "metadata[plan]": "year" });
      expect(made.updates[0]["items[0][price]"]).toMatch(/^price_/);
      expect(h.db.row("SELECT plan FROM subscriptions WHERE id=?", SUB)!.plan).toBe("year");
    });
});

describe("tax recorded on the purchase", () => {
  it("stores total_details.amount_tax as purchases.tax_cents (and on a gift)", async () => {
    h.seedPreview();
    await h.webhook(stripeEvent("checkout.session.completed.payment", { automatic_tax: { enabled: true, status: "complete" }, total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 264 } }));
    expect(h.db.row("SELECT tax_cents, amount_cents FROM purchases")).toEqual({ tax_cents: 264, amount_cents: 2900 });
    expect(h.events("paid")[0].detail).toMatchObject({ tax: 264 });
    await h.webhook(stripeEvent("checkout.session.completed.gift", { automatic_tax: { enabled: true }, total_details: { amount_tax: 483 } }));
    expect(h.db.row("SELECT tax_cents FROM gifts")!.tax_cents).toBe(483);
    const m = await adminMoney(h.env.DB);
    expect(m.tax_30d).toBe(264 + 483);
    const page = String(await adminPage({ stats: { days: 30, funnel: { previews: 0, checkouts: 0, paid: 0, generated: 0, preview_to_checkout: 0, checkout_to_paid: 0 }, revenue: {}, gifts: {}, subscriptions: [], by_ref: [], by_sign: [], daily: [], events: [] } as never,
      extras: { errors: [], stories: [], followups: { pending: 0, due: 0 }, reminders: { pending: 0, due: 0 }, stage_reminders: { pending: 0, due: 0 } }, money: m, currency: "usd" }));
    expect(page).toContain("$7.47");
    expect(page).toContain("tax collected (30d)");
  });
  it("leaves tax_cents NULL when the session had no tax calculation (STRIPE_TAX off)", async () => {
    h.seedPreview();
    await h.webhook(stripeEvent("checkout.session.completed.payment", { total_details: { amount_tax: 0 } }));
    expect(h.db.row("SELECT tax_cents FROM purchases")!.tax_cents).toBeNull();
  });
});

describe("order bump", () => {
  const bumped = (o: Record<string, unknown> = {}) => stripeEvent("checkout.session.completed.payment", { amount_total: 4400, metadata: { bump_price: BUMP }, ...o });

  it("a bumped session makes the purchase, one gift code on the same session and payment, and one delivery email with both", async () => {
    h.seedPreview();
    stripeStub({ lineItems: [lineItem("price_reading", 2900), lineItem(BUMP, 1500)] });
    await h.webhook(bumped());
    const pu = h.db.row("SELECT * FROM purchases")!;
    expect(pu).toMatchObject({ amount_cents: 4400, status: "generated", stripe_session_id: "cs_test_reading_0001" });
    const g = h.db.rows("SELECT * FROM gifts");
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ stripe_session_id: "cs_test_reading_0001", stripe_payment_intent: "pi_test_reading_0001", amount_cents: 1500, buyer_email: "reader@example.com", buyer_name: "Sam", redeemed_at: null, tax_cents: null });
    const code = g[0].code as string;
    const mail = h.emails();
    expect(mail).toHaveLength(1);
    expect(mail[0].text).toContain(`${SITE_URL}/r/${pu.id}`);
    expect(mail[0].text).toContain(`The reading you added for someone else: code ${code}, or send them ${SITE_URL}/gift/${code}.`);
    expect(mail[0].text).toContain(`${SITE_URL}/gift/card/${code}.png`);
    expect(h.events("gift_paid")[0]).toMatchObject({ ref: code, detail: { bump: true, amount: 1500, purchase: pu.id } });
    // the reading page shows the code too (if the email never arrives)
    const page = await (await h.request(`/r/${pu.id}`)).text();
    expect(page).toContain(`Their code is <span style="color:#F2B544">${code}</span>`);
    // /thanks for the session goes to the reading, not to the gift page
    const t = await h.request("/thanks?session_id=cs_test_reading_0001");
    expect(t.headers.get("location")).toBe(`/r/${pu.id}`);
  });

  it("offered but not taken: no gift and no gift line", async () => {
    h.seedPreview();
    stripeStub({ lineItems: [lineItem("price_reading", 2900)] });
    await h.webhook(bumped({ amount_total: 2900 }));
    expect(h.db.rows("SELECT * FROM gifts")).toHaveLength(0);
    expect(h.emails()[0].text).not.toContain("someone else");
  });

  it("is idempotent: a redelivered event makes one gift; a failed line-items call is retried by the redelivery", async () => {
    h.seedPreview();
    stripeStub({ lineItems: [lineItem(BUMP, 1500)] });
    const real = h.stripe; let fail = true;
    h.stripe = (c) => (fail && c.url.includes("/line_items") ? json({ error: { message: "down" } }, 500) : real(c));
    await h.webhook(bumped());
    expect(h.db.rows("SELECT * FROM gifts")).toHaveLength(0);
    expect(h.events("error").map((e) => e.detail.where)).toContain("bump-gift");
    fail = false;
    await h.webhook(bumped()); await h.webhook(bumped());
    expect(h.db.rows("SELECT * FROM gifts")).toHaveLength(1);
    expect(h.db.rows("SELECT * FROM purchases")).toHaveLength(1);
  });

  it("a full refund of the session refunds the reading and voids the bump code; a partial refund changes neither", async () => {
    h.seedPreview();
    stripeStub({ lineItems: [lineItem(BUMP, 1500)] });
    await h.webhook(bumped());
    const code = h.db.row("SELECT code FROM gifts")!.code as string;
    await h.webhook(stripeEvent("charge.refunded", { refunded: false, amount_refunded: 1500 })); // e.g. just the bump's amount
    expect(h.db.row("SELECT status FROM purchases")!.status).toBe("generated");
    expect(h.db.row("SELECT redeemed_at FROM gifts")!.redeemed_at).toBeNull();
    expect(h.events("partial_refund_ignored")).toHaveLength(1);
    await h.webhook(stripeEvent("charge.refunded", { amount_refunded: 4400 }));
    expect(h.db.row("SELECT status FROM purchases")!.status).toBe("refunded");
    expect(h.db.row("SELECT redeemed_at FROM gifts")!.redeemed_at).toBe("refunded");
    expect((await h.request(`/gift/${code}`)).status).toBe(410);
    expect((await h.request(`/gift/card/${code}.png`)).status).toBe(410);
  });

  it("/admin/refund on the reading voids its bump code as well", async () => {
    h.env.ADMIN_KEY = "admin_key_for_tests_123";
    h.seedPreview();
    stripeStub({ lineItems: [lineItem(BUMP, 1500)] });
    await h.webhook(bumped());
    const r = await h.request("/admin/refund", { method: "POST", headers: { authorization: "Bearer admin_key_for_tests_123", "content-type": "application/json" }, body: JSON.stringify({ email: "reader@example.com" }) });
    expect(await r.json()).toEqual({ refunded: true });
    expect(h.db.row("SELECT redeemed_at FROM gifts")!.redeemed_at).toBe("refunded");
  });
});

describe("price test", () => {
  beforeEach(() => { h.kv.store.set("geo:melbourne", JSON.stringify({ label: "Melbourne, Australia", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" })); });
  const preview = async () => { const r = await post("/preview", { date: "1997-06-01", place: "Melbourne", time: "12:00" }); return r.headers.get("location")!.replace("/p/", ""); };

  it("PRICE_TEST=on stores the hashed arm on the preview and logs it; off stores nothing", async () => {
    h.env.PRICE_TEST = "on";
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) ids.push(await preview());
    for (const pid of ids) expect(h.db.row("SELECT price_arm FROM previews WHERE id=?", pid)!.price_arm).toBe(armFor(pid));
    expect(h.events("preview").map((e) => e.detail.arm)).toEqual(ids.map(armFor));
    h.env.PRICE_TEST = "off";
    const off = await preview();
    expect(h.db.row("SELECT price_arm FROM previews WHERE id=?", off)!.price_arm).toBeNull();
  });

  it("arm B is shown $39 / $25 on the result page and charged that at checkout, with the arm in the checkout event", async () => {
    h.seedPreview({ id: "pv_b" }); h.db.prepare("UPDATE previews SET price_arm='B' WHERE id='pv_b'").runSync();
    h.seedPreview({ id: "pv_b_notime", time: null }); h.db.prepare("UPDATE previews SET price_arm='B' WHERE id='pv_b_notime'").runSync();
    h.seedPreview({ id: "pv_a" });
    const page = await (await h.request("/p/pv_b")).text();
    expect(page).toContain(">$39</span>");
    expect(page).not.toContain(">$29</span>");
    expect(await (await h.request("/p/pv_b_notime")).text()).toContain("house chapter comes with it, $39.");
    expect(await (await h.request("/p/pv_a")).text()).toContain(">$29</span>");
    const made = stripeStub();
    await post("/checkout", { preview: "pv_b" });
    expect(made.sessions[0]).toMatchObject({ "line_items[0][price_data][unit_amount]": "3900", "metadata[arm]": "B" });
    expect(h.events("checkout")[0].detail).toMatchObject({ amount: 3900, arm: "B" });
  });

  it("stops itself after 14 days: price_test_done names the winner by revenue per preview, new previews get arm A, earlier B previews keep their price", async () => {
    h.env.PRICE_TEST = "on";
    const old = new Date(Date.now() - 15 * 86400000).toISOString();
    for (const [pid, arm] of [["pv_a1", "A"], ["pv_a2", "A"], ["pv_b1", "B"], ["pv_b2", "B"]]) {
      h.seedPreview({ id: pid }); h.db.prepare("UPDATE previews SET price_arm=?, created_at=? WHERE id=?").bind(arm, old, pid).runSync();
    }
    h.seedPurchase({ id: "tok_a", previewId: "pv_a1" }); // 2900
    h.seedPurchase({ id: "tok_b", previewId: "pv_b1" }); h.db.prepare("UPDATE purchases SET amount_cents=3900 WHERE id='tok_b'").runSync();
    const pid = await preview();
    expect(h.db.row("SELECT price_arm FROM previews WHERE id=?", pid)!.price_arm).toBeNull();
    const done = h.events("price_test_done");
    expect(done).toHaveLength(1);
    expect(done[0]).toMatchObject({ ref: "B", detail: { winner: "B", reason: "days", A: { previews: 2, purchases: 1, cents: 2900, per_preview: 1450 }, B: { previews: 2, purchases: 1, cents: 3900, per_preview: 1950 } } });
    await preview(); await h.scheduled();
    expect(h.events("price_test_done")).toHaveLength(1); // once
    const made = stripeStub();
    await post("/checkout", { preview: "pv_b2" });
    expect(made.sessions[0]["line_items[0][price_data][unit_amount]"]).toBe("3900");
    const m = await adminMoney(h.env.DB);
    expect(m.arms.map((a) => [a.arm, a.previews, a.purchases])).toEqual([["A", 2, 1], ["B", 2, 1]]);
    expect(m.price_test_done).toBeTruthy();
  });

  it("stops at 600 previews in each arm (net of tax decides the winner)", async () => {
    h.env.PRICE_TEST = "on";
    h.seedPreview({ id: "seed" });
    const at = new Date().toISOString();
    for (const arm of ["A", "B"]) h.db.db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 600)
      INSERT INTO previews SELECT '${arm}' || i, '${at}', birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref, '${arm}' FROM previews, n WHERE id='seed'`);
    h.seedPurchase({ id: "tok_a", previewId: "A1" }); h.db.prepare("UPDATE purchases SET amount_cents=2900, tax_cents=0 WHERE id='tok_a'").runSync();
    h.seedPurchase({ id: "tok_b", previewId: "B1" }); h.db.prepare("UPDATE purchases SET amount_cents=3900, tax_cents=1100 WHERE id='tok_b'").runSync(); // 2800 net
    await h.scheduled();
    expect(h.events("price_test_done")[0]).toMatchObject({ ref: "A", detail: { winner: "A", reason: "previews" } });
  });
});

describe("gift season banner", () => {
  const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
  it.each([["2026-11-14T12:00:00Z", false], ["2026-11-15T00:30:00Z", true], ["2026-12-22T23:00:00Z", true], ["2026-12-23T00:30:00Z", false]])("on %s: banner %s on /, /p/:id and /r/:tok", async (iso, on) => {
    at(iso);
    h.seedPreview(); h.seedPurchase();
    for (const path of ["/", "/p/pv_test_0001", `/r/${TOK}`]) {
      const page = await (await h.request(path)).text();
      expect(page.includes('class="gbar')).toBe(on);
      if (on) expect(page).toContain("still works on Christmas morning");
    }
    expect((await (await h.request("/gift")).text()).includes('class="gbar')).toBe(false); // only on those three
  });
  it("follows GIFT_SEASON_START / GIFT_SEASON_END", async () => {
    at("2026-10-20T12:00:00Z");
    h.env.GIFT_SEASON_START = "2026-10-01"; h.env.GIFT_SEASON_END = "2026-10-31";
    expect(await (await h.request("/")).text()).toContain('class="gbar');
  });
});

describe("gift season email", () => {
  const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
  function seedBuyers() {
    h.seedPreview();
    h.seedPurchase({ id: "tok_buyer_000001", email: "buyer@example.com" });
    h.seedPurchase({ id: "tok_buyer_000002", email: "buyer@example.com" }); // two readings, one email
    h.seedPurchase({ id: "tok_refund_00001", email: "refunded@example.com", status: "refunded" });
    h.seedPurchase({ id: "tok_stop_000001", email: "stopped@example.com" });
    h.db.prepare("INSERT INTO followups (purchase_id, kind, send_on, sent_at) VALUES ('tok_stop_000001','day10','2026-10-01','skipped:stop')").runSync();
    h.seedPurchase({ id: "tok_stop_000002", email: "stopped2@example.com" });
    h.db.prepare("INSERT INTO events (at, kind, ref) VALUES ('2026-10-01T00:00:00Z','stopped','tok_stop_000002')").runSync(); // nothing was pending when they stopped
    h.seedPurchase({ id: "tok_gifted_00001", email: "recipient@example.com" }); h.db.prepare("UPDATE purchases SET amount_cents=0 WHERE id='tok_gifted_00001'").runSync();
  }
  const giftMails = () => h.emails().filter((m) => /Saturn return$/.test(m.subject) && /gift/i.test(m.text));

  it("1 Dec: one email per buyer, skipping refunds, stops and gift recipients; with the stop link and List-Unsubscribe; never twice", async () => {
    at("2026-12-01T00:30:00Z"); // 11:30 in Melbourne
    seedBuyers();
    await h.scheduled();
    const sent = h.calls.filter((c) => c.url === "https://api.resend.com/emails").map((c) => c.json());
    expect(sent.map((m) => m.to[0])).toEqual(["buyer@example.com"]);
    const stop = `${SITE_URL}/stop/tok_buyer_000002`; // the latest reading
    expect(sent[0].subject).toBe("Give someone their Saturn return");
    expect(sent[0].text).toContain(`${SITE_URL}/gift?r=gift-email`);
    expect(sent[0].text).toContain("$29");
    expect(sent[0].text).toContain(stop);
    expect(sent[0].headers).toEqual({ "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    vi.setSystemTime(new Date("2026-12-01T05:30:00Z"));
    await h.scheduled();
    expect(giftMails()).toHaveLength(1);
    expect(h.db.rows("SELECT campaign, email FROM campaign_sends")).toEqual([{ campaign: "gift-2026-12-01", email: "buyer@example.com" }]);
    expect(h.events("gift_season_sent")).toHaveLength(1);
  });

  it("waits for 09:00 local, sends the 15 Dec one separately, and nothing on other days", async () => {
    at("2026-11-30T20:30:00Z"); // 1 Dec 07:30 Melbourne
    seedBuyers();
    await h.scheduled();
    expect(giftMails()).toHaveLength(0);
    vi.setSystemTime(new Date("2026-12-08T03:00:00Z"));
    await h.scheduled();
    expect(giftMails()).toHaveLength(0);
    vi.setSystemTime(new Date("2026-12-15T03:00:00Z"));
    await h.scheduled();
    expect(h.emails().map((m) => m.subject)).toEqual(["Still time to give a Saturn return"]);
  });

  it("a buyer who presses stop after the first email doesn't get the second", async () => {
    at("2026-12-01T03:00:00Z");
    seedBuyers();
    await h.scheduled();
    expect(giftMails()).toHaveLength(1);
    await h.request("/stop/tok_buyer_000002", { method: "POST", body: "List-Unsubscribe=One-Click" });
    h.clearCalls();
    vi.setSystemTime(new Date("2026-12-15T03:00:00Z"));
    await h.scheduled();
    expect(h.emails()).toHaveLength(0);
  });

  it("a failed send is retried the next hour", async () => {
    at("2026-12-01T03:00:00Z");
    seedBuyers();
    h.resend = () => json({ message: "nope" }, 500);
    await h.scheduled();
    expect(h.db.rows("SELECT * FROM campaign_sends")).toHaveLength(0);
    h.resend = () => json({ id: "email_ok" });
    vi.setSystemTime(new Date("2026-12-01T04:00:00Z"));
    await h.scheduled();
    expect(h.db.rows("SELECT * FROM campaign_sends")).toHaveLength(1);
  });
});

describe("gift card PNG", () => {
  it("renders for a live code, 404s for an unknown one and 410s once refunded; the gift email links to it", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.gift"));
    const code = h.db.row("SELECT code FROM gifts")!.code as string;
    expect(h.emails()[0].text).toContain(`A card to print or send: ${SITE_URL}/gift/card/${code}.png`);
    const r = await h.request(`/gift/card/${code}.png`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(h.kv.store.has(`gift:png:${code}`)).toBe(true);
    expect(await (await h.request(`/gift/thanks/${code}`)).text()).toContain(`/gift/card/${code}.png`);
    expect((await h.request("/gift/card/NOPENOPE.png")).status).toBe(404);
    h.db.prepare("UPDATE gifts SET redeemed_at='refunded'").runSync();
    expect((await h.request(`/gift/card/${code}.png`)).status).toBe(410);
  });
});
