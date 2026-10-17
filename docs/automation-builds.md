# Automation builds: the ten that make Rite hands-off

Written 17 Oct 2026. Companion to the "Rite: path to $1M" doc and `growth-plan.md`. Each build has a scope, the design, what Mick has to provide, how we know it works, and its effort in focused agent days. Order is by what launch needs first.

**Principles for every build**
- Runs on what we already have: the Worker (Hono, D1, KV, Cron), Stripe, Resend, ElevenLabs, PostHog. New vendors only where a platform forces it (posting APIs, ad APIs).
- Every automated action writes an `events` row, so `/admin`, the error digest and the KPI email see it.
- Anything that spends money or moves money has a hard cap in config and a kill switch (`[vars]` flag, deploy to change).
- Anything that answers a customer acts only inside written policy (`/refunds`, `/privacy`, `docs/support-macros.md`); everything else goes to Mick with a draft.
- Tests for the money paths (refunds, payouts, budget changes) before they go live, same as the Season and refund work.

## Summary

| # | Build | Needed by | Effort | Mick provides | Monthly cost |
|---|---|---|---|---|---|
| 1 | Stripe Tax | Before launch | 0.5 day + registrations | Stripe Tax on; EU OSS and UK VAT registrations | 0.5% of taxed sales (Stripe Tax Basic) |
| 2 | Order bump + gift season | Before launch (gifts peak Nov–Dec) | 1.5 days | Approve copy | — |
| 3 | Inbox assistant (support + refunds) | Launch day (needs the domain) | 2.5 days | Domain + Email Routing on | ~$5 in model calls |
| 4 | Scheduled render | Launch week | 1.5 days | GitHub repo secrets | GitHub Actions minutes (likely free tier) |
| 5 | Auto-posting (Postiz) | Launch week | 1 day + platform approvals | Postiz API key; the five accounts connected in Postiz; TikTok public posting confirmed | Existing Postiz plan |
| 6 | Monday KPI email | Launch week | 0.5 day | — | — |
| 7 | Birth-month search pages | November | 2 days | Search Console verified (checklist B9) | — |
| 8 | Creator and affiliate program | November | 3.5 days | Stripe Connect enabled | 30% of attributed sales |
| 9 | Bookkeeping sync | November | 0.5 day | Xero account + Stripe app install | Xero plan |
| 10 | Ads budget controller | December, after gate A | 2.5 days | Meta Business account, ad account, app + system-user token | Ad spend under the cap |

