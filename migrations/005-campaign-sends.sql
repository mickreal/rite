-- Adds campaign_sends (gift-season emails, once per address per date). Safe to re-run. Run once: npm run db:migrate:b12
CREATE TABLE IF NOT EXISTS campaign_sends (
  campaign TEXT NOT NULL,
  email TEXT NOT NULL,
  purchase_id TEXT,
  sent_at TEXT NOT NULL,
  UNIQUE(campaign, email)
);
