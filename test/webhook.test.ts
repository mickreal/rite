// /webhook/stripe, end to end: real Stripe signatures, real SQL (schema.sql in node:sqlite), every outbound call recorded.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Harness, FakeD1, migrationFiles, stripeEvent, signStripe, SITE_URL, WHSEC, REPORT_REPLY } from "./helpers/worker";
import { nextNoteDate } from "../src/season";
// @ts-expect-error: no @types/node in this Workers project; vitest runs in Node
import { readFileSync } from "node:fs";

// resvg's wasm and font imports only resolve under wrangler; nothing on the webhook path renders a PNG.
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));

const TOK = "tok_test_purchase_000000000000001";
const SUB = "sub_test_0001";

let h: Harness;
beforeEach(() => { h = new Harness(); vi.stubGlobal("fetch", h.fetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const purchases = () => h.db.rows("SELECT * FROM purchases ORDER BY created_at");
const gifts = () => h.db.rows("SELECT * FROM gifts");
const sub = (id = SUB) => h.db.row("SELECT * FROM subscriptions WHERE id = ?", id);

describe("signature and routing", () => {
  it("rejects a payload signed with the wrong secret: 400, nothing written, nothing sent", async () => {
    h.seedPreview();
    const res = await h.webhook(stripeEvent("checkout.session.completed.payment"), { secret: "whsec_not_the_right_one_000000" });
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/bad signature/);
    expect(purchases()).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it("rejects a missing header, a garbled header and a tampered body", async () => {
    const ev = stripeEvent("checkout.session.completed.payment");
    expect((await h.request("/webhook/stripe", { method: "POST", body: JSON.stringify(ev) })).status).toBe(400);
    expect((await h.webhook(ev, { header: "t=1,v1=deadbeef" })).status).toBe(400);
    const header = await signStripe(JSON.stringify(ev));
    const tampered = JSON.stringify({ ...ev, data: { object: { ...ev.data.object, amount_total: 1 } } });
    expect((await h.request("/webhook/stripe", { method: "POST", headers: { "stripe-signature": header }, body: tampered })).status).toBe(400);
    expect(purchases()).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });

  it("rejects a correctly signed event older than Stripe's 5-minute tolerance (replay)", async () => {
    h.seedPreview();
    const res = await h.webhook(stripeEvent("checkout.session.completed.payment"), { t: Math.floor(Date.now() / 1000) - 600 });
    expect(res.status).toBe(400);
    expect(purchases()).toHaveLength(0);
  });

  it("acknowledges an event type it doesn't handle with 200 and does nothing", async () => {
    const res = await h.webhook(stripeEvent("customer.updated"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(h.calls).toHaveLength(0);
    expect(h.events()).toHaveLength(0);
  });
});

describe("checkout.session.completed: a reading", () => {
  it("creates the purchase, writes the reading in a fresh invocation and emails the link", async () => {
    h.seedPreview({ ref: "tiktok" });
    const res = await h.webhook(stripeEvent("checkout.session.completed.payment"));
    expect(res.status).toBe(200);

    const [p] = purchases();
    expect(purchases()).toHaveLength(1);
    expect(p).toMatchObject({ preview_id: "pv_test_0001", email: "reader@example.com", first_name: "Sam", stripe_session_id: "cs_test_reading_0001",
      stripe_payment_intent: "pi_test_reading_0001", amount_cents: 2900, tier: "full", status: "generated" });
    const tok = p.id as string;
    expect(tok).toMatch(/^[a-z0-9]{32}$/);
    expect(JSON.parse(p.report_md as string)).toEqual(REPORT_REPLY);
    expect(p.delivered_at).toBeTruthy();

    // the reading is written by POST /internal/generate/:tok on the worker's own URL, authorised with the webhook secret
    const self = h.selfCalls();
    expect(self).toHaveLength(1);
    expect(self[0]).toMatchObject({ url: `${SITE_URL}/internal/generate/${tok}`, method: "POST" });
    expect(self[0].headers.authorization).toBe(`Bearer ${WHSEC}`);

    expect(h.llm()).toEqual([expect.objectContaining({ model: "test-report-model", max_tokens: 6000 })]);
    const mail = h.emails();
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toEqual(["reader@example.com"]);
    expect(mail[0].subject).toMatch(/^Your Saturn return — Aries, /);
    expect(mail[0].text).toContain(`${SITE_URL}/r/${tok}`);
    expect(mail[0].text.startsWith("Sam,")).toBe(true);

    expect(h.events().map((e) => e.kind)).toEqual(["paid", "generated", "emailed"]);
    expect(h.events("paid")[0]).toMatchObject({ ref: tok, detail: { pid: "pv_test_0001", tier: "full", amount: 2900, ref: "tiktok", sign: "Aries" } });
    expect(h.posthog()).toEqual(["server_paid", "server_generated"]);
    expect(h.db.rows("SELECT kind FROM followups WHERE purchase_id = ? ORDER BY kind", tok).map((r) => r.kind)).toEqual(["day10", "day3"]);
    expect(h.db.rows("SELECT * FROM stage_reminders WHERE purchase_id = ?", tok).length).toBeGreaterThan(0);
    expect(h.stripeCalls()).toHaveLength(0);
  });

  it("stores the no-birth-time tier and a null first name when the field was left empty", async () => {
    h.seedPreview({ time: null });
    await h.webhook(stripeEvent("checkout.session.completed.payment", { amount_total: 1900, metadata: { tier: "notime" }, custom_fields: [{ key: "first_name", type: "text", text: { value: "   " } }] }));
    expect(purchases()[0]).toMatchObject({ tier: "notime", amount_cents: 1900, first_name: null, status: "generated" });
    expect(h.emails()[0].text.startsWith("Hi,")).toBe(true);
  });

  it("is idempotent: the same event delivered twice makes one purchase, one reading and one email", async () => {
    h.seedPreview();
    const ev = stripeEvent("checkout.session.completed.payment");
    expect((await h.webhook(ev)).status).toBe(200);
    expect((await h.webhook(ev)).status).toBe(200);
    expect(purchases()).toHaveLength(1);
    expect(h.llm()).toHaveLength(1);
    expect(h.emails()).toHaveLength(1);
    expect(h.events("paid")).toHaveLength(1);
    // the retry still pokes the generator, which finds the lock already taken and does nothing
    expect(h.selfCalls()).toHaveLength(2);
  });

  it("writes the reading inline when the self-call is refused (Cloudflare 1042)", async () => {
    h.seedPreview();
    const real = h.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input instanceof Request ? input.url : input).startsWith(`${SITE_URL}/internal/`) ? Promise.resolve(new Response("error code: 1042", { status: 404 })) : real(input, init));
    await h.webhook(stripeEvent("checkout.session.completed.payment"));
    expect(purchases()[0].status).toBe("generated");
    expect(h.events("error")[0].detail).toMatchObject({ where: "kick-generate", status: 404 });
    expect(h.llm()).toHaveLength(1);
    expect(h.emails()).toHaveLength(1);
  });

  it("marks the purchase failed (no email) when the model fails twice", async () => {
    h.seedPreview();
    h.anthropic = () => new Response("overloaded", { status: 529 });
    await h.webhook(stripeEvent("checkout.session.completed.payment"));
    expect(purchases()[0].status).toBe("failed");
    expect(h.llm()).toHaveLength(2);
    expect(h.emails()).toHaveLength(0);
    expect(h.events("error").map((e) => e.detail.where)).toEqual(["report-llm", "report-llm"]);
  });

  it("ignores a session that isn't paid yet (async payment methods) or has no preview id", async () => {
    h.seedPreview();
    expect((await h.webhook(stripeEvent("checkout.session.completed.payment", { payment_status: "unpaid" }))).status).toBe(200);
    expect((await h.webhook(stripeEvent("checkout.session.completed.payment", { id: "cs_test_nopreview", metadata: { preview_id: null } }))).status).toBe(200);
    expect(purchases()).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe("checkout.session.completed: a gift", () => {
  it("stores a code and emails it to the buyer, with no reading written", async () => {
    const res = await h.webhook(stripeEvent("checkout.session.completed.gift"));
    expect(res.status).toBe(200);
    const [g] = gifts();
    expect(gifts()).toHaveLength(1);
    expect(g).toMatchObject({ buyer_email: "buyer@example.com", buyer_name: "Alex", message: "Happy 29th", stripe_session_id: "cs_test_gift_0001",
      stripe_payment_intent: "pi_test_gift_0001", amount_cents: 2900, redeemed_purchase_id: null, redeemed_at: null });
    expect(g.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    const mail = h.emails();
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({ to: ["buyer@example.com"], subject: `Your Rite gift code: ${g.code}` });
    expect(mail[0].text).toContain(`${SITE_URL}/gift/${g.code}`);
    expect(mail[0].text).toContain("Thanks, Alex.");

    expect(purchases()).toHaveLength(0);
    expect(h.selfCalls()).toHaveLength(0);
    expect(h.llm()).toHaveLength(0);
    expect(h.events().map((e) => [e.kind, e.ref])).toEqual([["gift_paid", g.code], ["emailed", g.code]]);
    expect(h.posthog()).toEqual(["server_gift_paid"]);
  });

  it("is idempotent: the same event twice makes one code and one email", async () => {
    const ev = stripeEvent("checkout.session.completed.gift");
    await h.webhook(ev); await h.webhook(ev);
    expect(gifts()).toHaveLength(1);
    expect(h.emails()).toHaveLength(1);
  });
});

describe("checkout.session.completed: Saturn Season starts", () => {
  beforeEach(() => { h.seedPreview(); h.seedPurchase(); });

  it.each([["month"], ["year"]])("stores an active %sly subscription and sends the welcome note now", async (plan) => {
    const res = await h.webhook(stripeEvent("checkout.session.completed.subscription", { metadata: { plan }, amount_total: plan === "year" ? 5900 : 700 }));
    expect(res.status).toBe(200);
    expect(sub()).toMatchObject({ purchase_id: TOK, status: "active", plan });
    expect(sub()!.last_sent_at).toBeTruthy(); // so the Monday cron waits six days

    const mail = h.emails();
    expect(mail).toHaveLength(1);
    expect(mail[0].to).toEqual(["reader@example.com"]);
    expect(mail[0].subject).toMatch(/^Saturn Season starts/);
    expect(mail[0].text).toContain(`${SITE_URL}/season/manage/${TOK}`);
    expect(mail[0].text).toContain("A test Season paragraph");
    expect(h.llm()).toEqual([expect.objectContaining({ model: "test-preview-model" })]);

    expect(h.events("season_start")[0]).toMatchObject({ ref: TOK, detail: { plan } });
    expect(h.events("season_welcome")[0]).toMatchObject({ ref: TOK, detail: { result: "sent" } });
    expect(h.posthog()).toContain("server_season_start");
    expect(h.stripeCalls()).toHaveLength(0);
  });

  it("defaults to monthly for a session without plan metadata (sessions created before plans)", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.subscription", { metadata: { plan: null } }));
    expect(sub()!.plan).toBe("month");
  });

  it("is idempotent: the same event twice sends one welcome note", async () => {
    const ev = stripeEvent("checkout.session.completed.subscription");
    await h.webhook(ev);
    const first = sub()!.last_sent_at;
    await h.webhook(ev);
    expect(h.db.rows("SELECT * FROM subscriptions")).toHaveLength(1);
    expect(h.emails()).toHaveLength(1);
    expect(h.events("season_start")).toHaveLength(1);
    expect(sub()!.last_sent_at).toBe(first);
  });

  it("a late retry of the start event doesn't revive a subscription that has since been cancelled", async () => {
    const ev = stripeEvent("checkout.session.completed.subscription");
    await h.webhook(ev);
    await h.webhook(stripeEvent("customer.subscription.deleted"));
    expect(sub()!.status).toBe("canceled");
    h.clearCalls();
    await h.webhook(ev);
    expect(sub()!.status).toBe("canceled");
    expect(h.emails()).toHaveLength(0);
  });

  it("does nothing for a subscription session with no purchase id", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.subscription", { metadata: { purchase_id: null } }));
    expect(h.db.rows("SELECT * FROM subscriptions")).toHaveLength(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe("invoice.payment_failed / invoice.paid", () => {
  beforeEach(() => { h.seedPreview(); h.seedPurchase(); });

  it("payment_failed moves an active subscription to past_due, once", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK });
    const ev = stripeEvent("invoice.payment_failed");
    expect((await h.webhook(ev)).status).toBe(200);
    expect(sub()!.status).toBe("past_due");
    expect(h.events("season_past_due")).toEqual([{ kind: "season_past_due", ref: SUB, detail: { invoice: "in_test_renewal_0002", attempt: 1 } }]);
    await h.webhook(stripeEvent("invoice.payment_failed", { attempt_count: 2 })); // Stripe's retry fails again
    expect(sub()!.status).toBe("past_due");
    expect(h.events("season_past_due")).toHaveLength(1);
    expect(h.calls).toHaveLength(0);
  });

  it("invoice.paid (and invoice.payment_succeeded) moves past_due back to active", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK, status: "past_due" });
    await h.webhook(stripeEvent("invoice.paid"));
    expect(sub()!.status).toBe("active");
    expect(h.events("season_resumed")).toEqual([{ kind: "season_resumed", ref: SUB, detail: { invoice: "in_test_renewal_0002" } }]);

    h.db.prepare("UPDATE subscriptions SET status='past_due'").runSync();
    await h.webhook(stripeEvent("invoice.paid", {}, { type: "invoice.payment_succeeded", id: "evt_1Rite0InvoiceSucceeded" }));
    expect(sub()!.status).toBe("active");
    expect(h.calls).toHaveLength(0);
  });

  it("a normal renewal on an active subscription changes nothing", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK });
    await h.webhook(stripeEvent("invoice.paid"));
    expect(sub()!.status).toBe("active");
    expect(h.events()).toHaveLength(0);
  });

  it("never revives a cancelled or completed subscription", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK, status: "canceled" });
    h.seedSubscription({ id: "sub_done", purchaseId: TOK, status: "complete" });
    await h.webhook(stripeEvent("invoice.payment_failed"));
    await h.webhook(stripeEvent("invoice.paid"));
    await h.webhook(stripeEvent("invoice.paid", { parent: { subscription_details: { subscription: "sub_done" } } }));
    expect(sub()!.status).toBe("canceled");
    expect(sub("sub_done")!.status).toBe("complete");
    expect(h.events()).toHaveLength(0);
  });

  it("ignores invoices with no subscription parent, and unknown subscriptions", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK });
    await h.webhook(stripeEvent("invoice.payment_failed", { parent: null }));
    await h.webhook(stripeEvent("invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_someone_else" } } }));
    expect(sub()!.status).toBe("active");
    expect(h.events()).toHaveLength(0);
  });

  it("the Monday cron sends no Season note while past_due, and resumes after invoice.paid", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK });
    h.seedPurchase({ id: "tok_test_purchase_000000000000002", email: "other@example.com" });
    h.seedSubscription({ id: "sub_test_0002", purchaseId: "tok_test_purchase_000000000000002" });
    await h.webhook(stripeEvent("invoice.payment_failed"));

    // Monday 07:00 in the preview's zone (Australia/Melbourne), the only hour runSeason sends
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(nextNoteDate("Australia/Melbourne", new Date()));
    h.clearCalls();
    await h.scheduled();
    expect(h.emails().map((m) => m.to[0])).toEqual(["other@example.com"]);
    expect(sub()!.last_sent_at).toBeNull();

    await h.webhook(stripeEvent("invoice.paid"));
    h.clearCalls();
    await h.scheduled();
    expect(h.emails().map((m) => m.to[0])).toEqual(["reader@example.com"]); // other@ already had this week's
    expect(sub()!.last_sent_at).toBeTruthy();
  });
});

