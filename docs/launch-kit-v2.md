# Rite launch kit v2

Written 17 Oct 2026. Replaces the content sections of `launch-kit.md` (the Polsia-era kit; keep it for history, don't post from it). Companion docs: `gtm-plan.md` (styles, tools, calendar), `emails.md` (email copy), `creators.md` (outreach list).

**Where the dates come from.** Every date below was computed on 17 Oct 2026 by running the site's own code (`src/compute.ts` → `src/astro/saturn.ts`, the daily ephemeris table that the test suite checks against Swiss Ephemeris to 0.02°). Celebrity passes use noon local time at the birth city, because no birth time is public; Saturn moves at most 0.13° a day, so a twelve-hour error moves a pass date by a day at most, and anyone within 1° of a sign boundary was dropped. Dates are the UTC date of the crossing, which is what a reading shows. Sign pages round to the month. If you re-run anything, use `compute()` with a real place and `today = 2026-10-17`; do not copy a date from memory, including from the old kit (several of its celebrity dates were a day out).

**Voice** (from `VOICE` in `src/content/prompts.ts`): direct, warm, grown-up. Plain English. No "cosmic", "the universe", "energy/energies", "manifest", "journey", "vibration", "align". No emoji. Second person. Never predict events. Never call the return a birthday or "turning 29". It is a two-to-three-year season with dated passes.

---

## (a) Positioning in five lines

1. Saturn is in Aries from 25 May 2025 to 12 Apr 2028 (with a step back into Pisces from 1 Sep 2025 to 14 Feb 2026). If you were born 8 Apr 1996 – 9 Jun 1998, 26 Oct 1998 – 1 Mar 1999, or 4 Mar 1967 – 29 Apr 1969, this is your Saturn return, and it is happening now.
2. It is not a birthday and not a day. It is a season of two to four years with one or three exact passes, each dated to the day; the free preview shows you your window and your passes in ten seconds, no account, no email.
3. The full reading is $29 ($19 without a birth time): ten chapters, narrated, with every date as a calendar file, a workbook that opens phase by phase, and five follow-up questions answered from your chart.
4. Gift codes ($29) for the friend who keeps saying "I think I'm in my Saturn return" without knowing when.
5. Saturn Season: a short note every Monday on where Saturn is against your chart this week, $7 a month or $59 a year, and it stops itself the week your window closes.

**The accuracy line for Product Hunt / HN:** "Dates to the day, from the same ephemeris professional astrologers use, tested against Swiss Ephemeris. No AI guessing at positions: the model only writes, the code only computes."

---

## (b) Cohort hooks

Birth ranges are from `src/content/sign-periods.json` (midnight-UTC sampling). Degree bands inside a cohort come from the stations: Saturn stopped at 14.7° Aries on 27 Jul 2026, turns direct at 7.9° on 11 Dec 2026, stops again at 27.9° on 10 Aug 2027 and turns direct at 21.0° on 25 Dec 2027. Anyone whose natal degree sits between a station's degree and the degree it came back to gets three passes; everyone else gets one.

| Cohort | Who (born) | Hook line | Dates to put on screen |
|---|---|---|---|
| **Aries, first return, early degrees** | 8 Apr – 24 Oct 1996; 11 Jan – 11 Mar 1997 (and 8–23 Apr 1996, 25 Oct 1996 – 10 Jan 1997 for the three-pass version) | "Born in 1996? Your exact pass already happened. The window hasn't closed." | Last pass between 15 Feb and 19 Apr 2026 (e.g. born 1 Sep 1996 → 3 Apr 2026). Window closes 12 Apr 2028. |
| **Aries, first return, the retrograde-pass band** | 12 Mar – 6 May 1997; 10 Nov 1997 – 21 Jan 1998 | "Born in spring 1997? You don't get one Saturn return. You get three dates." | Born 1 Apr 1997 → 13 May 2026, 15 Oct 2026, 3 Feb 2027. Saturn turns direct 11 Dec 2026. |
| **Aries, first return, the 2027 band** | 7 May – 9 Nov 1997; 22 Jan – 25 Mar 1998 | "Born in late 1997? Your Saturn return is dated. It's next spring." | One pass between 15 Mar and 4 May 2027 (e.g. born 1 Aug 1997 → 29 Apr 2027). You are on the approach now. |
| **Aries, first return, 2027–28 three-pass band** | 26 Mar – 20 May 1998; 24 Nov 1998 – 2 Feb 1999 | "Born in spring 1998? Yours runs May 2027 to January 2028, in three passes." | Born 1 Apr 1998 → 11 May 2027, 23 Nov 2027, 22 Jan 2028. Saturn stops 10 Aug 2027. |
| **Aries, first return, the last-degree band** | 21 May – 9 Jun 1998; 26 Oct – 23 Nov 1998; 3 Feb – 1 Mar 1999 | "Born in Nov 1998? Your pass is the last thing Saturn does in Aries." | One pass 27 Mar – 12 Apr 2028 (e.g. born 15 Nov 1998 → 31 Mar 2028). Window closes 12 Apr 2028. |
| **Taurus, first return (next)** | 10 Jun – 25 Oct 1998; 2 Mar 1999 – 10 Aug 2000; 17 Oct 2000 – 20 Apr 2001 | "Born in 1999? Your Saturn return opens 13 April 2028. Here's your date." | Window 13 Apr 2028 – 31 May 2030. Born 1 Apr 1999 → 10 May 2028; born 1 Mar 2000 → 18 Apr 2029; born 1 Jan 2001 → 14 Aug 2029, 28 Sep 2029, 19 Apr 2030. |
| **Aries, second return** | 4 Mar 1967 – 29 Apr 1969 | "Born in 1968? Your second Saturn return is running right now, on the same dates as the 1997 kids." | Born 1 Sep 1967 → 21 May 2026, 4 Oct 2026, 11 Feb 2027. Born 1 Jan 1969 → 16 Apr 2027. Born 1 Sep 1968 → 11 Jun 2027, 10 Oct 2027, 2 Mar 2028. |
| **Pisces, just finished** | 29 Jan 1994 – 7 Apr 1996 (and 22 May – 30 Jun 1993) | "Born in 1995? Your Saturn return ended on 13 February. What did it leave you with?" | Window 8 Mar 2023 – 13 Feb 2026. Born 1 Jun 1995 → one pass 25 Mar 2025. |

Second-return bands mirror the first (same degrees, same pass dates): born 4 Mar – 8 May 1967 and 17 Oct 1967 – 28 Jan 1968 are separating (last pass by 19 Apr 2026); 9 May – 16 Oct 1967 and 29 Jan – 30 Mar 1968 are in the three-pass loop now; 31 Mar – 21 May 1968 and 29 Oct 1968 – 10 Feb 1969 have one pass Mar – May 2027; 22 May – 28 Oct 1968 and 11 Feb – 12 Apr 1969 get three passes May 2027 – Mar 2028; 13 – 29 Apr 1969 get one pass at the very end, 27 Mar – 12 Apr 2028.

Boundary rule for anything on screen: someone born on the first or last day of a range needs a birth time to be sure of their sign. Say "enter your date, the site checks" rather than promising.

---

## (c) Ten short-video scripts

Format per script: style (from `gtm-plan.md` §2), length, hook (spoken in the first two seconds), beats with on-screen text, CTA. Every CTA is "Free preview at rite.report". Captions on. One real date per video minimum; never more than three.

### 1. Style 1 (dial screen-recording) — "Born in spring 1997"
~30 s. Screen: `/start`, type 1 Apr 1997, the dial swings to 10° Aries, three passes appear.
- Hook (VO): "Born in spring 1997? You don't get one Saturn return. You get three dates."
- Beat 1 (dial swings): "Saturn was at 10° Aries when you were born." On screen: **10° Aries**
- Beat 2 (passes appear): "It crossed that degree on 13 May. It's crossing it again right now, going backwards." On screen: **13 May 2026 · 15 Oct 2026**
- Beat 3: "And once more in February, going forwards. That's the one that settles." On screen: **3 Feb 2027**
- Beat 4: "Three passes. Not a day. Not a birthday." On screen: **One season, three dates**
- CTA: "Yours are different. Free preview at rite.report."

### 2. Style 1 — "Born in late 1997, you're on the approach"
~25 s. Screen: type 1 Aug 1997; dial to 20° Aries; one pass appears.
- Hook: "Born in the second half of 1997? Your Saturn return hasn't happened yet. It's dated."
- Beat 1: "Saturn is at 10° Aries today. Yours is at 20°." On screen: **Today: 10° Aries · You: 20° Aries**
- Beat 2: "It's moving backwards until 11 December. Then it turns and comes for your degree." On screen: **Turns direct 11 Dec 2026**
- Beat 3: "Exact on 29 April 2027. This is the year you set the thing up, not the year it gets tested." On screen: **29 Apr 2027**
- CTA: "Free preview at rite.report."

### 3. Style 1 — "Born in 1999? Your window opens in 2028"
~25 s. Screen: type 1 Apr 1999; dial to 3° Taurus; "Approaching" stamp.
- Hook: "Born in 1999? Everyone's talking about Saturn returns and yours hasn't started."
- Beat 1: "Saturn was in Taurus when you were born. It's in Aries now." On screen: **Natal: 3° Taurus**
- Beat 2: "Your window opens the day Saturn enters Taurus." On screen: **Opens 13 Apr 2028**
- Beat 3: "First exact pass a month later." On screen: **10 May 2028**
- Beat 4: "You have eighteen months. Use them." On screen: **Notify me when my window opens**
- CTA: "Free preview at rite.report. It'll email you when it starts."

### 4. Style 1 — "Born in 1968? Same dates as the 1997 kids"
~30 s. Screen: type 1 Sep 1967; dial to 11° Aries; three passes; "second return" label.
- Hook: "Born in 1967 or 68? This is your second Saturn return, and it's running on the same calendar as your kids' first."
- Beat 1: "Saturn's back at the degree it held the day you were born. For the second time." On screen: **Second return · 11° Aries**
- Beat 2: "Three passes: May, October, February." On screen: **21 May 2026 · 4 Oct 2026 · 11 Feb 2027**
- Beat 3: "The first one was about what you had to prove. This one's about what outlasts you." On screen: **What outlasts you**
- CTA: "Free preview at rite.report. Written for second returns too."

### 5. Style 1 — "Born in Nov 1998: yours is the last thing Saturn does in Aries"
~20 s. Screen: type 15 Nov 1998; dial to 28° Aries; one pass right at the window's edge.
- Hook: "Born in November 1998? Your Saturn return is the last thing Saturn does before it leaves Aries."
- Beat 1: "Natal Saturn at 28° Aries. Saturn's at 10° today, going backwards." On screen: **28° Aries**
- Beat 2: "Exact on 31 March 2028. Window closes twelve days later." On screen: **31 Mar 2028 → closes 12 Apr 2028**
- Beat 3: "A short, clean pass at the very end. Most of your window is approach."
- CTA: "Free preview at rite.report."

### 6. Style 3 (talking head) — "It's not a day, it's a season"
~40 s. Mick or a creator to camera, one on-screen date.
- Hook: "Your Saturn return is not a birthday. Nobody's is."
- Beat 1: "Saturn takes about 29 and a half years to go round. It comes back to the degree it held when you were born, and it spends two to four years in that sign while it does it." On screen: **Saturn in Aries: 25 May 2025 – 12 Apr 2028**
- Beat 2: "Inside that window there's one exact pass, or three if Saturn goes backwards over your degree. That's the part with a date."
- Beat 3: "Before the pass is approach: pressure, no verdict. The pass is contact. After the last pass is integration: what you chose becomes structure."
- Beat 4: "If someone tells you it hits at 29, ask them which day. If they can't say, they're guessing."
- CTA: "Free preview at rite.report gives you the day."

### 7. Style 3 — "The retrograde pass is the one people miss"
~40 s. To camera. One on-screen date.
- Hook: "If you were born in spring 1997, Saturn is crossing your degree right now, backwards, and most of you don't know."
- Beat 1: "Saturn stopped on 27 July and has been reversing since. It turns around again on 11 December." On screen: **Turns direct 11 Dec 2026**
- Beat 2: "Anyone with Saturn between 8° and 15° Aries gets crossed three times: once forwards in spring, once backwards now, once forwards in the new year."
- Beat 3: "The backwards pass is the one that feels like 'why is this coming back'. It isn't a repeat. It's the same question asked without the adrenaline."
- Beat 4: "Three dates. You should know all three."
- CTA: "Free preview at rite.report."

### 8. Style 5 (green-screen reaction) — Simone Biles, three passes
~30 s. Creator in front of a screenshot of the result page for 14 Mar 1997, Columbus, Ohio (noon; no claim of a birth time).
- Hook: "Simone Biles is in the middle of a three-pass Saturn return and the third one is on New Year's week."
- Beat 1 (point at passes): "First pass 23 April. Second pass 22 November. Third pass 29 December." On screen: **23 Apr 2026 · 22 Nov 2026 · 29 Dec 2026**
- Beat 2: "Saturn stopped on 11 December less than half a degree from her natal Saturn. That's as close as a station gets." On screen: **Closest turn: 11 Dec 2026, 0.3°**
- Beat 3: "I'm not telling you what she's going through. I'm telling you the dates are public maths, and yours are too."
- CTA: "Free preview at rite.report."

### 9. Style 5 — Jennifer Aniston and Kylie Jenner, same return
~30 s. Split screenshot: two result pages, 11 Feb 1969 Los Angeles and 10 Aug 1997 Los Angeles.
- Hook: "Jennifer Aniston and Kylie Jenner are in the same Saturn return. One week apart."
- Beat 1: "Kylie: Saturn at 20° Aries, exact on 28 April 2027." On screen: **28 Apr 2027**
- Beat 2: "Jennifer: Saturn at 21° Aries, first pass 5 May 2027, then two more. Second return, same degrees." On screen: **5 May 2027 · 15 Dec 2027 · 1 Jan 2028**
- Beat 3: "Born 28 years apart, crossed by the same planet in the same month. That's what a return is."
- CTA: "Free preview at rite.report. Works for first and second returns."

### 10. Style 6 (static quote card, 8–12 s with motion) — "The closest turn"
Cream card, gold dial frozen at 7.9° Aries, one line of text, one date. Use for the Dec station news peg.
- Card text: "Saturn stops on 11 December at 7.9° Aries. If your Saturn is within a degree of that, this is your closest turn: the nearest it gets without crossing."
- Second card (swipe or cut): "Born 24 Jun – 11 Aug 1996, or 4 – 19 Mar 1997? That's you. (Second return: 30 Apr – 18 May 1967, 4 – 31 Oct 1967, 16 Jan – 9 Feb 1968.)"
- On screen: **11 Dec 2026 · 7.9° Aries**
- CTA (bottom of card): rite.report

### Bonus Style 6 (filler) — sign line
Card text from the Aries sign page: "Aries is the sign of starting things, acting on your own and going first. Saturn there asks for the slower version of that: leadership that holds up over time." Small line underneath: "Saturn in Aries until 12 Apr 2028." CTA: rite.report.

---

## (d) Ten X / Threads posts

All under 280 characters. No hashtag spam (one tag at most, usually none). At most one date each.

1. Born in 1997? Your Saturn return isn't a vibe, it's a date. For most of you it's three dates. rite.report shows them free, no account.

2. "Your Saturn return hits at 29" is like saying summer hits on a Tuesday. It's a two-to-three-year season with one or three exact passes. Ask for the day. If someone can't give it, they're guessing.

3. Saturn stops on 11 December at 7.9° Aries. Born 24 Jun – 11 Aug 1996, or 4 – 19 Mar 1997? That's within a degree of your natal Saturn: the closest it gets without crossing. The reading calls it the closest turn.

4. Everyone born 12 March – 6 May 1997 is in the backwards pass of their Saturn return right now. The one that feels like "why is this back." It isn't back. It's the same question, asked quieter.

5. Born in 1968? Your second Saturn return is running on the same calendar as the 1997 first-timers. Different question, same dates. The reading is written for both.

6. Saturn leaves Aries on 12 April 2028. If you're Aries-Saturn (born Apr 96 – Jun 98, or Oct 98 – Feb 99), that's when your window closes, whatever else is going on. Everything before it is still the season.

7. Born in 1999 or 2000? Your Saturn return hasn't started. Taurus opens 13 April 2028. rite.report will email you a month before, free.

8. A Saturn return has three phases: approach (pressure, no verdict), contact (the dated pass or passes), integration (what you chose becomes structure). Most of the content you'll see is about contact. Most of your window is the other two.

9. We don't predict events. The reading tells you what Saturn in your sign asks for, where it lands if you give a birth time, and the exact dates. What you do with that is yours.

10. Dates to the day, checked against Swiss Ephemeris. Preview is free. Reading is $29. Weekly note is $7 and cancels itself when your window closes. That's the whole business.

---

## (e) Five Instagram carousel outlines

Cream card, gold dial, dark type. Slide 1 is the cover (big line, one date), last slide is the CTA. Six to eight slides.

### Carousel 1 — What a Saturn return actually is
1. **Cover:** "A Saturn return is not a birthday." Small: Saturn in Aries until 12 Apr 2028.
2. Saturn takes about 29.5 years to go round the Sun. Your return is when it gets back to the degree it held the day you were born.
3. It spends two to four years in that sign while it does it. That's your window. Dial graphic: ingress → egress.
4. Inside the window: one exact pass, or three if Saturn goes backwards over your degree. Those are the dates.
5. Three phases. Approach: pressure, no verdict. Contact: the pass. Integration: what you chose becomes structure.
6. It happens around 28–30, again around 58–59, again around 87–88. Same maths, different question each time.
7. Saturn describes the work, not what happens to you. Nothing here predicts an event.
8. **CTA:** "Your window and your passes, free, in ten seconds. rite.report"

### Carousel 2 — Your window by birth year
1. **Cover:** "Find your Saturn return by birth date."
2. Born 29 Jan 1994 – 7 Apr 1996: Saturn in Pisces. Return window 8 Mar 2023 – 13 Feb 2026. Done.
3. Born 8 Apr 1996 – 9 Jun 1998, or 26 Oct 1998 – 1 Mar 1999: Saturn in Aries. Window 25 May 2025 – 12 Apr 2028. **Now.**
4. Born 10 Jun – 25 Oct 1998, 2 Mar 1999 – 10 Aug 2000, or 17 Oct 2000 – 20 Apr 2001: Saturn in Taurus. Window 13 Apr 2028 – 31 May 2030. Next.
5. Born 4 Mar 1967 – 29 Apr 1969: Saturn in Aries. Second return, window 25 May 2025 – 12 Apr 2028. **Now.**
6. Born 30 Apr 1969 – 18 Jun 1971: Saturn in Taurus. Second return opens 13 Apr 2028.
7. Born on a boundary day? Your birth time decides the sign. The site checks.
8. **CTA:** "Exact passes to the day: rite.report"

### Carousel 3 — The three passes
1. **Cover:** "Why some people get three Saturn returns in a year." Small: Saturn turns direct 11 Dec 2026.
2. Saturn doesn't move in a straight line from our point of view. Each year it stops, backs up for about four and a half months, and stops again.
3. This year: stopped 27 Jul 2026 at 14.7° Aries. Turns direct 11 Dec 2026 at 7.9° Aries.
4. If your natal Saturn is between 7.9° and 14.7° Aries, it got crossed going forwards (Apr–Jul), is being crossed going backwards (now), and gets crossed again going forwards (Dec–Mar). Three passes.
5. Born 12 Mar – 6 May 1997 or 10 Nov 1997 – 21 Jan 1998: that's you. (Second return: 9 May – 16 Oct 1967, 29 Jan – 30 Mar 1968.)
6. Example, born 1 Apr 1997: 13 May 2026, 15 Oct 2026, 3 Feb 2027.
7. Everyone else in Aries gets one clean pass. Neither is better. Three means the theme surfaces, retreats, then settles.
8. **CTA:** "Your passes, dated: rite.report"

### Carousel 4 — First vs second return
1. **Cover:** "Born 1968 and born 1997 are in the same Saturn return."
2. The maths is identical: Saturn back at your natal degree, in your natal sign, for the same window. 25 May 2025 – 12 Apr 2028 for both.
3. First return (28–30): the first adult reckoning. What are you actually responsible for? What did you start that you'll still be doing in three years?
4. Second return (58–59): nothing left to prove. What structures outlast you? Which obligations did you choose, and which did you inherit?
5. Same sign, same work. Saturn in Aries asks for initiative that holds up over time: starting things you also finish, leadership you can support.
6. Example pair, both Los Angeles: born 10 Aug 1997, one pass 28 Apr 2027. Born 11 Feb 1969, passes 5 May 2027, 15 Dec 2027, 1 Jan 2028.
7. **CTA:** "The reading is written for both. rite.report"

### Carousel 5 — What to do in each phase
1. **Cover:** "Your Saturn return has three phases. Here's the job in each."
2. **Approach** (window open, no pass yet): set the thing up. Decide what you're building. Write it down. Don't wait for the pass to make the decision for you.
3. Approach, concretely: one commitment with a daily shape. One agreement you've been avoiding, had out loud.
4. **Contact** (the pass, or the three passes): hold. This is where the thing you set up gets tested. The job is to not quit at the first boring stretch.
5. Contact, concretely: keep the promise small and often. The week before each pass, reread what you wrote in approach.
6. **Integration** (after the last pass, until Saturn leaves the sign): consolidate. What you chose becomes structure. Drop the story you tell about yourself that no longer matches what you did.
7. Where you are today depends on your degree. Born Apr 1996 – early Mar 1997: integration. Born mid-Mar – early May 1997, or Nov 1997 – Jan 1998: contact. Everyone else with Saturn in Aries: approach. Window closes for all of Aries on 12 Apr 2028.
8. **CTA:** "The workbook opens phase by phase. rite.report"

---

## (f) Three Reddit explainers

**Before posting, read each subreddit's rules on self-promotion that day.** r/astrology and r/AskAstrologers have historically removed promotional posts and links; r/SaturnReturn is small and may not exist under that exact name when you look (search for it; if it's gone, r/astrologymemes or r/Zillennials with the birth-date hook are the fallbacks). None of these bodies contain a link. If someone asks how you computed it, answer in a comment: "I built a small tool for it, rite.report; the preview is free and I'm not going to pitch the paid part here." Use `rite.report/?r=reddit` in that comment so `/admin/stats` can attribute it. Post from Mick's own account with real karma.

