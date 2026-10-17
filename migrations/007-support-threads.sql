-- Adds support_threads and support_replies (build 3b, the inbox UI at /admin/inbox). Safe to re-run. Run once: npm run db:migrate:b3b
-- support_threads: one row per thread (support_messages.thread_key). status: needs_mick | assistant | mick_replied | closed.
-- owner: assistant (may act on new messages) | mick (taken over: the assistant only drafts). notified_msg_id: the last
-- customer message Mick was sent a note about (one note per new message).
CREATE TABLE IF NOT EXISTS support_threads (
  thread_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'needs_mick',
  owner TEXT NOT NULL DEFAULT 'assistant',
  updated_at TEXT NOT NULL,
  notified_msg_id TEXT
);
-- support_replies: every outbound support email (the assistant's automatic replies and Mick's from /admin/inbox).
-- nonce: the reply form's one-time value (UNIQUE, so a resubmitted form never sends twice). status: sending | sent | failed.
CREATE TABLE IF NOT EXISTS support_replies (
  id TEXT PRIMARY KEY,
  thread_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  in_reply_to TEXT,
  references_hdr TEXT,
  nonce TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'sending',
  resend_id TEXT,
  sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_support_replies_thread ON support_replies(thread_key, created_at);
CREATE INDEX IF NOT EXISTS idx_support_threads_status ON support_threads(status, updated_at);
