// Build 8, the creator and affiliate program (docs/automation-builds.md §8): applications, approval (Stripe promotion
// code on the coupon, free reading), attribution by code and by ?c= link, commission maths with tax and refunds, the hold
// window, payout batching and idempotency, the CREATORS kill switch and dry run, and Connect not being enabled.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new TextEncoder().encode("PNGDATA") }));
import { Harness, stripeEvent, type Call } from "./helpers/worker";
import { commissionCents, creatorsMode, payoutDecision, payoutDue, payoutPeriod, nextPayoutDate, normHandle, codeFor, connectUnavailable, availableAt } from "../src/creators";
import { buildKpiReport } from "../src/kpi";

const ADMIN = "admin_key_test_0123456789";
const AUTH = { authorization: `Bearer ${ADMIN}` };
const TOK = "tok_test_purchase_000000000000001";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const stripeErr = (message: string, status = 400) => json({ error: { type: "invalid_request_error", message } }, status);
const form = (c: Call) => Object.fromEntries(new URLSearchParams(c.body)) as Record<string, string>;
// 1 Dec 2026 09:00 Brisbane (UTC+10) = 30 Nov 23:00 UTC: the payout run's first hour
const PAYDAY = new Date("2026-11-30T23:00:00Z");

let h: Harness;
interface StubOpts { couponExists?: boolean; transfers?: "ok" | "connect" | "error"; capability?: string; accountCreate?: "ok" | "connect"; promoCreate?: "ok" | "exists-ours" | "exists-other"; sessionRejectsDiscount?: boolean }
function stub(o: StubOpts = {}) {
  const made = { coupons: [] as Record<string, string>[], promos: [] as Record<string, string>[], sessions: [] as Record<string, string>[], transfers: [] as Array<{ f: Record<string, string>; key: string }>, accounts: [] as Record<string, string>[], links: [] as Record<string, string>[], promoUpdates: [] as Array<[string, Record<string, string>]> };
  let n = 0;
  h.stripe = (c) => {
    const u = new URL(c.url), p = u.pathname;
    if (p.startsWith("/v1/coupons/") && c.method === "GET") return o.couponExists ? json({ id: p.split("/").pop(), percent_off: 10 }) : json({ error: { type: "invalid_request_error", code: "resource_missing", message: "No such coupon" } }, 404);
    if (p === "/v1/coupons" && c.method === "POST") { made.coupons.push(form(c)); return json({ id: form(c).id }); }
    if (p === "/v1/promotion_codes" && c.method === "POST") {
      made.promos.push(form(c));
      if (o.promoCreate === "exists-ours" || o.promoCreate === "exists-other") return stripeErr("A promotion code with this code already exists");
      return json({ id: `promo_${++n}`, code: form(c).code });
    }
    if (p === "/v1/promotion_codes" && c.method === "GET") return json({ object: "list", data: [{ id: "promo_existing", code: u.searchParams.get("code"), metadata: { creator_id: o.promoCreate === "exists-ours" ? "cr_new" : "cr_someone_else" } }], has_more: false });
    if (p.startsWith("/v1/promotion_codes/") && c.method === "POST") { made.promoUpdates.push([p.split("/").pop()!, form(c)]); return json({ id: p.split("/").pop() }); }
    if (p === "/v1/checkout/sessions" && c.method === "POST") {
      const f = form(c); made.sessions.push(f);
      if (o.sessionRejectsDiscount && f["discounts[0][promotion_code]"]) return stripeErr("This promotion code is inactive.");
      return json({ id: `cs_${made.sessions.length}`, url: `https://checkout.stripe.test/pay/cs_${made.sessions.length}` });
    }
    if (p === "/v1/accounts" && c.method === "POST") { made.accounts.push(form(c)); return o.accountCreate === "connect" ? stripeErr("You must sign up for Connect before you can create connected accounts.") : json({ id: "acct_new" }); }
    if (p.startsWith("/v1/accounts/") && c.method === "GET") return json({ id: p.split("/").pop(), capabilities: { transfers: o.capability ?? "active" } });
    if (p === "/v1/account_links" && c.method === "POST") { made.links.push(form(c)); return json({ url: "https://connect.stripe.test/setup/abc" }); }
    if (p === "/v1/transfers" && c.method === "POST") {
      made.transfers.push({ f: form(c), key: c.headers["idempotency-key"] ?? "" });
      if (o.transfers === "connect") return stripeErr("You can only create transfers if you've signed up for Connect.");
      if (o.transfers === "error") return stripeErr("Insufficient funds in Stripe account.");
      return json({ id: `tr_${made.transfers.length}`, amount: Number(form(c).amount) });
    }
    if (p === "/v1/refunds") return json({ id: "re_1" });
    return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
  };
  return made;
}