### Reddit 1 — r/astrology
**Title:** Saturn in Aries, 2025–2028: the actual pass dates by birth date, for anyone who keeps hearing "you're in your Saturn return"

**Body:**

Saturn first entered Aries on 25 May 2025, backed into Pisces from 1 Sep 2025, re-entered Aries 14 Feb 2026 and stays until 12 Apr 2028. If you were born with Saturn in Aries (8 Apr 1996 – 9 Jun 1998, 26 Oct 1998 – 1 Mar 1999, or 4 Mar 1967 – 29 Apr 1969 for the second return), this is your return window. All of it, not just the exact pass.

What decides whether you get one pass or three is where your natal Saturn sits relative to the stations. This year Saturn stopped at 14.7° Aries on 27 Jul 2026 and turns direct at 7.9° on 11 Dec 2026. Next year it stops at 27.9° on 10 Aug 2027 and turns direct at 21.0° on 25 Dec 2027.

- Natal Saturn 0–7.9° (born Apr 1996 – 11 Mar 1997): your pass or passes were done by 19 Apr 2026. You're separating, in the natal sign until April 2028. Consolidation, not crisis.
- 7.9–14.7° (born 12 Mar – 6 May 1997, or 10 Nov 1997 – 21 Jan 1998): three passes, roughly Apr–Jul 2026, Aug–Dec 2026, Dec 2026 – Mar 2027. The second, backwards pass is happening now.
- 14.7–21.0° (born 7 May – 9 Nov 1997, or 22 Jan – 25 Mar 1998): one pass between 15 Mar and 4 May 2027. You're on the approach.
- 21.0–27.9° (born 26 Mar – 20 May 1998, or 24 Nov 1998 – 2 Feb 1999): three passes between May 2027 and Mar 2028.
- 27.9–30° (born 21 May – 9 Jun 1998, 26 Oct – 23 Nov 1998, 3 Feb – 1 Mar 1999): one pass 27 Mar – 12 Apr 2028, right at the end.

