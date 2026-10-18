// Ads budget controller and Meta Conversions API (docs/automation-builds.md build 10; docs/growth-plan.md §3).
//
// - Conversions API: a server-side Purchase per paid reading or gift, from the Stripe webhook, only when META_CAPI = "on"
//   and META_PIXEL_ID + a token are set. event_id is the Checkout Session id (Meta dedups on event_name + event_id), the
//   email is normalised (trim, lower-case) and SHA-256 hashed as Meta requires. Never throws, never blocks a purchase.
// - Controller: once a day at 06:00 Brisbane (the hourly cron), reads spend for the configured campaign (or ad set) from the
//   Marketing API, counts buyers from Rite's own `?r=meta` purchases (not Meta's attribution), and applies RULES inside the
//   hard caps. ADS = "off" (default) does nothing; "dry-run" decides, logs and emails but changes nothing at Meta; "on"
//   applies. Missing config or any Meta error: no change, an `ads_decision` row saying why (and an `error` row for the
//   digest). Every run writes one `ads_decision` event; the Monday KPI email summarises them.
//
// Brisbane is UTC+10 all year, so day boundaries are fixed offsets. Set the ad account's time zone to Australia/Brisbane
// when creating it (Meta can't change it later), so Meta's spend days line up with ours.

const BRIS_MS = 10 * 3600000;
const DAY = 86400000;
const LIVE = "('paid','writing','generated')"; // sold, as /admin and the KPI email count them

/** The rules from the spec and the growth plan, in cents and days. Changing one is a code change and a deploy, like the caps' flag. */
export const RULES = {
  raiseBelowCents: 1600,   // 7-day cost per buyer under $16 → raise 20%
  holdToCents: 2000,       // $16–20 → hold
  cutAboveCents: 2000,     // over $20 for 3 days → cut 30%
  cutDays: 3,
  pauseAboveCents: 3000,   // over $30 for 2 days → pause and email Mick
  pauseDays: 2,
  raisePct: 20,
  cutPct: 30,
  startHoldDays: 7,        // growth plan: $50 a day for 7 days, then the rules (covers the spec's 3-day learning phase)
  killSpendCents: 30000,   // growth plan kill line: cost per buyer over $40 once $300 is spent (since the campaign started)
  killCpbCents: 4000,
  minBuyersToRaise: 3,     // a raise needs at least this many ?r=meta buyers in the 7 days (no raising on one lucky sale)
  cooldownDays: 3,         // no raise or cut within 3 days of the last one (the 7-day number needs time to move)
  minDailyCents: 500,      // below $5 a day left under the monthly cap → pause instead
} as const;

export type AdsMode = "off" | "dry-run" | "on";
export const adsMode = (v: string | undefined): AdsMode => (v === "on" ? "on" : v === "dry-run" ? "dry-run" : "off");

export interface AdsEnv {
  DB: D1Database; SITE_URL: string;
  ADS?: string; ADS_DAILY_CAP?: string; ADS_MONTHLY_CAP?: string; ADS_REF?: string;
  META_CAPI?: string; META_PIXEL_ID?: string; META_CAPI_TOKEN?: string; META_TEST_EVENT_CODE?: string;
  META_ADS_TOKEN?: string; META_APP_SECRET?: string; META_CAMPAIGN_ID?: string; META_ADSET_ID?: string; META_API_VERSION?: string;
}
export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const GRAPH = "https://graph.facebook.com";
const ver = (env: AdsEnv) => (env.META_API_VERSION || "v24.0").replace(/^(?!v)/, "v");
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256Hex(s: string) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
/** Meta's normalisation for `em`: trim and lower-case, then SHA-256 (hex). */
export const hashEmail = (email: string) => sha256Hex(email.trim().toLowerCase());

const brisDate = (t: number) => new Date(t + BRIS_MS).toISOString().slice(0, 10);
const brisMidnight = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) - BRIS_MS;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const usd = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;

async function logEvent(db: D1Database, kind: string, ref: string | null, detail: unknown, at = new Date()) {
  try { await db.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(at.toISOString(), kind, ref, JSON.stringify(detail).slice(0, 2000)).run(); }
  catch (e) { console.error("ads log", e); }
}