function seedCreator(o: { id?: string; handle?: string; status?: string; promo?: string | null; acct?: string | null; ready?: boolean; uncapped?: boolean; email?: string } = {}) {
  const id = o.id ?? "cr_test1", handle = o.handle ?? "ellduclos";
  h.db.prepare(`INSERT INTO creators (id, handle, email, created_at, status, approved_at, code, promo_code_id, token, connect_account_id, payouts_enabled, uncapped) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, handle, o.email ?? `${handle}@creator.test`, "2026-10-01T00:00:00Z", o.status ?? "active", "2026-10-01T00:00:00Z", codeFor(handle), o.promo === undefined ? `promo_${id}` : o.promo,
      `tok${id.replace(/[^a-z0-9]/g, "")}000000000000000000000`.slice(0, 32), o.acct === undefined ? `acct_${id}` : o.acct, o.ready === false ? 0 : 1, o.uncapped ? 1 : 0).runSync();
  return id;
}
const tokenOf = (id: string) => h.db.row("SELECT token FROM creators WHERE id=?", id)!.token as string;

/** A paid reading session (fulfilled through the webhook) with this creator's code or link. */
let seq = 0;
async function sale(o: { creator?: string; via?: "code" | "link"; amount?: number; tax?: number; email?: string; at?: string } = {}) {
  if (o.at) vi.setSystemTime(new Date(o.at));
  const i = ++seq, tok = `tok_test_purchase_${String(i).padStart(15, "0")}`, pi = `pi_sale_${i}`;
  h.seedPurchase({ id: tok, pi, email: o.email ?? `buyer${i}@example.com` });
  const creator = o.creator ?? "cr_test1";
  const amount = o.amount ?? 2610, tax = o.tax ?? 0;
  await h.webhook(stripeEvent("checkout.session.completed.payment", {
    id: `cs_seed_${tok}`, payment_intent: pi, amount_total: amount, customer_details: { email: o.email ?? `buyer${i}@example.com` },
    total_details: { amount_tax: tax }, automatic_tax: { enabled: tax > 0 },
    discounts: o.via === "link" ? [] : [{ coupon: "rite-creator-10", promotion_code: `promo_${creator}` }],
    metadata: { preview_id: "pv_test_0001", tier: "full", ...(o.via === "link" ? { creator } : {}) },
  }));
  return { tok, pi };
}
const refund = (pi: string, amount: number, refunded: number) => h.webhook(stripeEvent("charge.refunded", { payment_intent: pi, amount, amount_refunded: refunded, refunded: refunded >= amount }));
const ledger = (creator = "cr_test1") => h.db.rows("SELECT kind, amount_cents, available_at, payout_id FROM creator_ledger WHERE creator_id=? ORDER BY id", creator);
const owed = (creator = "cr_test1") => ledger(creator).reduce((a, r) => a + (r.amount_cents as number), 0);
const runPayouts = () => h.request("/admin/creators/payouts", { method: "POST", headers: AUTH });

beforeEach(() => {
  h = new Harness({ POSTHOG_KEY: undefined, ADMIN_KEY: ADMIN, CREATORS: "on", CREATOR_MIN_PAYOUT_CENTS: "500" } as never);
  vi.stubGlobal("fetch", h.fetch);
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-10T00:00:00Z"));
  seq = 0;
  h.seedPreview();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("the money rules", () => {
  it("commission is 30% of what was paid net of tax, rounded once, and follows refunds pro rata", () => {
    expect(commissionCents(2900, null, 0, 30)).toBe(870);
    expect(commissionCents(2610, 237, 0, 30)).toBe(712); // 30% × 2,373
    expect(commissionCents(2610, 237, 1305, 30)).toBe(356); // half refunded: half the net
    expect(commissionCents(2610, 237, 2610, 30)).toBe(0);
    expect(commissionCents(2610, 237, 9999, 30)).toBe(0); // never negative
    expect(commissionCents(0, 0, 0, 30)).toBe(0); // a $0 (100% code) sale earns nothing
    expect(commissionCents(4110, 0, 0, 30)).toBe(1233); // a reading with the order bump: the whole payment
  });
  it("CREATORS: only 'on' moves money; 'dry' dry-runs; anything else is off", () => {
    expect(creatorsMode({ CREATORS: "on" })).toBe("on");
    expect(creatorsMode({ CREATORS: " DRY " })).toBe("dry");
    expect(creatorsMode({ CREATORS: "dry-run" })).toBe("dry");
    for (const v of [undefined, "", "off", "yes", "true"]) expect(creatorsMode({ CREATORS: v })).toBe("off");
  });
  it("payout decisions, the run time (1st, 09:00 Brisbane) and the hold", () => {
    const base = { netCents: 3000, minCents: 2500, capCents: 50000, uncapped: false, status: "active", hasAccount: true };
    expect(payoutDecision(base)).toBe("pay");
    expect(payoutDecision({ ...base, netCents: 2499 })).toBe("below_min");
    expect(payoutDecision({ ...base, netCents: -300 })).toBe("nothing");
    expect(payoutDecision({ ...base, netCents: 60000 })).toBe("over_cap");
    expect(payoutDecision({ ...base, netCents: 60000, uncapped: true })).toBe("pay");
    expect(payoutDecision({ ...base, status: "paused" })).toBe("paused");
    expect(payoutDecision({ ...base, hasAccount: false })).toBe("no_account");
    expect(payoutDue(new Date("2026-11-30T22:59:00Z"))).toBe(false);
    expect(payoutDue(PAYDAY)).toBe(true);
    expect(payoutDue(new Date("2026-12-01T13:59:00Z"))).toBe(true); // 23:59 Brisbane, still the 1st
    expect(payoutDue(new Date("2026-12-01T14:00:00Z"))).toBe(false);
    expect(payoutPeriod(PAYDAY)).toBe("2026-12");
    expect(nextPayoutDate(new Date("2026-11-10T00:00:00Z"))).toBe("2026-12-01");
    expect(nextPayoutDate(new Date("2026-11-30T20:00:00Z"))).toBe("2026-12-01"); // 06:00 on the 1st, before the run
    expect(availableAt("2026-11-10T00:00:00.000Z", 15)).toBe("2026-11-25T00:00:00.000Z");
  });
  it("handles and codes", () => {
    expect(normHandle("@Ell.Duclos")).toBe("ell.duclos");
    expect(normHandle("_saturnsdaughter")).toBe("_saturnsdaughter");
    expect(normHandle("a")).toBeNull();
    expect(normHandle("bad handle")).toBeNull();
    expect(normHandle("..")).toBeNull();
    expect(codeFor("_saturnsdaughter")).toBe("RITE-SATURNSDAUGHTER");
    expect(connectUnavailable(new Error("You can only create transfers if you've signed up for Connect."))).toBe(true);
    expect(connectUnavailable(new Error("An error occurred with our connection to Stripe."))).toBe(false);
  });
});

describe("applying and approval", () => {
  it("GET /creators shows what creators get and the form; an application is stored as pending and emailed to Mick", async () => {
    const page = await (await h.request("/creators")).text();
    expect(page).toContain("30%");
    expect(page).toContain("10% off");
    expect(page).toContain('action="/creators/apply"');
    const r = await h.request("/creators/apply", { method: "POST", body: new URLSearchParams({ email: "Ell@Example.com", handle: "@EllDuclos", platform: "TikTok", profile_url: "https://www.tiktok.com/@ellduclos", country: "CA", audience: "17k" }) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/creators?ok=1#apply");
    const c = h.db.row("SELECT * FROM creators")!;
    expect(c).toMatchObject({ handle: "ellduclos", email: "ell@example.com", status: "pending", country: "CA", code: null });
    const m = h.emails().find((e) => e.subject.startsWith("Rite creator application"))!;
    expect(m.to).toEqual(["admin@rite.test"]);
    expect(m.text).toContain("RITE-ELLDUCLOS");
    expect(m.text).toContain("/admin/creators");
    expect(h.stripeCalls()).toHaveLength(0);
    // the same handle again is refused; the honeypot is accepted silently and stores nothing
    const dup = await h.request("/creators/apply", { method: "POST", body: new URLSearchParams({ email: "x@example.com", handle: "ellduclos" }) });
    expect(dup.status).toBe(400);
    expect(await dup.text()).toContain("already have an application");
    await h.request("/creators/apply", { method: "POST", body: new URLSearchParams({ email: "bot@example.com", handle: "spambot", website: "http://spam" }) });
    expect(h.db.rows("SELECT handle FROM creators").map((x) => x.handle)).toEqual(["ellduclos"]);
  });

  it("approve: ensures the 10% coupon, makes RITE-HANDLE as a promotion code on it, a free reading, and sends one welcome email", async () => {
    const made = stub();
    h.db.prepare("INSERT INTO creators (id, handle, email, created_at, status, token) VALUES ('cr_new','shay_cancer','shay@example.com','2026-11-01T00:00:00Z','pending','toknew000000000000000000000000000')").runSync();
    const r = await h.request("/admin/creators/cr_new/approve", { method: "POST", headers: AUTH, body: new URLSearchParams({}) });
    expect(r.status).toBe(303);
    expect(made.coupons).toEqual([expect.objectContaining({ id: "rite-creator-10", percent_off: "10", duration: "once" })]);
    expect(made.promos[0]).toMatchObject({ "promotion[type]": "coupon", "promotion[coupon]": "rite-creator-10", code: "RITE-SHAYCANCER", "metadata[creator_id]": "cr_new" });
    const c = h.db.row("SELECT * FROM creators WHERE id='cr_new'")!;
    expect(c).toMatchObject({ status: "active", code: "RITE-SHAYCANCER", promo_code_id: "promo_1" });
    const g = h.db.row("SELECT * FROM gifts WHERE code=?", c.gift_code)!;
    expect(g).toMatchObject({ amount_cents: 0, buyer_email: "shay@example.com", redeemed_at: null });
    const w = h.emails().filter((e) => e.subject === "Your Rite creator code: RITE-SHAYCANCER");
    expect(w).toHaveLength(1);
    expect(w[0].to).toEqual(["shay@example.com"]);
    for (const s of ["https://rite.test/?c=shay_cancer", `https://rite.test/gift/${c.gift_code}`, "https://rite.test/creators/d/toknew", "30%", "15 days"]) expect(w[0].text).toContain(s);
    // approving again changes nothing and emails nobody; the coupon is cached
    await h.request("/admin/creators/cr_new/approve", { method: "POST", headers: AUTH, body: new URLSearchParams({}) });
    expect(made.promos).toHaveLength(1);
    expect(h.emails().filter((e) => e.subject.startsWith("Your Rite creator code"))).toHaveLength(1);
    expect(h.db.rows("SELECT code FROM gifts")).toHaveLength(1);
  });

  it("approve reuses a promotion code Stripe already has for this creator, and refuses one that belongs to someone else", async () => {
    h.db.prepare("INSERT INTO creators (id, handle, email, created_at, status, token) VALUES ('cr_new','shay_cancer','shay@example.com','2026-11-01T00:00:00Z','pending','toknew000000000000000000000000000')").runSync();
    stub({ couponExists: true, promoCreate: "exists-other" });
    const bad = await h.request("/admin/creators/cr_new/approve", { method: "POST", headers: AUTH, body: new URLSearchParams({}) });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("Stripe refused RITE-SHAYCANCER");
    expect(h.db.row("SELECT status, code FROM creators WHERE id='cr_new'")).toEqual({ status: "pending", code: null });
    expect(h.emails().filter((e) => e.subject.startsWith("Your Rite creator code"))).toHaveLength(0);
    stub({ couponExists: true, promoCreate: "exists-ours" });
    await h.request("/admin/creators/cr_new/approve", { method: "POST", headers: AUTH, body: new URLSearchParams({}) });
    expect(h.db.row("SELECT status, promo_code_id FROM creators WHERE id='cr_new'")).toEqual({ status: "active", promo_code_id: "promo_existing" });
  });

  it("admin pages need the admin key; pause switches the Stripe code off", async () => {
    expect((await h.request("/admin/creators")).status).toBe(303); // to /admin/login
    seedCreator();
    const page = await (await h.request(`/admin/creators?key=${ADMIN}`)).text();
    expect(page).toContain("@ellduclos");
    expect(page).toContain("RITE-ELLDUCLOS");
    const made = stub();
    await h.request("/admin/creators/cr_test1/state", { method: "POST", headers: AUTH, body: new URLSearchParams({ do: "pause" }) });
    expect(made.promoUpdates).toEqual([["promo_cr_test1", { active: "false" }]]);
    expect(h.db.row("SELECT status FROM creators")!.status).toBe("paused");
  });
});