Second-return people: same degrees, same pass dates, 29.5 years later. Born 9 May – 16 Oct 1967 or 29 Jan – 30 Mar 1968, you're in the three-pass loop now too.

Two things I'd push back on from the usual content. One: "it hits at 29." It hits at a degree, on a date, and the window around it is two to four years. Two: Saturn in Aries "means" some event. It doesn't. The sign describes the kind of work (for Aries: initiative that holds up over time, starting things you also finish, independence you can actually support) and the house, if you have a birth time, says where. What happens is yours.

Happy to work out anyone's degree and pass dates from a birth date in the comments. No time needed for the sign; time needed for the house.

### Reddit 2 — r/AskAstrologers
**Title:** PSA for the "am I in my Saturn return?" posts: here's how to answer it yourself in two minutes, with this year's dates

**Body:**

This comes up every week, so here's the method rather than a verdict.

1. Find your natal Saturn sign and degree. Any free chart site gives it; you don't need a birth time for the sign (Saturn moves about 0.1° a day), you do need one for the house.
2. Saturn returns to that degree about 29.5 years after you were born. The sign it's in during that time is your return window, from the day it enters the sign to the day it leaves. Right now Saturn is in Aries (25 May 2025 – 12 Apr 2028, with a dip back into Pisces Sep 2025 – Feb 2026). Next it's Taurus, 13 Apr 2028 – 31 May 2030.
3. Count the passes. Saturn retrogrades every year for about four and a half months. If your degree falls between where it stops and where it turns around, it crosses you three times; if not, once. The 2026 loop is 14.7° → 7.9° Aries (stations 27 Jul and 11 Dec 2026). The 2027 loop is 27.9° → 21.0° (10 Aug and 25 Dec 2027). The first Taurus loop is 11.3° → 4.4° (23 Aug 2028 and 6 Jan 2029).
4. Place yourself. Before the first pass is approach. Between first and last pass is contact. After the last pass until Saturn leaves the sign is integration. All three are "in your Saturn return."

