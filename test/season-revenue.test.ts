// Saturn Season revenue in the Monday KPI email: the webhook stores each paid Season invoice once (invoice.paid and
// invoice.payment_succeeded both arrive, and Stripe redelivers), net of tax, with refunds from charge.refunded; the
// report adds it to weekly revenue, month to date and the best month.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness, stripeEvent } from "./helpers/worker";
import { buildKpiReport } from "../src/kpi";

const TOK = "tok_test_purchase_000000000000001", SUB = "sub_test_0001";
const MON = new Date("2026-11-15T21:30:00Z"); // Monday 16 Nov 2026 07:30 Brisbane; last week = 9–15 Nov
const unix = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

let h: Harness;
beforeEach(() => { h = new Harness(); vi.stubGlobal("fetch", h.fetch); h.seedPreview(); h.seedPurchase(); h.seedSubscription({ id: SUB, purchaseId: TOK }); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const invoices = () => h.db.rows("SELECT * FROM season_invoices ORDER BY invoice_id");
const paidEvent = (o: Record<string, unknown> = {}, top: Record<string, unknown> = {}) => stripeEvent("invoice.paid", { status_transitions: { paid_at: unix("2026-11-12T03:00:00Z") }, ...o }, top);

describe("webhook: season_invoices", () => {
  it("stores a paid invoice once across invoice.paid, invoice.payment_succeeded and a redelivery", async () => {
    await h.webhook(paidEvent({ total_taxes: [{ amount: 64, tax_behavior: "inclusive" }] }));
    await h.webhook(paidEvent({}, { type: "invoice.payment_succeeded", id: "evt_succeeded" }));
    await h.webhook(paidEvent({ total_taxes: [{ amount: 64, tax_behavior: "inclusive" }] }));
    expect(invoices()).toEqual([{ invoice_id: "in_test_renewal_0002", subscription_id: SUB, purchase_id: TOK, paid_at: "2026-11-12T03:00:00.000Z",
      amount_cents: 700, tax_cents: 64, refunded_cents: 0, currency: "usd", billing_reason: "subscription_cycle" }]);
    expect(h.calls).toHaveLength(0);
  });

  it("stores the first invoice even before the subscription row exists, and skips $0 and non-subscription invoices", async () => {
    await h.webhook(paidEvent({ id: "in_first", billing_reason: "subscription_create", parent: { subscription_details: { subscription: "sub_new" } } }));
    await h.webhook(paidEvent({ id: "in_zero", amount_paid: 0 }));
    await h.webhook(paidEvent({ id: "in_other", parent: null }));
    await h.webhook(stripeEvent("invoice.payment_failed", { id: "in_failed" }));
    expect(invoices().map((r) => [r.invoice_id, r.subscription_id, r.tax_cents])).toEqual([["in_first", "sub_new", 0]]);
  });

  it("without status_transitions.paid_at, uses the time the webhook arrived", async () => {
    await h.webhook(stripeEvent("invoice.paid"));
    expect(Math.abs(Date.parse(invoices()[0]!.paid_at as string) - Date.now())).toBeLessThan(60000);
  });

  it("charge.refunded on a Season charge records the refund on its invoice (cumulative, so idempotent)", async () => {
    await h.webhook(paidEvent({ id: "in_1", amount_paid: 5900 }));
    h.stripe = (c) => {
      const u = new URL(c.url);
      if (u.pathname === "/v1/invoice_payments") return json({ object: "list", data: [{ invoice: { id: "in_1", parent: { type: "subscription_details", subscription_details: { subscription: SUB } } } }] });
      if (u.pathname === `/v1/subscriptions/${SUB}`) return json({ id: SUB, status: "canceled" });
      return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
    };
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_season_1", refunded: false, amount_refunded: 2000 }));
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_season_1", refunded: false, amount_refunded: 2000 }));
    expect(invoices()[0]!.refunded_cents).toBe(2000);
  });
});

describe("KPI report: Season revenue", () => {
  const inv = (id: string, at: string, cents: number, tax = 0, refunded = 0, reason = "subscription_cycle") =>
    h.db.prepare("INSERT INTO season_invoices (invoice_id, subscription_id, purchase_id, paid_at, amount_cents, tax_cents, refunded_cents, currency, billing_reason) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(id, SUB, TOK, at, cents, tax, refunded, "usd", reason).runSync();

  it("adds Season, net of tax and refunds, to weekly revenue, the Season line and month to date", async () => {
    h.db.prepare("UPDATE purchases SET created_at='2026-11-20T00:00:00.000Z'").runSync(); // the seeded reading is outside both weeks
    inv("in_a", "2026-11-10T00:00:00.000Z", 5900, 536, 0, "subscription_create"); // $59 year, $5.36 tax → $53.64
    inv("in_b", "2026-11-11T00:00:00.000Z", 700, 0);                               // $7 renewal
    inv("in_c", "2026-11-12T00:00:00.000Z", 700, 0, 350);                          // half refunded → $3.50
    inv("in_d", "2026-11-13T00:00:00.000Z", 700, 0, 700);                          // fully refunded: out
    inv("in_p", "2026-11-04T00:00:00.000Z", 700, 0);                               // the week before
    inv("in_old", "2026-10-20T00:00:00.000Z", 5900, 0);                            // October: outside the month
    const { text } = await buildKpiReport(h.env.DB, MON);
    // 5364 + 700 + 350 = 6414 cents
    expect(text).toContain("Revenue: $64 vs $7 (+816%) · readings $0, gifts $0, Season $64");
    expect(text).toContain("· 3 payments (2 renewals), $64 net of tax vs $7 (+816%)");
    expect(text).toMatch(/Month to date \(2026-11, day 16 of 30\): \$71 vs \$5,104 pro-rated, 1% \(month target \$10,000\) · Season \$71 of it/);
  });

  it("counts Season in the best month (Gate C)", async () => {
    h.db.prepare("UPDATE purchases SET created_at='2027-02-01T00:00:00.000Z'").runSync();
    inv("in_m", "2027-03-03T00:00:00.000Z", 5900, 900);
    const { text } = await buildKpiReport(h.env.DB, new Date("2027-03-14T21:00:00Z"));
    expect(text).toContain("this month $50 so far · best month $50 (2027-03)");
  });
});
