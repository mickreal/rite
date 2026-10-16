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
  card.ts           Share card (1080×1920 SVG)
  content/notes.ts  Sign + house notes used in prompts and copy
  content/prompts.ts Preview, report and weekly-email system prompts
  views/            Landing page, report page, shared layout/CSS
test/
  astro.test.ts     21 tests: Saturn vs Swiss Ephemeris (0.02°), all 12 Placidus cusps (0.05°), the four acceptance cases
  geo.test.ts       local→UTC conversions incl. DST
  reference.json    Swiss Ephemeris reference values the tests compare against
schema.sql          D1 schema
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

# 2. Secrets — fill in .dev.vars (gitignored, placeholders already there), then:
npm run secrets:push                             # pushes each value to Cloudflare; skips any still REPLACE_ME

# 3. Deploy
npm run deploy                                   # → https://rite.<account>.workers.dev

# 4. Stripe webhook
#    Stripe dashboard → Developers → Webhooks → Add endpoint:
#    URL: https://<your-worker-url>/webhook/stripe
#    Events: checkout.session.completed, customer.subscription.deleted, charge.refunded
#    Copy the signing secret into .dev.vars → npm run secrets:push

# 5. Domain
#    Cloudflare dashboard → Workers → rite → Settings → Domains & Routes → add rite.report
#    Then set SITE_URL in wrangler.toml to https://rite.report and redeploy.
```

Local dev: copy `.dev.vars.example` to `.dev.vars`, fill in test keys, `npm run db:schema:local`, `npm run dev`. The preview works with no keys at all (the LLM paragraph falls back to a templated sentence); checkout needs Stripe test keys; `stripe listen --forward-to localhost:8787/webhook/stripe` gives you a local webhook secret.

## How it works

1. `POST /preview` — geocodes the birthplace (Nominatim, cached in KV for 90 days), converts local birth time to UTC using the birthplace's IANA zone (noon if no time), computes natal Saturn, the relevant return (1st/2nd/3rd by age), the 5° window, 1° peak, exact crossing dates (interpolated to the hour), today's phase, and houses if a time was given. Stores a `previews` row, asks the LLM for one paragraph, redirects to `/p/:id`.
2. `POST /checkout` — Stripe Checkout, $29 with birth time / $19 without, with an optional first-name field. Metadata carries the preview id.
3. `POST /webhook/stripe` — on `checkout.session.completed` creates a `purchases` row with an unguessable token, generates the report (Claude, system prompt in `content/prompts.ts`), rejects and regenerates once if any date in the output isn't in the inputs, emails the link. `/thanks` polls for the row then redirects to `/r/:token`.
4. `/r/:token` — the report page. Print stylesheet for "Save as PDF". Share card at `/card/r/:token.svg`. Saturn Season upsell.
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

## Not built yet (day 2)

- PNG share card (Cloudflare Browser Rendering or resvg-wasm) — SVG is served now.
- Real PDF attachment — print stylesheet instead.
- SEO pages (`/saturn-return/saturn-in-aries` etc.) — content is in `docs/launch-kit.md`; a static generator from `content/notes.ts` is ~an hour.
- Annual Saturn Season price ($59) — only monthly is wired.
- Second-return landing variant.
