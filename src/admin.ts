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

/** ADMIN_KEY check: `Authorization: Bearer <secret>` (scripts), or `key` = the secret as typed into /admin/login's form. Never read from a URL. */
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


// ---------- admin session (build 3b, hardened in b12-admin): a signed cookie so the key is never in a URL ----------
// Cookie value: v2.<expiry, unix s>.<session version>.<mfa 0|1>.<random id>.<HMAC-SHA256(ADMIN_KEY, "rite-admin-session.v2.…")>.
// Valid while unexpired, correctly signed, carrying the current session version (admin_state "session_version"; "Sign out
// everywhere" rotates it) and, when ADMIN_TOTP_SECRET is set, mfa=1. Changing ADMIN_KEY also signs every session out. The
// CSRF token for the admin forms is an HMAC of the cookie value, so it's per-session and needs no storage.
export const SESSION_COOKIE = "rite_admin";
export const SESSION_DAYS = 14;
/** How long the step between a correct key and the authenticator code may take. */
export const PENDING_MINUTES = 5;

const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
const rand = (n = 12) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b64u(b); };

export interface SessionOpts { version?: string; mfa?: boolean }
export interface SessionCheck { version?: string; mfaRequired?: boolean }

export async function makeSession(secret: string, nowMs = Date.now(), o: SessionOpts = {}): Promise<string> {
  const exp = Math.floor(nowMs / 1000) + SESSION_DAYS * 86400;
  const body = `v2.${exp}.${o.version ?? "0"}.${o.mfa ? 1 : 0}.${rand()}`;
  return `${body}.${await hmac(secret, `rite-admin-session.${body}`)}`;
}

