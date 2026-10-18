// Creator and affiliate program (docs/automation-builds.md §8): applications, approval (code, coupon, free reading),
// attribution of sales, the commission ledger and its refund reversals, Stripe Connect Express onboarding, and the monthly
// payout run. The pure rules are in creators.ts; index.ts wires the routes, checkout, webhook and cron to these.
import Stripe from "stripe";
import type { Env } from "./index";
import { sendEmail } from "./email";
import {
  creatorsMode, commissionPct, discountPct, holdDays, minPayoutCents, unpaidCapCents, commissionCents, availableAt, payoutDecision,
  payoutPeriod, payoutDue, nextPayoutDate, payoutKey, payoutId, connectUnavailable, normHandle, normCode, codeFor, couponId, SKIP_LABEL,
  type PayoutSkip, type CreatorsMode,
} from "./creators";

export type LogFn = (env: Env, kind: string, ref?: string | null, detail?: unknown) => Promise<void>;

export interface CreatorRow {
  id: string; handle: string; email: string; name: string | null; platform: string | null; profile_url: string | null; audience: string | null; note: string | null;
  country: string | null; created_at: string; status: string; approved_at: string | null; code: string | null; promo_code_id: string | null; gift_code: string | null;
  token: string; connect_account_id: string | null; payouts_enabled: number; uncapped: number; cap_notified_at: string | null;
}

const stripe = (env: Env) => new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const now = () => new Date().toISOString();
const rand = (n: number) => { const b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, n); };
const money = (cents: number, cur = "usd") => `${cur.toLowerCase() === "usd" ? "$" : `${cur.toUpperCase()} `}${(cents / 100).toFixed(2)}`;
const giftCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.getRandomValues(new Uint8Array(8)); return Array.from(b, (x) => A[x % A.length]).join(""); };
const adminTo = (env: Env) => env.ADMIN_EMAIL || env.SUPPORT_EMAIL;
const errText = (e: unknown) => String((e as { message?: string })?.message ?? e).slice(0, 300);

export const creatorById = (db: D1Database, id: string) => db.prepare("SELECT * FROM creators WHERE id=?").bind(id).first<CreatorRow>();
export const creatorByToken = (db: D1Database, tok: string) => (/^[a-z0-9]{20,64}$/.test(tok) ? db.prepare("SELECT * FROM creators WHERE token=?").bind(tok).first<CreatorRow>() : Promise.resolve(null));
/** The creator behind a `?c=` link or the cookie it set: active creators only, so a paused or rejected link attributes nothing. */
export async function activeCreatorByHandle(db: D1Database, raw: string | null | undefined): Promise<CreatorRow | null> {
  const h = raw ? normHandle(raw) : null;
  if (!h) return null;
  try { return await db.prepare("SELECT * FROM creators WHERE handle=? AND status='active'").bind(h).first<CreatorRow>(); }
  catch { return null; } // before migration 008 there is no creators table: no attribution, nothing breaks
}

// ---------- applications ----------
export interface Application { email: string; handle: string; name?: string; platform?: string; profile_url?: string; audience?: string; note?: string; country?: string }
export const COUNTRIES = [["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"], ["NZ", "New Zealand"], ["IE", "Ireland"], ["DE", "Germany"], ["FR", "France"], ["NL", "Netherlands"], ["", "Somewhere else"]] as const;
export const PLATFORMS = ["TikTok", "Instagram", "YouTube", "Substack / newsletter", "Podcast", "Other"] as const;

