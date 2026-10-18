-- Adds season_invoices (Saturn Season revenue in the Monday KPI email). Safe to re-run. Run once: npm run db:migrate:b10
-- One row per paid Season invoice (Stripe invoice.paid / invoice.payment_succeeded), keyed on the invoice id so a redelivered
-- event or the second of the two events stores nothing new. amount_cents: amount_paid (tax included); tax_cents: the tax on
-- it (total_taxes), 0 when Stripe Tax is off; refunded_cents: refunded on the invoice's charge (charge.refunded).
CREATE TABLE IF NOT EXISTS season_invoices (
  invoice_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  purchase_id TEXT,
  paid_at TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT,
  billing_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_season_invoices_paid ON season_invoices(paid_at);