/** The parsed session when the cookie is valid now, else null. */
export async function readSession(secret: string | undefined, value: string | null | undefined, nowMs = Date.now(), o: SessionCheck = {}): Promise<{ exp: number; mfa: boolean } | null> {
  if (!secret || secret.length <= 10 || !value) return null;
  const m = /^(v2\.(\d{1,12})\.([A-Za-z0-9_-]{1,40})\.([01])\.[A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{20,})$/.exec(value);
  if (!m) return null;
  const sigOk = safeEqual(m[5]!, await hmac(secret, `rite-admin-session.${m[1]}`));
  const fresh = Number(m[2]) * 1000 > nowMs;
  const verOk = safeEqual(m[3]!, o.version ?? "0");
  const mfaOk = !o.mfaRequired || m[4] === "1";
  return sigOk && fresh && verOk && mfaOk ? { exp: Number(m[2]), mfa: m[4] === "1" } : null;
}
export async function sessionValid(secret: string | undefined, value: string | null | undefined, nowMs = Date.now(), o: SessionCheck = {}): Promise<boolean> {
  return (await readSession(secret, value, nowMs, o)) !== null;
}

/** The short-lived proof that the key step passed, carried by the authenticator-code form (hidden field). */
export async function makePending(secret: string, nowMs = Date.now()): Promise<string> {
  const body = `p1.${Math.floor(nowMs / 1000) + PENDING_MINUTES * 60}.${rand()}`;
  return `${body}.${await hmac(secret, `rite-admin-pending.${body}`)}`;
}
export async function pendingValid(secret: string, value: string | null | undefined, nowMs = Date.now()): Promise<boolean> {
  const m = /^(p1\.(\d{1,12})\.[A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{20,})$/.exec(value ?? "");
  if (!m) return false;
  const sigOk = safeEqual(m[3]!, await hmac(secret, `rite-admin-pending.${m[1]}`));
  return sigOk && Number(m[2]) * 1000 > nowMs;
}

export function cookieValue(header: string | null | undefined, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

/** HttpOnly, Secure, SameSite=Strict, scoped to /admin. maxAge 0 clears it. */
export const sessionCookie = (value: string, maxAge = SESSION_DAYS * 86400) =>
  `${SESSION_COOKIE}=${value}; Path=/admin; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;

export async function csrfToken(secret: string, sessionId: string): Promise<string> {
  return (await hmac(secret, `rite-admin-csrf.${sessionId}`)).slice(0, 32);
}

/**
 * The browser says this POST came from our own pages: Sec-Fetch-Site same-origin, or (older browsers) an Origin equal to
 * ours. A request with neither header (curl, very old browsers) passes here and relies on the CSRF token alone.
 */
export function sameOrigin(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") return origin === new URL(req.url).origin;
  return origin !== "null";
}

/**
 * Where /admin/login may send you afterwards: a path under /admin on this site (normalised, so /admin/../x or an encoded
 * //host can't leave it), never /admin/login or /admin/logout, and never with ?key=. Anything else is /admin.
 */
export function safeNext(next: string | null | undefined): string {
  const n = (next ?? "").trim();
  if (!n.startsWith("/") || n.startsWith("//") || /[\\\s\x00-\x1f]/.test(n) || /%(2f|5c|2e)/i.test(n.split("?")[0]!)) return "/admin";
  let u: URL;
  try { u = new URL(n, "https://rite.invalid"); } catch { return "/admin"; }
  if (u.origin !== "https://rite.invalid" || !/^\/admin(\/|$)/.test(u.pathname) || /^\/admin\/(login|logout)(\/|$)/.test(u.pathname)) return "/admin";
  u.searchParams.delete("key");
  return u.pathname + u.search;
}

// ---------- admin state: session version and TOTP replay guard ----------
// D1 table admin_state (migration 011, strongly consistent, atomic claim). Until it's applied, KV (CACHE) stands in.
export interface AdminStateEnv { DB: D1Database; CACHE?: KVNamespace }
const missingTable = (e: unknown) => /no such table/i.test(String(e));

export async function stateGet(env: AdminStateEnv, k: string): Promise<string | null> {
  try { return (await env.DB.prepare("SELECT v FROM admin_state WHERE k=?").bind(k).first<{ v: string }>())?.v ?? null; }
  catch (e) { if (!missingTable(e)) throw e; return (await env.CACHE?.get(`admin_state:${k}`)) ?? null; }
}
export async function stateSet(env: AdminStateEnv, k: string, v: string): Promise<void> {
  try { await env.DB.prepare("INSERT INTO admin_state (k, v, updated_at) VALUES (?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at").bind(k, v, new Date().toISOString()).run(); }
  catch (e) { if (!missingTable(e)) throw e; await env.CACHE?.put(`admin_state:${k}`, v); }
}
/** The current session version ("0" until the first "Sign out everywhere"). */
export const sessionVersion = async (env: AdminStateEnv) => (await stateGet(env, "session_version")) ?? "0";
/** Sign out everywhere: a new random version, so every cookie made before it fails. Returns the new version. */
export async function rotateSessionVersion(env: AdminStateEnv): Promise<string> {
  const v = rand(9);
  await stateSet(env, "session_version", v);
  return v;
}
/**
 * Use up a TOTP step: true only if it's later than the last step used, so a code works once and an older code never works
 * after a newer one. In D1 it's one conditional upsert (atomic: two simultaneous logins with one code can't both win).
 */
export async function claimTotpStep(env: AdminStateEnv, step: number): Promise<boolean> {
  try {
    const r = await env.DB.prepare(`INSERT INTO admin_state (k, v, updated_at) VALUES ('totp_last_step', ?, ?)
      ON CONFLICT(k) DO UPDATE SET v=excluded.v, updated_at=excluded.updated_at WHERE CAST(admin_state.v AS INTEGER) < CAST(excluded.v AS INTEGER)`).bind(String(step), new Date().toISOString()).run();
    return (r.meta?.changes ?? 0) > 0;
  } catch (e) {
    if (!missingTable(e) || !env.CACHE) throw e;
    const last = parseInt((await env.CACHE.get("admin_state:totp_last_step")) ?? "0", 10) || 0;
    if (step <= last) return false;
    await env.CACHE.put("admin_state:totp_last_step", String(step));
    return true;
  }
}

// ---------- sign-in rate limit: wrong keys and wrong codes, per IP and for the whole admin ----------
export const LOGIN_FAILS_PER_IP = 10;
export const LOGIN_FAILS_GLOBAL = 50;
export const LOGIN_WINDOW_S = 3600;
type Bucket = { n: number; reset: number };
const bucketKeys = (ip: string) => ({ ip: `adminlogin:ip:${ip}`, global: "adminlogin:global" });
async function readBucket(kv: KVNamespace, k: string, nowS: number): Promise<Bucket> {
  try { const b = JSON.parse((await kv.get(k)) ?? "null") as Bucket | null; if (b && b.reset > nowS) return b; } catch { /* unreadable: start again */ }
  return { n: 0, reset: nowS + LOGIN_WINDOW_S };
}
/** Blocked when this IP has 10 failures in its hour, or the admin as a whole has 50; retryAt is when it opens (unix s). */
export async function loginBlocked(kv: KVNamespace | undefined, ip: string, nowMs = Date.now()): Promise<{ scope: "ip" | "global"; retryAt: number } | null> {
  if (!kv) return null;
  const nowS = Math.floor(nowMs / 1000), k = bucketKeys(ip);
  const [a, g] = await Promise.all([readBucket(kv, k.ip, nowS), readBucket(kv, k.global, nowS)]);
  if (a.n >= LOGIN_FAILS_PER_IP) return { scope: "ip", retryAt: a.reset };
  if (g.n >= LOGIN_FAILS_GLOBAL) return { scope: "global", retryAt: g.reset };
  return null;
}
export async function loginFailed(kv: KVNamespace | undefined, ip: string, nowMs = Date.now()): Promise<void> {
  if (!kv) return;
  const nowS = Math.floor(nowMs / 1000), k = bucketKeys(ip);
  for (const key of [k.ip, k.global]) {
    const b = await readBucket(kv, key, nowS);
    await kv.put(key, JSON.stringify({ n: b.n + 1, reset: b.reset }), { expirationTtl: Math.max(60, b.reset - nowS) });
  }
}

export interface AdminLogin { at: string; detail: string | null }
/** The last 5 sign-ins and the failed attempts in the last 24 h, for the dashboard. */
export async function adminLogins(db: D1Database, nowMs = Date.now()): Promise<{ recent: AdminLogin[]; failed24h: number }> {
  try {
    const [r, f] = await Promise.all([
      db.prepare("SELECT at, detail FROM events WHERE kind='admin_login' ORDER BY id DESC LIMIT 5").all<AdminLogin>(),
      db.prepare("SELECT COUNT(*) n FROM events WHERE kind='admin_login_failed' AND at > ?").bind(new Date(nowMs - 86400000).toISOString()).first<{ n: number }>(),
    ]);
    return { recent: r.results ?? [], failed24h: f?.n ?? 0 };
  } catch { return { recent: [], failed24h: 0 }; }
}
