-- One-off: adds gifts.tax_cents (Stripe Tax collected on a gift checkout). Run once: npm run db:migrate:b12
ALTER TABLE gifts ADD COLUMN tax_cents INTEGER;