describe("attribution", () => {
  it("?c=<handle> sets the 30-day cookie and counts a click; checkout then pre-applies the creator's code and tags the session", async () => {
    seedCreator();
    const r = await h.request("/?c=EllDuclos");
    expect(r.headers.get("set-cookie")).toContain("rite_c=ellduclos; Path=/; Max-Age=2592000; Secure; SameSite=Lax");
    expect(h.events("creator_click")).toHaveLength(1);
    expect(await r.text()).toContain("c-ellduclos"); // the preview's ref
    expect((await h.request("/?c=nobody")).headers.get("set-cookie")).toBeNull();
    const made = stub();
    h.env.PRICE_BUMP_CENTS = "0";
    await h.request("/checkout", { method: "POST", headers: { cookie: "rite_c=ellduclos" }, body: new URLSearchParams({ preview: "pv_test_0001" }) });
    expect(made.sessions[0]).toMatchObject({ "discounts[0][promotion_code]": "promo_cr_test1", "metadata[creator]": "cr_test1" });
    expect(made.sessions[0].allow_promotion_codes).toBeUndefined();
    // no cookie: anyone's code can be typed, as before
    await h.request("/checkout", { method: "POST", body: new URLSearchParams({ preview: "pv_test_0001" }) });
    expect(made.sessions[1]).toMatchObject({ allow_promotion_codes: "true" });
    expect(made.sessions[1]["metadata[creator]"]).toBeUndefined();
    // a gift checkout follows the cookie too
    await h.request("/checkout", { method: "POST", headers: { cookie: "rite_c=ellduclos" }, body: new URLSearchParams({ gift: "1" }) });
    expect(made.sessions[2]).toMatchObject({ "metadata[gift]": "1", "discounts[0][promotion_code]": "promo_cr_test1" });
  });

  it("a paused creator's link sets nothing; if Stripe refuses the code at checkout the sale still goes through without it", async () => {
    seedCreator({ status: "paused" });
    expect((await h.request("/?c=ellduclos")).headers.get("set-cookie")).toBeNull();
    h.db.prepare("UPDATE creators SET status='active'").runSync();
    const made = stub({ sessionRejectsDiscount: true });
    h.env.PRICE_BUMP_CENTS = "0";
    const r = await h.request("/checkout", { method: "POST", headers: { cookie: "rite_c=ellduclos" }, body: new URLSearchParams({ preview: "pv_test_0001" }) });
    expect(r.status).toBe(303);
    expect(made.sessions).toHaveLength(2);
    expect(made.sessions[1]).toMatchObject({ allow_promotion_codes: "true", "metadata[creator]": "cr_test1" });
    expect(h.events("error").map((e) => e.detail.where)).toContain("creator-checkout");
  });

  it("a paid session with the creator's code records the sale and 30% of the net of tax, held 15 days; redelivery adds nothing", async () => {
    seedCreator();
    const { pi } = await sale({ amount: 2610, tax: 237 });
    expect(h.db.row("SELECT * FROM creator_sales")).toMatchObject({ payment_intent: pi, creator_id: "cr_test1", via: "code", amount_cents: 2610, tax_cents: 237, rate_pct: 30 });
    expect(ledger()).toEqual([{ kind: "commission", amount_cents: 712, available_at: "2026-11-25T00:00:00.000Z", payout_id: null }]);
    await h.webhook(stripeEvent("checkout.session.completed.payment", { id: `cs_seed_tok_test_purchase_000000000000001`, payment_intent: pi, amount_total: 2610, total_details: { amount_tax: 237 }, automatic_tax: { enabled: true }, discounts: [{ promotion_code: "promo_cr_test1" }] }));
    expect(ledger()).toHaveLength(1);
    expect(h.events("creator_sale")).toHaveLength(1);
  });

  it("the link alone (metadata.creator, no code) attributes too; the creator's own purchase earns nothing; an unknown code is ignored", async () => {
    seedCreator();
    await sale({ via: "link", amount: 2900 });
    expect(h.db.row("SELECT via FROM creator_sales")!.via).toBe("link");
    expect(owed()).toBe(870);
    await sale({ email: "ellduclos@creator.test" });
    expect(h.events("creator_self_purchase")).toHaveLength(1);
    await sale({ creator: "cr_unknown" });
    expect(h.db.rows("SELECT 1 FROM creator_sales")).toHaveLength(1);
  });

  it("gift checkouts are attributed through the gift row", async () => {
    seedCreator();
    await h.webhook(stripeEvent("checkout.session.completed.gift", { payment_intent: "pi_gift_c", amount_total: 2610, discounts: [{ promotion_code: "promo_cr_test1" }] }));
    const s = h.db.row("SELECT * FROM creator_sales")!;
    expect(s.gift_code).toBe(h.db.row("SELECT code FROM gifts")!.code);
    expect(owed()).toBe(783);
  });
});