Example: born 1 Apr 1997, natal Saturn 10° Aries, three passes: 13 May 2026, 15 Oct 2026, 3 Feb 2027. Born 1 Aug 1997, 20° Aries, one pass 29 Apr 2027. Born 1 Apr 1999, 3° Taurus, window opens 13 Apr 2028, one pass 10 May 2028.

If your Saturn is within a degree of a sign boundary (0° or 29°), your birth time matters for the sign, and the answer is "get the time first."

If you want someone to check your dates, post the birth date and I'll run it.

### Reddit 3 — r/SaturnReturn (if it exists; otherwise r/Zillennials with the date hook)
**Title:** Born between April 1996 and February 1999? Your Saturn return is open right now. Here's what phase you're in, by birth month.

**Body:**

Saturn is in Aries until 12 April 2028. If you were born 8 Apr 1996 – 9 Jun 1998 or 26 Oct 1998 – 1 Mar 1999, Saturn was in Aries when you were born, and this is your return. It's a season, not a day: a two-to-three-year window with one or three exact passes inside it.

Where you are today, roughly by birth month (exact dates depend on your degree, which depends on the day):

- **Apr 1996 – early Mar 1997:** your exact pass or passes happened between May 2025 and 19 Apr 2026. You're in integration. The thing you decided during the pass is now supposed to become structure. Boring on purpose.
- **Mid Mar – early May 1997, and Nov 1997 – Jan 1998:** three passes. First was Apr–Jul 2026. Second is the backwards one, Aug–Dec 2026, happening now. Third is Dec 2026 – Mar 2027. The middle pass feels like a repeat; it's the same question without the adrenaline.
- **May – early Nov 1997, and late Jan – Mar 1998:** one pass, 15 Mar – 4 May 2027. You're in approach. This is the year to set the thing up, not the year it gets tested.
- **Late Mar – May 1998, and late Nov 1998 – early Feb 1999:** three passes, May 2027 – Mar 2028. Approach for now.
- **Late May – early Jun 1998, late Oct – Nov 1998, and Feb 1999:** one pass in the last two weeks of the window, 27 Mar – 12 Apr 2028. Long approach, short contact.

