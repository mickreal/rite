-- One-off: adds previews.price_arm (the price test arm, 'A' | 'B', NULL when no test runs). Run once: npm run db:migrate:b12
ALTER TABLE previews ADD COLUMN price_arm TEXT;
