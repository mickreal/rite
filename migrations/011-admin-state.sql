-- Adds admin_state (b12-admin, README "Admin"). Safe to re-run. Run once: npm run db:migrate:admin
-- Small key/value rows for the admin sign-in: session_version (rotated by "Sign out everywhere", so every older cookie
-- fails) and totp_last_step (the last authenticator time step used, so each code works once). Until this is applied the
-- Worker keeps both in KV instead, which works but is only eventually consistent across Cloudflare locations.
CREATE TABLE IF NOT EXISTS admin_state (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
