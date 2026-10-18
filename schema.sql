-- Rite — D1 schema. Apply with: wrangler d1 execute rite --remote --file=schema.sql

CREATE TABLE IF NOT EXISTS previews (
  id TEXT PRIMARY KEY,              -- short random id, used to resume checkout
  created_at TEXT NOT NULL,
  birth_date TEXT NOT NULL,         -- YYYY-MM-DD (local)
  birth_time TEXT,                  -- HH:MM (local) or NULL
  place_label TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  tz TEXT NOT NULL,                 -- IANA
  birth_utc TEXT NOT NULL,          -- ISO
  natal_lon REAL NOT NULL,          -- tropical ecliptic longitude 0-360
  natal_sign TEXT NOT NULL,
  natal_degree REAL NOT NULL,       -- 0-30 within sign
  natal_house INTEGER,              -- 1-12 or NULL
  return_number INTEGER NOT NULL,
  window_start TEXT NOT NULL,       -- YYYY-MM-DD
  window_end TEXT NOT NULL,
  peak_start TEXT NOT NULL,
  peak_end TEXT NOT NULL,
  hits TEXT NOT NULL,               -- JSON array of YYYY-MM-DD
  phase TEXT NOT NULL,
  preview_text TEXT,
  ref TEXT,                         -- ?r= attribution
  price_arm TEXT                    -- price test arm 'A' | 'B' while PRICE_TEST runs; NULL otherwise (migrations/004)
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,              -- report token (unguessable)
  preview_id TEXT NOT NULL REFERENCES previews(id),
  created_at TEXT NOT NULL,
  email TEXT NOT NULL,
  first_name TEXT,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL,
  tier TEXT NOT NULL,               -- 'full' | 'notime'
  report_md TEXT,                   -- generated report (markdown)
  report_json TEXT,                 -- inputs handed to the LLM, for audit
  status TEXT NOT NULL DEFAULT 'paid',  -- paid | generated | failed | refunded
  delivered_at TEXT,
  tax_cents INTEGER                 -- Stripe Tax on the session (total_details.amount_tax), included in amount_cents; NULL before migrations/002
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,              -- stripe subscription id
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,             -- active | past_due | canceled | complete
  last_sent_at TEXT,
  next_send_local_hour INTEGER NOT NULL DEFAULT 7,
  plan TEXT                         -- 'month' | 'year' (from Checkout metadata); NULL for rows created before the column existed.
                                    -- Databases created before this column: run `npm run db:migrate:plan` once (migrations/001-subscriptions-plan.sql).
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,               -- visit | preview | checkout | paid | generated | emailed | refund | season_sent | error
  ref TEXT,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_purchases_preview ON purchases(preview_id);
CREATE INDEX IF NOT EXISTS idx_events_kind_at ON events(kind, at);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  preview_id TEXT NOT NULL REFERENCES previews(id),
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  hit_date TEXT NOT NULL,          -- the pass this reminder is for (YYYY-MM-DD)
  send_on TEXT NOT NULL,           -- hit_date - 7 days
  sent_at TEXT,
  UNIQUE(preview_id, email, hit_date)
);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(send_on, sent_at);

CREATE TABLE IF NOT EXISTS asks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  created_at TEXT NOT NULL,
  q TEXT NOT NULL,
  a TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asks_purchase ON asks(purchase_id);

CREATE TABLE IF NOT EXISTS stage_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  stage_key TEXT NOT NULL,          -- contact | integration | close | p2 | p4 | p6 | return
  label TEXT NOT NULL,              -- human name of what opens
  on_date TEXT NOT NULL,            -- YYYY-MM-DD the stage opens
  send_on TEXT NOT NULL,            -- on_date - 7 days
  sent_at TEXT,
  UNIQUE(purchase_id, stage_key)
);
CREATE INDEX IF NOT EXISTS idx_stage_reminders_due ON stage_reminders(send_on, sent_at);

CREATE TABLE IF NOT EXISTS gifts (
  code TEXT PRIMARY KEY,            -- short code the recipient enters / link they open
  created_at TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_name TEXT,
  message TEXT,                     -- optional note from the buyer
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent TEXT,
  amount_cents INTEGER NOT NULL,
  redeemed_purchase_id TEXT REFERENCES purchases(id),
  redeemed_at TEXT,
  tax_cents INTEGER                 -- as purchases.tax_cents, for gift checkouts; NULL for order-bump codes (the tax is on the purchase)
);

