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
  status TEXT NOT NULL,             -- active | canceled | complete
  last_sent_at TEXT,
  next_send_local_hour INTEGER NOT NULL DEFAULT 7
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
