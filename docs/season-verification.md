# Saturn Season: live verification checklist

What was built on the `worktree-agent-aeca7be80c746f089` branch (GTM plan S1–S4, S6 and overnight item 6) and how to
check it against real Stripe, Resend and D1. Nothing here was exercised live: Stripe and D1 calls were written against
the SDK's types (stripe v23, API `2026-09-30.endive`) and the date/plan maths is unit-tested in `test/season.test.ts`.

## 0. Before deploying

- [ ] `npm test` and `npm run typecheck` green (59 tests).
- [ ] **D1 column**: `npm run db:migrate:plan` once against the remote database (adds `subscriptions.plan`). Every
      Season query now selects `s.plan`, so the cron and the manage page fail until this is applied. A fresh database
      gets the column from `schema.sql`; the migration errors with "duplicate column name" on one that already has it, which is fine.
- [ ] **Stripe webhook events**: Developers → Webhooks → the Rite endpoint → add `invoice.payment_failed` and
      `invoice.paid` to the subscribed events (existing: `checkout.session.completed`, `customer.subscription.deleted`,
      `charge.refunded`). Without these, failed renewals keep getting notes.
- [ ] Deploy. First Season checkout after deploy creates the Product "Rite — Saturn Season" and two Prices (lookup keys
      `rite_season_month_700_usd_live` and `rite_season_year_5900_usd_live`) and caches their ids in KV
      `stripe:season:prices`. Check they appear once in Stripe → Product catalogue. If you ever change
      `PRICE_SEASON_*_CENTS`, delete that KV key; new Prices are created under new lookup keys and the old ones stay
      attached to existing subscriptions.

## 1. Subscribe (S1 welcome note)

- [ ] Open your own reading `/r/<tok>` → Saturn Season card → "$7 a month". Checkout shows the real Price (not an inline
      line item). Use the 100% promo code.
- [ ] After paying you land on `/season/manage/<tok>?ok=started`; the page says Stripe is confirming and refreshes itself
      until the webhook has written the row (status "On", plan "$7 a month").
- [ ] Within a minute the **welcome note** arrives (subject "Saturn Season starts — …"). It has: the orb line, the
      model's paragraph, "One thing this week:", "One line to carry:", a "Coming up in the next 30 days:" list (or
      "nothing dated"), "Reread: <chapter>: /r/<tok>#c7|#c3|#c5", and the manage link.
- [ ] Every date in the note is one the reading already shows. If the model invented one, `events` has
      `season-dates-ungrounded` and the note went out with the code-written fallback paragraph instead; check
      `SELECT * FROM events WHERE kind='error' AND detail LIKE '%season%'`.
- [ ] `events` has `season_start` (with `plan`) and `season_welcome` (`result: "sent"`); `subscriptions.last_sent_at`
      is set, so the Monday cron skips you for six days.
- [ ] `POST /admin/season/<tok>?to=you@x` still forces a note without touching the schedule.

## 2. Manage page (S2)

- [ ] `/season/manage/<tok>` shows status, plan, next note (next Monday 07:00 in the preview's timezone, e.g.
      "Mon 19 Oct, 07:00 (Australia/Brisbane)") and the window-close date.
- [ ] `/season/stop/<tok>` (the link in older notes) 301s to the manage page.
- [ ] The reading's Season card now says "Manage it" and links here.

## 3. Plan switch (S2, S3)

- [ ] Monthly → yearly: "Switch to $59 a year" appears only when the window end is ≥ 9 months away (the reading page
      hides the yearly button under the same rule). After switching: flash "Done. Your plan is now $59 a year", Stripe
      subscription item now on the yearly Price with a proration line (credit for the unused month, charge for the year;
      `proration_behavior: create_prorations` means the proration is invoiced at the next cycle, not instantly — if you
      want it charged on the spot change it to `always_invoice` in `POST /season/plan/:tok`).
- [ ] Yearly → monthly: switches now; Stripe holds the unused yearly amount as a customer credit.
- [ ] `events` has `season_plan {from, to}`; `subscriptions.plan` updated.
- [ ] Posting `plan=year` when yearly isn't allowed, or the same plan, is a silent no-op redirect.

## 4. Cancel

- [ ] "Stop Saturn Season" → browser confirm → Stripe subscription `canceled` immediately → flash "Stopped." →
      `subscriptions.status='canceled'`, `events.season_cancel`. The `customer.subscription.deleted` echo leaves the
      row as `canceled` (it only touches `active`/`past_due` rows now).
- [ ] The reading card goes back to the subscribe offer.

## 5. Yearly auto-close refund (S3)

Can only be seen on a subscription whose window actually closes, so simulate:
- [ ] Subscribe yearly on a test reading, then in the Stripe test dashboard confirm `invoices.list` for the subscription
      returns a paid invoice whose `payments.data[0].payment.payment_intent` is set (the refund is issued against it).
- [ ] The maths: full months between today and the item's `current_period_end`, refund `round(5900 × unused / 12)`,
      capped at `invoice.amount_paid` (promo codes). With a 100% promo the refund is 0 and `season_refund` logs
      `reason: "nothing paid"`.
- [ ] Any Stripe failure logs `error` with `where: season-close-*` or `season-refund`; the subscription row still moves
      to `complete` and the goodbye email still goes.
- [ ] `/refunds` already promises the unused months back; the manage page says so under the yearly switch.

## 6. Failed payment (S6)

- [ ] In test mode, attach the card `4000 0000 0000 0341` to a subscription and let a renewal fail (or use the
      dashboard's "Send test webhook" for `invoice.payment_failed` with the subscription id in
      `parent.subscription_details.subscription`). Row goes `past_due`, `events.season_past_due`; `runSeason` skips it
      (selects `status='active'` only); the manage page shows "Paused: last payment failed" with a stop button.
- [ ] `invoice.paid` for the same subscription → `active` again, `events.season_resumed`.

## 7. Window-open capture (overnight item 6)

- [ ] A preview whose window opens more than 12 months out (e.g. born mid-2000) shows "Tell me when my window opens"
      with one field; submitting posts `kind=window_open`, lands on `?reminded=window` ("One email, a month before your
      window opens in <Mon YYYY>") and stores a `reminders` row with `hit_date = window_start`, `send_on = window_start − 30 days`.
- [ ] PostHog: `remind_submit {kind: "window_open"}` (pass reminders now send `{kind: "pass"}`).
- [ ] To see the email without waiting: `UPDATE reminders SET send_on = date('now') WHERE hit_date = window_start` on
      that row and wait for the hour. Subject "Your Saturn return window opens on <date>".
- [ ] A preview inside or within a year of its window still shows the pass-reminder card.

## Not done / decisions for Mick

- Proration is `create_prorations` (billed at the next invoice) as specified; `always_invoice` charges the difference
  today and is a one-word change.
- The welcome note reuses the weekly template with a two-line welcome preface; no separate welcome copy.
- Day-10 Season nudge and the Season line in stage reminders (S5) were out of scope for this pass.
- `npm run db:migrate:plan` is a separate step rather than inside `schema.sql`: D1 runs a file as one batch, so a
  failing `ALTER` would roll back the whole schema on a database that already has the column.
