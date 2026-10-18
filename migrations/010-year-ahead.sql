-- Adds year_aheads (the year-ahead reading, build 11, docs/automation-builds.md §11). Safe to re-run. Run once: npm run db:migrate:b11
-- One row per year-ahead bought: the next 12 months of Saturn for an existing reading (purchase_id), from start (YYYY-MM-01)
-- to end (exclusive). year: start's calendar year, the page is /r/<purchase_id>/year/<year>. Fulfilment inserts once per
-- Checkout Session (stripe_session_id UNIQUE); the partial unique index allows one live year-ahead per reading per year (a
-- refunded one doesn't block buying it again). amount_cents as paid (tax-inclusive), tax_cents inside it.
-- status: paid | writing | generated | failed | refunded. writing_at: the generation lock's time. facts_json: the engine's
-- year (src/year-ahead.ts) the prose was written around; report_md: the model's JSON; inputs_json: what it was given.
CREATE TABLE IF NOT EXISTS year_aheads (
  id TEXT PRIMARY KEY,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  year INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  email TEXT NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL,
  tax_cents INTEGER,
  currency TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  writing_at TEXT,
  facts_json TEXT,
  inputs_json TEXT,
  report_md TEXT,
  delivered_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_year_aheads_live ON year_aheads(purchase_id, year) WHERE status != 'refunded';
CREATE INDEX IF NOT EXISTS idx_year_aheads_pi ON year_aheads(stripe_payment_intent);
CREATE INDEX IF NOT EXISTS idx_year_aheads_created ON year_aheads(created_at);
