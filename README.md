# Rite — Saturn Return reports

Personalised Saturn Return reports. Free preview (sign, window, phase) → $29/$19 report → $7/mo "Saturn Season" weekly email that cancels itself when the return ends.

Runs entirely on Cloudflare's free tier: one Worker, D1, KV, a Cron Trigger. No platform fee, no servers.

## What's here

```
src/
  index.ts          Hono app: routes, Stripe checkout + webhook, report generation, cron handler
  compute.ts        Everything numeric about a person's return (no LLM)
  astro/saturn.ts   Saturn longitude, return window, exact hits, phase, stations  (astronomy-engine)
  astro/houses.ts   Placidus houses + Asc/MC; Whole Sign fallback above 66° latitude
  geo.ts            Nominatim geocoding, tz-lookup, local→UTC with historical DST (ICU)
  llm.ts            Anthropic Messages API; grounding check that every date in the output came from the inputs
  email.ts          Resend; delivery, weekly, and season-complete templates
  astro/cycle.ts    The whole 29-year cycle: path chart, month table, tension points, stage wheel, area weights, Saturn-in-sign periods
  card.ts           Share card (1080×1920 SVG) and link-preview image (SVG; the PNG in public/ is rendered from it)
  content/notes.ts  Sign + house notes used in prompts and copy
  content/signs.ts  Copy for the public per-sign pages
  content/sign-periods.json  Every stretch Saturn spends in each sign 1930–2075 (scripts/gen-sign-periods.ts)
  content/prompts.ts Preview, reading (JSON), follow-up and weekly-email system prompts
  views/theme.ts    Shared shell, CSS, animations (design: Bricolage Grotesque + Hanken Grotesk, #0E1014 / #F2B544)
  views/landing.ts  /            Landing: live calculator (fetches /api/calc as you type), chapters, price, Season row, FAQ
                    /second      Same page, `variant: "second"`: hero, FAQ and ages emphasis for the current second-return cohort
  views/flow.ts     /start       Mobile one-step-at-a-time version of the same form
  views/result.ts   /p/:id       Free result: window chart, passes, remind-me, offer
  views/reading.ts  /r/:tok      Paid reading, ten chapters (see below)
  views/sign.ts     /saturn-return/saturn-in/:sign   Public SEO pages, all dates computed
  views/gift.ts     /gift        Buy a gift code; /gift/thanks/:code after payment
  views/season.ts   /season/manage/:tok   Saturn Season: plan, next note, switch monthly/yearly, stop
  views/season-landing.ts  /season       What Saturn Season is, with a sample note computed this week
  season.ts         Saturn Season date/plan logic (next note, unused months, yearly gating, upcoming dates, note facts) — pure, tested
  followups.ts      Day-3 / day-10 follow-up scheduling and skip rules — pure, tested
  narration.ts      Per-chapter narration script for the TTS endpoint
public/og.png       Link-preview image served as a static asset
test/
  astro.test.ts     21 tests: Saturn vs Swiss Ephemeris (0.02°), all 12 Placidus cusps (0.05°), the four acceptance cases
  cycle.test.ts     Chart, month table, stage wheel and tension points
  geo.test.ts       local→UTC conversions incl. DST
  reference.json    Swiss Ephemeris reference values the tests compare against
schema.sql          D1 schema (previews, purchases, subscriptions, reminders, stage_reminders, asks, gifts, events, followups, stories)
wrangler.toml       Worker config (vars, bindings, cron)
docs/               Launch kit (content, prompts, cohort data) and this build's notes
```

## Setup (≈20 minutes, once)

Prereqs: Node 22, a Cloudflare account, `npx wrangler login`.

```bash
npm install
npm test                      # must be green before anything else

# 1. Cloudflare resources
npx wrangler d1 create rite                      # paste database_id into wrangler.toml
npx wrangler kv namespace create CACHE           # paste id into wrangler.toml
npm run db:schema                                # applies schema.sql to the remote D1
#    Existing database from before Oct 2026? Also run once: npm run db:migrate:plan   (adds subscriptions.plan)
#    Already deployed? Re-run `npm run db:schema` after pulling: it adds the followups and stories tables
#    (CREATE TABLE IF NOT EXISTS, safe to re-run). Until it runs, the cron's follow-up step and /r/:tok/story fail.

# 2. Secrets (never commit these)
npx wrangler secret put STRIPE_SECRET_KEY        # sk_live_… from the Rite Stripe account (use sk_test_ first)
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # from step 4
npx wrangler secret put ANTHROPIC_API_KEY        # console.anthropic.com
npx wrangler secret put RESEND_API_KEY           # resend.com — verify rite.report as a sending domain

# 3. Deploy
npm run deploy                                   # → https://rite.<account>.workers.dev

# 4. Stripe webhook
#    Stripe dashboard → Developers → Webhooks → Add endpoint:
#    URL: https://<your-worker-url>/webhook/stripe
#    Events: checkout.session.completed, customer.subscription.deleted, charge.refunded,
#            invoice.payment_failed, invoice.paid        (the last two pause/resume Saturn Season on failed renewals)
#    Copy the signing secret → wrangler secret put STRIPE_WEBHOOK_SECRET → npm run deploy again

# 5. Domain
#    Cloudflare dashboard → Workers → rite → Settings → Domains & Routes → add rite.report
#    Then set SITE_URL in wrangler.toml to https://rite.report and redeploy.
```

