# Rite GTM plan

Working doc. Dated 16 Oct 2026. Owners: **M** = Mick, **N1/N2** = overnight sessions (see `overnight-plan.md`), **S** = live session with Mick.

## 1. Saturn Season: make the subscription whole

What ships today: monthly $7 / yearly $59 Stripe subscription from the reading page, webhook activates it, hourly cron sends a Claude-written note every Monday 07:00 in the subscriber's timezone, auto-cancels with a goodbye email when Saturn leaves the natal sign, stop link, `/admin/season/:tok` to force a note.

| # | Item | Why | Owner |
|---|---|---|---|
| S1 | **Welcome note on subscribe** — send the first note within minutes of the webhook, not next Monday | First impression; proves the thing works | N1 |
| S2 | **Manage page** `/season/manage/:tok` — plan, next note date, switch monthly↔yearly (Stripe subscription update with proration), cancel; replace the bare stop link | Self-serve; fewer support emails | N1 |
| S3 | **Yearly guardrails** — only offer yearly when ≥9 months of window remain; on auto-close of a yearly plan, refund the unused months (Stripe `subscriptions.cancel` + prorated refund) | The refund page already promises it | N1 |
| S4 | **Richer note** — add the concrete dates inside 30 days (station, pass, window close), a "reread chapter X" deep link into the reading, phase-specific structure (approach / contact / integration), and a weekly "one line to carry" | Current note is one paragraph; the data is already computed | N1 |
| S5 | **Season line in stage reminders** and a **day-10 nudge** to reading owners who haven't subscribed (copy from `docs/emails.md`) | Only upsell surface today is the card at the bottom of the reading | N1 (copy), N2 (send) |
| S6 | **Pause on failed payment** — handle `invoice.payment_failed` → status `past_due`, skip notes, resume on `invoice.paid` | Otherwise we keep emailing non-payers | N1 |
| S7 | **Season landing section** on `/` and a `/season` page for people who arrive from a note that was forwarded | Notes get forwarded; nowhere to land | N2 |
| S8 | **Dogfood** — Mick subscribes his own reading (promo code) and reads 3 Mondays of notes before launch | Quality bar | M |

Everything above is testable locally except Stripe proration (needs a test-mode key; N1 writes it against the Stripe API docs and leaves a checklist for M to verify with the live promo flow).

## 2. Content: styles, then volume

Principle: pick five repeatable styles, make a template for each, then produce in batches. The product has two unusual assets: **real dates** (every post can carry a specific date, which astrology content almost never does) and a **live dial animation** that already exists in the site's code.

### Styles (what, why, how we produce it)

1. **Dial screen-recording + voiceover** (graphics). Screen capture of `/start`: type a birth date, Saturn swings to position, passes appear. 20–30 s. VO: "Born in 1997? Your Saturn return hits 28 April 2027. Here's what that means." Produce programmatically: Playwright drives the real site; voiceover from the narration voice (Deepgram Aura via Workers AI) or Mick's voice. **Zero-cost, infinitely repeatable per cohort/sign.** → N2 builds the generator (`scripts/render-clip.ts`).
2. **Cohort callout cards** (static/animated graphics). "Born Apr 1996–Jun 1998: your Saturn return is open now." Twelve sign variants + three cohort variants, in the brand (cream card, gold dial). Carousel-friendly. Produce with **Remotion** (React → MP4/PNG, uses our own design tokens) or Canva Bulk Create from a CSV. → N2 for the Remotion template; M for Canva if preferred.
3. **Talking-head explainers** (live action or AI). 30–45 s, one idea each: "Why your Saturn return is 2–3 years, not a day", "The retrograde pass is the one people miss", "What the 'closest turn' is". Hook in line one, one on-screen date, captions on. Live: Mick or a creator; AI: a consistent avatar (see tools). → scripts from N1; production M.
4. **Storytime / POV with text overlay** (UGC proper). Someone 28–31 telling what changed, dates on screen matched to their chart. This is the format TikTok's own "my saturn return 2026" discovery page is full of; it's testimonial-shaped, so it needs **real people** (creators with gift codes, or customers who opt in via a post-reading prompt) — not AI actors, both for honesty and because several AI tools' terms bar scripted testimonials. → creator outreach list from N1; a "share your story" prompt at the end of the reading from N2.
5. **Green-screen reaction to a chart** (hybrid). Creator or Mick in front of a screenshot of a result page or sign page, reacting to the dates. Native TikTok effect, cheap, works for the "celebrity born in 1997" angle (celebrity table in the kit, verified against the ephemeris). → scripts N1.
6. **Static quote cards** (graphics, low effort). The "one line to carry" from readings (with permission) or lines from the sign copy, on the cream card. Fills the calendar between heavier posts. → N2 template.