// ---------- Conversions API ----------
export interface CapiPurchase { eventId: string; email: string; valueCents: number; currency: string; contentName: string; at: Date }

/** Pixel + token when the Conversions API is switched on and configured; null otherwise. */
export function capiConfig(env: AdsEnv): { pixel: string; token: string } | null {
  if (env.META_CAPI !== "on") return null;
  const token = env.META_CAPI_TOKEN || env.META_ADS_TOKEN;
  return env.META_PIXEL_ID && token ? { pixel: env.META_PIXEL_ID, token } : null;
}

/** Send one Purchase to Meta. Never throws; logs a `meta_capi` row (sent or why not) and an `error` row on failure. */
export async function sendCapiPurchase(env: AdsEnv, p: CapiPurchase, ref: string | null, f: FetchFn = (u, i) => fetch(u, i)): Promise<{ sent: boolean; reason?: string }> {
  if (env.META_CAPI !== "on") return { sent: false, reason: "off" };
  const cfg = capiConfig(env);
  if (!cfg) { await logEvent(env.DB, "error", ref, { where: "meta-capi", e: "META_CAPI is on but META_PIXEL_ID or META_CAPI_TOKEN is missing" }); return { sent: false, reason: "config" }; }
  if (!p.email) return { sent: false, reason: "no email" };
  try {
    const event = {
      event_name: "Purchase", event_time: Math.floor(p.at.getTime() / 1000), event_id: p.eventId, action_source: "website",
      event_source_url: `${env.SITE_URL}/`,
      user_data: { em: [await hashEmail(p.email)] },
      custom_data: { currency: p.currency.toUpperCase(), value: Math.round(p.valueCents) / 100, content_name: p.contentName, content_type: "product" },
    };
    const body: Record<string, unknown> = { data: [event], access_token: cfg.token };
    if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;
    const res = await f(`${GRAPH}/${ver(env)}/${encodeURIComponent(cfg.pixel)}/events`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const msg = await metaError(res);
      await logEvent(env.DB, "error", ref, { where: "meta-capi", status: res.status, e: msg });
      return { sent: false, reason: `meta ${res.status}` };
    }
    await logEvent(env.DB, "meta_capi", ref, { event: "Purchase", event_id: p.eventId, value: p.valueCents, test: !!env.META_TEST_EVENT_CODE });
    return { sent: true };
  } catch (e) {
    await logEvent(env.DB, "error", ref, { where: "meta-capi", e: String(e).slice(0, 300) });
    return { sent: false, reason: "error" };
  }
}

async function metaError(res: Response): Promise<string> {
  const t = await res.text().catch(() => "");
  try { const j = JSON.parse(t) as { error?: { message?: string; code?: number } }; if (j.error?.message) return `${j.error.code ?? ""} ${j.error.message}`.trim().slice(0, 300); } catch { /* not JSON */ }
  return t.slice(0, 300);
}

// ---------- the rules (pure) ----------
export interface DayRecord { date: string; spend7: number; buyers7: number; action: string }
export interface AdsInput {
  today: string;            // Brisbane date of the run
  status: string;           // Meta's status of the campaign / ad set (ACTIVE, PAUSED, ...)
  budgetCents: number;      // current daily budget
  daysLive: number;         // full days since the campaign's start date (0 on the start date)
  spend7: number; buyers7: number;          // the last 7 full Brisbane days: Meta spend, Rite's ?r=meta buyers
  spendLife: number; buyersLife: number;    // since the campaign started
  spendMonth: number; daysLeftInMonth: number; // spend this month (Meta, today included) and days left including today
  dailyCapCents: number; monthlyCapCents: number;
  history: DayRecord[];     // earlier runs (any order); today's is not in it
}
export type AdsAction = "none" | "hold" | "raise" | "cut" | "pause";
export interface Decision { action: AdsAction; reason: string; from: number; to: number; cpb7: number | null; email: boolean }

/** Cost per buyer in cents; null with no spend; Infinity with spend and no buyers. */
export const costPerBuyer = (spend: number, buyers: number) => (spend <= 0 ? null : buyers > 0 ? spend / buyers : Infinity);
const above = (spend: number, buyers: number, cents: number) => { const c = costPerBuyer(spend, buyers); return c !== null && c > cents; };
const cpbS = (c: number | null) => (c === null ? "n/a" : c === Infinity ? "no buyers" : usd(Math.round(c)));
const dollarsDown = (c: number) => Math.floor(c / 100) * 100;