/** Store an application (status pending) and email Mick. Returns the row, or an error to show on the form. */
export async function applyCreator(env: Env, a: Application, log: LogFn): Promise<{ ok: true; creator: CreatorRow } | { ok: false; error: string }> {
  const email = a.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 200) return { ok: false, error: "Enter the email you'd like us to use." };
  const handle = normHandle(a.handle);
  if (!handle) return { ok: false, error: "Your handle: letters, numbers, dots or underscores, 2 to 30 of them." };
  const clip = (s: string | undefined, n: number) => (s ?? "").trim().slice(0, n) || null;
  const country = /^[A-Z]{2}$/.test((a.country ?? "").trim().toUpperCase()) ? a.country!.trim().toUpperCase() : null;
  const url = clip(a.profile_url, 300);
  if (url && !/^https?:\/\/\S+$/i.test(url)) return { ok: false, error: "The profile link should start with https://" };
  const taken = await env.DB.prepare("SELECT 1 FROM creators WHERE handle=?").bind(handle).first();
  if (taken) return { ok: false, error: "We already have an application for that handle. Reply to any Rite email if it's yours and you haven't heard back." };
  const row = { id: `cr_${rand(12)}`, token: rand(32) };
  await env.DB.prepare(`INSERT INTO creators (id, handle, email, name, platform, profile_url, audience, note, country, created_at, status, token) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?)`)
    .bind(row.id, handle, email, clip(a.name, 80), clip(a.platform, 40), url, clip(a.audience, 40), clip(a.note, 1000), country, now(), row.token).run();
  await log(env, "creator_applied", row.id, { handle, platform: clip(a.platform, 40) });
  const c = (await creatorById(env.DB, row.id))!;
  const ok = await sendEmail(env, adminTo(env), `Rite creator application: @${handle}${c.platform ? ` (${c.platform})` : ""}`,
`@${handle} applied to the creator program.

Name: ${c.name ?? "(none)"}
Email: ${email}
Platform: ${c.platform ?? "(none)"}
Profile: ${c.profile_url ?? "(none)"}
Audience: ${c.audience ?? "(not given)"}
Country: ${c.country ?? "(not given)"}
Note: ${c.note ?? "(none)"}

Check the profile, then approve (makes ${codeFor(handle)}, their free reading and emails them) or reject:
${env.SITE_URL}/admin/creators`);
  if (!ok) await log(env, "error", row.id, { where: "creator-apply-email" });
  return { ok: true, creator: c };
}

// ---------- approval ----------
/** The 10%-off coupon behind every creator code: found by its fixed id, created once if missing. duration once (Season too). */
async function ensureCoupon(env: Env): Promise<string> {
  const pct = discountPct(env), id = couponId(pct);
  const kv = `stripe:coupon:${id}`;
  if (await env.CACHE.get(kv)) return id;
  const s = stripe(env);
  try { await s.coupons.retrieve(id); }
  catch (e) {
    if ((e as { statusCode?: number }).statusCode !== 404) throw e;
    await s.coupons.create({ id, percent_off: pct, duration: "once", name: `Rite creator code (${pct}% off)`, metadata: { rite: "creator" } });
  }
  await env.CACHE.put(kv, "1");
  return id;
}

/**
 * Approve a pending (or re-run a half-finished) creator: the Stripe promotion code (RITE-HANDLE, or `codeOverride`) on the
 * coupon, a free-reading gift code, status active, and the welcome email. Each step is skipped when already done, so
 * pressing Approve again after a Stripe error carries on where it stopped.
 */
export async function approveCreator(env: Env, id: string, codeOverride: string | null, log: LogFn): Promise<{ ok: boolean; error?: string }> {
  const c = await creatorById(env.DB, id);
  if (!c) return { ok: false, error: "No such creator." };
  if (c.status === "rejected") return { ok: false, error: "That application was rejected; it can't be approved." };
  let code = c.code, promo = c.promo_code_id;
  try {
    if (!promo) {
      code = codeOverride ? normCode(codeOverride) : codeFor(c.handle);
      if (!code) return { ok: false, error: "A code is letters, digits and dashes, 4 to 40 long." };
      if (await env.DB.prepare("SELECT 1 FROM creators WHERE code=? AND id != ?").bind(code, id).first()) return { ok: false, error: `${code} belongs to another creator. Pick a different code.` };
      const coupon = await ensureCoupon(env);
      const s = stripe(env);
      try {
        promo = (await s.promotionCodes.create({ promotion: { type: "coupon", coupon }, code, metadata: { creator_id: id, handle: c.handle } }, { idempotencyKey: `rite-promo-${id}-${code}` })).id;
      } catch (e) {
        // the code already exists in Stripe: reuse it only if it was made for this creator (a retry after a lost response)
        const found = await s.promotionCodes.list({ code, limit: 1 });
        const p = found.data[0];
        if (!p || p.metadata?.creator_id !== id) return { ok: false, error: `Stripe refused ${code}: ${errText(e)}` };
        promo = p.id;
      }
      await env.DB.prepare("UPDATE creators SET code=?, promo_code_id=? WHERE id=?").bind(code, promo, id).run();
    }
  } catch (e) {
    await log(env, "error", id, { where: "creator-approve", e: errText(e) });
    return { ok: false, error: `Stripe call failed, nothing was emailed: ${errText(e)}` };
  }
  let gift = c.gift_code;
  if (!gift) {
    gift = giftCode();
    await env.DB.prepare("INSERT INTO gifts (code, created_at, buyer_email, buyer_name, message, amount_cents) VALUES (?,?,?,?,?,0)").bind(gift, now(), c.email, "Rite", "Your own reading, from Rite. Post about it or don't.").run();
    await env.DB.prepare("UPDATE creators SET gift_code=? WHERE id=?").bind(gift, id).run();
  }
  const first = c.status !== "active" && !c.approved_at;
  await env.DB.prepare("UPDATE creators SET status='active', approved_at=COALESCE(approved_at, ?) WHERE id=?").bind(now(), id).run();
  await log(env, "creator_approved", id, { handle: c.handle, code });
  if (first) {
    const m = welcomeEmail(env, { ...c, code, gift_code: gift });
    const ok = await sendEmail(env, c.email, m.subject, m.text);
    await log(env, ok ? "emailed" : "error", id, ok ? { creator: "welcome" } : { where: "creator-welcome-email" });
  }
  return { ok: true };
}

