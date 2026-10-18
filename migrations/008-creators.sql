-- Adds the creator and affiliate program tables (build 8, docs/automation-builds.md §8). Safe to re-run.
-- Run once: npm run db:migrate:b8
-- creators: one row per applicant. status pending | active | paused | rejected. code: RITE-HANDLE, a Stripe promotion code
-- (promo_code_id) on the 10%-off coupon. gift_code: their free reading. token: the dashboard link's secret.
-- connect_account_id: their Stripe Connect Express account; payouts_enabled: transfers capability active when last checked.
-- uncapped: 1 once Mick lifts the unpaid-commission cap ($500 by default); cap_notified_at: when Mick was told it was passed.
CREATE TABLE IF NOT EXISTS creators (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  platform TEXT,
  profile_url TEXT,
  audience TEXT,
  note TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_at TEXT,
  code TEXT UNIQUE,
  promo_code_id TEXT UNIQUE,
  gift_code TEXT,
  token TEXT NOT NULL UNIQUE,
  connect_account_id TEXT,
  payouts_enabled INTEGER NOT NULL DEFAULT 0,
  uncapped INTEGER NOT NULL DEFAULT 0,
  cap_notified_at TEXT
);
-- creator_sales: one row per attributed payment (a reading, with its order bump, or a gift). via: code | link.
-- amount_cents as paid (tax-inclusive), tax_cents inside it, refunded_cents as Stripe last reported (cumulative).
CREATE TABLE IF NOT EXISTS creator_sales (
  payment_intent TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  purchase_id TEXT,
  gift_code TEXT,
  created_at TEXT NOT NULL,
  via TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  rate_pct INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_creator_sales_creator ON creator_sales(creator_id, created_at);
-- creator_ledger: the commission ledger. kind commission (+) | reversal (−, a refund). available_at: payable from (the sale
-- + the hold). payout_id: the creator_payouts row that paid it (NULL = unpaid).
CREATE TABLE IF NOT EXISTS creator_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id TEXT NOT NULL,
  payment_intent TEXT,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  payout_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_creator_ledger_unpaid ON creator_ledger(creator_id, payout_id, available_at);
CREATE INDEX IF NOT EXISTS idx_creator_ledger_pi ON creator_ledger(payment_intent);
-- creator_payouts: one Stripe transfer per creator per month per currency. status pending | paid | failed. attempts: the
-- idempotency key's attempt number (a failed payout retried by hand gets a new key; a pending one reuses its key).
CREATE TABLE IF NOT EXISTS creator_payouts (
  id TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL,
  period TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 1,
  transfer_id TEXT,
  created_at TEXT NOT NULL,
  paid_at TEXT,
  error TEXT,
  UNIQUE(creator_id, period, currency)
);