Saturn in Aries, for everyone above, is about initiative: starting things you also finish, and independence you can support rather than just declare. The failure mode is quitting at the first boring stretch, or waiting for permission. The mature form is one thing, made unglamorous and daily.

What I'd actually do in each phase: approach, decide and write it down; contact, keep the promise small and often; integration, drop the story about yourself that no longer matches what you did.

Drop a birth date if you want your degree and pass dates. No time needed.

---

## (g) Two newsletter pitch emails

Both short, plain text, from Mick's own address, offering a free reading for the editor (a gift code; they redeem it with their own details). No attachments. Replace the bracketed bits.

### Pitch 1 — astrology newsletters (Substack astrologers, The Mountain Astrologer's list, Astro Poets-style letters)

Subject: Saturn in Aries pass dates, by birth date, for your readers

Hi [name],

I've been reading [newsletter] since [specific post]. I build Rite, a Saturn return reading that does one thing most astrology content doesn't: it gives the dates. Window to the day, the one or three exact passes, the closest station, all from the ephemeris (tested against Swiss Ephemeris), and then a reading that stays inside the chart: the work, where it lands, no event predictions.

Two things you might find useful, no strings:

1. A gift code for a full reading on your own chart, so you can judge it: [CODE] at rite.report/gift/[CODE]. It works with or without a birth time.
2. If you're writing about Saturn in Aries, I can send you a verified table of pass dates by birth-date band (for example, born 12 Mar – 6 May 1997 gets three passes, the second one running now until 11 Dec 2026). Cite it or don't; it's just correct.