export function welcomeEmail(env: Env, c: Pick<CreatorRow, "handle" | "name" | "code" | "gift_code" | "token">) {
  const pct = commissionPct(env), off = discountPct(env), hold = holdDays(env), min = minPayoutCents(env);
  return {
    subject: `Your Rite creator code: ${c.code}`,
    text: `Hi ${c.name?.split(" ")[0] || `@${c.handle}`},

You're in. Everything in one place:

Your code: ${c.code}
It takes ${off}% off a reading or a gift for anyone who uses it at checkout.

Your link: ${env.SITE_URL}/?c=${c.handle}
It applies your code by itself and remembers the person for 30 days.

You get ${pct}% of what every sale through your code or link actually pays (after tax, and less any refund). It's paid on the 1st of each month, straight to your bank through Stripe.

Your own reading, free: ${env.SITE_URL}/gift/${c.gift_code}
Open it with your birth details. Post about it or don't; there's no script and no deadline.

Your dashboard (clicks, sales, commission, payouts; keep this link to yourself):
${env.SITE_URL}/creators/d/${c.token}

Set up payouts from the dashboard once: Stripe asks for your identity and bank details. Commission waits ${hold} days (past our 14-day refund window), then goes out on the next 1st once you're owed ${money(min)} or more.

Mick, Rite`,
  };
}

/** Admin actions on a creator other than approve. pause/resume also switch the Stripe promotion code off and on. */
export type CreatorAction = "pause" | "resume" | "uncap" | "reject";
export const CREATOR_ACTIONS: CreatorAction[] = ["pause", "resume", "uncap", "reject"];
export async function changeCreator(env: Env, id: string, a: CreatorAction, log: LogFn): Promise<{ ok: boolean; error?: string }> {
  const c = await creatorById(env.DB, id);
  if (!c) return { ok: false, error: "No such creator." };
  try {
    if (a === "reject") {
      if (c.status !== "pending") return { ok: false, error: "Only a pending application can be rejected; pause an approved creator instead." };
      await env.DB.prepare("UPDATE creators SET status='rejected' WHERE id=?").bind(id).run();
    } else if (a === "uncap") {
      await env.DB.prepare("UPDATE creators SET uncapped=1 WHERE id=?").bind(id).run();
    } else {
      const want = a === "resume";
      if (want && c.status !== "paused") return { ok: false, error: "Only a paused creator can be resumed." };
      if (!want && c.status !== "active") return { ok: false, error: "Only an active creator can be paused." };
      if (c.promo_code_id) await stripe(env).promotionCodes.update(c.promo_code_id, { active: want });
      await env.DB.prepare("UPDATE creators SET status=? WHERE id=?").bind(want ? "active" : "paused", id).run();
    }
  } catch (e) {
    await log(env, "error", id, { where: `creator-${a}`, e: errText(e) });
    return { ok: false, error: `Stripe call failed, nothing changed: ${errText(e)}` };
  }
  await log(env, `creator_${a}`, id, { handle: c.handle });
  return { ok: true };
}

// ---------- attribution and the ledger ----------
export interface SaleInput {
  paymentIntent: string | null; amountCents: number; taxCents: number | null; currency: string; buyerEmail: string;
  /** Promotion code ids on the Checkout Session (session.discounts). */
  promoCodeIds: string[];
  /** metadata.creator: the creator whose link cookie was on the browser at checkout. */
  linkCreatorId: string | null;
  purchaseId?: string | null; giftCode?: string | null;
}

/**
 * Attribute one paid Checkout Session to a creator and record their commission. The creator's promotion code on the session
 * wins; otherwise the link cookie (metadata.creator). Idempotent on the payment intent (Stripe redelivery, /thanks and
 * /admin/fulfil all call it). Never throws: an error is logged and the sale simply isn't attributed.
 */