describe("refunds", () => {
  it("a full refund before payout cancels the commission (it waits with it and nets to zero); an echo adds nothing", async () => {
    seedCreator();
    const { pi } = await sale({ amount: 2610, tax: 237 });
    vi.setSystemTime(new Date("2026-11-12T00:00:00Z"));
    await refund(pi, 2610, 2610);
    expect(ledger()).toEqual([
      { kind: "commission", amount_cents: 712, available_at: "2026-11-25T00:00:00.000Z", payout_id: null },
      { kind: "reversal", amount_cents: -712, available_at: "2026-11-25T00:00:00.000Z", payout_id: null },
    ]);
    await refund(pi, 2610, 2610);
    expect(ledger()).toHaveLength(2);
    expect(h.db.row("SELECT refunded_cents FROM creator_sales")!.refunded_cents).toBe(2610);
    vi.setSystemTime(PAYDAY);
    const made = stub();
    await runPayouts();
    expect(made.transfers).toHaveLength(0);
    expect(h.db.rows("SELECT * FROM creator_payouts")).toHaveLength(0);
  });

  it("a partial refund reverses its share (pro rata, net of tax), even though the reading itself ignores partial refunds", async () => {
    seedCreator();
    const { pi } = await sale({ amount: 2610, tax: 237 });
    await refund(pi, 2610, 1305);
    expect(ledger().map((r) => r.amount_cents)).toEqual([712, -356]);
    expect(h.db.row("SELECT status FROM purchases WHERE stripe_payment_intent=?", pi)!.status).toBe("generated");
    await refund(pi, 2610, 2610); // the rest, later: cumulative amount_refunded
    expect(ledger().map((r) => r.amount_cents)).toEqual([712, -356, -356]);
    expect(owed()).toBe(0);
  });

  it("POST /admin/refund reverses the commission itself (and the charge.refunded echo then adds nothing)", async () => {
    seedCreator();
    const { pi } = await sale({ amount: 2900, email: "refundme@example.com" });
    stub();
    await h.request("/admin/refund", { method: "POST", headers: { ...AUTH, "content-type": "application/json" }, body: JSON.stringify({ email: "refundme@example.com" }) });
    expect(owed()).toBe(0);
    await refund(pi, 2900, 2900);
    expect(ledger()).toHaveLength(2);
  });

  it("a refund after the payout is payable at once, so it comes off the next payout", async () => {
    seedCreator();
    const a = await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    vi.setSystemTime(PAYDAY);
    let made = stub();
    await runPayouts();
    expect(made.transfers.map((t) => t.f.amount)).toEqual(["870"]);
    vi.setSystemTime(new Date("2026-12-03T00:00:00Z"));
    await refund(a.pi, 2900, 2900);
    const rev = ledger().find((r) => r.kind === "reversal")!;
    expect(rev).toMatchObject({ amount_cents: -870, available_at: "2026-12-03T00:00:00.000Z", payout_id: null });
    await sale({ amount: 2900, at: "2026-12-05T00:00:00Z" });
    await sale({ amount: 2900 });
    await sale({ amount: 2900 });
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z")); // 1 Jan 09:00 Brisbane
    made = stub();
    await runPayouts();
    expect(made.transfers.map((t) => t.f.amount)).toEqual(["1740"]); // 3 × 870 − 870
  });
});

