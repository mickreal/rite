// Creator and affiliate program (docs/automation-builds.md §8): the money rules that don't touch I/O. Commission maths,
// the hold window, payout decisions, the CREATORS switch, handles and codes. creator-ops.ts does the D1 and Stripe calls.

export interface CreatorsEnv {
  CREATORS?: string; CREATOR_COMMISSION_PCT?: string; CREATOR_DISCOUNT_PCT?: string; CREATOR_HOLD_DAYS?: string;
  CREATOR_MIN_PAYOUT_CENTS?: string; CREATOR_UNPAID_CAP_CENTS?: string;
}

/**
 * CREATORS: "on" moves money (monthly Stripe transfers), "dry" works out the payouts and emails them to Mick without calling
 * Stripe, anything else (default "off") runs no payouts at all. Attribution and the commission ledger run in every mode, so
 * nothing earned is lost before the switch is turned on.
 */
export type CreatorsMode = "off" | "dry" | "on";
export function creatorsMode(env: Pick<CreatorsEnv, "CREATORS">): CreatorsMode {
  const v = (env.CREATORS ?? "").trim().toLowerCase();
  return v === "on" ? "on" : v === "dry" || v === "dry-run" || v === "dryrun" ? "dry" : "off";
}

const int = (v: string | undefined, d: number, lo = 0, hi = Number.MAX_SAFE_INTEGER) => { const n = parseInt(v ?? "", 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : d; };
export const commissionPct = (env: CreatorsEnv) => int(env.CREATOR_COMMISSION_PCT, 30, 0, 100);
export const discountPct = (env: CreatorsEnv) => int(env.CREATOR_DISCOUNT_PCT, 10, 1, 100);
/** Days a commission waits before it can be paid: past the 14-day refund window. */
export const holdDays = (env: CreatorsEnv) => int(env.CREATOR_HOLD_DAYS, 15, 0, 365);
export const minPayoutCents = (env: CreatorsEnv) => int(env.CREATOR_MIN_PAYOUT_CENTS, 2500, 1);
/** Unpaid commission a creator can be paid until Mick lifts their cap (spec: $500). */
export const unpaidCapCents = (env: CreatorsEnv) => int(env.CREATOR_UNPAID_CAP_CENTS, 50000, 1);

/**
 * Commission on one sale, in cents: rate × the net amount still kept. Net = what was paid minus the tax in it (prices are
 * tax-inclusive, so tax_cents is part of amount_cents); a refund (full or partial) keeps only the unrefunded share of that
 * net, pro rata. Rounded to the nearest cent once, on the whole, so a sale's commission is the same however it is reached.
 */
export function commissionCents(amountCents: number, taxCents: number | null | undefined, refundedCents: number, ratePct: number): number {
  const amount = Math.max(0, Math.round(amountCents));
  if (!amount || ratePct <= 0) return 0;
  const tax = Math.min(amount, Math.max(0, Math.round(taxCents ?? 0)));
  const kept = Math.max(0, amount - Math.max(0, Math.round(refundedCents)));
  return Math.round(kept * (amount - tax) * ratePct / (100 * amount));
}

/** When a commission recorded at `atIso` becomes payable. */
export const availableAt = (atIso: string, days: number) => new Date(Date.parse(atIso) + days * 86400000).toISOString();

// ---------- payouts ----------
export type PayoutSkip = "paused" | "below_min" | "over_cap" | "no_account" | "not_ready" | "nothing";
/** Whether a creator's payable balance in one currency is paid this run, and if not, why. */
export function payoutDecision(o: { netCents: number; minCents: number; capCents: number; uncapped: boolean; status: string; hasAccount: boolean }): "pay" | PayoutSkip {
  if (o.netCents <= 0) return "nothing";
  if (o.status !== "active") return "paused";
  if (o.netCents < o.minCents) return "below_min";
  if (!o.uncapped && o.netCents > o.capCents) return "over_cap";
  if (!o.hasAccount) return "no_account";
  return "pay";
}
export const SKIP_LABEL: Record<PayoutSkip, string> = {
  paused: "paused", below_min: "below the minimum (carried to next month)", over_cap: "over the unpaid cap (lift it in /admin/creators)",
  no_account: "no Stripe account yet (onboarding not started)", not_ready: "Stripe onboarding not finished", nothing: "nothing payable",
};

// Payouts run on the 1st of the month, from 09:00 Brisbane (UTC+10, no DST), inside the hourly cron.
const BRIS_MS = 10 * 3600000;
const bris = (d: Date) => new Date(d.getTime() + BRIS_MS);
export const payoutPeriod = (now: Date) => bris(now).toISOString().slice(0, 7);
export const PAYOUT_HOUR = 9;
export function payoutDue(now: Date): boolean { const b = bris(now); return b.getUTCDate() === 1 && b.getUTCHours() >= PAYOUT_HOUR; }
/** The next payout day (YYYY-MM-DD, Brisbane): the 1st of next month, or today if it's the 1st before the run. */
export function nextPayoutDate(now: Date): string {
  const b = bris(now);
  if (b.getUTCDate() === 1 && b.getUTCHours() < PAYOUT_HOUR) return b.toISOString().slice(0, 10);
  return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
/** Stripe idempotency key for one payout attempt (a pending retry reuses it; a retry after a failure gets the next attempt). */
export const payoutKey = (payoutId: string, attempt: number) => `rite-${payoutId}-a${attempt}`;
export const payoutId = (creatorId: string, period: string, currency: string) => `po_${creatorId}_${period}_${currency.toLowerCase()}`;

/** A Stripe error that means Connect isn't set up on the platform account (so no transfer or connected account can exist). "connection" errors don't match. */
export const connectUnavailable = (e: unknown) => /\bconnect\b|platform profile|express accounts|can only create transfers/i.test(String((e as { message?: string })?.message ?? e));

// ---------- handles, codes ----------
/** A creator's handle as it appears in `?c=`: lower-case, without the @, letters, digits, dot and underscore, 2–30 long. */
export function normHandle(raw: string): string | null {
  const h = raw.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9._]{2,30}$/.test(h) && /[a-z0-9]/.test(h) ? h : null;
}
/** The personal code: RITE-HANDLE (Stripe promotion codes allow letters, digits and dashes). */
export const codeFor = (handle: string) => `RITE-${handle.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;
export function normCode(raw: string): string | null {
  const c = raw.trim().toUpperCase().replace(/\s+/g, "");
  return /^[A-Z0-9-]{4,40}$/.test(c) ? c : null;
}
/** The 30-day first-party cookie the `?c=` link sets. */
export const REF_COOKIE = "rite_c";
export const REF_DAYS = 30;
export const refCookie = (handle: string) => `${REF_COOKIE}=${handle}; Path=/; Max-Age=${REF_DAYS * 86400}; Secure; SameSite=Lax`;
/** The Stripe coupon every creator code points at, ensured by id. */
export const couponId = (pct: number) => `rite-creator-${pct}`;
