-- Adds support_messages (build 3, the inbox assistant). Safe to re-run. Run once: npm run db:migrate:b3
CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  thread_key TEXT NOT NULL,
  auth_pass INTEGER NOT NULL DEFAULT 0,
  auth_detail TEXT,
  has_attachment INTEGER NOT NULL DEFAULT 0,
  class TEXT,
  confidence REAL,
  status TEXT NOT NULL DEFAULT 'received',
  action TEXT,
  outcome TEXT,
  draft TEXT,
  reply_message_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_thread ON support_messages(thread_key, from_addr);
CREATE INDEX IF NOT EXISTS idx_support_msgid ON support_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_support_received ON support_messages(received_at);