describe("hold window and payouts", () => {
  it("only commission past its 15-day hold is paid; the transfer has an idempotency key from the payout id; a second run pays nothing", async () => {
    seedCreator();
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" }); // available 16 Nov
    await sale({ amount: 2900, at: "2026-11-16T22:00:00Z" }); // available 1 Dec 22:00 UTC: after the run
    vi.setSystemTime(PAYDAY);
    const made = stub();
    await h.scheduled();
    expect(made.transfers).toHaveLength(1);
    expect(made.transfers[0].f).toMatchObject({ amount: "870", currency: "usd", destination: "acct_cr_test1", "metadata[payout_id]": "po_cr_test1_2026-12_usd", transfer_group: "rite-creators-2026-12" });
    expect(made.transfers[0].key).toBe("rite-po_cr_test1_2026-12_usd-a1");
    expect(h.db.row("SELECT * FROM creator_payouts")).toMatchObject({ id: "po_cr_test1_2026-12_usd", amount_cents: 870, status: "paid", transfer_id: "tr_1", period: "2026-12" });
    expect(ledger().map((r) => r.payout_id)).toEqual(["po_cr_test1_2026-12_usd", null]);
    // the next hourly run, and a forced run the same month, pay nothing more
    vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
    await h.scheduled();
    await runPayouts();
    expect(made.transfers).toHaveLength(1);
    expect(h.emails().filter((e) => e.subject.startsWith("Rite creator payouts 2026-12"))[0].text).toContain("@ellduclos: $8.70 paid (tr_1)");
  });

  it("nothing runs before the 1st at 09:00 Brisbane", async () => {
    seedCreator();
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    vi.setSystemTime(new Date("2026-11-30T22:00:00Z"));
    const made = stub();
    await h.scheduled();
    expect(made.transfers).toHaveLength(0);
    expect(h.events("creator_payout_run")).toHaveLength(0);
  });

  it("below the minimum carries over; over the cap waits for Mick; no account or unfinished onboarding is skipped; paused is held", async () => {
    h.env.CREATOR_MIN_PAYOUT_CENTS = "2500"; h.env.CREATOR_UNPAID_CAP_CENTS = "1500";
    seedCreator({ id: "cr_small", handle: "small" });
    seedCreator({ id: "cr_big", handle: "big" });
    seedCreator({ id: "cr_noacct", handle: "noacct", acct: null, ready: false, uncapped: true });
    seedCreator({ id: "cr_onb", handle: "onb", uncapped: true });
    seedCreator({ id: "cr_paused", handle: "paused", status: "paused", uncapped: true });
    vi.setSystemTime(new Date("2026-11-01T00:00:00Z"));
    await sale({ creator: "cr_small", amount: 2900 });
    for (const c of ["cr_big", "cr_noacct", "cr_onb", "cr_paused"]) for (let i = 0; i < 3; i++) await sale({ creator: c, amount: 2900 });
    // the cap email went to Mick once, for the capped creator over it
    const capMail = h.emails().filter((e) => e.subject.includes("passed the $15.00 unpaid cap"));
    expect(capMail.map((m) => m.subject)).toEqual(["Rite creator @big passed the $15.00 unpaid cap"]);
    vi.setSystemTime(PAYDAY);
    // onb's account can't take transfers yet
    const made = stub();
    h.stripe = ((orig) => (c: Call) => (c.url.endsWith("/v1/accounts/acct_cr_onb") ? json({ id: "acct_cr_onb", capabilities: { transfers: "inactive" } }) : orig(c)))(h.stripe);
    await runPayouts();
    expect(made.transfers).toHaveLength(0);
    const text = h.emails().find((e) => e.subject.startsWith("Rite creator payouts 2026-12"))!.text;
    expect(text).toContain("@small: $8.70 below the minimum");
    expect(text).toContain("@big: $26.10 over the unpaid cap");
    expect(text).toContain("@noacct: $26.10 no Stripe account yet");
    expect(text).toContain("@onb: $26.10 Stripe onboarding not finished");
    expect(text).toContain("@paused: $26.10 paused");
    expect(h.db.row("SELECT payouts_enabled FROM creators WHERE id='cr_onb'")!.payouts_enabled).toBe(0);
    // Mick lifts big's cap; the next forced run pays it
    await h.request("/admin/creators/cr_big/state", { method: "POST", headers: AUTH, body: new URLSearchParams({ do: "uncap" }) });
    await runPayouts();
    expect(made.transfers.map((t) => [t.f.destination, t.f.amount])).toEqual([["acct_cr_big", "2610"]]);
  });

  it("a failed transfer releases its rows (nothing marked paid); a retry gets a new idempotency key; a stuck pending payout is retried with its own key", async () => {
    seedCreator();
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    vi.setSystemTime(PAYDAY);
    let made = stub({ transfers: "error" });
    await h.scheduled();
    expect(made.transfers).toHaveLength(1);
    expect(h.db.row("SELECT status, error FROM creator_payouts")).toMatchObject({ status: "failed", error: expect.stringContaining("Insufficient funds") });
    expect(ledger()[0].payout_id).toBeNull();
    expect(h.events("error").map((e) => e.detail.where)).toContain("creator-transfer");
    // the hourly cron doesn't retry a failure on its own; Mick's "Run payouts now" does, with attempt 2
    vi.setSystemTime(new Date("2026-12-01T01:00:00Z"));
    await h.scheduled();
    expect(made.transfers).toHaveLength(1);
    made = stub();
    await runPayouts();
    expect(made.transfers.map((t) => t.key)).toEqual(["rite-po_cr_test1_2026-12_usd-a2"]);
    expect(h.db.row("SELECT status, attempts FROM creator_payouts")).toEqual({ status: "paid", attempts: 2 });

    // a run that died between claiming and Stripe's answer: the pending row is retried with the same key and amount
    seedCreator({ id: "cr_two", handle: "two" });
    h.db.prepare("INSERT INTO creator_ledger (creator_id, payment_intent, kind, amount_cents, currency, created_at, available_at, payout_id) VALUES ('cr_two','pi_x','commission',900,'usd','2026-11-01','2026-11-16','po_cr_two_2026-12_usd')").runSync();
    h.db.prepare("INSERT INTO creator_payouts (id, creator_id, period, currency, amount_cents, status, attempts, created_at) VALUES ('po_cr_two_2026-12_usd','cr_two','2026-12','usd',900,'pending',1,'2026-11-30T23:00:00Z')").runSync();
    made = stub();
    await runPayouts();
    expect(made.transfers.map((t) => [t.key, t.f.amount])).toEqual([["rite-po_cr_two_2026-12_usd-a1", "900"]]);
    expect(h.db.row("SELECT status FROM creator_payouts WHERE id='po_cr_two_2026-12_usd'")!.status).toBe("paid");
  });
});