If it's not for you, no reply needed.

Mick
rite.report

### Pitch 2 — self-development / "adulting" newsletters (not astrology-first)

Subject: A grown-up version of the Saturn return thing, with actual dates

Hi [name],

Your readers are 27–31 and at least a third of them have heard "you're in your Saturn return" this year. Most of what they've heard is wrong in a specific way: it's not a day at 29, it's a two-to-three-year season with dated passes, and for anyone born Apr 1996 – Feb 1999 it is happening now (Saturn is in Aries until 12 Apr 2028).

I built Rite to be the version you could recommend without wincing. The preview is free and needs no account: birth date in, your window and exact dates out. The reading ($29) is plain English, never predicts events, and comes with a workbook that opens phase by phase and calendar files for each date.

Here's a gift code for a full reading on your own chart, so you can decide for yourself: [CODE] at rite.report/gift/[CODE]. If you'd rather a short piece from me, "How to tell which phase of your Saturn return you're in, by birth month," I can write it to your length.

Either way, thanks for [specific thing].

Mick
rite.report

---

## (h) Celebrity table, re-verified 17 Oct 2026

Birth dates and cities checked against English Wikipedia / Wikidata on 17 Oct 2026. **No birth times are used or claimed**: every row is computed at 12:00 local time at the birth city, so the house is unknown and the degree carries up to ±0.07°. Dropped from the old kit for being within 1° of a sign boundary: Joe Burrow, Hailee Steinfeld, Barbie Ferreira (all 0.7° Aries) and Luka Dončić (29.9° Aries). Dropped for not having a standalone Wikipedia article: Malia Obama. Dates in the old kit that differed by a day (Simone Biles, Lisa, Jungkook, Jack Harlow, Sabrina Carpenter, Hunter Schafer, Kylian Mbappé, Conan Gray and others) are corrected here; use this table.

Posting rule: the date is the content, the interpretation is general. Do not say what anyone is going through.

