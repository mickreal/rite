-- One-off: adds subscriptions.plan to a database created before schema.sql had it.
-- Run once: npm run db:migrate:plan   (fails with "duplicate column name" if already applied; that is fine)
ALTER TABLE subscriptions ADD COLUMN plan TEXT;