export async function attributeSale(env: Env, s: SaleInput, log: LogFn): Promise<string | null> {
  if (!s.paymentIntent || s.amountCents <= 0 || (!s.promoCodeIds.length && !s.linkCreatorId)) return null;
  try {
    let c: CreatorRow | null = null;
    for (const p of s.promoCodeIds) { c = await env.DB.prepare("SELECT * FROM creators WHERE promo_code_id=?").bind(p).first<CreatorRow>(); if (c) break; }
    if (!c && s.linkCreatorId) c = await creatorById(env.DB, s.linkCreatorId);
    if (!c || (c.status !== "active" && c.status !== "paused")) return null;
    const via = s.linkCreatorId === c.id ? "link" : "code";
    if (s.buyerEmail && s.buyerEmail.trim().toLowerCase() === c.email.toLowerCase()) { await log(env, "creator_self_purchase", c.id, { pi: s.paymentIntent }); return null; }
    const rate = commissionPct(env), at = now(), cur = (s.currency || env.CURRENCY).toLowerCase(), tax = s.taxCents ?? 0;
    const ins = await env.DB.prepare(`INSERT OR IGNORE INTO creator_sales (payment_intent, creator_id, purchase_id, gift_code, created_at, via, currency, amount_cents, tax_cents, rate_pct) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(s.paymentIntent, c.id, s.purchaseId ?? null, s.giftCode ?? null, at, via, cur, s.amountCents, tax, rate).run();
    if (!ins.meta.changes) return c.id; // already attributed
    const commission = commissionCents(s.amountCents, tax, 0, rate);
    if (commission > 0) await env.DB.prepare("INSERT INTO creator_ledger (creator_id, payment_intent, kind, amount_cents, currency, created_at, available_at) VALUES (?,?,'commission',?,?,?,?)")
      .bind(c.id, s.paymentIntent, commission, cur, at, availableAt(at, holdDays(env))).run();
    await log(env, "creator_sale", c.id, { via, amount: s.amountCents, tax, commission, ref: s.purchaseId ?? s.giftCode ?? null });
    await capCheck(env, c, log);
    return c.id;
  } catch (e) {
    if (/no such table/i.test(String(e))) return null; // before migration 008
    await log(env, "error", s.purchaseId ?? s.giftCode ?? null, { where: "creator-attribution", e: errText(e) });
    return null;
  }
}

/** Once a capped creator's unpaid commission passes the cap, tell Mick (once) with their handle and sales to date. */
async function capCheck(env: Env, c: CreatorRow, log: LogFn) {
  if (c.uncapped || c.cap_notified_at) return;
  const cap = unpaidCapCents(env);
  const u = await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM creator_ledger WHERE creator_id=? AND payout_id IS NULL").bind(c.id).first<{ n: number }>();
  if ((u?.n ?? 0) <= cap) return;
  const claim = await env.DB.prepare("UPDATE creators SET cap_notified_at=? WHERE id=? AND cap_notified_at IS NULL").bind(now(), c.id).run();
  if (!claim.meta.changes) return;
  const st = await env.DB.prepare("SELECT COUNT(*) n, COALESCE(SUM(amount_cents - refunded_cents),0) gross FROM creator_sales WHERE creator_id=?").bind(c.id).first<{ n: number; gross: number }>();
  await sendEmail(env, adminTo(env), `Rite creator @${c.handle} passed the ${money(cap)} unpaid cap`,
`@${c.handle} (${c.email}) is owed more than ${money(cap)} in unpaid commission: ${money(u?.n ?? 0)}.

Sales to date: ${st?.n ?? 0}, ${money(st?.gross ?? 0)} paid by buyers (tax included, less refunds).

Their payouts are held until you lift the cap. If the sales look real (not a leaked code on a coupon site), press "Lift cap" at:
${env.SITE_URL}/admin/creators`);
  await log(env, "creator_cap", c.id, { unpaid: u?.n ?? 0, cap });
}

/**
 * A refund on an attributed payment (full or partial; `refundedCents` is Stripe's cumulative amount_refunded). The
 * commission becomes rate × the unrefunded share of the net, and the difference goes in as a reversal row. Idempotent: the
 * reversal is computed against the ledger in one statement, so a redelivered or duplicate refund event adds nothing. A
 * reversal of a commission still in its hold waits with it (so the two net to zero in the same payout); one after a payout
 * is payable at once, so it comes off the next payout.
 */
export async function reverseCommission(env: Env, pi: string | null | undefined, refundedCents: number, log: LogFn): Promise<number> {
  if (!pi) return 0;
  try {
    const sale = await env.DB.prepare("SELECT * FROM creator_sales WHERE payment_intent=?").bind(pi).first<{ creator_id: string; amount_cents: number; tax_cents: number; refunded_cents: number; rate_pct: number; currency: string }>();
    if (!sale) return 0;
    const refunded = Math.min(sale.amount_cents, Math.max(sale.refunded_cents, Math.round(refundedCents)));
    if (refunded !== sale.refunded_cents) await env.DB.prepare("UPDATE creator_sales SET refunded_cents=? WHERE payment_intent=? AND refunded_cents < ?").bind(refunded, pi, refunded).run();
    const target = commissionCents(sale.amount_cents, sale.tax_cents, refunded, sale.rate_pct);
    const orig = await env.DB.prepare("SELECT available_at, payout_id FROM creator_ledger WHERE payment_intent=? AND kind='commission' ORDER BY id LIMIT 1").bind(pi).first<{ available_at: string; payout_id: string | null }>();
    const at = now();
    const avail = orig && !orig.payout_id && orig.available_at > at ? orig.available_at : at;
    const r = await env.DB.prepare(`INSERT INTO creator_ledger (creator_id, payment_intent, kind, amount_cents, currency, created_at, available_at)
      SELECT ?, ?, 'reversal', ? - COALESCE(SUM(amount_cents),0), ?, ?, ? FROM creator_ledger WHERE payment_intent=? HAVING ? - COALESCE(SUM(amount_cents),0) < 0`)
      .bind(sale.creator_id, pi, target, sale.currency, at, avail, pi, target).run();
    if (!r.meta.changes) return 0;
    const row = await env.DB.prepare("SELECT amount_cents FROM creator_ledger WHERE id=?").bind(r.meta.last_row_id).first<{ amount_cents: number }>();
    await log(env, "creator_reversal", sale.creator_id, { pi, refunded, amount: row?.amount_cents ?? null, after_payout: !!orig?.payout_id });
    return row?.amount_cents ?? 0;
  } catch (e) {
    if (/no such table/i.test(String(e))) return 0; // before migration 008
    await log(env, "error", pi, { where: "creator-reversal", e: errText(e) });
    return 0;
  }
}

// ---------- Stripe Connect Express ----------
/** Create the creator's Express account (once) and an onboarding link. Connect not enabled → a logged, friendly error. */
export async function connectLink(env: Env, c: CreatorRow, log: LogFn, create: boolean): Promise<{ url: string } | { error: string }> {
  const s = stripe(env);
  try {
    let acct = c.connect_account_id;
    if (!acct) {
      if (!create) return { error: "none" };
      const a = await s.accounts.create({ type: "express", email: c.email, ...(c.country ? { country: c.country } : {}), capabilities: { transfers: { requested: true } },
        business_type: "individual", metadata: { creator_id: c.id, handle: c.handle } }, { idempotencyKey: `rite-connect-${c.id}` });
      acct = a.id;
      await env.DB.prepare("UPDATE creators SET connect_account_id=? WHERE id=? AND connect_account_id IS NULL").bind(acct, c.id).run();
      await log(env, "creator_connect_created", c.id, { account: acct });
    }
    const link = await s.accountLinks.create({ account: acct, type: "account_onboarding", refresh_url: `${env.SITE_URL}/creators/d/${c.token}/connect`, return_url: `${env.SITE_URL}/creators/d/${c.token}?connect=done` });
    return { url: link.url };
  } catch (e) {
    const unavailable = connectUnavailable(e);
    await log(env, unavailable ? "creator_connect_unavailable" : "error", c.id, { where: "creator-connect", e: errText(e) });
    return { error: unavailable ? "unavailable" : "failed" };
  }
}

/** Refresh payouts_enabled from Stripe (the transfers capability is active). The new value, "unavailable" (Connect isn't set up), or null on another error. */
export async function refreshConnect(env: Env, c: Pick<CreatorRow, "id" | "connect_account_id">, log: LogFn): Promise<boolean | "unavailable" | null> {
  if (!c.connect_account_id) return false;
  try {
    const a = await stripe(env).accounts.retrieve(c.connect_account_id);
    const ready = a.capabilities?.transfers === "active";
    await env.DB.prepare("UPDATE creators SET payouts_enabled=? WHERE id=?").bind(ready ? 1 : 0, c.id).run();
    return ready;
  } catch (e) {
    const u = connectUnavailable(e);
    await log(env, u ? "creator_connect_unavailable" : "error", c.id, { where: "creator-connect-refresh", e: errText(e) });
    return u ? "unavailable" : null;
  }
}

// ---------- monthly payouts ----------
export interface PayoutLine { creator: string; handle: string; currency: string; cents: number; result: "paid" | "would_pay" | "failed" | PayoutSkip; transfer?: string; error?: string }
export interface PayoutRun { ran: boolean; reason?: string; mode: CreatorsMode; period: string; lines: PayoutLine[]; connectUnavailable?: boolean }

/**
 * The monthly payout run (the 1st, from 09:00 Brisbane; or forced from /admin/creators). For each creator and currency: the
 * unpaid ledger rows past their hold, netted (refund reversals included). Paid when the creator is active, the net is at
 * least CREATOR_MIN_PAYOUT_CENTS, under the unpaid cap (or uncapped), and their Express account can take transfers.
 *
 * CREATORS off: nothing runs. dry: the batch is worked out and emailed to Mick; no Stripe call, nothing written but an event.
 * on: one creator_payouts row per creator, period and currency (UNIQUE, so overlapping runs can't pay twice), the rows
 * assigned to it, then one Stripe transfer with an idempotency key derived from the payout id. A failed transfer releases
 * its rows to next month. If Stripe says Connect isn't set up, the run stops: no money moves, and the KPI email says so.
 */
export async function runCreatorPayouts(env: Env, at: Date, o: { force?: boolean }, log: LogFn): Promise<PayoutRun> {
  const mode = creatorsMode(env), period = payoutPeriod(at), out: PayoutRun = { ran: false, mode, period, lines: [] };
  if (mode === "off") return { ...out, reason: "CREATORS is off" };
  if (!o.force && !payoutDue(at)) return { ...out, reason: "not the 1st, 09:00 Brisbane" };
  try {
    if (!o.force && await env.DB.prepare("SELECT 1 FROM events WHERE kind='creator_payout_run' AND ref=? AND json_extract(detail,'$.mode')=? LIMIT 1").bind(period, mode).first())
      return { ...out, reason: "already ran this month" };
  } catch { return { ...out, reason: "no creator tables (migration 008)" }; }
  out.ran = true;
  const nowIso = at.toISOString(), min = minPayoutCents(env), cap = unpaidCapCents(env);
  const creators = (await env.DB.prepare("SELECT * FROM creators WHERE status IN ('active','paused') ORDER BY created_at").all<CreatorRow>()).results ?? [];
  const s = stripe(env);
  outer: for (const c of creators) {
    const bal = (await env.DB.prepare("SELECT currency, COALESCE(SUM(amount_cents),0) net FROM creator_ledger WHERE creator_id=? AND payout_id IS NULL AND available_at <= ? GROUP BY currency").bind(c.id, nowIso).all<{ currency: string; net: number }>()).results ?? [];
    const pend = (await env.DB.prepare("SELECT * FROM creator_payouts WHERE creator_id=? AND period=? AND status != 'paid'").bind(c.id, period).all<{ id: string; currency: string; amount_cents: number; status: string; attempts: number }>()).results ?? [];
    const currencies = new Set([...bal.map((b) => b.currency), ...pend.map((p) => p.currency)]);
    for (const cur of currencies) {
      const line: PayoutLine = { creator: c.id, handle: c.handle, currency: cur, cents: 0, result: "nothing" };
      const id = payoutId(c.id, period, cur);
      const existing = await env.DB.prepare("SELECT * FROM creator_payouts WHERE id=?").bind(id).first<{ id: string; amount_cents: number; status: string; attempts: number }>();
      if (existing?.status === "paid") continue; // this month's payout is done; anything newer waits for next month
      const net = bal.find((b) => b.currency === cur)?.net ?? 0;
      // a pending payout (a run that stopped mid-way) is retried as it was: same rows, same amount, same idempotency key
      const retryPending = existing?.status === "pending";
      if (existing?.status === "failed" && !o.force) { line.result = "failed"; line.cents = existing.amount_cents; line.error = "failed earlier this month; retry from /admin/creators"; out.lines.push(line); continue; }
      line.cents = retryPending ? existing!.amount_cents : net;
      const d = retryPending ? "pay" : payoutDecision({ netCents: net, minCents: min, capCents: cap, uncapped: !!c.uncapped, status: c.status, hasAccount: !!c.connect_account_id });
      if (d !== "pay") { if (d !== "nothing") { line.result = d; out.lines.push(line); } continue; }
      if (mode === "dry") { line.result = "would_pay"; out.lines.push(line); continue; }
      // on: the account must be able to take transfers now
      const ready = await refreshConnect(env, c, log);
      if (ready === "unavailable") { line.result = "failed"; line.error = "Stripe Connect isn't available on this account"; out.lines.push(line); out.connectUnavailable = true; break outer; }
      if (ready === null && !retryPending) { line.result = "failed"; line.error = "couldn't check the Stripe account (nothing sent; it goes again next month or from /admin/creators)"; out.lines.push(line); continue; }
      if (!ready && !retryPending) { line.result = "not_ready"; out.lines.push(line); continue; }
      let attempt = existing?.attempts ?? 1;
      if (!existing) {
        const ins = await env.DB.prepare("INSERT OR IGNORE INTO creator_payouts (id, creator_id, period, currency, amount_cents, status, attempts, created_at) VALUES (?,?,?,?,0,'pending',1,?)").bind(id, c.id, period, cur, nowIso).run();
        if (!ins.meta.changes) continue; // another run got it
      } else if (existing.status === "failed") {
        attempt = existing.attempts + 1;
        const up = await env.DB.prepare("UPDATE creator_payouts SET status='pending', attempts=?, error=NULL WHERE id=? AND status='failed'").bind(attempt, id).run();
        if (!up.meta.changes) continue;
      }
      if (!retryPending) {
        await env.DB.prepare("UPDATE creator_ledger SET payout_id=? WHERE creator_id=? AND currency=? AND payout_id IS NULL AND available_at <= ?").bind(id, c.id, cur, nowIso).run();
        const sum = await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) n FROM creator_ledger WHERE payout_id=?").bind(id).first<{ n: number }>();
        line.cents = sum?.n ?? 0;
        await env.DB.prepare("UPDATE creator_payouts SET amount_cents=? WHERE id=?").bind(line.cents, id).run();
        if (line.cents < min) { // rows changed between the read and the assignment (a refund): give them back, pay next month
          await env.DB.batch([env.DB.prepare("UPDATE creator_ledger SET payout_id=NULL WHERE payout_id=?").bind(id), env.DB.prepare("DELETE FROM creator_payouts WHERE id=? AND status='pending'").bind(id)]);
          line.result = "below_min"; out.lines.push(line); continue;
        }
      }
      try {
        const t = await s.transfers.create({ amount: line.cents, currency: cur, destination: c.connect_account_id!, transfer_group: `rite-creators-${period}`,
          description: `Rite creator commission ${period} (@${c.handle})`, metadata: { creator_id: c.id, payout_id: id, period } }, { idempotencyKey: payoutKey(id, attempt) });
        await env.DB.prepare("UPDATE creator_payouts SET status='paid', transfer_id=?, paid_at=? WHERE id=?").bind(t.id, now(), id).run();
        line.result = "paid"; line.transfer = t.id;
        await log(env, "creator_payout", c.id, { payout: id, amount: line.cents, currency: cur, transfer: t.id });
      } catch (e) {
        const msg = errText(e);
        await env.DB.batch([
          env.DB.prepare("UPDATE creator_payouts SET status='failed', error=? WHERE id=?").bind(msg, id),
          env.DB.prepare("UPDATE creator_ledger SET payout_id=NULL WHERE payout_id=?").bind(id),
        ]);
        line.result = "failed"; line.error = msg;
        if (connectUnavailable(e)) { out.connectUnavailable = true; await log(env, "creator_connect_unavailable", c.id, { where: "creator-transfer", e: msg }); out.lines.push(line); break outer; }
        await log(env, "error", c.id, { where: "creator-transfer", payout: id, e: msg });
      }
      out.lines.push(line);
    }
  }
  const paid = out.lines.filter((l) => l.result === "paid"), would = out.lines.filter((l) => l.result === "would_pay");
  await log(env, "creator_payout_run", period, { mode, forced: !!o.force, paid: paid.length, paid_cents: paid.reduce((a, l) => a + l.cents, 0), would_pay: would.length,
    would_cents: would.reduce((a, l) => a + l.cents, 0), failed: out.lines.filter((l) => l.result === "failed").length, connect_unavailable: !!out.connectUnavailable,
    skipped: out.lines.filter((l) => !["paid", "would_pay", "failed"].includes(l.result)).length });
  if (out.lines.length || o.force) await sendEmail(env, adminTo(env), `Rite creator payouts ${period}${mode === "dry" ? " (dry run, nothing sent)" : ""}: ${mode === "dry" ? `${would.length} would be paid` : `${paid.length} paid`}${out.connectUnavailable ? ", STRIPE CONNECT NOT AVAILABLE" : ""}`, payoutText(env, out));
  return out;
}

export function payoutText(env: Env, r: PayoutRun): string {
  const L: string[] = [];
  if (r.connectUnavailable) L.push("Stripe says Connect isn't set up on the Rite account, so the run stopped and no money moved. Enable Connect (Express) in the Stripe dashboard, then run payouts again from /admin/creators.", "");
  if (r.mode === "dry") L.push("CREATORS is \"dry\": this is what the run would do. Nothing was sent to Stripe.", "");
  const label = (l: PayoutLine) => l.result === "paid" ? `paid (${l.transfer})` : l.result === "would_pay" ? "would be paid" : l.result === "failed" ? `FAILED: ${l.error ?? ""}` : SKIP_LABEL[l.result as PayoutSkip];
  L.push(...(r.lines.length ? r.lines.map((l) => `@${l.handle}: ${money(l.cents, l.currency)} ${label(l)}`) : ["Nothing payable this month."]));
  L.push("", `Next run: ${nextPayoutDate(new Date(Date.parse(`${r.period}-02T00:00:00Z`)))}, 09:00 Brisbane.`, `${env.SITE_URL}/admin/creators`);
  return L.join("\n");
}

// ---------- numbers for the dashboard and /admin/creators ----------
export interface CreatorNumbers { clicks: number; clicks30: number; sales: number; netCents: number; accrued: number; held: number; payable: number; paid: number; reversed: number; currency: string }
export async function creatorNumbers(db: D1Database, id: string, at = new Date()): Promise<CreatorNumbers> {
  const nowIso = at.toISOString(), since = new Date(at.getTime() - 30 * 86400000).toISOString();
  const [cl, sa, lg] = await Promise.all([
    db.prepare("SELECT COUNT(*) n, COALESCE(SUM(at >= ?),0) n30 FROM events WHERE kind='creator_click' AND ref=?").bind(since, id).first<{ n: number; n30: number }>(),
    db.prepare("SELECT COUNT(*) n, COALESCE(SUM((amount_cents - refunded_cents) * (amount_cents - tax_cents) / amount_cents),0) net, MAX(currency) cur FROM creator_sales WHERE creator_id=? AND amount_cents > 0").bind(id).first<{ n: number; net: number; cur: string | null }>(),
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN l.kind='commission' THEN l.amount_cents END),0) accrued, COALESCE(SUM(CASE WHEN l.kind='reversal' THEN l.amount_cents END),0) reversed,
        COALESCE(SUM(CASE WHEN l.payout_id IS NULL AND l.available_at > ? THEN l.amount_cents END),0) held,
        COALESCE(SUM(CASE WHEN l.payout_id IS NULL AND l.available_at <= ? THEN l.amount_cents END),0) payable,
        COALESCE(SUM(CASE WHEN p.status='paid' THEN l.amount_cents END),0) paid
      FROM creator_ledger l LEFT JOIN creator_payouts p ON p.id = l.payout_id WHERE l.creator_id=?`).bind(nowIso, nowIso, id).first<Record<string, number>>(),
  ]);
  return { clicks: cl?.n ?? 0, clicks30: cl?.n30 ?? 0, sales: sa?.n ?? 0, netCents: Math.round(sa?.net ?? 0), accrued: lg?.accrued ?? 0, held: lg?.held ?? 0, payable: lg?.payable ?? 0, paid: lg?.paid ?? 0, reversed: lg?.reversed ?? 0, currency: sa?.cur ?? "usd" };
}
export interface PayoutRow { id: string; creator_id: string; handle?: string; period: string; currency: string; amount_cents: number; status: string; transfer_id: string | null; paid_at: string | null; error: string | null }
export const payoutsOf = (db: D1Database, id: string) => db.prepare("SELECT * FROM creator_payouts WHERE creator_id=? ORDER BY period DESC, currency LIMIT 24").bind(id).all<PayoutRow>().then((r) => r.results ?? []);
export const recentPayouts = (db: D1Database) => db.prepare("SELECT p.*, c.handle FROM creator_payouts p JOIN creators c ON c.id = p.creator_id ORDER BY p.created_at DESC LIMIT 30").all<PayoutRow>().then((r) => r.results ?? []);
export { nextPayoutDate };