| Name | Birth date | Birth city | Natal Saturn | Passes (computed) | Note |
|---|---|---|---|---|---|
| Anya Taylor-Joy | 16 Apr 1996 | Miami, Florida | 1.1° Aries | 11 Jun 2025, 14 Aug 2025, 23 Feb 2026 | First return, separating. Birth time unknown. |
| Lorde | 7 Nov 1996 | Auckland, New Zealand | 1.2° Aries | 13 Jun 2025, 11 Aug 2025, 24 Feb 2026 | Separating. Birth time unknown. |
| Noah Kahan | 1 Jan 1997 | Strafford, Vermont | 1.4° Aries | 17 Jun 2025, 8 Aug 2025, 26 Feb 2026 | Separating. Birth time unknown. |
| Bella Hadid | 9 Oct 1996 | Washington, D.C. | 3.0° Aries | 11 Mar 2026 | One pass, separating. Birth time unknown. |
| Rosé (BLACKPINK) | 11 Feb 1997 | Auckland, New Zealand | 4.6° Aries | 24 Mar 2026 | Separating. Birth time unknown. |
| Lili Reinhart | 13 Sep 1996 | Cleveland, Ohio | 5.0° Aries | 27 Mar 2026 | Separating. Birth time unknown. |
| Normani | 31 May 1996 | Atlanta, Georgia | 5.5° Aries | 31 Mar 2026 | Separating. Birth time unknown. |
| Tom Holland | 1 Jun 1996 | Kingston upon Thames, London | 5.6° Aries | 1 Apr 2026 | Separating. Birth time unknown. |
| Zendaya | 1 Sep 1996 | Oakland, California | 5.8° Aries | 3 Apr 2026 | Separating; closest turn 11 Dec 2026 at 2.1°. Birth time unknown. |
| Camila Cabello | 3 Mar 1997 | Havana, Cuba | 6.9° Aries | 11 Apr 2026 | Separating; closest turn 11 Dec 2026 at 1.0°. Birth time unknown. |
| Simone Biles | 14 Mar 1997 | Columbus, Ohio | 8.2° Aries | 23 Apr 2026, 22 Nov 2026, 29 Dec 2026 | Three passes, live; station 11 Dec 2026 at 0.3°. Birth time unknown. |
| Lisa (BLACKPINK) | 27 Mar 1997 | Buriram, Thailand | 9.8° Aries | 6 May 2026, 24 Oct 2026, 25 Jan 2027 | Second pass in a week (24 Oct). Birth time unknown. |
| Maisie Williams | 15 Apr 1997 | Bristol, England | 12.2° Aries | 31 May 2026, 23 Sep 2026, 20 Feb 2027 | Between second and third pass. Birth time unknown. |
| Lana Condor | 11 May 1997 | Cần Thơ, Vietnam | 15.2° Aries | 19 Mar 2027 | One pass; closest turn 27 Jul 2026 at 0.5°. Birth time unknown. |
| Naomi Osaka | 16 Oct 1997 | Osaka, Japan | 16.4° Aries | 28 Mar 2027 | Approach. Birth time unknown. |
| Chappell Roan | 19 Feb 1998 | Willard, Missouri | 17.1° Aries | 3 Apr 2027 | Approach. Birth time unknown. |
| Jayson Tatum | 3 Mar 1998 | St. Louis, Missouri | 18.4° Aries | 13 Apr 2027 | Approach. Birth time unknown. |
| Sydney Sweeney | 12 Sep 1997 | Spokane, Washington | 18.9° Aries | 17 Apr 2027 | Approach. Birth time unknown. |
| Jacob Elordi | 26 Jun 1997 | Brisbane, Australia | 19.2° Aries | 20 Apr 2027 | Approach. Birth time unknown. |
| Jack Harlow | 13 Mar 1998 | Louisville, Kentucky | 19.5° Aries | 22 Apr 2027 | Approach. Birth time unknown. |
| Jungkook (BTS) | 1 Sep 1997 | Busan, South Korea | 19.6° Aries | 23 Apr 2027 | Approach. Birth time unknown. |
| Kylie Jenner | 10 Aug 1997 | Los Angeles, California | 20.3° Aries | 28 Apr 2027 | Approach; closest turn 25 Dec 2027 at 0.7°. Birth time unknown. |
| Hunter Schafer | 31 Dec 1998 | Trenton, New Jersey | 26.8° Aries | 4 Jul 2027, 15 Sep 2027, 17 Mar 2028 | Three passes 2027–28. Birth time unknown. |
| Kylian Mbappé | 20 Dec 1998 | Paris, France | 26.8° Aries | 5 Jul 2027, 13 Sep 2027, 18 Mar 2028 | Three passes 2027–28. Birth time unknown. |
| Conan Gray | 5 Dec 1998 | Lemon Grove, California | 27.3° Aries | 14 Jul 2027, 5 Sep 2027, 22 Mar 2028 | Three passes; closest turn 10 Aug 2027 at 0.6°. Birth time unknown. |
| Maya Hawke | 8 Jul 1998 | New York City | 2.4° Taurus | 2 May 2028 | Taurus cohort; window opens 13 Apr 2028. Birth time unknown. |
| Shawn Mendes | 8 Aug 1998 | Pickering, Ontario | 3.6° Taurus | 11 May 2028 | Taurus cohort. Birth time unknown. |
| Lil Nas X | 9 Apr 1999 | Lithia Springs, Georgia | 4.5° Taurus | 18 May 2028, 27 Dec 2028, 14 Jan 2029 | Taurus; station 6 Jan 2029 at 0.1°. Birth time unknown. |
| Sabrina Carpenter | 11 May 1999 | Quakertown, Pennsylvania | 8.6° Taurus | 26 Jun 2028, 21 Oct 2028, 16 Mar 2029 | Taurus, three passes. Birth time unknown. |
| Gracie Abrams | 7 Sep 1999 | Los Angeles, California | 17.1° Taurus | 25 May 2029 | Taurus, one pass. Birth time unknown. |
| Daniel Craig | 2 Mar 1968 | Chester, England | 11.2° Aries | 20 May 2026, 5 Oct 2026, 11 Feb 2027 | Second return, three passes, live. Birth time unknown. |
| Céline Dion | 30 Mar 1968 | Charlemagne, Quebec | 14.7° Aries | 18 Jul 2026, 4 Aug 2026, 14 Mar 2027 | Second return; sits on the 27 Jul 2026 station degree (0.1°). Birth time unknown. |
| Lucy Liu | 2 Dec 1968 | New York City | 19.0° Aries | 18 Apr 2027 | Second return, one pass. Birth time unknown. |
| Jennifer Aniston | 11 Feb 1969 | Los Angeles, California | 21.1° Aries | 5 May 2027, 15 Dec 2027, 1 Jan 2028 | Second return; station 25 Dec 2027 at 0.1°. Birth time unknown. |
| Hugh Jackman | 12 Oct 1968 | Sydney, Australia | 22.3° Aries | 16 May 2027, 14 Nov 2027, 31 Jan 2028 | Second return, three passes. Birth time unknown. |
| Will Smith | 25 Sep 1968 | Philadelphia, Pennsylvania | 23.6° Aries | 27 May 2027, 28 Oct 2027, 16 Feb 2028 | Second return, three passes. Birth time unknown. |
| Paul Rudd | 6 Apr 1969 | Passaic, New Jersey | 27.1° Aries | 9 Jul 2027, 10 Sep 2027, 20 Mar 2028 | Second return; closest turn 10 Aug 2027 at 0.8°. Birth time unknown. |

