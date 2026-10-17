// Admin data: the numbers behind GET /admin/stats (JSON) and GET /admin (HTML), plus the auth check both use.
// Pure D1 queries; no Stripe, email or analytics calls.

const enc = new TextEncoder();

/** Constant-time string comparison (time depends only on the longer length, not on where the strings differ). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  const n = Math.max(x.length, y.length);
  let d = x.length ^ y.length;
  for (let i = 0; i < n; i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** The admin secret is the Stripe webhook secret (README). Accepts `Authorization: Bearer <secret>` or, for the browser, `?key=<secret>`. */
export function adminAuthorized(secret: string | undefined, auth?: string | null, key?: string | null): boolean {
  if (!secret || secret.length <= 10) return false;
  const viaHeader = auth != null && safeEqual(auth, `Bearer ${secret}`);
  const viaKey = key != null && safeEqual(key, secret);
  return viaHeader || viaKey;
}

export type AdminStats = Awaited<ReturnType<typeof adminStats>>;

/** Exactly the /admin/stats payload for the last `days` days. */
export async function adminStats(db: D1Database, days: number) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [kinds, byRef, bySign, rev, gifts, subs, daily] = await Promise.all([
    db.prepare("SELECT kind, COUNT(*) n FROM events WHERE at > ? GROUP BY kind ORDER BY n DESC").bind(since).all(),
    db.prepare("SELECT COALESCE(pv.ref,'(none)') ref, COUNT(DISTINCT pv.id) previews, COUNT(DISTINCT pu.id) purchases, COALESCE(SUM(pu.amount_cents),0) cents FROM previews pv LEFT JOIN purchases pu ON pu.preview_id = pv.id AND pu.status IN ('paid','writing','generated') WHERE pv.created_at > ? GROUP BY 1 ORDER BY previews DESC").bind(since).all(),
    db.prepare("SELECT pv.natal_sign sign, pv.return_number rn, COUNT(DISTINCT pv.id) previews, COUNT(DISTINCT pu.id) purchases FROM previews pv LEFT JOIN purchases pu ON pu.preview_id = pv.id AND pu.status IN ('paid','writing','generated') WHERE pv.created_at > ? GROUP BY 1,2 ORDER BY previews DESC").bind(since).all(),
    db.prepare("SELECT COALESCE(SUM(amount_cents),0) cents, COUNT(*) n, SUM(CASE WHEN amount_cents=0 THEN 1 ELSE 0 END) free_or_gift FROM purchases WHERE status IN ('paid','writing','generated') AND created_at > ?").bind(since).first(),
    db.prepare("SELECT COUNT(*) sold, SUM(CASE WHEN redeemed_at IS NOT NULL AND redeemed_at != 'refunded' THEN 1 ELSE 0 END) redeemed FROM gifts WHERE created_at > ?").bind(since).first(),
    db.prepare("SELECT status, COUNT(*) n FROM subscriptions GROUP BY status").all(),
    db.prepare("SELECT substr(at,1,10) day, SUM(kind='preview') previews, SUM(kind='checkout') checkouts, SUM(kind='paid') paid FROM events WHERE at > ? GROUP BY 1 ORDER BY 1").bind(since).all(),
  ]);
  const k = Object.fromEntries((kinds.results as Array<{ kind: string; n: number }>).map((r) => [r.kind, r.n]));
  const funnel = { previews: k.preview ?? 0, checkouts: k.checkout ?? 0, paid: k.paid ?? 0, generated: k.generated ?? 0, preview_to_checkout: k.preview ? +((k.checkout ?? 0) / k.preview * 100).toFixed(1) : 0, checkout_to_paid: k.checkout ? +((k.paid ?? 0) / k.checkout * 100).toFixed(1) : 0 };
  return { days, funnel, revenue: rev, gifts, subscriptions: subs.results, by_ref: byRef.results, by_sign: bySign.results, daily: daily.results, events: kinds.results };
}

export interface AdminError { at: string; ref: string | null; detail: string | null }
export interface AdminStory { created_at: string; purchase_id: string; first_name: string | null; sign: string | null; text: string; can_quote: number }
export interface AdminQueue { pending: number; due: number }
export interface AdminExtras { errors: AdminError[]; stories: AdminStory[]; followups: AdminQueue; reminders: AdminQueue; stage_reminders: AdminQueue }

