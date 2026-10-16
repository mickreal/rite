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
  ref TEXT                          -- ?r= attribution
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
  delivered_at TEXT
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
  redeemed_at TEXT
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