describe("kill switch and dry run", () => {
  it("CREATORS=off: sales are still recorded, but the 1st moves no money and calls no Stripe", async () => {
    h.env.CREATORS = "off";
    seedCreator();
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    expect(owed()).toBe(870);
    vi.setSystemTime(PAYDAY);
    const made = stub();
    h.clearCalls();
    await h.scheduled();
    expect(h.stripeCalls()).toHaveLength(0);
    expect(made.transfers).toHaveLength(0);
    expect(h.db.rows("SELECT * FROM creator_payouts")).toHaveLength(0);
    const r = await runPayouts();
    expect(r.headers.get("location")).toBe("/admin/creators?f=off");
    expect(h.stripeCalls()).toHaveLength(0);
  });

  it("CREATORS=dry: emails Mick what would be paid, once a month, with no Stripe call and nothing assigned", async () => {
    h.env.CREATORS = "dry";
    seedCreator();
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    vi.setSystemTime(PAYDAY);
    stub();
    h.clearCalls();
    await h.scheduled();
    expect(h.stripeCalls()).toHaveLength(0);
    const m = h.emails().filter((e) => e.subject.startsWith("Rite creator payouts 2026-12 (dry run"));
    expect(m).toHaveLength(1);
    expect(m[0].text).toContain("@ellduclos: $8.70 would be paid");
    expect(ledger()[0].payout_id).toBeNull();
    expect(h.db.rows("SELECT * FROM creator_payouts")).toHaveLength(0);
    vi.setSystemTime(new Date("2026-12-01T01:00:00Z"));
    await h.scheduled();
    expect(h.emails().filter((e) => e.subject.startsWith("Rite creator payouts"))).toHaveLength(1);
  });
});