/**
 * Days in a row (today first) the 7-day cost per buyer was over `cents`. A raise or cut ends the run: the next streak
 * starts after a change. A missing day (no run) ends it too.
 */
export function streak(i: AdsInput, cents: number): number {
  if (!above(i.spend7, i.buyers7, cents)) return 0;
  const byDate = new Map(i.history.map((h) => [h.date, h]));
  let n = 1;
  for (let d = addDays(i.today, -1); ; d = addDays(d, -1)) {
    const h = byDate.get(d);
    if (!h || h.action === "raise" || h.action === "cut" || !above(h.spend7, h.buyers7, cents)) return n;
    n++;
  }
}

/** The budget ceiling today: the daily cap, and what keeps the month under the monthly cap at this rate. Whole dollars. */
export function allowedBudget(i: AdsInput): number {
  const left = Math.max(0, i.monthlyCapCents - i.spendMonth);
  return dollarsDown(Math.min(i.dailyCapCents, left / Math.max(1, i.daysLeftInMonth)));
}

export function decide(i: AdsInput): Decision {
  const cpb7 = costPerBuyer(i.spend7, i.buyers7);
  const from = i.budgetCents;
  const d = (action: AdsAction, reason: string, to = from, email = false): Decision => ({ action, reason, from, to, cpb7: cpb7 === Infinity ? null : cpb7, email });
  const cpbLife = costPerBuyer(i.spendLife, i.buyersLife);

  if (i.status !== "ACTIVE") return d("none", `campaign is ${i.status}; the controller never resumes it (Mick does, in Ads Manager)`);
  if (i.spendLife >= RULES.killSpendCents && cpbLife !== null && cpbLife > RULES.killCpbCents)
    return d("pause", `kill line: ${usd(i.spendLife)} spent since start for ${i.buyersLife} ?r=meta buyer${i.buyersLife === 1 ? "" : "s"} (${cpbS(cpbLife)} each, line is ${usd(RULES.killCpbCents)} after ${usd(RULES.killSpendCents)})`, 0, true);
  if (i.spendMonth >= i.monthlyCapCents) return d("pause", `monthly cap reached: ${usd(i.spendMonth)} of ${usd(i.monthlyCapCents)} this month`, 0, true);
  const allowed = allowedBudget(i);
  if (allowed < RULES.minDailyCents) return d("pause", `monthly cap: ${usd(i.monthlyCapCents - i.spendMonth)} left for ${i.daysLeftInMonth} day${i.daysLeftInMonth === 1 ? "" : "s"}, under ${usd(RULES.minDailyCents)} a day`, 0, true);
  const learning = i.daysLive < RULES.startHoldDays;
  if (!learning && streak(i, RULES.pauseAboveCents) >= RULES.pauseDays)
    return d("pause", `cost per buyer over ${usd(RULES.pauseAboveCents)} for ${RULES.pauseDays} days (${cpbS(cpb7)} over 7 days: ${usd(i.spend7)} for ${i.buyers7})`, 0, true);
  if (from > allowed) return d("cut", `over the cap: ${usd(from)} a day, cap today ${usd(allowed)} (daily ${usd(i.dailyCapCents)}, monthly ${usd(i.monthlyCapCents)} with ${usd(i.spendMonth)} spent)`, allowed);
  if (learning) return d("hold", `start: day ${i.daysLive + 1} of ${RULES.startHoldDays} at the starting budget (${cpbS(cpb7)} per buyer so far)`);

  const last = i.history.filter((h) => h.action === "raise" || h.action === "cut").map((h) => h.date).sort().pop();
  const sinceChange = last ? daysBetween(last, i.today) : Infinity;
  if (sinceChange < RULES.cooldownDays) return d("hold", `${sinceChange} day${sinceChange === 1 ? "" : "s"} since the last change (waits ${RULES.cooldownDays}); ${cpbS(cpb7)} per buyer`);

  const over20 = streak(i, RULES.cutAboveCents);
  if (over20 >= RULES.cutDays) {
    const to = Math.min(allowed, Math.max(RULES.minDailyCents, dollarsDown(from * (100 - RULES.cutPct) / 100)));
    return d("cut", `cost per buyer over ${usd(RULES.cutAboveCents)} for ${over20} days (${cpbS(cpb7)}): ${RULES.cutPct}% down`, to);
  }
  if (cpb7 !== null && cpb7 < RULES.raiseBelowCents) {
    if (i.buyers7 < RULES.minBuyersToRaise) return d("hold", `${cpbS(cpb7)} per buyer but only ${i.buyers7} buyer${i.buyers7 === 1 ? "" : "s"} in 7 days (raises need ${RULES.minBuyersToRaise})`);
    const full = dollarsDown(from * (100 + RULES.raisePct) / 100), to = Math.min(allowed, full);
    if (to <= from) return d("hold", `${cpbS(cpb7)} per buyer, at the cap (${usd(allowed)} a day)`);
    return d("raise", `${cpbS(cpb7)} per buyer over 7 days (${i.buyers7} buyers), under ${usd(RULES.raiseBelowCents)}: ${RULES.raisePct}% up${to < full ? `, held to the cap ${usd(allowed)}` : ""}`, to);
  }
  if (over20) return d("hold", `${cpbS(cpb7)} per buyer, over ${usd(RULES.cutAboveCents)} for ${over20} of ${RULES.cutDays} days`);
  return d("hold", `${cpbS(cpb7)} per buyer${cpb7 !== null && cpb7 <= RULES.holdToCents ? ` (${usd(RULES.raiseBelowCents)}–${usd(RULES.holdToCents)} holds)` : ""}`);
}