describe("customer.subscription.deleted", () => {
  beforeEach(() => { h.seedPreview(); h.seedPurchase(); });

  it.each([["active"], ["past_due"]])("cancels a %s subscription", async (status) => {
    h.seedSubscription({ id: SUB, purchaseId: TOK, status });
    expect((await h.webhook(stripeEvent("customer.subscription.deleted"))).status).toBe(200);
    expect(sub()!.status).toBe("canceled");
    expect(h.calls).toHaveLength(0);
  });

  it("leaves a completed subscription complete (our own cancel echoing back at window close)", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK, status: "complete" });
    await h.webhook(stripeEvent("customer.subscription.deleted"));
    expect(sub()!.status).toBe("complete");
  });

  it("ignores an unknown subscription", async () => {
    h.seedSubscription({ id: SUB, purchaseId: TOK });
    await h.webhook(stripeEvent("customer.subscription.deleted", { id: "sub_unknown" }));
    expect(sub()!.status).toBe("active");
  });
});

describe("charge.refunded", () => {
  it("marks the reading refunded", async () => {
    h.seedPreview();
    h.seedPurchase({ pi: "pi_test_reading_0001" });
    h.seedPurchase({ id: "tok_test_purchase_000000000000002", pi: "pi_other" });
    expect((await h.webhook(stripeEvent("charge.refunded"))).status).toBe(200);
    expect(h.db.row("SELECT status FROM purchases WHERE id = ?", TOK)!.status).toBe("refunded");
    expect(h.db.row("SELECT status FROM purchases WHERE id = ?", "tok_test_purchase_000000000000002")!.status).toBe("generated");
    // a dashboard refund gets an events row (the KPI email counts it); the only outbound call is PostHog's server_refund
    expect(h.events("refund")).toEqual([{ kind: "refund", ref: TOK, detail: expect.objectContaining({ via: "stripe", gift: false }) }]);
    expect(h.posthog()).toEqual(["server_refund"]);
    expect(h.calls).toHaveLength(1);
    // a redelivery (or the echo of POST /admin/refund) changes no row and logs nothing more
    await h.webhook(stripeEvent("charge.refunded"));
    expect(h.events("refund")).toHaveLength(1);
  });

  it("voids an unredeemed gift code, so it can no longer be redeemed", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.gift"));
    const code = gifts()[0].code as string;
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_test_gift_0001" }));
    expect(gifts()[0].redeemed_at).toBe("refunded"); // same marker /admin/refund uses
    expect(gifts()[0].redeemed_purchase_id).toBeNull();

    // the recipient tries to use it anyway
    h.seedPreview();
    const res = await h.request("/redeem", { method: "POST", body: new URLSearchParams({ preview: "pv_test_0001", gift: code, email: "friend@example.com" }) });
    expect(res.status).toBe(302);
    expect(purchases()).toHaveLength(0);
  });

  it("leaves an already-redeemed gift (and the recipient's reading) alone", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.gift"));
    h.seedPreview();
    h.seedPurchase({ id: TOK });
    h.db.prepare("UPDATE gifts SET redeemed_purchase_id = ?, redeemed_at = ?").bind(TOK, "2026-10-01T00:00:00.000Z").runSync();
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_test_gift_0001" }));
    expect(gifts()[0]).toMatchObject({ redeemed_purchase_id: TOK, redeemed_at: "2026-10-01T00:00:00.000Z" });
    expect(h.db.row("SELECT status FROM purchases WHERE id = ?", TOK)!.status).toBe("generated");
  });

  it("is a no-op for a charge with no payment intent or one we don't know", async () => {
    h.seedPreview();
    h.seedPurchase({ pi: "pi_test_reading_0001" });
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: null }));
    await h.webhook(stripeEvent("charge.refunded", { payment_intent: "pi_someone_else" }));
    expect(purchases()[0].status).toBe("generated");
  });
});