Local dev: copy `.dev.vars.example` to `.dev.vars`, fill in test keys, `npm run db:schema:local`, `npm run dev`. The preview works with no keys at all (the LLM paragraph falls back to a templated sentence); checkout needs Stripe test keys; `stripe listen --forward-to localhost:8787/webhook/stripe` gives you a local webhook secret.

## How it works

1. `POST /preview` — geocodes the birthplace (Nominatim, cached in KV for 90 days), converts local birth time to UTC using the birthplace's IANA zone (noon if no time), computes natal Saturn, the relevant return (1st/2nd/3rd by age), the window (Saturn in the natal sign around the return, first dip to final exit), exact crossing dates (interpolated to the hour), today's phase, and houses if a time was given. Stores a `previews` row, asks the LLM for one paragraph, redirects to `/p/:id`. `GET /api/calc?date=&time=` is the same maths without geocoding, used by the landing page's live calculator (noon UTC, lat/lon 0, so sign/dates only; cached per day).
2. `POST /checkout` — Stripe Checkout, $29 with birth time / $19 without, with an optional first-name field. Metadata carries the preview id.
3. `POST /webhook/stripe` — on `checkout.session.completed` creates a `purchases` row with an unguessable token, asks Claude for the reading as one JSON object (slots for each chapter; schema in `content/prompts.ts`), rejects and regenerates once if keys are missing or any date in the output isn't in the inputs, stores it in `purchases.report_md`, emails the link. `/thanks` polls for the row then redirects to `/r/:token`.
4. `/r/:token` — the reading. Everything dated or numeric is computed on each view, so the page updates as the person moves through the cycle; the model's prose fills the slots. Chapters: 0 where you are now (stage wheel + date scrubber via `/r/:tok/stage?t=`), 1 your Saturn, 2 the window (path chart, three phases), 3 the pass and the turn (per-date cards, `.ics` per date or all at `/r/:tok/calendar.ics`), 4 where it shows up (house/cusp weights), 5 month by month, 6 Saturn history (ages ~7/14/21, answers kept in localStorage), 7 workbook (localStorage), 8 the long arc, 9 ask (`POST /r/:tok/ask`, five per purchase, stored in `asks`). Print stylesheet for "Save as PDF". Share card at `/card/r/:token.svg`. Saturn Season card at the end.
5. Cron (hourly) — for each active subscription, if it's Monday 07:00 in the subscriber's own timezone, computes today's orb/motion, writes the weekly note, sends it. When the orb passes 5° separating it sends the season-complete email and cancels the Stripe subscription.

## Saturn Season

