import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness, stripeEvent } from "./helpers/worker";

const TOK = "tok_test_purchase_000000000000001", SUB = "sub_test_0001";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
let h: Harness;
beforeEach(() => { h = new Harness({ ADMIN_KEY: "admin_key_for_tests_123" } as never); vi.stubGlobal("fetch", h.fetch); h.seedPreview(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const subStatus = () => h.db.row("SELECT status FROM subscriptions WHERE id = ?", SUB)!.status;

/** Stripe stub for a yearly sub paid on 1 Jan 2026 for $59, period ending 1 Jan 2027. */
function stripeYearly(cancelled: string[], refunds: unknown[]) {
  h.stripe = (c) => {
    const u = new URL(c.url);
    if (u.pathname === `/v1/subscriptions/${SUB}` && c.method === "GET") return json({ id: SUB, status: cancelled.length ? "canceled" : "active", items: { data: [{ current_period_end: Date.UTC(2027, 0, 1) / 1000 }] } });
    if (u.pathname === `/v1/subscriptions/${SUB}` && c.method === "DELETE") { cancelled.push(SUB); return json({ id: SUB, status: "canceled" }); }
    if (u.pathname === "/v1/invoices") return json({ object: "list", data: [{ id: "in_1", amount_paid: 5900, payments: { data: [{ payment: { type: "payment_intent", payment_intent: "pi_season_1" } }] } }] });
    if (u.pathname === "/v1/refunds") { refunds.push(Object.fromEntries(new URLSearchParams(c.body))); return json({ id: "re_1" }); }
    if (u.pathname === "/v1/invoice_payments") return json({ object: "list", data: [{ invoice: { id: "in_1", parent: { type: "subscription_details", subscription_details: { subscription: SUB } } } }] });
    return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
  };
}

describe("refund policy", () => {
  it("a partial refund on a reading changes nothing", async () => {
    h.seedPurchase({ pi: "pi_test_reading_0001" });
    await h.webhook(stripeEvent("charge.refunded", { refunded: false, amount_refunded: 1000 }));
    expect(h.db.row("SELECT status FROM purchases WHERE id = ?", TOK)!.status).toBe("generated");
    expect(h.events("partial_refund_ignored")).toHaveLength(1);
  });

  it("a refund on a Season invoice (e.g. from the Stripe dashboard) stops the subscription", async () => {
    h.seedPurchase();
    h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "year" });
    const cancelled: string[] = []; stripeYearly(cancelled, []);
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_season_1", refunded: false, amount_refunded: 2000 }));
    expect(cancelled).toEqual([SUB]);
    expect(subStatus()).toBe("canceled");
  });

  it("stopping a yearly plan from the manage page cancels now and refunds the unused full months", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-04-15T00:00:00Z"));
    h.seedPurchase();
    h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "year" });
    const cancelled: string[] = [], refunds: Record<string, string>[] = []; stripeYearly(cancelled, refunds);
    const r = await h.request(`/season/cancel/${TOK}`, { method: "POST" });
    expect(r.status).toBe(302);
    expect(cancelled).toEqual([SUB]);
    expect(subStatus()).toBe("canceled");
    expect(refunds).toEqual([{ payment_intent: "pi_season_1", amount: String(Math.round(5900 * 8 / 12)) }]); // 15 Apr → 1 Jan: 8 full months
    expect(r.headers.get("location")).toContain("refund=");
  });

  it("stopping a monthly plan cancels with nothing to refund", async () => {
    h.seedPurchase();
    h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "month" });
    const cancelled: string[] = [], refunds: unknown[] = []; stripeYearly(cancelled, refunds);
    await h.request(`/season/cancel/${TOK}`, { method: "POST" });
    expect(cancelled).toEqual([SUB]);
    expect(refunds).toHaveLength(0);
    expect(subStatus()).toBe("canceled");
  });

  it("if Stripe won't cancel, the subscription stays as it was", async () => {
    h.seedPurchase();
    h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "month" });
    const r = await h.request(`/season/cancel/${TOK}`, { method: "POST" }); // default stub: every Stripe call 500s
    expect(r.headers.get("location")).toContain("ok=error");
    expect(subStatus()).toBe("active");
  });

  it("POST /admin/refund {season:true} stops it and refunds unused yearly months", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-17T00:00:00Z"));
    h.seedPurchase();
    h.seedSubscription({ id: SUB, purchaseId: TOK, plan: "year" });
    const cancelled: string[] = [], refunds: unknown[] = []; stripeYearly(cancelled, refunds);
    const r = await h.request("/admin/refund", { method: "POST", headers: { authorization: "Bearer admin_key_for_tests_123", "content-type": "application/json" }, body: JSON.stringify({ email: "reader@example.com", season: true }) });
    expect(await r.json()).toMatchObject({ season: true, canceled: true, refunded: true, cents: Math.round(5900 * 2 / 12) }); // 17 Oct → 1 Jan: 2 full months
    expect(subStatus()).toBe("canceled");
  });
});
