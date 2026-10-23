// Money rules that don't touch I/O: Stripe Tax and local-price parameters, the price test (arm assignment and its
// stopping rule) and the gift-season dates. index.ts does the Stripe, D1 and email calls around these.

/** Stripe's tax code for "general electronically supplied services". */
export const TAX_CODE = "txcd_10000000";

export interface CommerceEnv {
  STRIPE_TAX?: string; LOCAL_PRICES?: string;
  PRICE_FULL_CENTS: string; PRICE_NOTIME_CENTS: string;
  PRICE_TEST?: string; PRICE_TEST_B_FULL_CENTS?: string; PRICE_TEST_B_NOTIME_CENTS?: string;
  PRICE_BUMP_CENTS?: string;
  GIFT_SEASON_START?: string; GIFT_SEASON_END?: string;
}

// ---------- Stripe Tax ----------
/** Stripe Tax is on only when the var says exactly "on" (wrangler.toml sets "on"; anything else, or unset, is today's behaviour). */
export const taxOn = (env: Pick<CommerceEnv, "STRIPE_TAX">) => env.STRIPE_TAX === "on";

/**
 * The extra Checkout Session params when Stripe Tax is on. Billing address "auto": Checkout asks only for what the tax
 * calculation needs (usually country and postcode, which the card form collects anyway), not a full street address,
 * so checkout doesn't get longer. No session passes an existing `customer`, so no `customer_update` is needed.
 */
export const sessionTax = (env: Pick<CommerceEnv, "STRIPE_TAX">) =>
  taxOn(env) ? { automatic_tax: { enabled: true }, billing_address_collection: "auto" as const } : {};

// ---------- local prices ----------
/** Products a LOCAL_PRICES entry can price. `gift` falls back to `full`; arm B of the price test uses `full_b` / `notime_b`; `year_ahead` is build 11. */
export type PriceProduct = "full" | "notime" | "gift" | "bump" | "season_month" | "season_year" | "full_b" | "notime_b" | "year_ahead";
export type LocalPrices = Record<string, Partial<Record<PriceProduct, number>>>;

/**
 * LOCAL_PRICES: JSON of currency → cents per product, e.g. {"gbp":{"full":2300,"notime":1500,"bump":1200}}. Off (null) when
 * unset, empty, "off" or not valid; set amounts only, never a live conversion. Currencies are lowercased; the base currency
 * and non-positive or non-integer amounts are dropped.
 */