/** Last 20 errors, last 20 stories, and unsent counts for the three email queues ("due" = send_on is today (UTC) or earlier). */
export async function adminExtras(db: D1Database, today = new Date().toISOString().slice(0, 10)): Promise<AdminExtras> {
  const queue = (t: "followups" | "reminders" | "stage_reminders") =>
    db.prepare(`SELECT COUNT(*) pending, COALESCE(SUM(send_on <= ?),0) due FROM ${t} WHERE sent_at IS NULL`).bind(today).first<AdminQueue>();
  const [errors, stories, followups, reminders, stage] = await Promise.all([
    db.prepare("SELECT at, ref, detail FROM events WHERE kind='error' ORDER BY id DESC LIMIT 20").all<AdminError>(),
    db.prepare("SELECT s.created_at, s.purchase_id, p.first_name, pv.natal_sign sign, s.text, s.can_quote FROM stories s LEFT JOIN purchases p ON p.id = s.purchase_id LEFT JOIN previews pv ON pv.id = p.preview_id ORDER BY s.id DESC LIMIT 20").all<AdminStory>(),
    queue("followups"), queue("reminders"), queue("stage_reminders"),
  ]);
  const q = (r: AdminQueue | null): AdminQueue => ({ pending: r?.pending ?? 0, due: r?.due ?? 0 });
  return { errors: errors.results, stories: stories.results, followups: q(followups), reminders: q(reminders), stage_reminders: q(stage) };
}

/** /admin's ?days= selector: 7, 30 or 90, default 30. */
export const adminDays = (v: string | undefined) => { const n = parseInt(v ?? "", 10); return n === 7 || n === 90 ? n : 30; };

export interface AdminArm { arm: string; previews: number; purchases: number; cents: number }
export interface AdminMoney {
  /** Stripe Tax collected in the last 30 days (readings incl. their order bump, and gift checkouts), cents. */
  tax_30d: number;
  /** Order-bump gift codes sold in the last 30 days, and their revenue (cents, tax included). */
  bumps_30d: { n: number; cents: number };
  /** Price test, per arm (all time: the arm is only stored while a test runs). cents = revenue net of tax. */
  arms: AdminArm[];
  /** The price_test_done event's detail (winner, reason, per-arm numbers), once the test has stopped itself. */
  price_test_done: { at: string; detail: string | null } | null;
}

/** /admin's money panel: tax collected, the order bump and the price test. Separate from adminStats so /admin/stats stays as it was. */
export async function adminMoney(db: D1Database, nowMs = Date.now()): Promise<AdminMoney> {
  const since = new Date(nowMs - 30 * 86400000).toISOString();
  const [tp, tg, bumps, arms, done] = await Promise.all([
    db.prepare("SELECT COALESCE(SUM(tax_cents),0) cents FROM purchases WHERE created_at > ? AND status != 'refunded'").bind(since).first<{ cents: number }>(),
    db.prepare("SELECT COALESCE(SUM(tax_cents),0) cents FROM gifts WHERE created_at > ? AND (redeemed_at IS NULL OR redeemed_at != 'refunded')").bind(since).first<{ cents: number }>(),
    db.prepare("SELECT COUNT(*) n, COALESCE(SUM(g.amount_cents),0) cents FROM gifts g JOIN purchases p ON p.stripe_session_id = g.stripe_session_id WHERE g.created_at > ? AND p.status != 'refunded'").bind(since).first<{ n: number; cents: number }>(),
    db.prepare(`SELECT pv.price_arm arm, COUNT(DISTINCT pv.id) previews, COUNT(DISTINCT pu.id) purchases, COALESCE(SUM(pu.amount_cents - COALESCE(pu.tax_cents,0)),0) cents
      FROM previews pv LEFT JOIN purchases pu ON pu.preview_id = pv.id AND pu.status IN ('paid','writing','generated') WHERE pv.price_arm IS NOT NULL GROUP BY 1 ORDER BY 1`).all<AdminArm>(),
    db.prepare("SELECT at, detail FROM events WHERE kind='price_test_done' ORDER BY id LIMIT 1").first<{ at: string; detail: string | null }>(),
  ]);
  return { tax_30d: (tp?.cents ?? 0) + (tg?.cents ?? 0), bumps_30d: { n: bumps?.n ?? 0, cents: bumps?.cents ?? 0 }, arms: arms.results ?? [], price_test_done: done ?? null };
}