- **Prices**: two recurring Stripe Prices (month / year, amounts from `PRICE_SEASON_*_CENTS`) under one Product "Rite — Saturn Season", created on first use by `ensureSeasonPrices` and cached in KV at `stripe:season:prices` (found again by `lookup_key` if the cache is lost). Checkout and plan switches use these ids; inline `price_data` can't be swapped on an existing subscription.
- **Subscribe** (`POST /season/:tok`, plan=month|year): Stripe Checkout; the webhook stores the row with `plan` and sends the first note immediately (welcome), which also sets `last_sent_at` so the Monday cron waits six days.
- **Manage** (`/season/manage/:tok`, linked from every note and the reading): status, plan, next note (Monday 07:00 in the subscriber's zone), the date it stops itself. `POST /season/plan/:tok` switches with `proration_behavior: create_prorations`; `POST /season/cancel/:tok` cancels now. `/season/stop/:tok` redirects here.
- **Yearly guardrails**: the reading only offers yearly when the window end is at least nine months away. When a yearly subscription auto-closes (Saturn leaves the sign) the cron refunds the unused full months (`5900 × unused / 12`) on the latest invoice's payment and logs `season_refund`.
- **Failed payment**: `invoice.payment_failed` → `past_due` (no notes); `invoice.paid` → `active` again.
- **Plan column**: `subscriptions.plan` was added after launch. New databases get it from `schema.sql`; an existing one needs `npm run db:migrate:plan` once.

Every number comes from code. The model only writes prose and is told it may not invent dates.

## Accuracy

- Saturn: `astronomy-engine` geocentric apparent longitude, true ecliptic of date, sampled daily 1920–2080 into `content/saturn-daily.json` (306 KB base64 Int32; `scripts/gen-saturn-table.ts`) and linearly interpolated at runtime (< 0.0005° error; Saturn moves ≤ 0.13°/day). Outside the table it falls back to the live ephemeris. Tested against Swiss Ephemeris to 0.02° across 1984–2026. This keeps every request well under the Workers free plan's 10 ms CPU cap (a full page is ~4 ms; the live ephemeris was 50 µs per sample and daily scans were blowing the cap intermittently with error 1102).
- Houses: Placidus by semi-arc iteration, tested against `swe_houses('P')` to 0.05° on all twelve cusps for seven charts across both hemispheres.
- Exact hits: daily scan, linear interpolation of the crossing instant; reported as the UTC date. Agrees with Swiss Ephemeris bisection to the hour for every celebrity in the launch kit.
- Why not `swisseph` on Workers: it needs a `.wasm` file shipped alongside the bundle, which is exactly what broke the Polsia build. Pure JS has no such failure mode.

## Admin

- Fulfilment and report-writing are split into separate invocations so no single request carries Stripe + Claude + D1 + email (the free plan caps CPU at 10 ms per invocation): the webhook (or `/thanks`) inserts the purchase row and POSTs `/internal/generate/:tok` to itself; that invocation takes a `writing` lock (status + timestamp) and writes the reading; `/r/:tok` only ever shows the "writing" page and re-kicks if the lock is older than 4 minutes. `POST /admin/fulfil {"session_id"}` fulfils a paid Checkout session by hand if the webhook was lost.

- `GET /health` — Saturn's current longitude and the time.
- `GET /admin?key=<secret>[&days=7|30|90]` — the same numbers as `/admin/stats` as a page, plus the last 20 errors, the last 20 stories (with `can_quote`) and pending/due counts for follow-ups, pass reminders and stage reminders. The key is the `ADMIN_KEY` secret (`?key=` or the bearer header), never the webhook secret; without `ADMIN_KEY` set the page is off. A wrong or missing key gets a plain 404. Sent `no-store`, `noindex`, `no-referrer`; never tagged by PostHog.
- `GET /admin/stats` and `POST /admin/refund {"email"}` — bearer token is `ADMIN_KEY` (falls back to the Stripe webhook secret only while `ADMIN_KEY` is unset). Wire `/admin/refund` to an inbox rule later if you want refund-on-request automation.
- Events table (`visit`, `preview`, `checkout`, `paid`, `generated`, `emailed`, `season_sent`, `season_welcome`, `season_plan`, `season_cancel`, `season_past_due`, `season_resumed`, `season_complete`, `season_refund`, `followup_sent`, `followup_skipped`, `calendar`, `story`, `refund`, `error`) is the funnel. `wrangler d1 execute rite --remote --command "SELECT kind, COUNT(*) FROM events GROUP BY kind"`.

## Public pages

- `/saturn-return/saturn-in/:sign` — twelve SEO pages. The transit dates, "first return, born" and "second return, born" ranges come from `content/sign-periods.json`; the birth-date check calls `/api/calc`. Listed in `/sitemap.xml`; `/p/`, `/r/` and `/admin/` are disallowed in `robots.txt`.
- `/season` — what Saturn Season is, for people who land from a forwarded note or the landing's Season row. The sample note is computed per request for a chart born 1 Jun 1997, Melbourne, as of this Monday 07:00 Melbourne. CTA goes to `/#start` (Season needs a reading).
- `/second` — the landing for people in their second return now: the cohort is whoever was born in the sign Saturn occupies today, 55–63 years before this stretch (`signData().secondBorn`), so the copy rolls over by itself when Saturn changes sign.
- Both are in `/sitemap.xml`.
- `/start` — the mobile stepper. Same `POST /preview` underneath; the "building" screen runs while the server geocodes and writes the preview.
- Remind-me (`POST /remind` on the result page) stores a row in `reminders`; the hourly cron emails it seven days before the pass. When the window is more than a year away the card becomes "Tell me when my window opens" (`kind=window_open`): one row with `hit_date` = window open, sent 30 days before, with its own copy in `runReminders`.

## Follow-ups and stories

- **Follow-up emails** (`docs/emails.md` §2, §3): when a reading is written, `followups` gets two rows, `day3` and `day10`, dated on the reader's birthplace-local calendar. The hourly cron (`runFollowups`) sends each from 09:00 local on its day, claims the row before sending (no double-send), puts it back if the send fails, and drops it as `expired` if it's still unsent a week later. Skips are stored as `sent_at = 'skipped:<reason>'` and logged `followup_skipped`; sends are logged `followup_sent`.
  - Day 3 "Did you put the dates in your calendar?": skipped if refunded, the window has closed, or the reader already downloaded a calendar file (the `.ics` route logs a `calendar` event).
  - Day 10 "What a Monday note looks like": quotes the note they'd have got this Monday, built by code for their chart (position, orb, motion, the phase paragraph, the 30-day list; no model call). Skipped if there's an active or past_due subscription, the purchase is refunded, or the window closes within 60 days.
- **Stage reminders** end with one Saturn Season line for non-subscribers when at least 30 days of window remain after the stage.
- **Share your story**: an opt-in card at the end of the reading posts to `POST /r/:tok/story` (≤2,000 characters, one per purchase per day). Rows go to `stories` with `can_quote` set only when the reader ticked "Rite can quote this, first name only"; a copy is emailed to `ADMIN_EMAIL` (or `SUPPORT_EMAIL`). Read them with `wrangler d1 execute rite --remote --command "SELECT created_at, can_quote, text FROM stories ORDER BY id DESC"`.

## Gifts, reminders, narration

- **Gift** (`/gift`): `POST /checkout` with `gift=1` runs a $29 Stripe Checkout with optional "from" and note fields. Fulfilment writes a `gifts` row with an 8-character code and emails it to the buyer; `/gift/thanks/:code` shows it. The recipient opens `/gift/:code` (landing with a gift banner), enters their own details, and the result page offers **Open my reading** (`POST /redeem`: creates a $0 purchase, marks the code used, writes the reading). `/admin/refund` also refunds an unredeemed gift by buyer email.
- **Stage reminders**: when a reading is written, `stage_reminders` gets one row per future stage opening (contact, integration, window close, then the first square / opposition / closing square ahead). The hourly cron emails each one seven days before (`stageReminderEmail`), once. Workbook prompts for a phase stay locked until that phase opens.
- **Narration**: `GET /r/:tok/audio/:ch.mp3` (chapters 0–8) builds a plain-text script from the same computed data + report JSON (`src/narration.ts`), sends it in ≤1800-char sentence-aligned chunks to Workers AI `@cf/deepgram/aura-1` (voice `TTS_VOICE`, default `luna`), concatenates the MP3 and caches it in KV for a year. The player on the reading page plays chapters back to back and prefetches the next. Cost is about $0.015 per 1,000 characters, so roughly 30 cents per reading, once. Needs the `[ai]` binding in `wrangler.toml` (no dashboard setup); the binding only works deployed or with `wrangler dev --remote`.

## Analytics, legal, ops

- **PostHog**: set `POSTHOG_KEY` (and `POSTHOG_HOST` if not US) as vars in `wrangler.toml`. Every HTML page gets the snippet injected (autocapture and session recording off) and sends one `$pageview` with the path templated (`/r/:tok`, never the token). Client events: `preview_submit`, `checkout_click`, `remind_submit`, `gift_click`, `share_card`, `play`, `ask_submit`, `calendar`, `season_click`, `story_submit`. Server events mirror the funnel from `log()`: `server_preview`, `server_checkout`, `server_paid`, `server_generated`, `server_gift_paid`, `server_gift_redeemed`, `server_season_start`, `server_ask`, `server_narrated`, `server_refund`, `server_story`, `server_error`. Without the key, nothing is sent.
- **Legal**: `/privacy`, `/terms`, `/refunds` (`views/legal.ts`), linked from the footer and the sitemap. Point Stripe's checkout "Terms" and "Privacy" links at them (Stripe dashboard → Settings → Public details).
- **Daily error digest**: the hourly cron emails `ADMIN_EMAIL` (falls back to `SUPPORT_EMAIL`) at 08:00 Brisbane with the last 24 h of event counts and error rows, only when there were errors.
- **Cleanup**: previews older than 90 days that were never bought and have no reminder are deleted daily at 04:00 Brisbane (the privacy page says so).
- **Admin**: `POST /admin/season/:tok?to=you@x` forces one Saturn Season note for that purchase to any address (doesn't touch the subscription's schedule); `POST /admin/fulfil`, `/admin/refund`, `/admin/stats` as before. Bearer token is `ADMIN_KEY` (webhook secret only while it's unset; `/internal/generate` always uses the webhook secret).

## Not built yet

- PNG share card (Cloudflare Browser Rendering or resvg-wasm) — SVG is served now; the OG image is a pre-rendered PNG because social crawlers won't render SVG.
- Real PDF attachment — print stylesheet instead.