-- Day-3 and day-10 follow-up emails to reading owners (docs/emails.md §2, §3). Scheduled when a reading is written;
-- send_on is the reader's local date. sent_at: ISO time sent, or 'skipped:<reason>' / 'expired'.
CREATE TABLE IF NOT EXISTS followups (
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  kind TEXT NOT NULL,               -- day3 | day10
  send_on TEXT NOT NULL,            -- YYYY-MM-DD, local to the birthplace zone
  sent_at TEXT,
  UNIQUE(purchase_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups(send_on, sent_at);

-- "Tell us how your return is going" at the end of a reading. Opt-in; can_quote = 1 only when the reader ticked
-- "Rite can quote this, first name only". One per purchase per day.
CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purchase_id TEXT NOT NULL REFERENCES purchases(id),
  created_at TEXT NOT NULL,
  text TEXT NOT NULL,               -- up to 2,000 characters
  can_quote INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stories_purchase ON stories(purchase_id, created_at);

-- One-off campaign emails (the gift-season emails on 1 and 15 Dec). One row per campaign per address, claimed before the
-- send so overlapping cron runs can't double-send; a failed send deletes its claim so the next hour retries.
CREATE TABLE IF NOT EXISTS campaign_sends (
  campaign TEXT NOT NULL,           -- e.g. gift-2026-12-01
  email TEXT NOT NULL,
  purchase_id TEXT,                 -- the purchase whose stop link the email carried
  sent_at TEXT NOT NULL,
  UNIQUE(campaign, email)
);

-- Support inbox (build 3, src/inbox.ts): every email to hello@, its classification and what was done. One row per message.
-- status: received | handled | forwarded | ignored | awaiting_delete | deleted. action: what it did, or would do with
-- INBOX_AUTO off. outcome: the result, or why it went to Mick. thread_key: the first message's id in the thread.
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  from_addr TEXT NOT NULL,          -- the From header's address, lower-cased
  subject TEXT,
  body_text TEXT,                   -- text/plain (or stripped HTML), up to 20,000 characters
  message_id TEXT,
  in_reply_to TEXT,
  thread_key TEXT NOT NULL,
  auth_pass INTEGER NOT NULL DEFAULT 0,   -- 1 when Email Routing's auth results show aligned SPF or DKIM (or DMARC) pass
  auth_detail TEXT,                 -- the auth results header it read, for checking
  has_attachment INTEGER NOT NULL DEFAULT 0,
  class TEXT,                       -- where_is_reading | refund | stop | wrong_details | delete_data | how_it_works | gift_issue | other
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'received',
  action TEXT,
  outcome TEXT,
  draft TEXT,                       -- the reply sent, or drafted for Mick
  reply_message_id TEXT             -- Resend's id for the reply
);
CREATE INDEX IF NOT EXISTS idx_support_thread ON support_messages(thread_key, from_addr);
CREATE INDEX IF NOT EXISTS idx_support_msgid ON support_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_support_received ON support_messages(received_at);

-- Support inbox UI (build 3b, /admin/inbox, migration 007). One row per thread: status needs_mick | assistant |
-- mick_replied | closed; owner assistant | mick (taken over: the assistant only drafts); notified_msg_id: the last
-- customer message Mick got a note about.
CREATE TABLE IF NOT EXISTS support_threads (
  thread_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'needs_mick',
  owner TEXT NOT NULL DEFAULT 'assistant',
  updated_at TEXT NOT NULL,
  notified_msg_id TEXT
);
-- Every outbound support email: the assistant's replies and Mick's. nonce: the reply form's one-time value (no double send).
CREATE TABLE IF NOT EXISTS support_replies (
  id TEXT PRIMARY KEY,
  thread_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author TEXT NOT NULL,             -- assistant | mick
  to_addr TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  in_reply_to TEXT,                 -- the customer message it answers (Message-ID)
  references_hdr TEXT,
  nonce TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sending',   -- sending | sent | failed
  resend_id TEXT,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_replies_thread ON support_replies(thread_key, created_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status, updated_at);

-- Creator and affiliate program (build 8, docs/automation-builds.md §8, migration 008). Comments in migrations/008-creators.sql.
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
-- Saturn Season revenue (migration 009): one row per paid Season invoice, keyed on Stripe's invoice id (invoice.paid and
-- invoice.payment_succeeded both arrive; the second is a no-op). amount_cents is amount_paid, tax included; the tax column is the
-- tax in it (0 with Stripe Tax off); refunded_cents comes from charge.refunded. The KPI email counts amount − tax, less refunds.
CREATE TABLE IF NOT EXISTS season_invoices (
  invoice_id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  purchase_id TEXT,
  paid_at TEXT NOT NULL,            -- ISO; Stripe's status_transitions.paid_at, else the time the webhook arrived
  amount_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  refunded_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT,
  billing_reason TEXT               -- subscription_create (the first month or year) | subscription_cycle (a renewal) | ...
);
CREATE INDEX IF NOT EXISTS idx_season_invoices_paid ON season_invoices(paid_at);
-- Year-ahead reading (build 11, migration 010): one row per year-ahead bought for an existing reading. Comments in
-- migrations/010-year-ahead.sql.
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
