# 30-day posting schedule

Written 17 Oct 2026. This puts the kit calendar (`launch-kit-v2.md` §i, `gtm-plan.md` §2–3) on a launch-relative clock so it survives a slipped launch.

- **L** is the first public posting day (soft launch, week 1 of the kit). Concrete dates assume **L = Mon 2 Nov 2026**.
- Kit week 1 → L+0…L+6. Week 2 (Product Hunt / HN) → L+7…L+13. Week 3 (creators) → L+14…L+20. Week 4 (December station) → L+21…L+27. L+28 and L+29 are new.

Asset ids are from the weeks 1–2 manifest (`docs/content/2026-10-weeks-1-2.md`, file names `<date>_<platform>_<asset>`). Weeks 3–4 assets are the batch being rendered now; check its manifest when it lands.

## Status tags

| Tag | Meaning |
|---|---|
| **READY** | Rendered in the weeks 1–2 batch, and still true on the new date. |
| **RE-RENDER** | Exists, but has a burned-in "today", a current degree or a "right now" that has to be rendered for the actual posting date. |
| **BATCH 3–4** | In the weeks 3–4 render. It was planned for 2–15 Nov, so if L = 2 Nov it posts 16–29 Nov. **Every time-sensitive line in it must be re-checked for its new date** (run `check-cohorts.ts --plan` with the new dates). |
| **NEW** | No asset yet; it needs making. |
| **PERSON** | Needs Mick or a creator on camera (style 3 talking heads, style 4 or 5 creator pieces). |
| **TEXT** | Text only. The copy is in the kit, verbatim, unless a rewrite is noted. |

## Platform rules

- **TikTok and Reels.** The same vertical every day. Post at **10:00 Brisbane** (19:00 ET the evening before, the US peak).
- **X and Threads.** 3–5 a week, the same text on both, at **23:00 Brisbane** (08:00 ET).
- **Instagram carousel.** One a week, Mondays, at 10:30 Brisbane.
- **Anything saying "today", "right now", "N weeks until" or a current degree.** Post it at **23:00 Brisbane on that UTC date** (08:00 ET), so it is that date in both Australia and the US. Re-render it if the slot moves.
- **Reddit.** By hand only, from Mick's account with real karma. No link in the post body. Read that subreddit's self-promotion rules **on the day**. If someone asks how it's computed, answer in a comment with `rite.report/?r=reddit`. Never repost a removed post. Reddit 3 runs only if 1 and 2 weren't removed and got a decent reception.
- **Newsletter pitches and creator DMs.** By hand, personal, never through a scheduler. Codes come from checklist B7.
- **Every post.** One real date, the CTA "Free preview at rite.report", no event predictions, and no "29" used as a birthday.
- **Bio links.** `rite.report/?r=tiktok`, `?r=ig`, `?r=x`, `?r=threads`. Captions say "rite.report" because the platforms don't make caption URLs clickable.

## Week 1: soft launch, styles 1 and 2, Aries cohorts (L+0…L+6)

