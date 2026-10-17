-- One-off: adds purchases.tax_cents (Stripe Tax collected on the session) to a database created before schema.sql had it.
-- Run once: npm run db:migrate:b12   (each file fails with "duplicate column name" if already applied; that is fine)
ALTER TABLE purchases ADD COLUMN tax_cents INTEGER;
