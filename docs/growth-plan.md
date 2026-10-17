# Growth plan: launch to $1M

Written 17 Oct 2026. The numbers and gates are in the "Rite: path to $1M" doc; the builds are in `automation-builds.md`; the launch steps are in `launch-checklist.md` and `posting-schedule-30d.md`. This file holds the plans those don't: the launch week as it now runs, gift season, the ads test, measurement and the decision calendar, the price test, creators, the waiting list, and what comes after the reading.

## 1. Launch week (launch as soon as the domain is live)

Launch day L = the first Monday the domain, email and webhook all work, aiming for **Mon 26 Oct 2026** (or Wed 21 Oct if the domain is bought tomorrow and B1–B7 go through in a day). The 28-day calendar was written for day 1 = 19 Oct, so it shifts by days, not weeks, and keeps the 11 Dec station posts.

| Day | Mick | Claude (sessions) |
|---|---|---|
| D−3 | Buy the domain; Cloudflare zone; spend caps (ElevenLabs, Anthropic); deploy current main | Builds 1, 2, 6 in parallel sessions |
| D−2 | Checklist B1–B6 (domain on the Worker, SITE_URL, Resend verified, Email Routing to the Worker, Stripe webhook URL and public details); Stripe Tax on | Build 3 (inbox assistant) against the live domain; review and merge 1, 2, 6 |
| D−1 | C1–C4 on the live domain (emails, a friend's purchase, refund, gift); B7 promo code off after making creator codes; Postiz API key; five accounts connected in Postiz | `LAUNCH=<L> npm run launch` → render, reread flagged posts; builds 4 and 5 |
| L | Launch-day runbook (checklist) | Watch errors, fix forward |
| L+1…L+6 | Reply to comments the first day; Reddit post 1 by hand | Weekly render and auto-posting live by L+4 |

If a step slips, launch moves to the next day, not the next week: the calendar shift is one command.

## 2. Gift season (15 Nov – 24 Dec)

Gifts are about 40% of December in the plan, so December is a gift month on purpose.

- **15 Nov:** gift banner live on `/`, results and readings (build 2, dated in config). Gift card image for each code.
- **15 Nov – 22 Dec:** one gift post in four (gift-angle captions on existing cohort cards: "born 1997? so is your best friend"), the presenter reel recut with a gift ending.
- **1 Dec and 15 Dec:** gift email to past buyers who haven't stopped emails.
- **18–24 Dec:** "still works on Christmas morning": codes are instant, so last-minute gifting is the pitch.
- **26 Dec – 5 Jan:** "you got a gift code?" posts aimed at redeemers, then January turns to "your year ahead".
- Ads, if gate A is met by 30 Nov, run a gift campaign in December alongside the reading campaign, under the same $20 rule.

## 3. Ads test (December)

- **Precondition:** gate A (2% of visitors buy and 1,500 previews a week by 30 Nov).
- **Setup:** Meta Advantage+ sales campaign, US + UK + Canada + Australia, ages 25–33 and 54–61 (the two cohorts in window), optimising for Purchase via the Conversions API (build 10).
- **Creative:** the five organic posts with the best bio-link click rate, plus the script 6 presenter reel. No new creative spend.
- **Budget:** $50 a day for 7 days ($350), then the controller's rules. Kill if cost per buyer is over $40 after $300 spent.
- **Read:** cost per buyer from our own `?r=meta` purchases, not Meta's attribution.

## 4. Measurement and the decision calendar

**Numbers that matter, in order:** visit → paid (the deciding number), preview → paid, revenue per buyer, cost per buyer (ads), revenue per month vs target. Everything else is diagnosis.

| Date | Decision | Inputs |
|---|---|---|
| L+7 | Fix the worst funnel step | PostHog funnel by step and source |
| L+14 | Start the price test if 300 previews a day; otherwise keep $29 | Preview volume |
| 30 Nov | **Gate A:** start ads or fix the offer | Visit → paid, previews a week |
| 31 Dec | Gift season review; January plan | Gifts per 100 readings, December revenue vs $45k |
| 31 Jan | **Kill line:** under 1.5% visit → paid means rework the offer (price, preview, result page) before more spend | Visit → paid, 4 weeks |
| 28 Feb | **Gate B:** raise the ad cap monthly | Cost per buyer at $200 a day |
| 31 Mar | Year-ahead reading live? Second product chosen | Build status, buyer survey |
| 30 Jun | **Gate C:** $100k month → push ads to $1–2k a day | Monthly revenue |
| 31 Oct 2027 | $1M check; year 2 plan | Everything |

The Monday KPI email (build 6) shows each gate's numbers against its threshold every week.

## 5. Price test

$29 vs $39 for the reading with a birth time ($19 vs $25 without), 50/50 by preview, 2 weeks or 600 previews per arm. Winner = higher revenue per preview (not purchase rate). $39 wins if the purchase rate falls by less than about 25%. The bump stays $15 in both arms.

## 6. Creators

`creators.md` has 16+ accounts and the three-line ask. With build 8 the ask becomes: a free reading (gift code), a personal 10%-off code for their audience, and 30% of every sale through it, paid monthly by Stripe automatically (decided 17 Oct; 30% is within the usual 20–50% for digital products). That replaces "the budget is codes" in `creators.md`. Outreach is by hand (DMs can't be automated without breaking platform rules): 10 DMs a week in November, from the list, then inbound through `/creators`.

## 7. Waiting list and the next cohorts

- The "tell me when my window opens" list is the asset that keeps working after the Aries window: Taurus opens in 2028 for people born roughly 1998–2001, the largest pool of not-yet visitors.
- Target 20,000 addresses by April 2027. One email 30 days before each person's window (already built); add a yearly "your window is N months away" email in their birth month (small build, phase 3).
- Second-return content (born 1967–69) runs monthly: the same dates, a different audience with more money.

## 8. After the reading (phase 3 products)

In order of expected value per build day:
1. **Year-ahead reading ($19, yearly):** next 12 months of Saturn against the chart, offered on the purchase anniversary and in January. The only repeat purchase in the line.
2. **Couples reading ($39):** two charts, both Saturn cycles side by side, where they overlap; gift-friendly.
3. **Another cycle:** Jupiter return (every 12 years: 24, 36, 48), Uranus opposition (around 40) or Chiron return (around 50), whichever the buyer survey asks for most. Same engine, same pages, same list.