| L+ | Date | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|---|
| 0 | Mon 2 Nov | Script 1, `aries-three-pass-1997`. **READY** (silent). The VO line "It's crossing it again right now, going backwards" is stale (that pass was 15 Oct), so it has to say "It crossed it again on 15 October, going backwards" before any `_vo` render. | Post 1 **TEXT** | Carousel 2, `carousel-2-window-by-birth-year-01…08` **READY** | Mick's own network, `?r=friends` (launch-day runbook) |
| 1 | Tue 3 Nov | Script 2, `aries-approach-1997`. **RE-RENDER**: the burned-in "Today: 10° Aries" is only true to 20 Oct, so render it for 3 Nov (`check-cohorts` gives the degree). | — | — | — |
| 2 | Wed 4 Nov | Cohort card, `cohort-aries-first-return-vertical` **READY** (true until 12 Apr 2028) | Post 4 **TEXT** (true until 11 Dec) | — | **Reddit 1**, r/astrology (kit §f). The body says "The second, backwards pass is happening now", which is true until 11 Dec. |
| 3 | Thu 5 Nov | Script 6, "not a day, a season". **PERSON** (Mick to camera). If not filmed: post the `photo_cohort-aries-first-return` still instead. | — | — | L+3 review (checklist, first 72 hours) |
| 4 | Fri 6 Nov | Script 5, `aries-last-degrees-1998` **READY** (silent captions are evergreen). The VO line "Saturn's at 10° today" must use the posting-day degree. | Post 2 **TEXT** | — | — |
| 5 | Sat 7 Nov | **NEW** (replaces the Lisa "pass today, 24 Oct" clip, which is now dead). Re-render `celeb-lisa-1997` with the hook "Lisa's Saturn return has three passes. Two are done. The last is 25 Jan 2027." (dates from the kit §h table). Or use Maisie Williams, who is between her second and third pass (third 20 Feb 2027). | — | — | — |
| 6 | Sun 8 Nov | Cohort card, `cohort-aries-1998-99-vertical` **READY** | Post 6 **TEXT** | — | Weekly funnel review (`/admin/stats` by `?r=`) |

## Week 2: launch, Product Hunt and HN, style 3 talking heads, style 6 fillers (L+7…L+13)

| L+ | Date | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|---|
| 7 | Mon 9 Nov | Script 7, "the retrograde pass". **PERSON**. Check the hook: "Saturn is crossing your degree right now, backwards". By 9 Nov most of the spring-1997 band has already had its backwards pass, so say "Saturn has been crossing the spring-1997 degrees backwards since August, and turns on 11 December". | Post 10 **TEXT** | Carousel 1, `carousel-1-what-it-is-01…08` **READY** | Product Hunt goes live at 18:01 Brisbane (00:01 PT Tue) |
| 8 | Tue 10 Nov | Script 6 re-cut. **PERSON** (a re-cut of the L+3 piece). If L+3 wasn't filmed: post `quote-aries-sign-line-vertical` here and move L+9 up. | Post 9 **TEXT** | — | **Show HN** at about 23:00 Mon Brisbane (08:00 ET Tue), with the accuracy line (kit §a) |
| 9 | Wed 11 Nov | Style 6, `quote-aries-sign-line-vertical` **READY** | — | — | **Reddit 2**, r/AskAstrologers (kit §f). Its dates are all fixed events, so it's safe to post later. |
| 10 | Thu 12 Nov | Script 3, `taurus-2028` **READY** (silent). For the VO, "You have eighteen months" becomes "about a year and a half". | Post 7 **TEXT** | — | **Newsletter pitch 1** (kit §g) to three astrology letters, starting with the two in `creators.md` (firstsaturnreturn.substack.com, The Rational Astrologer) |
| 11 | Fri 13 Nov | Style 3, "what the closest turn is". **PERSON**, with `cutin_quote-closest-turn.png` **READY** as the cut-in (true until 11 Dec). If not filmed: post the cut-in as a still. | — | — | — |
| 12 | Sat 14 Nov | Style 6, "one line to carry" quote card. **NEW**: it needs a real reader's line with `can_quote` (`/admin` stories). If there's none yet, post the `photo_cohort-aries-1998-99` still. | Post 8 **TEXT** | — | — |
| 13 | Sun 15 Nov | Cohort card, `cohort-aries-second-return-vertical` **READY** | — | — | Weekly funnel review |

## Week 3: creators, style 5 celebrity reactions, Taurus anticipation (L+14…L+20)

