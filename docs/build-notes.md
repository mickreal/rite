# Build notes — 16 Oct 2026

## Decisions

- **Cloudflare, not Polsia.** Polsia's free tier produced a landing page and a crashing preview (missing `swisseph.wasm` in the bundle), then paywalled every further run at $20/mo + 20% of revenue through Stripe Connect. The whole product is a few hundred lines of Worker code; owning it costs nothing.
- **Cloudflare, not Supabase.** Mick's two free Supabase projects are already used. Rite needs no auth (tokenised report links), so D1 + KV + Cron covers it.
- **`astronomy-engine`, not Swiss Ephemeris.** Pure JS, no WASM asset to lose in a bundle. Verified against Swiss Ephemeris in the test suite: Saturn to 0.02°, all twelve Placidus cusps to 0.05°.
- **Exact-hit dates are UTC dates of the interpolated crossing instant.** The first pass of the launch kit used a 00:00 daily scan and reported the day *after* each crossing — every celebrity date was one day late. Corrected on 16 Oct; `docs/launch-kit.md` is the corrected version.
- **Window = ±5°, peak = ±1°.** Reported as the outer envelope, so early-degree Aries people get a window that runs to Feb 2027 even though their single hit was Apr 2026 — Saturn's retrograde brings it back within 5°. That's the honest answer, and the `phase` field ("separating") does the explaining.
- **Phase comes from today's actual orb**, not the envelope — otherwise anyone inside a retrograde loop reads as "peak" for months.
- **The LLM never computes.** It receives JSON of computed values and writes prose. A grounding check rejects any report whose dates aren't in the inputs and regenerates once.
- **Share card is SVG** for now. PNG via Browser Rendering or resvg-wasm is a day-2 item.

## Test cases (all green)

| Case | Expect |
| --- | --- |
| 1 Sep 1996, no time | Aries 5.8°, one hit 3 Apr 2026, separating on 16 Oct 2026 |
| 14 Mar 1997 | Aries 8.2°, hits 22 Apr / 23 Nov / 28 Dec 2026, in window on 16 Oct 2026 |
| 15 Jun 1998 | Taurus, first hit 2028, not yet |
| 20 Dec 1995 | Pisces, complete |
| 11 Feb 1969 | Aries, second return, first hit 2027 |

## Open items for Mick

1. Cloudflare: `wrangler login`, create D1 + KV, paste ids into `wrangler.toml`, `npm run db:schema`, `npm run deploy`.
2. Stripe (the new Rite account): test secret key → `wrangler secret put STRIPE_SECRET_KEY`; webhook endpoint → signing secret.
3. Anthropic API key → `wrangler secret put ANTHROPIC_API_KEY`.
4. Resend: account, verify `rite.report` (or a subdomain) for sending → `RESEND_API_KEY`.
5. Domain: buy `rite.report`, attach to the Worker, set `SITE_URL`.
6. First real test: your own birth details through the live site, then a $29 test-mode purchase with card 4242 4242 4242 4242.

## Day-2 backlog (in order)

1. SEO pages from `content/notes.ts` + the kit's sign/house tables (144 sign×house pages + 12 + 12 + per-birth-year).
2. PNG share card.
3. Annual Saturn Season price.
4. Second-return landing variant (born 1967–69).
5. Refund-on-request inbox automation → `POST /admin/refund`.