describe("schema and migrations", () => {
  it("an old database (before subscriptions.plan, the tax / price-test columns and campaign_sends) plus migrations/ has the same columns as schema.sql (and support_messages)", () => {
    const cols = (d: FakeD1, t: string) => d.rows(`PRAGMA table_info(${t})`).map((r) => r.name).sort();
    const fresh = new FakeD1();
    const old = new FakeD1(false);
    const schema: string = readFileSync("schema.sql", "utf8");
    // drop each later column (the last in its table, with its comment lines) and the campaign_sends table
    let before = schema;
    for (const col of ["plan TEXT", "price_arm TEXT", "tax_cents INTEGER"]) before = before.replace(new RegExp(`,([ \\t]*--[^\\n]*)?\\n\\s*${col}[^\\n]*\\n(\\s*--[^\\n]*\\n)*`, "g"), "$1\n");
    before = before.replace(/CREATE TABLE IF NOT EXISTS campaign_sends \([\s\S]*?\n\);\n/, "");
    before = before.replace(/CREATE TABLE IF NOT EXISTS (support_messages|support_threads|support_replies|season_invoices) \([\s\S]*?\n\);\n/g, "").replace(/CREATE INDEX IF NOT EXISTS idx_(support|season_invoices)_[^\n]*\n/g, "");
    expect(before).not.toMatch(/\bplan TEXT|price_arm|tax_cents|campaign_sends \(|support_messages|support_threads|support_replies|season_invoices/);
    old.db.exec(before);
    for (const f of migrationFiles()) old.db.exec(readFileSync(f, "utf8"));
    for (const t of ["previews", "purchases", "subscriptions", "events", "gifts", "followups", "stories", "campaign_sends", "support_messages", "support_threads", "support_replies", "season_invoices"]) expect(cols(old, t)).toEqual(cols(fresh, t));
  });
});