About 16 agent days in all. Builds 1–6 (about 7.5 days) fit before and around launch if they run in parallel: 1+2 in one session, 3 in another, 4+5+6 in a third. (Build 5 uses Mick's existing Postiz instead of a new posting service.)

---

## 1. Stripe Tax

**Why.** EU and UK VAT apply from the first sale of an automated digital service to a consumer, with no threshold for a non-EU seller; US states add tax past their thresholds; Australian GST applies above A$75k. Without this, the tax is owed out of revenue.

**Design.**
- `automatic_tax: { enabled: true }` on all four Checkout Sessions (reading, gift, Season subscription, and the order-bump session). `billing_address_collection: "required"` so Stripe has the customer's location (two pieces of evidence: card country + address).
- Prices are **tax-inclusive** (decided 17 Oct: `tax_behavior: "inclusive"` on `price_data` and on the Season Prices), so the customer sees $29 and Rite absorbs the tax.
- Currency: USD stays the base. Local prices for GBP, EUR, AUD and CAD (set, rounded amounts rather than a live conversion) sit behind a `LOCAL_PRICES` config, off until Mick sets the amounts; Checkout then shows the buyer's own currency, which UK and EU consumers expect with VAT-inclusive pricing.
- Product tax code `txcd_10000000` (general electronically supplied services) on the reading, gift and Season products.
- Season Prices: recreate with `tax_behavior` set (Stripe won't change it on an existing Price). `ensureSeasonPrices` gets a new lookup key `v2`; existing subscriptions stay on the old Prices.
- `/admin` adds "tax collected (30d)" from `session.total_details.amount_tax` stored on purchases (new column `tax_cents`, migration 002).

**Mick provides.** Turn on Stripe Tax; add registrations: EU (non-Union OSS, via one member state, e.g. Ireland), UK (HMRC VAT for non-established businesses), Australia GST when turnover passes A$75k; US states as Stripe's threshold monitor flags them.

**Done when.** A test checkout from a UK address shows VAT included; from a US address in a state without registration, no tax; `tax_cents` recorded; tests cover the session parameters.

**Status (17 Oct, branch `b12-tax-bump`).** Built and tested in code (`test/b12.test.ts`, `test/commerce.test.ts`), behind `STRIPE_TAX` (default "on" in `wrangler.toml`, "off" = as before). Migrations 002–003 add `tax_cents` to purchases and gifts (as well as purchases, so gift checkouts count toward "tax collected"). Local prices need real Prices (Checkout's `price_data` has no `currency_options`), so with `LOCAL_PRICES` set the reading and gift lines switch to cached Prices. Not verified against live Stripe: the UK/US test checkouts are launch checklist B10.

## 2. Order bump and gift season

**Why.** The bump adds about $2.25 per buyer. Gifts are most of December revenue in the plan.

**Design.**
- **Bump:** Stripe Checkout `optional_items` on the reading session: "Add a reading for someone else, $15" (a gift code at a discount). The webhook already turns gift purchases into codes; a bumped session creates one purchase + one gift, and the delivery email gets a line with the gift code and link. Needs real Price objects (optional items take Prices): created once and cached like `ensureSeasonPrices`.
- **Price test:** `PRICE_TEST` flag. When on, half of new previews (by a hash of the preview id) see $39 instead of $29; the arm is stored on the preview and in the `checkout` event. `/admin` shows purchase rate and revenue per preview by arm. The test ends itself after 2 weeks or 600 previews per arm and logs a winner (higher revenue per preview); switching the price stays a one-line config change for Mick.
- **Gift season:** a dated gift banner on `/`, `/p/:id` and `/r/:tok` from 15 Nov to 22 Dec ("Give someone their Saturn return"), driven by dates in config so it turns itself off. One email to past buyers on 1 Dec and 15 Dec (only to buyers who haven't stopped emails), with "send it as a gift" and the gift link. A printable/shareable gift card PDF or PNG with the code, generated like the share card (existing PNG pipeline).
- **Gift deadline:** gift codes are instant, so the message is "still works on Christmas morning".

**Done when.** A test checkout with the bump produces a reading, a gift code and one email with both; the price test splits ~50/50 in tests; the banner shows only inside its dates.

**Status (17 Oct, branch `b12-tax-bump`).** Built and tested: bump ($15, `PRICE_BUMP_CENTS`; gift code on the same session and payment, line in the delivery email, also on the reading page), price test (`PRICE_TEST`, off; arm in `previews.price_arm`, migration 004; stops itself and logs `price_test_done`), gift banner and the 1/15 Dec emails (`campaign_sends`, migration 005; skip refunds and stops), gift card PNG at `/gift/card/:code.png`. Refunds keep the full-refunds-only rule: a full refund voids the bump code, a partial one changes nothing (README, support macros §6). Copy to approve: banner (`views/theme.ts`), gift email (`docs/emails.md` §6), bump line, gift card.

## 3. Inbox assistant (support and refunds)

**Why.** Every email says "reply to this". Support is the main recurring human job.

**Design.**
- Cloudflare Email Routing sends `hello@rite.report` to an **Email Worker** handler (`email()` export in the same Worker). Each message is stored (`support_messages` table: from, subject, body text, thread key, status) and classified by Haiku into: `where_is_reading`, `refund`, `stop`, `wrong_details`, `delete_data`, `how_it_works`, `gift_issue`, `other`.
- **Acts on its own, inside policy:**
  - `where_is_reading`: finds purchases by the sender's address; resends the reading link; if stuck in `writing` > 4 min, re-kicks generation (the `/admin/fulfil` path).
  - `refund`: if a purchase from that address is within 14 days, refunds it through the existing refund function and replies with the macro 1 text; Season refunds use `closeSeasonSubscription`. Over 14 days → to Mick.
  - `stop`: the same as `/stop/:tok` for every purchase and preview on that address.
  - `how_it_works`: macro 7.
  - `delete_data`: does the deletion of macro 5 after taking a D1 export of the rows to R2, and only after a second "yes, delete" reply from the same address (an irreversible action gets a confirmation).
- **Never on its own:** `wrong_details` (needs judgement about whose error), anything from an address with no purchase, anything with an attachment, anything the classifier scores below 0.8, and a sender's third message in a thread. These go to Mick (forwarded to `ADMIN_EMAIL`) with the classification, the customer's history (purchases, refunds, emails sent) and a drafted reply.
- Replies are sent through Resend from `hello@`, threaded (`In-Reply-To`), signed "Rite". Every action is an `events` row (`support_auto` with kind and outcome).
- Caps: at most 20 automatic refunds a day and $500 a day (config); past that, everything goes to Mick.
- Spoofing guard: act only when the message passes SPF/DKIM (Email Routing exposes the auth results); otherwise forward.

**Mick provides.** Domain, Email Routing enabled with the catch-all or `hello@` routed to the Worker (checklist B4 changes from "forward to Mick" to "route to Worker"; the Worker forwards what it doesn't handle).

**Done when.** Tests for each class with fixture emails; a refund request at day 13 refunds, at day 15 forwards; a spoofed sender is forwarded, never acted on.

**Status (18 Oct, branch `b3-inbox`).** Built and tested (`test/inbox.test.ts`): the `email()` handler (`src/inbox.ts`, with a small MIME parser in `src/mime.ts`, no new dependency), migration 006 (`support_messages`; `npm run db:migrate:b3`), the Haiku classifier (`MODEL_PREVIEW`), every action above, caps (`INBOX_REFUNDS_PER_DAY`, `INBOX_REFUND_CENTS_PER_DAY`), a loop guard (auto-replies, bulk, noreply, our own addresses) and `/admin/inbox?key=`. It ships with **`INBOX_AUTO = "off"`**: every message goes to Mick with the draft and what it would do, and nothing reaches the customer. Mick gets the original (Email Routing forward, so `ADMIN_EMAIL` must be a verified destination) plus a summary via Resend. Replies are signed "Mick, Rite", as the macros are. Two things differ from the design: **data deletion goes to Mick**, because there's no R2 binding yet (add `SUPPORT_EXPORTS`, commented in `wrangler.toml`, to turn it on), and a "stop" from someone with only free pass reminders is honoured too. Not verified against live mail: the SPF/DKIM check reads Cloudflare's `ARC-Authentication-Results`; check the first real messages on `/admin/inbox` show "pass" (launch checklist B4). Mondays' KPI email has a support line.

**Status (18 Oct, branch `b3b-inbox-ui`): the inbox UI.** Built and tested (`test/inbox-ui.test.ts`): `/admin/inbox` lists threads (newest activity first; sender, subject, last-message snippet, status Needs me / Handled by assistant / Mick replied / Closed, class; tabs Needs me, All, Closed), and `/admin/inbox/t/:id` shows the whole conversation (customer messages and every outbound reply, the assistant's and Mick's), the customer's history and a reply box prefilled with the assistant's draft. Send goes through Resend from `SUPPORT_EMAIL` with `In-Reply-To` the latest customer message and `References` the thread's, is stored, and sets "Mick replied". A one-time form nonce means a resubmit never sends twice; a reply with a `{…}` part left in is refused. **Takeover:** once Mick replies or presses "I've got this", the assistant never acts on that thread again (whatever `INBOX_AUTO` says) and new messages in it go to Needs me; "Hand back to assistant" undoes it (the third-message guard still applies). The note to `ADMIN_EMAIL` is now short, with a link to the thread (the Email Routing forward of the original stays), at most one per new customer message. Auth: `ADMIN_KEY` as before, plus `/admin/login`, which sets a 30-day HttpOnly, Secure, SameSite=Strict cookie signed with `ADMIN_KEY`; inbox POSTs need a per-session CSRF token and a same-origin request. Migration 007 (`support_threads`, `support_replies`; `npm run db:migrate:b3b`, checklist B14); without it everything works as build 3 and the pages are read-only. Cloudflare Access in front of `/admin*` is documented as an optional extra (`docs/support-macros.md`). No new services or dependencies.

## 4. Scheduled render

**Why.** Content is the launch channel; today a render is a command on Mick's Mac or in a session.

**Design.**
- A GitHub Actions workflow (`.github/workflows/render-week.yml`) on a weekly schedule (Thursday 02:00 UTC) plus manual dispatch.
- Steps: checkout → `npm ci` (root, content, remotion) → `bun clips/check-cohorts.ts --plan` → render next week's posts from the active plan (`plan-launch.json`, then rolling plans) with `TODAY` set per post → upload the files to an **R2 bucket** (`rite-content`, public read on a random path) → write `out/<week>/manifest.json` with captions, alt text and URLs.
- Rolling calendar: after the 28-day launch plan, a generator builds the next week from templates (cohort clips, sign verticals, quote cards, carousels, presenter reels where the plan has an Anna clip) with captions from `cohorts.json` and the kit, so the calendar never runs out. New Anna clips stay a manual choice (they cost money).
- Uses the existing date check; a failing check fails the run and emails Mick (no stale dates go out).

**Mick provides.** Repo secrets: `ELEVENLABS_API_KEY`, `R2` credentials (or a Cloudflare API token scoped to the bucket).

**Done when.** A dispatched run produces a week's files and manifest in R2 within the Actions time limit; a deliberately stale caption fails the run.

**Status (17 Oct).** Built: `.github/workflows/render-week.yml`, `content/scripts/rolling-plan.ts`, `content/scripts/upload-week.ts`, `--from`/`--to` on render-batch and export-batch. Setup, secrets, the manual dispatch and the manifest format (what build 5 reads): `content/README.md`, "Scheduled render (GitHub Actions)". Mick keeps GitHub's Actions failure emails on; a failed run is the alert.

## 5. Auto-posting (Postiz)

**Why.** Posting by hand is daily work.

**Design.**
- **Postiz**, which Mick already uses for content. Its public API uploads media (`POST /public/v1/upload`) and creates or schedules posts (`POST /public/v1/posts`, `type: "schedule"` with a date, several posts per request), with a rate limit of about 100 post requests an hour on cloud, 90 self-hosted ([Postiz API](https://docs.postiz.com/public-api/introduction)). One request per day's posts stays far inside that.
- A Worker cron (daily) reads the week's manifest from R2, uploads each file to Postiz and schedules it at its slot with the caption and the platform settings; records the Postiz post ids in a `posts` table and logs `posted` events.
- **TikTok caveat:** a self-hosted Postiz posts through your own TikTok developer app, and until TikTok audits that app every post is forced to private (`SELF_ONLY`) and at most 5 accounts can post a day ([Postiz TikTok docs](https://docs.postiz.com/providers/tiktok.md)). If Mick's Postiz is self-hosted, the TikTok app audit has to be applied for now, or TikTok posts go through a hosted service until it passes. Postiz cloud: confirm one public test post before relying on it.
- Bio links stay `rite.report/?r=<platform>`; captions carry the same link where a platform allows it.
- Failure handling: a rejected post is retried once with the silent version, then reported in the KPI email and the error digest.
- Kill switch: `POSTING=off`.

**Mick provides.** The Postiz API key (in `.dev.vars`), the five accounts connected in Postiz, and whether it's cloud or self-hosted (and the base URL if self-hosted).

**Done when.** A test week posts to private test accounts; the `posts` table matches the manifest.

## 6. Monday KPI email

**Design.** A Worker cron at 07:30 Brisbane each Monday sends Mick one email: last 7 days vs the previous 7 for visits (PostHog API), previews, purchase rate (visit→paid and preview→paid), revenue (Stripe), gifts, Season starts and cancellations, refunds and their reasons, cost per buyer and spend (once ads run), voice and model spend, errors by type, posts published and the best post by clicks; plus the month against the plan's target and the next gate's numbers ("Gate A: 1.7% of 2.0%"). One line at the top says what to look at.

**Done when.** A test send with seeded data; numbers match `/admin` for the same window.

## 7. Birth-month search pages

**Why.** "Saturn return [month year]" and "Saturn return calculator" are searched by exactly the right people, and search traffic compounds without spend.

**Design.**
- `/saturn-return/born/1997-03` for every month 1940–2005 (792 pages), each computed by the engine: the sign Saturn was in, which return (first or second) and its window, the exact pass dates for the start, middle and end of that month (they differ within a month: the page says so and sends people to the calculator for their own day), and the closest-turn date where it applies. Plus links to neighbouring months, the sign page and `/start` with the month pre-filled.
- Content written by code from real dates, with a short sign paragraph from `signs.ts`; no model call per page. Cached in KV.
- `sitemap.xml` lists them; canonical URLs; structured data (FAQ: "When is my Saturn return if I was born in March 1997?").
- Year index pages `/saturn-return/born/1997`.

**Done when.** Every page renders under the Workers CPU limit; every date on a sample of 50 pages matches `compute()`; Search Console accepts the sitemap.

## 8. Creator and affiliate program

**Why.** Creators sell this better than ads; paying them automatically removes the manual work of gift codes and invoices.

**Design.**
- `/creators` page: sign up with email and handle → Stripe Connect **Express** onboarding (Stripe handles identity, tax forms and bank details) → on return, a code (`RITE-HANDLE`) and a link (`rite.report/?c=handle`).
- Attribution: the link sets a 30-day first-party cookie and the `ref`; a code at checkout applies 10% off for the buyer (a Stripe promotion code tied to a coupon). Purchases record `affiliate_id`.
- Commission 30% of the net sale (after refunds), held 15 days (past the 14-day refund window), then paid by a monthly cron with a Stripe **transfer** to the creator's connected account. Refunds after payout are deducted from the next payout.
- Every creator gets one free reading (a gift code) on approval, so they can post about their own.
- Auto-approval for accounts under a follower threshold isn't verifiable from here, so: auto-approve everyone, cap unpaid commission per creator at $500 until Mick approves them (an email with the creator's handle and sales to date).
- `/creators/dashboard/:token`: clicks, sales, commission pending and paid.

**Mick provides.** Stripe Connect enabled on the account (platform profile, Express).

**Done when.** A test creator onboards in test mode, a test purchase with the code is attributed, the monthly cron transfers the right amount, and a refund before payout cancels the commission.

## 9. Bookkeeping sync

**Design.** Stripe's Xero integration (or the Xero Stripe feed) syncs payouts, fees, refunds and tax. Rite's own job is to keep Stripe metadata clean (product names, `tier`, `gift`, `affiliate_id`) so the ledger reads well. A monthly export of purchases (CSV to R2) as a backup ledger.

**Mick provides.** A Xero account and the connection (OAuth, his).

**Done when.** One month of test data shows up in Xero with fees and tax split out.

## 10. Ads budget controller

**Why.** Ads are about 40% of revenue by the end of the plan; they need daily budget decisions.

**Design.**
- Starts only after gate A (2% of visitors buying). Meta first (Advantage+ sales campaign optimising for a `Purchase` event).
- **Conversions API**: the webhook sends `Purchase` server-side to Meta with the order value and a hashed email (consented by the privacy page update), so Meta optimises on real purchases without a browser pixel.
- A daily Worker cron (06:00 Brisbane) computes 7-day cost per buyer = Meta spend (Marketing API insights) ÷ purchases attributed to `?r=meta` (our own data, not Meta's claim). Rules:
  - cost per buyer < $16 and spend under the cap → raise the daily budget 20%;
  - $16–20 → hold;
  - > $20 for 3 days → cut 30%; > $30 for 2 days → pause and email Mick.
  - Never above `ADS_DAILY_CAP` or `ADS_MONTHLY_CAP` (config), and no change in the first 3 days of a new campaign (learning phase).
- Creative: the presenter reels and the best organic posts by click rate (from the `posts` table), uploaded as ad creative by the same cron weekly.
- Every change is an `events` row and appears in the KPI email.
- TikTok ads in phase 4, same rules, same controller.

**Mick provides.** Meta Business account, ad account with a payment method, a Meta app with Marketing API access and a system-user token; the monthly cap.

**Done when.** Rule tests with fixture spend and purchase numbers; a dry-run week logs the changes it would make before it's allowed to make them.

---

## Order of work

1. **This week, before launch:** 1 Stripe Tax · 2 order bump and gift season · 3 inbox assistant (lands the day the domain does) · 6 KPI email.
2. **Launch week:** 4 scheduled render · 5 auto-posting (needs Mick's Postiz and account connections).
3. **November:** 7 search pages · 8 creator program · 9 bookkeeping.
4. **December, once gate A is met:** 10 ads controller.

What stays human after all ten: approvals platforms require, tax registrations, the Monday read, monthly test choices, and the launch-fortnight posts on Reddit, Product Hunt and Hacker News.