export function localPrices(env: Pick<CommerceEnv, "LOCAL_PRICES">, base = "usd"): LocalPrices | null {
  const raw = (env.LOCAL_PRICES ?? "").trim();
  if (!raw || raw === "off") return null;
  let j: unknown;
  try { j = JSON.parse(raw); } catch { return null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const out: LocalPrices = {};
  for (const [cur, v] of Object.entries(j as Record<string, unknown>)) {
    const c = cur.toLowerCase();
    if (!/^[a-z]{3}$/.test(c) || c === base.toLowerCase() || !v || typeof v !== "object") continue;
    const row: Partial<Record<PriceProduct, number>> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (typeof n === "number" && Number.isInteger(n) && n > 0) row[k as PriceProduct] = n;
    if (Object.keys(row).length) out[c] = row;
  }
  return Object.keys(out).length ? out : null;
}

/** Stripe `currency_options` for one product from LOCAL_PRICES, or undefined when no currency prices it. */
export function currencyOptions(lp: LocalPrices | null, product: PriceProduct, tax: boolean): Record<string, { unit_amount: number; tax_behavior?: "inclusive" }> | undefined {
  if (!lp) return undefined;
  const out: Record<string, { unit_amount: number; tax_behavior?: "inclusive" }> = {};
  for (const [cur, row] of Object.entries(lp)) {
    const n = row[product] ?? (product === "gift" ? row.full : undefined);
    if (n) out[cur] = { unit_amount: n, ...(tax ? { tax_behavior: "inclusive" as const } : {}) };
  }
  return Object.keys(out).length ? out : undefined;
}

/** Short stable hash (FNV-1a, 32-bit) as hex. Used for lookup keys and the price-test split. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
export const hashHex = (s: string) => fnv1a(s).toString(16).padStart(8, "0");

/**
 * Lookup-key suffix for a Stripe Price: `_v2` when it carries tax_behavior "inclusive", `_l<hash>` when it carries local
 * prices (so changing LOCAL_PRICES makes new Prices rather than reusing ones with old amounts). Empty: today's Prices.
 */
export function priceKeySuffix(tax: boolean, opts: Record<string, unknown> | undefined): string {
  return `${tax ? "_v2" : ""}${opts ? `_l${hashHex(JSON.stringify(opts))}` : ""}`;
}

// ---------- order bump ----------
/** The order-bump price in cents ("Add a reading for someone else"), or 0 when PRICE_BUMP_CENTS is unset or "0" (no bump). */
export const bumpCents = (env: Pick<CommerceEnv, "PRICE_BUMP_CENTS">) => { const n = parseInt(env.PRICE_BUMP_CENTS ?? "", 10); return n > 0 ? n : 0; };

// ---------- price test ----------
export type Arm = "A" | "B";
export const PRICE_TEST_MAX_DAYS = 14;
export const PRICE_TEST_MAX_PER_ARM = 600;

/** Deterministic arm for a preview id: the same id always gets the same arm; ids split about 50/50. */
export const armFor = (previewId: string): Arm => (fnv1a(`rite-price-test:${previewId}`) & 1 ? "B" : "A");

/** The reading price (cents) a preview sees: its stored arm, whatever the flag says now (a shown price never changes). */
export function armCents(env: CommerceEnv, arm: string | null | undefined, tier: "full" | "notime"): number {
  const base = parseInt(tier === "full" ? env.PRICE_FULL_CENTS : env.PRICE_NOTIME_CENTS, 10);
  if (arm !== "B") return base;
  const b = parseInt((tier === "full" ? env.PRICE_TEST_B_FULL_CENTS : env.PRICE_TEST_B_NOTIME_CENTS) ?? "", 10);
  return b > 0 ? b : base;
}

export interface ArmStats { previews: number; purchases: number; cents: number }
export interface PriceTestState { first: string | null; A: ArmStats; B: ArmStats }

/** Whether the running test should stop now, and why: 14 days after the first assignment, or 600 previews in each arm. */
export function priceTestStop(s: PriceTestState, now = new Date()): "days" | "previews" | null {
  if (!s.first) return null;
  if (now.getTime() - Date.parse(s.first) >= PRICE_TEST_MAX_DAYS * 86400000) return "days";
  if (s.A.previews >= PRICE_TEST_MAX_PER_ARM && s.B.previews >= PRICE_TEST_MAX_PER_ARM) return "previews";
  return null;
}

/** Revenue per preview, in cents (2 dp). */
export const perPreview = (a: ArmStats) => (a.previews ? Math.round(a.cents / a.previews * 100) / 100 : 0);
/** The winner by revenue per preview; a tie goes to A (no change). */
export const priceTestWinner = (s: PriceTestState): Arm => (perPreview(s.B) > perPreview(s.A) ? "B" : "A");

// ---------- gift season ----------
const DEFAULT_START = "2026-11-15", DEFAULT_END = "2026-12-22";
const isoDate = (v: string | undefined, d: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : d);
export const giftSeason = (env: Pick<CommerceEnv, "GIFT_SEASON_START" | "GIFT_SEASON_END">) => ({ start: isoDate(env.GIFT_SEASON_START, DEFAULT_START), end: isoDate(env.GIFT_SEASON_END, DEFAULT_END) });

/** Whether `day` (YYYY-MM-DD, UTC by default) is inside the gift season, both ends included. */
export function giftSeasonOn(env: Pick<CommerceEnv, "GIFT_SEASON_START" | "GIFT_SEASON_END">, day = new Date().toISOString().slice(0, 10)): boolean {
  const { start, end } = giftSeason(env);
  return day >= start && day <= end;
}

/** The gift-season email days: 1 and 15 December of the season's year, kept only if they fall inside the season. */
export function giftEmailDates(env: Pick<CommerceEnv, "GIFT_SEASON_START" | "GIFT_SEASON_END">): string[] {
  const { start, end } = giftSeason(env);
  const y = start.slice(0, 4);
  return [`${y}-12-01`, `${y}-12-15`].filter((d) => d >= start && d <= end);
}
/** Not before this local hour on an email day, in the buyer's birthplace zone (the zone we have, as for follow-ups). */
export const GIFT_EMAIL_HOUR = 9;

/** Cents as a display amount without the symbol: 2900 → "29", 2950 → "29.50". */
export const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