| L+ | Date | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|---|
| 14 | Mon 16 Nov | Script 8, Simone Biles **BATCH 3–4**. Check "the third one is on New Year's week" (29 Dec, fine) and that the second pass (22 Nov) is still described as ahead. | Post 3 **TEXT** (11 Dec station) | Carousel 3 **BATCH 3–4** | **Creator wave 1**: DMs 1–10 from `creators.md`, one code each, checking each profile first |
| 15 | Tue 17 Nov | Script 4, born 1968 **BATCH 3–4**. Its first two passes (21 May and 4 Oct 2026) are now behind the viewer; the beat "Three passes: May, October, February" still reads correctly. | — | — | — |
| 16 | Wed 18 Nov | Script 9, Aniston and Jenner **BATCH 3–4** (all 2027–28 dates, evergreen) | Post 5 **TEXT** | — | **Reddit 3**, only if 1 and 2 went well (r/SaturnReturn, or the r/Zillennials fallback). Otherwise hold. |
| 17 | Thu 19 Nov | Style 4, first creator repost. **PERSON** (needs a creator post and their permission to duet or stitch). Fallback: Script 1 `_vo` version. | — | — | **Creator wave 2**: DMs 11–19 (including @thoseastrologygirls, who get two codes) |
| 18 | Fri 20 Nov | Style 5, Sabrina Carpenter, Taurus 2028 **BATCH 3–4** (first pass 26 Jun 2028) | — | — | — |
| 19 | Sat 21 Nov | Style 6, Taurus sign-line card "opens 13 Apr 2028" **BATCH 3–4** | Repost the best creator clip, or Post 7 again if there's none | — | — |
| 20 | Sun 22 Nov | Script 3 re-cut with the "Notify me" screen **BATCH 3–4** | **NEW, TEXT, time-sensitive.** Simone Biles's second pass is **today, 22 Nov 2026** (kit §h). Suggested copy: "Simone Biles's second Saturn pass is today, 22 Nov. The third is 29 Dec. Computed at noon in Columbus, no birth time claimed. The dates are public maths; yours are too. rite.report". Post at 23:00 Brisbane on 22 Nov. | — | Weekly review by source and sign (`/admin/stats`) |

## Week 4: the December station as the news peg, second-return pieces (L+21…L+27)

| L+ | Date | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|---|
| 21 | Mon 23 Nov | Script 10, the closest-turn card, "Saturn stops 11 Dec" **BATCH 3–4** | **Rewrite** the kit's "four weeks until Saturn stops": from 23 Nov it's **18 days**. Time-sensitive: post at 23:00 Brisbane. | Carousel 4, first vs second return **BATCH 3–4** | **Newsletter pitch 2** (kit §g) to three self-development letters |
| 22 | Tue 24 Nov | Style 5, Daniel Craig and Simone Biles **BATCH 3–4**. **Kit error to fix:** the calendar says "both have December passes", but Craig's passes are 20 May 2026, 5 Oct 2026 and 11 Feb 2027 (no December pass). Pitch it as "both in the 2026 three-pass loop", with Simone's 29 Dec as the December date. | — | — | — |
| 23 | Wed 25 Nov | Script 4 re-cut for people born in 1969 (one pass 16 Apr 2027) **BATCH 3–4** | Post 5 variant, "born 1969?" **TEXT** (write it with the 16 Apr 2027 date) | — | — |
| 24 | Thu 26 Nov | Style 3, "what integration looks like". **PERSON**. US Thanksgiving, so expect low US reach; this is a good slot for the weakest piece. | — | — | Follow up creators who haven't replied, **once** |
| 25 | Fri 27 Nov | Style 6, second-return quote card **BATCH 3–4** | Post 2 re-run, reworded **TEXT** | — | — |
| 26 | Sat 28 Nov | Style 4, second creator repost. **PERSON**. Fallback: the `photo_cohort-aries-second-return` still. | — | — | — |
| 27 | Sun 29 Nov | Cohort card, "born Mar–May 1997, third pass Dec–Mar" **BATCH 3–4** | — | Carousel 5, what to do in each phase **BATCH 3–4** | End-of-month review: conversion by source and sign, Season take-rate, narration play-rate, ask usage. Set the next backlog. |

## Days 29 and 30: new (L+28, L+29)