describe("Stripe Connect", () => {
  it("onboarding: POST makes the Express account once and sends the creator to Stripe; the return refreshes their status", async () => {
    seedCreator({ acct: null, ready: false });
    const tok = tokenOf("cr_test1");
    const made = stub({ capability: "active" });
    const r = await h.request(`/creators/d/${tok}/connect`, { method: "POST" });
    expect(r.headers.get("location")).toBe("https://connect.stripe.test/setup/abc");
    expect(made.accounts[0]).toMatchObject({ type: "express", email: "ellduclos@creator.test", "capabilities[transfers][requested]": "true", "metadata[creator_id]": "cr_test1" });
    expect(made.links[0]).toMatchObject({ account: "acct_new", type: "account_onboarding", return_url: `https://rite.test/creators/d/${tok}?connect=done` });
    await h.request(`/creators/d/${tok}/connect`, { method: "POST" });
    expect(made.accounts).toHaveLength(1);
    const page = await (await h.request(`/creators/d/${tok}?connect=done`)).text();
    expect(page).toContain("Payouts are set up");
    expect(h.db.row("SELECT payouts_enabled FROM creators")!.payouts_enabled).toBe(1);
  });

  it("Connect not enabled: onboarding says so politely, nothing is stored, and the KPI email reports it", async () => {
    seedCreator({ acct: null, ready: false });
    const tok = tokenOf("cr_test1");
    stub({ accountCreate: "connect" });
    const r = await h.request(`/creators/d/${tok}/connect`, { method: "POST" });
    expect(r.headers.get("location")).toBe(`/creators/d/${tok}?connect=unavailable`);
    expect(h.db.row("SELECT connect_account_id FROM creators")!.connect_account_id).toBeNull();
    expect(h.events("creator_connect_unavailable")).toHaveLength(1);
    expect(await (await h.request(`/creators/d/${tok}?connect=unavailable`)).text()).toContain("Payout setup isn't open yet");
    const k = await buildKpiReport(h.db as unknown as D1Database, new Date("2026-11-16T00:00:00Z"), { creatorsMode: "on" });
    expect(k.text).toContain("Stripe Connect: NOT available on the account (1 refusal this week). No money moved");
  });

  it("Connect not enabled at payout time: the transfer is refused, the run stops, rows are released and no payout is marked paid", async () => {
    seedCreator({ id: "cr_a", handle: "a1" });
    seedCreator({ id: "cr_b", handle: "b1" });
    await sale({ creator: "cr_a", amount: 2900, at: "2026-11-01T00:00:00Z" });
    await sale({ creator: "cr_b", amount: 2900 });
    vi.setSystemTime(PAYDAY);
    const made = stub({ transfers: "connect" });
    await h.scheduled();
    expect(made.transfers).toHaveLength(1); // stopped after the first refusal
    expect(h.db.rows("SELECT status FROM creator_payouts").map((r) => r.status)).toEqual(["failed"]);
    expect(h.db.rows("SELECT payout_id FROM creator_ledger").every((r) => r.payout_id === null)).toBe(true);
    expect(h.events("creator_connect_unavailable")).toHaveLength(1);
    const m = h.emails().find((e) => e.subject.startsWith("Rite creator payouts 2026-12"))!;
    expect(m.subject).toContain("STRIPE CONNECT NOT AVAILABLE");
    expect(m.text).toContain("no money moved");
    const admin = await (await h.request(`/admin/creators?key=${ADMIN}`)).text();
    expect(admin).toContain("Stripe said Connect isn"); // the apostrophe is HTML-escaped
  });
});