Avoid: AI avatars delivering first-person "this changed my life" lines (platform policy risk and it reads false), anything predicting events (the product's own voice rules).

### Tools (researched 16 Oct 2026; prices are list, check before buying)

**Programmatic graphics/video (our main engine):**
- **Remotion** — React components rendered to video/PNG. Free for individuals/small companies (company licence above a threshold). We already have the dial as HTML/SVG; porting it is a day. Best fit for data-driven per-sign and per-cohort clips at zero marginal cost. → recommended.
- **Creatomate** or **Bannerbear** — template + JSON → video/image via API, from ~$41/mo (Creatomate) / $49/mo (Bannerbear). Faster than Remotion to start, less control, recurring cost. Fallback if Remotion is too much engineering.
- **Canva Bulk Create** — CSV → variants of a Canva design (Pro, ~$15/mo). Good for Style 2 and 6 if Mick prefers designing in Canva.

**AI talking heads (Style 3 only, non-testimonial):**
- **HeyGen** — from $29/mo Creator; cheapest per-second avatar video; free-plan output can't be used in ads. Clean, corporate-leaning avatars.
- **Captions (Mirage)** — $9.99–24.99/mo, phone-first, virtual actors + strong auto-captioning/editing; its policy bars scripted testimonials, which suits our rule anyway.
- **Arcads / MakeUGC / Creatify** — "AI UGC" actors at ~$2–12 per video; MakeUGC and Creatify have batch modes. Terms around ad use and ownership are inconsistent across these (one review found conflicts inside their own help pages). Use only for explainer-style scripts, never first-person reviews.
- Source for the comparison: [adtestbench.com AI UGC pricing and rights table](https://adtestbench.com/ai-ugc/); overviews at [Creatify](https://creatify.ai/blog/the-8-best-ai-ugc-ad-tools-in-2026), [HeyGen](https://www.heygen.com/blog/best-ai-video-generator-for-ads), [StartupTalky](https://startuptalky.com/best-ai-ugc-video-tools/).

**Live-action editing and repurposing:**
- **Descript** — edit video by editing the transcript, filler-word removal, studio sound, auto-captions; ~$24/mo Creator. Right tool for Mick's own talking heads (Style 3, 5).
- **CapCut** — free, templates, trending sounds, direct TikTok publish. Good enough for Style 4/5 assembly.
- **OpusClip** — long recording → many short clips (~$15/mo). Useful once there's a 20-minute "everything about Saturn returns" recording to mine.

**Scheduling/publishing:** Buffer or Later (free tiers cover 3 channels); Metricool if we want TikTok analytics in one place.

Recommendation: **Remotion for everything data-driven (Styles 1, 2, 6) + Descript for Mick's live pieces (3, 5) + real creators for 4.** One AI-avatar tool (Captions) as a trial for explainers only. Decide after the first week's numbers in PostHog, not before.

### Calendar (first 4 weeks; details in `launch-kit-v2.md` once N1 writes it)

- Cadence: 1 post/day TikTok + Reels (same asset), 3–5 X/Threads a week, 1 carousel a week on Instagram, Reddit twice total (explainers, no links in post).
- Week 1 (soft): Styles 1 and 2 only — six dial clips for the Aries cohorts (born 1996–98, Oct 98–Feb 99) and the "it's not a day, it's three years" explainer. Reddit explainer #1.
- Week 2: Style 3 live pieces (3), Style 6 fillers, Product Hunt / HN Show post with the accuracy angle (Swiss Ephemeris-checked, dates to the day). Reddit #2.
- Week 3: Style 4 — first creator posts with gift codes; Style 5 celebrity reactions; "Taurus opens 2028" anticipation for the next cohort.
- Week 4: Dec 2026 station as the news peg ("Saturn stops on 11 Dec, here's who feels it"); second-return (1967–69) pieces; newsletter pitches go out.

### Capture that's missing from the site (code)

- **"Notify me when my window opens"** for visitors whose return is years away — most visitors. One email field on the result page when `phase = not_yet` and the window is >12 months out; stored in `reminders` with the window-open date. This is the single biggest list-builder absent today. → N1.
- **"Share your story"** prompt at the end of a reading (opt-in, links to a form or mailto) to feed Style 4. → N2.
- Per-sign `og.png` so sign pages unfurl properly when shared. → N2.

## 3. Launch sequence

1. **Pre-launch (this week, M):** Resend domain, `rite.report` domain + `SITE_URL`, Stripe webhook moved, Stripe public details (terms/privacy), promo code deleted, Season dogfood started, accounts created (TikTok, Instagram, X/Threads; Reddit account should already have karma or borrow one).
2. **Soft launch (week 1):** six dial clips + explainer, Reddit explainer, Mick's own network. Watch the PostHog funnel: preview → result → unlock. Fix whatever drops hardest.
3. **Launch (week 2):** Product Hunt + Hacker News "Show HN: a Saturn return calculator checked against Swiss Ephemeris", live talking heads, first newsletter pitches.
4. **Creators (week 3):** 20 astrology creators, 1–50k followers, ask = "here's a gift code for your reading, post what you think, no script". List + DM copy from N1.
5. **Review (end of week 4):** conversion by source and by sign from `/admin/stats`, Season take-rate, narration play-rate, ask usage. Decide the Night 3+ backlog from the numbers.

## 4. Open decisions for Mick

- Remotion (engineering, free) vs Creatomate/Canva (faster, paid) for the data-driven assets.
- Mick on camera, or creators only?
- Entity name for the legal pages (`views/legal.ts` says "MickMade (Australia)").
- Whether yearly Season stays offered at all before S3 ships.