Pairs that make one post: Jennifer Aniston + Kylie Jenner (same degrees, 28 years apart, passes a week apart); Daniel Craig + Simone Biles (both in the three-pass loop with December dates); Céline Dion + Lana Condor (both sat on the 27 Jul 2026 station).

---

## (i) Four-week posting calendar

Matches `gtm-plan.md` §2 Calendar: one TikTok/Reels post a day (same asset), 3–5 X/Threads a week, one Instagram carousel a week, Reddit twice in total. Dated from Mon 19 Oct 2026 for concreteness; shift the whole grid if pre-launch slips. "Script n" refers to section (c), "Post n" to (d), "Carousel n" to (e), "Reddit n" to (f).

### Week 1 (19–25 Oct) — soft launch: styles 1 and 2 only, Aries cohorts
| Day | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|
| Mon 19 | Script 1 (born spring 1997, three dates) | Post 1 | Carousel 2 (window by birth year) | Mick's own network: preview link |
| Tue 20 | Script 2 (late 1997, approach) | — | — | — |
| Wed 21 | Cohort card: born Apr 96 – Jun 98 (style 2) | Post 4 (backwards pass) | — | Reddit 1 (r/astrology) |
| Thu 22 | Script 6 (not a day, a season) | — | — | — |
| Fri 23 | Script 5 (Nov 1998, last-degree pass) | Post 2 (myth-busting) | — | Lisa's second pass is 24 Oct: schedule Style 5 draft for Sat |
| Sat 24 | Style 5 quick cut: Lisa (BLACKPINK), pass today (24 Oct 2026) | — | — | — |
| Sun 25 | Cohort card: born Oct 98 – Feb 99 (style 2) | Post 6 (window closes 12 Apr 2028) | — | Review PostHog funnel: preview → result → unlock |

### Week 2 (26 Oct – 1 Nov) — launch: style 3 live pieces, style 6 fillers, PH/HN
| Day | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|
| Mon 26 | Script 7 (the retrograde pass) | Post 10 (the accuracy line) | Carousel 1 (what it actually is) | — |
| Tue 27 | Script 6 re-cut, vertical captions | Post 9 (no predictions) | — | Product Hunt + "Show HN: Saturn return calculator checked against Swiss Ephemeris" |
| Wed 28 | Style 6: bonus sign-line card | — | — | Reddit 2 (r/AskAstrologers) |
| Thu 29 | Script 3 (born 1999, Taurus opens 2028) | Post 7 (Taurus, 13 Apr 2028) | — | Newsletter pitch 1 to first three astrology letters |
| Fri 30 | Style 3: "what the closest turn is" (from Script 10 text, to camera) | — | — | — |
| Sat 31 | Style 6: quote card from a reading's "one line to carry" (with permission) | Post 8 (three phases) | — | — |
| Sun 1 | Cohort card: born Mar 1967 – Apr 1969 (style 2) | — | — | Weekly funnel review |

### Week 3 (2–8 Nov) — creators with gift codes, style 5 celebrity reactions, Taurus anticipation
| Day | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|
| Mon 2 | Script 8 (Simone Biles, three passes) | Post 3 (11 Dec station, closest turn) | Carousel 3 (the three passes) | Send gift-code DMs to the first ten creators in `creators.md` |
| Tue 3 | Script 4 (born 1968, second return) | — | — | — |
| Wed 4 | Script 9 (Aniston + Jenner) | Post 5 (second return) | — | Reddit 3 (r/SaturnReturn or fallback) only if 1 and 2 went well; otherwise hold |
| Thu 5 | Style 4: first creator repost (duet/stitch with permission) | — | — | DMs to the next ten creators |
| Fri 6 | Style 5: Sabrina Carpenter, Taurus 2028 (26 Jun 2028 first pass) | — | — | — |
| Sat 7 | Style 6: Taurus sign-line card, "opens 13 Apr 2028" | Repost best creator clip | — | — |
| Sun 8 | Script 3 re-cut with "Notify me" screen | — | — | Funnel review by source (`/admin/stats`) |

### Week 4 (9–15 Nov) — December station as the news peg, second-return pieces, newsletter pitches
| Day | TikTok + Reels | X / Threads | Instagram | Other |
|---|---|---|---|---|
| Mon 9 | Script 10 (closest turn card, "Saturn stops 11 Dec") | Post 3 variant: "four weeks until Saturn stops" | Carousel 4 (first vs second return) | Newsletter pitch 2 to three self-development letters |
| Tue 10 | Style 5: Daniel Craig + Simone Biles (both have December passes) | — | — | — |
| Wed 11 | Script 4 re-cut for 1969-born (one pass 16 Apr 2027) | Post 5 variant: "born 1969?" | — | — |
| Thu 12 | Style 3: "what integration looks like" (born 1996, separating) | — | — | Follow up creators who haven't replied, once |
| Fri 13 | Style 6: second-return quote card | Post 2 re-run with fresh wording | — | — |
| Sat 14 | Style 4: second creator repost | — | — | — |
| Sun 15 | Cohort card: born Mar – May 1997, "third pass Dec–Mar" | — | Carousel 5 (what to do in each phase) | End-of-month review: conversion by source and sign, Season take-rate, narration play-rate, ask usage. Set the Night 3+ backlog. |

Standing rule for every post: one real date, the CTA "free preview at rite.report", nothing that predicts an event, nothing that says "29" as a birthday.