// ---------- Marketing API ----------
interface MetaObject { status: string; budgetCents: number; startDate: string }

class MetaClient {
  constructor(private env: AdsEnv, private token: string, private f: FetchFn) {}
  private async auth(): Promise<Record<string, string>> {
    const p: Record<string, string> = { access_token: this.token };
    if (this.env.META_APP_SECRET) p.appsecret_proof = await hmacHex(this.env.META_APP_SECRET, this.token);
    return p;
  }
  async get(path: string, params: Record<string, string>): Promise<any> {
    const q = new URLSearchParams({ ...params, ...(await this.auth()) });
    const res = await this.f(`${GRAPH}/${ver(this.env)}/${path}?${q}`, { method: "GET", signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`Meta GET ${path.split("?")[0]} ${res.status}: ${await metaError(res)}`);
    return res.json();
  }
  async post(path: string, params: Record<string, string>): Promise<void> {
    const res = await this.f(`${GRAPH}/${ver(this.env)}/${path}`, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...params, ...(await this.auth()) }).toString(), signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Meta POST ${path} ${res.status}: ${await metaError(res)}`);
    const j = await res.json().catch(() => null) as { success?: boolean } | null;
    if (j && j.success === false) throw new Error(`Meta POST ${path}: success false`);
  }
  async object(id: string): Promise<MetaObject> {
    const j = await this.get(id, { fields: "status,effective_status,daily_budget,start_time,created_time" }) as { status?: string; daily_budget?: string; start_time?: string; created_time?: string };
    const budget = parseInt(j.daily_budget ?? "", 10);
    if (!(budget > 0)) throw new Error(`${id} has no daily_budget (lifetime budget, or the budget is on the ad set: set META_ADSET_ID)`);
    const t = Date.parse(j.start_time || j.created_time || "");
    if (Number.isNaN(t)) throw new Error(`${id} has no start_time`);
    return { status: j.status ?? "UNKNOWN", budgetCents: budget, startDate: brisDate(t) };
  }
  /** Spend in cents for a range of the account's days (inclusive), or a date preset. */
  async spend(id: string, range: { since: string; until: string } | "maximum" | "this_month"): Promise<number> {
    const p: Record<string, string> = { fields: "spend", level: id === this.env.META_ADSET_ID ? "adset" : "campaign" };
    if (typeof range === "string") p.date_preset = range; else p.time_range = JSON.stringify(range);
    const j = await this.get(`${id}/insights`, p) as { data?: Array<{ spend?: string }> };
    if (!j || !Array.isArray(j.data)) throw new Error(`Meta insights for ${id}: no data array`);
    return Math.round(j.data.reduce((s, r) => s + (parseFloat(r.spend ?? "0") || 0), 0) * 100);
  }
}

// ---------- the daily run ----------
export interface AdsRunDeps { now: Date; f?: FetchFn; notify: (subject: string, text: string) => Promise<boolean>; force?: boolean }
export interface AdsRunResult { ran: boolean; reason?: string; decision?: Decision; applied?: boolean }

/** True during 06:00–06:59 Brisbane: when the hourly cron runs the controller. */
export const adsRunHour = (now: Date) => new Date(now.getTime() + BRIS_MS).getUTCHours() === 6;

/** Rite's own buyers from an ad source: sold readings whose preview carried ?r=<ref> (or ?r=<ref>-anything). */
async function ownBuyers(db: D1Database, ref: string, fromIso: string, toIso: string): Promise<number> {
  const r = await db.prepare(`SELECT COUNT(*) n FROM purchases pu JOIN previews pv ON pv.id = pu.preview_id WHERE pu.status IN ${LIVE} AND pu.amount_cents > 0 AND (pv.ref = ? OR pv.ref LIKE ?) AND pu.created_at >= ? AND pu.created_at < ?`)
    .bind(ref, `${ref}-%`, fromIso, toIso).first<{ n: number }>();
  return Number(r?.n ?? 0) || 0;
}

export async function runAdsController(env: AdsEnv, deps: AdsRunDeps): Promise<AdsRunResult> {
  const mode = adsMode(env.ADS);
  if (mode === "off") return { ran: false, reason: "ADS=off" };
  const { now } = deps;
  if (!deps.force && !adsRunHour(now)) return { ran: false, reason: "not 06:00 Brisbane" };
  const today = brisDate(now.getTime());
  const done = await env.DB.prepare("SELECT 1 FROM events WHERE kind='ads_decision' AND json_valid(detail) AND json_extract(detail,'$.date') = ? LIMIT 1").bind(today).first();
  if (done) return { ran: false, reason: "already ran today" };

  const base = { date: today, mode };
  const id = env.META_ADSET_ID || env.META_CAMPAIGN_ID || "";
  const dailyCap = Math.round(parseFloat(env.ADS_DAILY_CAP ?? "") * 100), monthlyCap = Math.round(parseFloat(env.ADS_MONTHLY_CAP ?? "") * 100);
  const missing = [!env.META_ADS_TOKEN && "META_ADS_TOKEN", !id && "META_CAMPAIGN_ID", !(dailyCap > 0) && "ADS_DAILY_CAP", !(monthlyCap > 0) && "ADS_MONTHLY_CAP"].filter(Boolean) as string[];
  if (missing.length) {
    const reason = `missing config: ${missing.join(", ")}; nothing read or changed`;
    await logEvent(env.DB, "ads_decision", null, { ...base, action: "none", reason, applied: false });
    return { ran: true, reason, decision: { action: "none", reason, from: 0, to: 0, cpb7: null, email: false }, applied: false };
  }

  const meta = new MetaClient(env, env.META_ADS_TOKEN!, deps.f ?? ((u, i) => fetch(u, i)));
  const ref = (env.ADS_REF || "meta").trim();
  let input: AdsInput;
  try {
    const obj = await meta.object(id);
    const winFrom = addDays(today, -7), winTo = addDays(today, -1);
    const [spend7, spendLife, spendMonth, buyers7, buyersLife, hist] = await Promise.all([
      meta.spend(id, { since: winFrom, until: winTo }), meta.spend(id, "maximum"), meta.spend(id, "this_month"),
      ownBuyers(env.DB, ref, new Date(brisMidnight(winFrom)).toISOString(), new Date(brisMidnight(today)).toISOString()),
      ownBuyers(env.DB, ref, new Date(brisMidnight(obj.startDate)).toISOString(), now.toISOString()),
      env.DB.prepare("SELECT detail FROM events WHERE kind='ads_decision' AND at >= ? AND json_valid(detail) ORDER BY id").bind(new Date(now.getTime() - 21 * DAY).toISOString()).all<{ detail: string }>(),
    ]);
    const y = parseInt(today.slice(0, 4), 10), m = parseInt(today.slice(5, 7), 10);
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    input = {
      today, status: obj.status, budgetCents: obj.budgetCents, daysLive: Math.max(0, daysBetween(obj.startDate, today)),
      spend7, buyers7, spendLife, buyersLife, spendMonth, daysLeftInMonth: daysBetween(today, monthEnd) + 1,
      dailyCapCents: dailyCap, monthlyCapCents: monthlyCap,
      history: hist.results.map((r) => JSON.parse(r.detail) as Partial<DayRecord>).filter((h): h is DayRecord => typeof h.date === "string" && typeof h.spend7 === "number" && typeof h.buyers7 === "number")
        // a raise or cut Meta refused (ADS=on, not applied) didn't happen: it neither resets a streak nor starts a cooldown
        .map((h) => ({ date: h.date, spend7: h.spend7, buyers7: h.buyers7, action: (h as { mode?: string }).mode === "on" && !(h as { applied?: boolean }).applied && (h.action === "raise" || h.action === "cut") ? "hold" : String(h.action ?? "") })),
    };
  } catch (e) {
    const reason = `Meta API error, nothing changed: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`;
    await logEvent(env.DB, "ads_decision", null, { ...base, action: "none", reason, applied: false });
    await logEvent(env.DB, "error", null, { where: "ads", e: reason });
    return { ran: true, reason, decision: { action: "none", reason, from: 0, to: 0, cpb7: null, email: false }, applied: false };
  }

  const dec = decide(input);
  let applied = false, applyError: string | null = null;
  if (mode === "on" && (dec.action === "raise" || dec.action === "cut" || dec.action === "pause")) {
    try {
      await meta.post(id, dec.action === "pause" ? { status: "PAUSED" } : { daily_budget: String(dec.to) });
      applied = true;
    } catch (e) { applyError = String(e instanceof Error ? e.message : e).slice(0, 300); }
  }
  const detail = {
    ...base, action: dec.action, reason: dec.reason, from: dec.from, to: dec.to, applied, ...(applyError ? { apply_error: applyError } : {}),
    status: input.status, spend7: input.spend7, buyers7: input.buyers7, cpb7: dec.cpb7 === null ? null : Math.round(dec.cpb7),
    spend_life: input.spendLife, buyers_life: input.buyersLife, spend_month: input.spendMonth, day: input.daysLive + 1, object: id,
  };
  await logEvent(env.DB, "ads_decision", id, detail);
  if (applyError) await logEvent(env.DB, "error", id, { where: "ads-apply", e: applyError });

  if (dec.email || applyError) {
    const dry = mode === "dry-run";
    const what = dec.action === "pause" ? (dry ? "would pause" : applied ? "paused" : "tried to pause") : `${dec.action} ${usd(dec.from)} → ${usd(dec.to)}`;
    const subject = `${dry ? "[dry run] " : ""}Rite ads: ${what} (${applyError ? "Meta refused the change" : dec.reason.replace(/ \(.*$/, "").split(":")[0]})`.slice(0, 140);
    const text = [
      `The ads controller ${what} ${id} on ${today} (ADS=${mode}).`, "",
      `Why: ${dec.reason}`, applyError ? `Meta error: ${applyError}` : "", "",
      `Last 7 days: ${usd(input.spend7)} spent, ${input.buyers7} ?r=${ref} buyer${input.buyers7 === 1 ? "" : "s"}, ${cpbS(costPerBuyer(input.spend7, input.buyers7))} each.`,
      `Since the start (day ${input.daysLive + 1}): ${usd(input.spendLife)} spent, ${input.buyersLife} buyer${input.buyersLife === 1 ? "" : "s"}. This month: ${usd(input.spendMonth)} of ${usd(monthlyCap)}.`, "",
      dec.action === "pause" ? "The controller never un-pauses. To restart, fix what the reason says and resume the campaign in Ads Manager by hand." : "",
      `${env.SITE_URL}/admin/kpi`,
    ].filter((l, k, a) => l !== "" || a[k - 1] !== "").join("\n");
    try { await deps.notify(subject, text); } catch (e) { await logEvent(env.DB, "error", id, { where: "ads-email", e: String(e) }); }
  }
  return { ran: true, decision: dec, applied };
}