describe("dashboard and the KPI email", () => {
  it("the dashboard shows the code, link, clicks, held / payable / paid; a pending creator's link is a 404", async () => {
    seedCreator();
    await h.request("/?c=ellduclos");
    await sale({ amount: 2900, at: "2026-11-01T00:00:00Z" });
    await sale({ amount: 2900, at: "2026-11-20T00:00:00Z" });
    vi.setSystemTime(new Date("2026-11-21T00:00:00Z"));
    const r = await h.request(`/creators/d/${tokenOf("cr_test1")}`);
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    const page = await r.text();
    for (const s of ["RITE-ELLDUCLOS", "https://rite.test/?c=ellduclos", "$8.70</b><span>commission waiting", "$8.70</b><span>ready for the next payout", "<b>2</b><span>sales through you", "<b>1</b><span>link clicks"]) expect(page).toContain(s);
    h.db.prepare("INSERT INTO creators (id, handle, email, created_at, status, token) VALUES ('cr_p','pend','p@example.com','2026-11-01','pending','tokpending00000000000000000000000')").runSync();
    expect((await h.request("/creators/d/tokpending00000000000000000000000")).status).toBe(404);
  });

  it("Monday's KPI email has creator sales and commission lines, and none at all before there are creators", async () => {
    const empty = await buildKpiReport(h.db as unknown as D1Database, new Date("2026-11-16T00:00:00Z"));
    expect(empty.text).not.toContain("CREATORS");
    seedCreator();
    h.db.prepare("INSERT INTO creators (id, handle, email, created_at, status, token) VALUES ('cr_p','pend','p@example.com','2026-11-01','pending','tokpending00000000000000000000000')").runSync();
    const { pi } = await sale({ amount: 2610, tax: 237, at: "2026-11-10T00:00:00Z" });
    await sale({ amount: 2900, at: "2026-11-11T00:00:00Z" });
    await refund(pi, 2610, 2610);
    const k = await buildKpiReport(h.db as unknown as D1Database, new Date("2026-11-15T21:00:00Z"), { creatorsMode: "dry" }); // Mon 16 Nov 07:00 Brisbane
    expect(k.text).toContain("Creators: 1 active, 1 application waiting · payouts dry run (CREATORS)");
    expect(k.text).toContain("Creator sales: 2 ($53 net of tax, before refunds) vs 0 ($0) (new)");
    expect(k.text).toContain("Commission: $16 earned, $7 reversed by refunds");
  });
});
