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
  views/landing.ts  /            Landing: live calculator (fetches /api/calc as you type), chapters, price, FAQ
  views/flow.ts     /start       Mobile one-step-at-a-time version of the same form
  views/result.ts   /p/:id       Free result: window chart, passes, remind-me, offer
  views/reading.ts  /r/:tok      Paid reading, ten chapters (see below)
  views/sign.ts     /saturn-return/saturn-in/:sign   Public SEO pages, all dates computed
  views/gift.ts     /gift        Buy a gift code; /gift/thanks/:code after payment
  narration.ts      Per-chapter narration script for the TTS endpoint
public/og.png       Link-preview image served as a static asset
test/
  astro.test.ts     21 tests: Saturn vs Swiss Ephemeris (0.02°), all 12 Placidus cusps (0.05°), the four acceptance cases
  cycle.test.ts     Chart, month table, stage wheel and tension points
  geo.test.ts       local→UTC conversions incl. DST
  reference.json    Swiss Ephemeris reference values the tests compare against
schema.sql          D1 schema (previews, purchases, subscriptions, reminders, stage_reminders, asks, gifts, events)
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
#    Events: checkout.session.completed, customer.subscription.deleted, charge.refunded
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

Every number comes from code. The model only writes prose and is told it may not invent dates.

## Accuracy

- Saturn: `astronomy-engine` geocentric apparent longitude, true ecliptic of date. Tested against Swiss Ephemeris to 0.02° across 1984–2026.
- Houses: Placidus by semi-arc iteration, tested against `swe_houses('P')` to 0.05° on all twelve cusps for seven charts across both hemispheres.
- Exact hits: daily scan, linear interpolation of the crossing instant; reported as the UTC date. Agrees with Swiss Ephemeris bisection to the hour for every celebrity in the launch kit.
- Why not `swisseph` on Workers: it needs a `.wasm` file shipped alongside the bundle, which is exactly what broke the Polsia build. Pure JS has no such failure mode.

## Admin

- `GET /health` — Saturn's current longitude and the time.
- `GET /admin/stats` and `POST /admin/refund {"email"}` — bearer token is the Stripe webhook secret. Wire `/admin/refund` to an inbox rule later if you want refund-on-request automation.
- Events table (`visit`, `preview`, `checkout`, `paid`, `generated`, `emailed`, `season_sent`, `refund`, `error`) is the funnel. `wrangler d1 execute rite --remote --command "SELECT kind, COUNT(*) FROM events GROUP BY kind"`.

## Public pages

- `/saturn-return/saturn-in/:sign` — twelve SEO pages. The transit dates, "first return, born" and "second return, born" ranges come from `content/sign-periods.json`; the birth-date check calls `/api/calc`. Listed in `/sitemap.xml`; `/p/`, `/r/` and `/admin/` are disallowed in `robots.txt`.
- `/start` — the mobile stepper. Same `POST /preview` underneath; the "building" screen runs while the server geocodes and writes the preview.
- Remind-me (`POST /remind` on the result page) stores a row in `reminders`; the hourly cron emails it seven days before the pass.

## Gifts, reminders, narration

- **Gift** (`/gift`): `POST /checkout` with `gift=1` runs a $29 Stripe Checkout with optional "from" and note fields. Fulfilment writes a `gifts` row with an 8-character code and emails it to the buyer; `/gift/thanks/:code` shows it. The recipient opens `/gift/:code` (landing with a gift banner), enters their own details, and the result page offers **Open my reading** (`POST /redeem`: creates a $0 purchase, marks the code used, writes the reading). `/admin/refund` also refunds an unredeemed gift by buyer email.
- **Stage reminders**: when a reading is written, `stage_reminders` gets one row per future stage opening (contact, integration, window close, then the first square / opposition / closing square ahead). The hourly cron emails each one seven days before (`stageReminderEmail`), once. Workbook prompts for a phase stay locked until that phase opens.
- **Narration**: `GET /r/:tok/audio/:ch.mp3` (chapters 0–8) builds a plain-text script from the same computed data + report JSON (`src/narration.ts`), sends it in ≤1800-char sentence-aligned chunks to Workers AI `@cf/deepgram/aura-1` (voice `TTS_VOICE`, default `luna`), concatenates the MP3 and caches it in KV for a year. The player on the reading page plays chapters back to back and prefetches the next. Cost is about $0.015 per 1,000 characters, so roughly 30 cents per reading, once. Needs the `[ai]` binding in `wrangler.toml` (no dashboard setup); the binding only works deployed or with `wrangler dev --remote`.

## Not built yet

- PNG share card (Cloudflare Browser Rendering or resvg-wasm) — SVG is served now; the OG image is a pre-rendered PNG because social crawlers won't render SVG.
- Real PDF attachment — print stylesheet instead.
- Annual Saturn Season price ($59) — only monthly is wired; the card mentions it.
- Second-return landing variant.