| L+ | Date | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|---|
| 28 | Mon 30 Nov | **NEW, time-sensitive.** Station countdown card: "Saturn stops in 11 days: 11 Dec 2026 at 7.9° Aries", using Script 10's second card for who's within a degree. Make it from the closest-turn quote config with a new line, and render it for 30 Nov. | **NEW TEXT**: "11 days until Saturn turns direct at 7.9° Aries…" (post at 23:00 Brisbane) | **NEW** carousel: "11 December, who feels the station". Slides from kit §c script 10 and §b: the birth bands within 1°, the first-return and second-return ranges, the three-pass explanation, and the CTA. | — |
| 29 | Tue 1 Dec | Best performer from weeks 1–2, re-run with `_vo` (pick it from the review). Any re-run with a degree or "today" line is **RE-RENDER**. | Post 10 re-run **TEXT** | — | Plan the next 30 days. The 11 Dec station (L+39) and Simone's 29 Dec third pass (L+57) are the next pegs. |

## What needs making before L

1. **RE-RENDER (C):** L+1 Script 2 for 3 Nov. L+5 Lisa, or the Maisie Williams swap. Before any `_vo`, fix the VO lines with "right now" or "today" (Scripts 1, 2, 3 and 5).
2. **Re-date the whole weeks 1–2 plan to L** (checklist E1) and run `render-batch` with the new dates. The date check runs each clip against its real posting day.
3. **Re-check BATCH 3–4 for its new dates (C):** a render planned for 2–15 Nov but posted 16–29 Nov. Fix the Craig "December passes" line. Rewrite "four weeks until" as "18 days".
4. **NEW (C):** the L+20 Simone X post, the L+21 X rewrite, the L+23 Post 5 variant, the L+28 countdown card, X post and carousel, and the L+12 reader quote card once a `can_quote` story exists.
5. **PERSON (M or creators):** L+3, L+7, L+8, L+11 and L+24 talking heads. L+17 and L+26 creator reposts. Every one has a READY fallback in its row, so the TikTok slot is never empty.

## Scheduler: Metricool

`gtm-plan.md` §2 names "Buffer or Later (free tiers cover 3 channels); Metricool if we want TikTok analytics in one place" without a final pick.

**Recommendation: Metricool.**
- It's the only one of the three named that covers all five channels here (TikTok, Instagram Reels and carousels, X, Threads) with TikTok analytics in the same place, which the L+27 review needs.
- It has a **bulk CSV upload** in its Planner.
- The batch export already writes a `manifest.csv` per batch (date, platform, file, caption, alt, other_version).
- Buffer is the fallback. Later lacks a CSV import.
- Check before paying: the current plan's cap on scheduled posts (this month is about 100 posts across channels, more than the free tier allows, so budget for one month of a paid tier), and that TikTok direct publishing is enabled for the account. Otherwise TikTok posts arrive as a notification to finish in the app.

**Loading the batch:**
1. Re-export with the launch dates (checklist E1), giving `content/out/launch-weeks-1-2/manifest.csv` plus the files. Do the same for weeks 3–4.
2. Upload the folder to Google Drive ("Rite content / launch"). Metricool's CSV wants **public media URLs**, and Drive share links often don't work for this. Either put the files on a public bucket (Cloudflare R2 with a public `r2.dev` URL is free at this size), or skip URLs and attach media by hand in the Planner after import.
3. Turn `manifest.csv` into Metricool's template (download the current template from Planner → bulk upload, because the columns change):
   - one row per platform post;
   - date plus the time from the platform rules above;
   - the caption from `caption`;
   - the media URL from `file`, or `other_version` for the silent cut;
   - alt text from `alt`.
   Text-only rows (X/Threads) have no file. Leave Reddit, PH/HN, newsletter and DM rows out: those are by hand.
4. Import into **Drafts** first, not straight to the queue. Spot-check five posts: media attached, caption intact, right time zone (set the Metricool brand time zone to **Australia/Brisbane**).
5. Before each week, re-confirm the time-sensitive rows (anything RE-RENDER or tagged time-sensitive) against `compute()` for their date, then move that week from Drafts to scheduled.
6. Add trending sounds to TikTok and Reels in the app if wanted. The renders have no music, by design (`content/README.md`).
