# Rite Launch Kit

Oct 16, 2026 · @Mick

Everything Polsia would otherwise spend credits producing — ephemeris-checked cohort data, 24 content posts, the report prompt, landing copy, emails and the Reddit post — ready to paste into its task briefs. Saturn is at 10° Aries today and stays in Aries until 14 Apr 2028; the live first-return cohort is anyone born Apr 1996–Jun 1998 or Oct 1998–Feb 1999.

## Division of labour

Polsia is worth credits for exactly three things: shipping code, running the nightly loop, and handling inbound support. Everything else in this kit is cheaper and better done here. Each Polsia credit should produce working software, not a document.

| Job | Who | Why |
| --- | --- | --- |
| Preview form, chart calc, checkout, report page, PDF, email delivery | Polsia | Code it can ship and iterate nightly |
| Nightly bug fixes, support inbox replies, refund automation | Polsia | The ops loop is what the 20% buys |
| Ephemeris data, cohort calendar, celebrity dates | This kit | Computed from JPL DE421; Polsia's research tasks would guess |
| Report prompt, landing copy, FAQ, emails | This kit | Voice and accuracy matter more than speed |
| 24 sign/house posts, Reddit post, share card brief | This kit | Content is the growth lever; credits are the wrong currency for it |
| SEO page template (144 sign×house pages) | This kit writes the template; Polsia generates | One task, one credit, 144 pages |
| Posting to socials, Meta ads | Neither yet | Nothing goes out until checkout works |

How to feed it in: each Polsia task brief in the last section says which part of this kit to paste. Paste the text, not a link — Polsia cannot read this doc.

## Accuracy spec

The product dies if the Saturn sign is wrong. These rules go verbatim into the preview and report tasks.

**Calculation**

- The build uses astronomy-engine (pure JS, no WASM file to lose in a bundle), verified in the test suite against Swiss Ephemeris to 0.02° for Saturn and 0.05° for every Placidus cusp. Reference alternatives: Swiss Ephemeris (`swisseph` npm / `pyswisseph`) or JPL DE421 via `skyfield`. Never let the LLM compute or guess a planetary position.
- Tropical zodiac, geocentric, apparent longitude. Natal Saturn = longitude at birth instant (UTC-converted from local time + birthplace timezone). No birth time → use 12:00 local; Saturn moves \~0.1°/day so sign is safe, house is not.
- Houses: Placidus default, Whole Sign as the fallback label when latitude > 66°. Only show a house when birth time is given.
- Store natal longitude to 0.01° — it drives the exact-hit dates.

**Return window**

- Transiting Saturn conjunct natal Saturn. Window opens at 5° applying, closes at 5° separating. Label the ±1° span as "peak".
- Exact hits: every date the transit crosses the natal degree. Retrograde loops produce either 1 or 3 hits; both are normal — say which the user gets and why. Scan daily from age 27.0 to 30.5 (first), 56.5 to 60 (second), 86 to 89.5 (third).
- First return runs 27–30 (never "29" alone); the sign Saturn occupies at birth is the one it returns to.

**Current sky (JPL DE421, computed 16 Oct 2026)**

- Saturn: 10.4° Aries. In Aries 15 Feb 2026 → 14 Apr 2028. Then Taurus to 2 Jun 2030, Gemini to 15 Jul 2032.
- Stations: retrograde 28 Jul 2026 (14.7° Aries) → direct 12 Dec 2026 (7.9°); retrograde 11 Aug 2027 (27.9°) → direct 25 Dec 2027 (21.0°); retrograde 24 Aug 2028 (11.3° Taurus).
- Anyone with natal Saturn 8–15° Aries gets three hits across late 2026 – early 2027. Natal 0–1° had three hits Jun 2025 – Feb 2026; 1–8° had a single hit Feb–Apr 2026 and is now separating. Natal 15–21° gets one hit Mar–May 2027; 21–28° gets three across Jul 2027 – Mar 2028.

**Copy rules the report must obey**

- Dates to the day for hits, to the month for the window.
- No event prediction. Saturn describes the work, not the outcome.
- Never say "29" as if the return is a birthday. It is a 2–3 year season.

## Who is in a Saturn return right now

Three cohorts are live or imminent. Aries is the launch market: \~2.3 years of birthdates, aged 27–30, in the window now.

| Natal Saturn | Born between | Return | Window | Status Oct 2026 |
| --- | --- | --- | --- | --- |
| Pisces | 22 May–1 Jul 1993; 29 Jan 1994–8 Apr 1996 | First | Mar 2023 – Feb 2026 | Just finished — "what did it mean" audience |
| **Aries** | **8 Apr 1996–10 Jun 1998; 26 Oct 1998–2 Mar 1999** | **First** | **Feb 2026 – Apr 2028** | **Live — launch cohort** |
| Taurus | 10 Jun–26 Oct 1998; 2 Mar 1999–11 Aug 2000; 17 Oct 2000–21 Apr 2001 | First | Apr 2028 – Jun 2030 | Next — "it's coming" audience from mid-2027 |
| Pisces | 25 Mar–17 Sep 1964; 17 Dec 1964–4 Mar 1967 | Second | Mar 2023 – Feb 2026 | Just finished |
| Aries | 4 Mar 1967–30 Apr 1969 | Second | Feb 2026 – Apr 2028 | Live — age 57–59, higher spend, zero competition |
| Taurus | 30 Apr 1969–19 Jun 1971 (not 11 Jan–22 Feb 1972 = Gemini blip) | Second | Apr 2028 – Jun 2030 | Next |

Two things this table buys you:

- **A date-of-birth hook.** "Born between April 1996 and June 1998? You're in it." converts better than any astrology framing because it needs no belief.
- **A second product with no extra build.** The second-return cohort (born 1967–69) is the same code with different copy. Nobody markets to them. Worth a landing page variant once the first is converting.

Dates are sign-ingress boundaries from JPL DE421; someone born within a day of a boundary should be told their sign from their actual birth time.

## Celebrity cohort with exact-hit dates

Public birthdates, natal Saturn computed at 12:00 UTC (sign-safe; no houses without a birth time). Exact-hit dates are the UTC date transiting Saturn crosses their natal degree, bisected to the hour with Swiss Ephemeris and cross-checked against JPL DE421. Each row is a post: "Zendaya's Saturn return was exact on 3 April 2026 — here's what that means." Post within a week of the date, or on the day for the ones still ahead.

**Already exact (retrospective posts — "what changed for them this year")**

| Person | Born | Natal Saturn | Exact hits |
| --- | --- | --- | --- |
| Joe Burrow | 10 Dec 1996 | 1° Aries | 3 Jun 2025, 22 Aug 2025, 19 Feb 2026 |
| Hailee Steinfeld | 11 Dec 1996 | 1° Aries | 3 Jun 2025, 22 Aug 2025, 19 Feb 2026 |
| Barbie Ferreira | 14 Dec 1996 | 1° Aries | 4 Jun 2025, 21 Aug 2025, 20 Feb 2026 |
| Anya Taylor-Joy | 16 Apr 1996 | 1° Aries | 11 Jun 2025, 14 Aug 2025, 23 Feb 2026 |
| Lorde | 7 Nov 1996 | 1° Aries | 13 Jun 2025, 12 Aug 2025, 24 Feb 2026 |
| Noah Kahan | 1 Jan 1997 | 1° Aries | 16 Jun 2025, 8 Aug 2025, 25 Feb 2026 |
| Bella Hadid | 9 Oct 1996 | 3° Aries | 11 Mar 2026 |
| Rosé (BLACKPINK) | 11 Feb 1997 | 5° Aries | 24 Mar 2026 |
| Lili Reinhart | 13 Sep 1996 | 5° Aries | 27 Mar 2026 |
| Normani | 31 May 1996 | 6° Aries | 31 Mar 2026 |
| Tom Holland | 1 Jun 1996 | 6° Aries | 1 Apr 2026 |
| Zendaya | 1 Sep 1996 | 6° Aries | 3 Apr 2026 |
| Camila Cabello | 3 Mar 1997 | 7° Aries | 11 Apr 2026 |

**In the three-hit loop now (live posts — "it's not over")**

| Person | Born | Natal Saturn | Exact hits |
| --- | --- | --- | --- |
| Simone Biles | 14 Mar 1997 | 8° Aries | 22 Apr 2026, 23 Nov 2026, 28 Dec 2026 |
| Lisa (BLACKPINK) | 27 Mar 1997 | 10° Aries | 7 May 2026, 24 Oct 2026, 26 Jan 2027 |
| Maisie Williams | 15 Apr 1997 | 12° Aries | 31 May 2026, 23 Sep 2026, 20 Feb 2027 |

**Still ahead (countdown posts)**

| Person | Born | Natal Saturn | Exact hits |
| --- | --- | --- | --- |
| Lana Condor | 11 May 1997 | 15° Aries | 19 Mar 2027 |
| Naomi Osaka | 16 Oct 1997 | 16° Aries | 28 Mar 2027 |
| Chappell Roan | 19 Feb 1998 | 17° Aries | 3 Apr 2027 |
| Jayson Tatum | 3 Mar 1998 | 18° Aries | 13 Apr 2027 |
| Sydney Sweeney | 12 Sep 1997 | 19° Aries | 17 Apr 2027 |
| Jacob Elordi | 26 Jun 1997 | 19° Aries | 20 Apr 2027 |
| Jungkook (BTS) | 1 Sep 1997 | 20° Aries | 22 Apr 2027 |
| Jack Harlow | 13 Mar 1998 | 20° Aries | 22 Apr 2027 |
| Kylie Jenner | 10 Aug 1997 | 20° Aries | 28 Apr 2027 |
| Hunter Schafer | 31 Dec 1998 | 27° Aries | 4 Jul 2027, 15 Sep 2027, 17 Mar 2028 |
| Kylian Mbappé | 20 Dec 1998 | 27° Aries | 5 Jul 2027, 14 Sep 2027, 18 Mar 2028 |
| Conan Gray | 5 Dec 1998 | 27° Aries | 14 Jul 2027, 4 Sep 2027, 22 Mar 2028 |
| Luka Dončić | 28 Feb 1999 | 30° Aries | 12 Apr 2028 |

**Taurus cohort (2028–29 — bank for later)**: Malia Obama 29 Apr 2028 · Maya Hawke 1 May 2028 · Shawn Mendes 11 May 2028 · Lil Nas X 18 May 2028 + 28 Dec 2028 + 13 Jan 2029 · Sabrina Carpenter 25 Jun 2028 + 21 Oct 2028 + 16 Mar 2029 · Gracie Abrams 25 May 2029.

**Second return, born 1967–69 (Aries)**: Daniel Craig, Céline Dion, Will Smith, Hugh Jackman, Lucy Liu, Jennifer Aniston, Paul Rudd — all in their second Saturn return 2026–28. One post: "Jennifer Aniston and Zendaya are in the same Saturn return."

Rule: birthdates are public record, so the posts are fine. Do not claim to know anyone's birth time, house, or what they're going through — the date is the content, the interpretation is general.

## Report generation prompt

The code computes every number and passes them in. The LLM only writes. Paste this as the system prompt in the "Generate and save the personalized paid Saturn Return guide" task.

```markdown
You write Rite's Saturn Return report. You are a direct, warm, grown-up voice: a smart older friend who has been through it, not a mystic and not a therapist. Plain English. No "cosmic", "the universe", "energies", "manifest", "journey". No emoji. Second person throughout.

YOU RECEIVE (computed by code — never recalculate, never contradict):
- first_name
- natal_saturn_sign, natal_saturn_degree
- natal_saturn_house (integer 1–12, or null if no birth time)
- return_number (1, 2 or 3)
- window_start, window_end (month + year)
- peak_start, peak_end (month + year)
- exact_hits (list of 1 or 3 dates)
- today
- phase: "approaching" | "in_window" | "peak" | "separating" | "complete"

WRITE EXACTLY THESE SECTIONS, with these headings, ~900 words total:

# Your Saturn return
One paragraph. Name their sign and (if present) house. State the window and where today falls in it. Say whether they get one hit or three and what that pattern means practically (three hits = a theme that surfaces, retreats, then settles; one hit = a cleaner single pass).

## When
A short dated list: window opens, peak begins, each exact hit, peak ends, window closes. Then two sentences on what the shape of the timing suggests about pacing.

## What it's asking of you
The sign. 2–3 paragraphs. Saturn's sign describes the kind of work: the quality that must become structural rather than aspirational. Be specific about the failure mode of that sign under pressure and what maturity in it looks like. Draw on the SIGN NOTES below; do not recite keywords.

## Where it lands
If house is present: 2 paragraphs on the life area, using the HOUSE NOTES. If house is null: one paragraph explaining that without a birth time the house can't be fixed, and that the sign is the more important half anyway. Do not guess a house.

## Build
Three concrete, non-generic things to build or commit to during the window, each one sentence, each tied to the sign and house. "Build" means structures: habits, agreements, skills, boundaries, finances. Not feelings.

## Let go
Three things to stop carrying, same rules. At least one should be a story they tell about themselves, not a behaviour.

## One line to carry
A single sentence, under 15 words, that they could write on a card. Not a quote from anyone. Not a platitude.

RULES
- Never predict events (no "you will meet", "you may lose", "expect a"). Saturn describes the work, not what happens.
- Never mention health, death, divorce, pregnancy, legal trouble, or money loss as predictions.
- Never say "29" as if the return is a birthday.
- Every date comes from the inputs. If a date is not in the inputs, it does not exist.
- If phase is "complete", write the whole report retrospectively: what the season was for, what to keep from it.
- If return_number is 2 or 3, drop the "first adult reckoning" framing entirely; write for someone 58 or 87 — legacy, what structures outlast you, what you're done proving.

SIGN NOTES (the work, the failure mode, the mature form)
- Aries: initiative. Fails as impulsiveness or waiting for permission. Matures into starting things you also finish.
- Taurus: stability. Fails as stubbornness or hoarding. Matures into resources you can rely on without being owned by them.
- Gemini: communication. Fails as scatter or cleverness without commitment. Matures into saying one true thing and standing by it.
- Cancer: belonging. Fails as over-caretaking or hiding in the shell. Matures into a home you built on purpose.
- Leo: self-expression. Fails as performance or fear of being seen. Matures into creative work that doesn't need applause.
- Virgo: craft. Fails as perfectionism or self-criticism. Matures into useful competence, done, shipped.
- Libra: partnership. Fails as people-pleasing or avoidance of conflict. Matures into agreements that are actually fair.
- Scorpio: depth. Fails as control or secrecy. Matures into trust that survives being tested.
- Sagittarius: meaning. Fails as restlessness or preaching. Matures into a belief you've actually lived.
- Capricorn: authority. Fails as workaholism or fear of failure. Matures into responsibility you chose.
- Aquarius: independence. Fails as detachment or contrarianism. Matures into belonging to something bigger without losing yourself.
- Pisces: surrender. Fails as escape or boundarylessness. Matures into compassion with a spine.

HOUSE NOTES (where it lands)
1 identity, body, how you show up · 2 money, possessions, self-worth · 3 communication, siblings, daily environment · 4 home, family, roots · 5 creativity, romance, children, play · 6 work, health, routine, service · 7 partnership, marriage, contracts · 8 shared resources, intimacy, debt, inheritance · 9 belief, education, travel, publishing · 10 career, reputation, public role · 11 friends, community, long-term goals · 12 solitude, the unconscious, endings, what you hide
```

**Preview prompt** (the free one): same voice, one paragraph only. Inputs: sign, house-or-null, window. Output: sign named, what it's asking in two sentences, window in one, and one sentence that makes the paid report feel necessary without being a pitch: "The full report dates your exact hits and tells you what to build before each one."

## Landing page copy + FAQ

The current page describes the product; this one runs it. The form is the headline. Everything below the fold exists to answer "is this real" before they type.

**Above the fold**

- Eyebrow: `SATURN RETURN · AGES 27–30 · 56–60`
- H1: **Find out exactly when your Saturn return hits.**
- Sub: Born April 1996 to June 1998? You're in it right now. Enter your birth details and get your Saturn sign, your window, and what it's asking of you — free, in ten seconds.
- Form: Birth date · Birth place · Birth time (optional — "adds your house; skip it if you don't know")
- Button: **Show my Saturn return**
- Under button: No account. No email needed for the preview.

**After the preview (the sell)**

- H2: **The full report dates every exact hit.**
- Three columns: *When* — your window to the month, your exact hits to the day. *What* — what your Saturn sign is asking you to make permanent. *Where* — the life area it lands in, when you give a birth time.
- Price card: $29 with birth time · $19 without · "Delivered in under a minute. Web page + PDF."
- Button: **Get my report — $29**

**Proof strip** (replace with real ones after 20 sales)

- "Calculated with the same ephemeris professional astrologers use (JPL / Swiss Ephemeris)"
- "No predictions. No mysticism. Dates and work."

**FAQ**

- *What is a Saturn return?* Saturn takes 29.5 years to orbit the Sun. When it returns to where it was when you were born — around 27–30, again around 57–60 — that's your return. It's the astrological marker for growing up, and most people feel it whether or not they believe in astrology.
- *How accurate are the dates?* To the day. We compute Saturn's position from the JPL ephemeris, not from a lookup table or an AI guess.
- *I don't know my birth time.* You still get your Saturn sign, window and exact dates — that's most of the report. Birth time only adds the house (the life area). The $19 version is for you.
- *Is this a prediction?* No. Saturn describes a kind of work, not an event. The report tells you what the season is for and when it peaks. What you do with that is yours.
- *I'm 31. Did I miss it?* Possibly not — depending on your Saturn degree, your window may run to 30.5. Enter your details; the preview tells you.
- *I'm 58.* Same product, different season. The report is written for second returns too.
- *Refunds?* If the report is wrong about your Saturn sign, full refund, no questions. If you just didn't like it, email us and we'll usually refund anyway.

**Footer line**: Rite — reports for the transits that have names.

## Saturn in each sign — 12 posts

Format per post: a hook (first line of a TikTok/Reel, or the carousel cover), the work in one line, and a 3-beat script (\~25 seconds spoken, or slides 2–4 of a carousel). Every post ends the same way: "Enter your birth date at rite.report to see your window." Lead with Aries — it's the live cohort. Each one is also an SEO page: `/saturn-return/saturn-in-aries`.

| Sign | Hook | The work | 3 beats |
| --- | --- | --- | --- |
| **Aries** (born Apr 96–Jun 98, in it NOW) | "If you were born in 1997, your Saturn return is happening right now and nobody told you." | Starting things you also finish. | 1. You've started a hundred things. Saturn in Aries asks which one you'll still be doing in three years. 2. The trap: waiting for permission, or quitting at the first boring stretch. 3. The move: pick one, make it unglamorous, make it daily. |
| Taurus (born mid-98–01, starts 2028) | "Saturn in Taurus people: your return starts in 2028. Here's what it's for." | Resources you can rely on without being owned by them. | 1. Money, body, stuff — Saturn audits what you actually depend on. 2. The trap: hoarding, or refusing to change because change costs. 3. The move: one financial structure that runs without you thinking about it. |
| Gemini | "Saturn in Gemini is the return nobody takes seriously. That's the problem." | Saying one true thing and standing by it. | 1. You can argue any side. Saturn asks which side is yours. 2. The trap: cleverness as a way to never commit. 3. The move: write the thing down, publish it, let it be judged. |
| Cancer | "Saturn in Cancer: your return is about the home you build, not the one you came from." | A home you built on purpose. | 1. Belonging stops being something you're given. 2. The trap: caretaking everyone so no one looks at you. 3. The move: decide who's family now. Act like it. |
| Leo | "Saturn in Leo people make the best work of their lives at 29 — if they stop performing." | Creative work that doesn't need applause. | 1. Being seen was the goal. Now it's the obstacle. 2. The trap: the version of you that's always on. 3. The move: make something you'd make if no one ever saw it. Then show it. |
| Virgo | "Saturn in Virgo: the return that turns a perfectionist into a professional." | Useful competence, done, shipped. | 1. Good enough, finished, beats perfect, abandoned. 2. The trap: self-criticism disguised as standards. 3. The move: ship the imperfect thing on a schedule. |
| Libra | "Saturn in Libra: your return is a relationship audit. All of them." | Agreements that are actually fair. | 1. Every relationship gets weighed. The unfair ones get heavy. 2. The trap: keeping the peace by paying for it yourself. 3. The move: renegotiate one deal you've been quietly resenting. |
| Scorpio | "Saturn in Scorpio returns are brutal and the people who have them come out unshakeable." | Trust that survives being tested. | 1. Control is the thing you're asked to put down. 2. The trap: secrecy, or testing people until they fail. 3. The move: tell one person the whole truth and let them stay. |
| Sagittarius | "Saturn in Sagittarius: you've been running. Your return is where you have to arrive." | A belief you've actually lived. | 1. Meaning you only talked about gets called in. 2. The trap: the next trip, the next big idea, the next escape. 3. The move: stay somewhere long enough to be wrong there. |
| Capricorn | "Saturn in Capricorn is Saturn at home. The return hits harder and builds more." | Responsibility you chose. | 1. You've been responsible for everything. Saturn asks: by choice, or by default? 2. The trap: work as the only place you feel safe. 3. The move: drop one obligation you inherited. Keep the ones you'd pick. |
| Aquarius | "Saturn in Aquarius: the return that asks if you're independent or just alone." | Belonging to something bigger without losing yourself. | 1. Different was the identity. Now it's a question. 2. The trap: contrarianism, detachment, the exit. 3. The move: join something. Stay through the part where it annoys you. |
| Pisces (born 94–96, just finished) | "Saturn in Pisces people: your return ended in February. What did it cost you?" | Compassion with a spine. | 1. Boundaries were the lesson. Most of you learned it the hard way. 2. The trap: escape — substances, fantasy, other people's problems. 3. The move: name what you'll no longer absorb. Say it out loud. |

**Posting cadence**: one sign per week on TikTok/Reels, cut into two pieces — the hook+beats as video, the table row as a carousel. Aries gets three posts, not one. Pisces gets the retrospective angle. The other nine are evergreen; post them in the order above and re-run yearly.

**Voice rules**: no "energy", "cosmic", "the universe". Say "Saturn asks" not "Saturn makes you". Every post is specific enough to be wrong — that's what makes it shareable.

## Saturn in each house — 12 posts

House posts convert the people who *have* a birth time — the $29 buyers. Same format. The hook for every house post is a variant of "Saturn return in the Nth house means it's happening HERE", which is also the SEO page: `/saturn-return/saturn-in-the-7th-house`. Sign × house pages (144) are the sign row + the house row stitched by the template in the Polsia briefs.

| House | Hook | Where it lands | 3 beats |
| --- | --- | --- | --- |
| 1st | "Saturn return in the 1st house: the person you've been performing is about to get retired." | Identity, body, how you show up. | 1. This one's about you, undisguised. 2. The trap: reinventing the surface instead of the structure. 3. The move: one visible commitment that's unmistakably yours. |
| 2nd | "2nd house Saturn return: you're about to find out what you're actually worth. Money's just the proxy." | Money, possessions, self-worth. | 1. Income, debt, and what you own get audited. 2. The trap: spending to feel adequate, or hoarding to feel safe. 3. The move: know your number. All of it. |
| 3rd | "3rd house Saturn return: the way you talk is about to cost you or save you." | Communication, siblings, daily environment. | 1. Words get weight. Casual stops being free. 2. The trap: saying everything, meaning nothing. 3. The move: one hard conversation you've been drafting for years. |
| 4th | "4th house Saturn return is the one where you finally deal with your family." | Home, family, roots. | 1. Where you live and who you came from, both on the table. 2. The trap: recreating the house you grew up in. 3. The move: decide what home means now. Build that. |
| 5th | "5th house Saturn return: your creativity stops being a hobby. Or it stops." | Creativity, romance, children, play. | 1. What you make for joy gets asked to grow up. 2. The trap: treating the thing you love as not serious enough to commit to. 3. The move: give it a schedule and a deadline. |
| 6th | "6th house Saturn return: your body and your job are sending the same message." | Work, health, routine, service. | 1. Daily life becomes the test. Not the big moments — Tuesdays. 2. The trap: grinding harder instead of fixing the system. 3. The move: one routine you'll keep at 60. Start it now. |
| 7th | "7th house Saturn return: this is the one that ends relationships. Or makes them permanent." | Partnership, marriage, contracts. | 1. Every "we" gets stress-tested. 2. The trap: staying because leaving is work, or leaving because staying is. 3. The move: say the terms out loud. See who signs. |
| 8th | "8th house Saturn return: everything you share — money, beds, secrets — gets renegotiated." | Shared resources, intimacy, debt, inheritance. | 1. Entanglement comes due. 2. The trap: control dressed as caution. 3. The move: one shared account, one shared truth, properly documented. |
| 9th | "9th house Saturn return: what you believe is about to get a reality check." | Belief, education, travel, publishing. | 1. Your worldview gets tested by actual conditions. 2. The trap: changing the subject to the next philosophy. 3. The move: finish the degree, publish the thing, or stop saying you will. |
| 10th | "10th house Saturn return: the career one. Yes, it's as big as it sounds." | Career, reputation, public role. | 1. Who you are in public becomes a structure, not a story. 2. The trap: chasing the title instead of the work. 3. The move: take the responsibility nobody's asking you to take yet. |
| 11th | "11th house Saturn return: your friend group is about to get a lot smaller and a lot better." | Friends, community, long-term goals. | 1. The crowd thins to the ones who'd show up. 2. The trap: networking as a substitute for belonging. 3. The move: pick the five-year goal. Tell those people. |
| 12th | "12th house Saturn return: the quiet one. It's happening where nobody can see." | Solitude, the unconscious, endings, what you hide. | 1. The work is internal and no one will congratulate you. 2. The trap: hiding, or calling isolation "healing". 3. The move: one thing you've never said to anyone, said to one person. |

**Which to post first**: 10th, 7th, 4th, 1st — the four that people already search. The 12th and 8th are the ones that get shared because they feel seen.

## Reddit launch post

r/astrology bans self-promotion outright and r/AskAstrologers bans links. The post that survives is a value post with the tool mentioned once, in the comments, when asked. Post this from your own account, not Polsia's. Target: r/SaturnReturn (small, on-topic, link-tolerant) first; then r/astrologymemes or r/Zillennials with the date-of-birth hook and no link in the body.

**Title**: If you were born between April 1996 and June 1998, your Saturn return is happening right now — here are the actual dates

**Body**:

> Saturn moved into Aries on 15 Feb 2026 and stays until 14 Apr 2028. If you were born with Saturn in Aries — that's 8 Apr 1996 to 10 Jun 1998, plus a short stretch 26 Oct 1998 to 2 Mar 1999 — this is your first return.
>
> Some things I wish someone had told me, computed from the actual ephemeris rather than vibes:
>
> - It is not a day. It's a 2–3 year window. Yours is roughly Feb 2026 – Apr 2028 depending on your degree.
> - Saturn goes retrograde 28 Jul 2026 and direct again 12 Dec 2026. If your natal Saturn is between 8° and 15° Aries (born roughly Mar–May 1997, or Oct 1997–Jan 1998), you get three exact hits across late 2026 – early 2027 instead of one. That's the "why does this keep coming back" feeling.
> - Early-degree people (born Apr–Dec 1996) had their single exact hit between Feb and April this year. You're separating now. The work is in the rearview, the consolidation isn't.
> - Late-degree people (born mid-1997 to early 1998): your exact hit is March–May 2027. You're in the approach. This is the year to set the thing up, not the year it tests you.
>
> Saturn in Aries specifically is about initiative — starting things you also finish. The failure mode is quitting at the first boring stretch, or waiting for someone to tell you it's allowed. The mature version is picking one thing and making it unglamorous and daily.
>
> Happy to look up anyone's exact window if you drop your birth date (no time needed for the sign; time needed for the house).

**In the comments, when asked how you computed it**: "I built a small tool for it — rite.report. Free preview gives you the sign and window; I'm not going to shill the paid part here."

**Measurement**: use `rite.report/?r=reddit` in the comment only. Success = 10 preview starts per 50 visits, per the Polsia task.

## Share card brief

The share card is the referral engine. It must be something a 28-year-old posts to a Story without embarrassment — which means it looks like a ticket or a receipt, not a horoscope.

- **Size**: 1080×1920 (Stories) primary; 1080×1080 secondary.
- **Content, top to bottom**: small "RITE" wordmark · large "SATURN RETURN" · the person's sign and house as the hero ("Aries · 10th house", or just "Aries") · their window ("Feb 2026 – Apr 2028") · their next exact hit date if one is ahead, else "Exact: 4 Apr 2026" · their one-line-to-carry from the report · bottom: `rite.report`.
- **Nothing else.** No name, no birth date, no birthplace. Privacy is the feature.
- **Palette**: near-black ground (#111418 per the existing theme), bone-white type, one accent used once (the exact-hit date). Single ringed-planet mark, line-weight, no gradients, no stars, no zodiac glyphs.
- **Type**: a serif for the sign (editorial, like a theatre ticket), a mono for the dates. The existing site uses a serif/mono pairing — keep it.
- **Variants**: one per phase — "Approaching", "In it", "Peak", "Separating", "Done" — shown as a small stamp in the corner. People share the stamp.
- **Generation**: server-side PNG from a template; the button says "Save my card". Also render the free preview's card (sign + window only) so sharing starts before purchase.
- **Share hook on the card for free users**: "Find your window → rite.report". On paid: the one-line-to-carry does the work.

## Email templates

From: Rite <hello@rite.report>. Plain text, no images except the share card. Short.

**1. Report delivery** (fires on Stripe `checkout.session.completed`)

> Subject: Your Saturn return — {sign}, {window\_start} to {window\_end}
>
> {first\_name},
>
> Your report's ready: {report\_url}
>
> The short version: Saturn in {sign}{, house\_phrase}. Your window runs {window\_start} to {window\_end}. {hit\_sentence — e.g. "Your exact hit was 4 April 2026; you're separating now." / "You get three exact hits: 23 Apr 2026, 24 Nov 2026, 29 Dec 2026."}
>
> The PDF is attached. Your share card is at the bottom of the report page — no personal details on it, just the sign and the dates.
>
> If the Saturn sign is wrong, reply to this and I'll refund you.
>
> — Rite
>
> P.S. Saturn Season is a weekly note through your window — where Saturn is this week relative to your chart, one line on what that's for. $7/month, stop any time: {upsell\_url}

**2. Saturn Season weekly** (Monday 7am local; generated from current Saturn longitude vs. natal)

> Subject: Saturn this week — {orb}° {applying|separating}
>
> {first\_name},
>
> Saturn is at {transit\_degree}° {transit\_sign}, {orb}° {from|past} your natal degree. {motion\_sentence — "It's retrograde until 12 December, so this is the second pass." / "It's direct and closing in; your exact hit is 19 March."}
>
> {one\_paragraph — 3 sentences max, generated: what this week's distance suggests for the sign's work. Phase-aware: approaching = set up; peak = hold; separating = consolidate.}
>
> One thing this week: {one\_line\_action}
>
> — Rite
>
> {Stop these | Manage}

**3. Season complete** (fires when orb > 5° separating and still subscribed)

> Subject: Your Saturn return is over
>
> {first\_name},
>
> As of this week Saturn is more than 5° past your natal degree. The window's closed.
>
> What you built in it is yours now. What you let go stays gone.
>
> I'm going to stop these emails — there's nothing left to track. If you'd like the full retrospective report (what the season was for, what to keep), it's $19 here: {retro\_url}. Otherwise, see you at 58.
>
> — Rite

**Rules**: the LLM writes only the bracketed prose; every date and degree comes from code. Season-complete auto-cancels the subscription — that's the honesty that makes people recommend it.

## Polsia task briefs

Each one replaces or extends a task already in the queue. Edit the existing task (open → Edit → Description) and paste; don't add duplicates. Where it says "paste section X", copy that section of this doc into the description — Polsia can't follow links.

**Edit: Build Rite's instant Saturn Return preview**

> Build the free preview. Inputs: birth date (required), birth place (required, geocoded to lat/long + timezone), birth time (optional). Compute natal Saturn with Swiss Ephemeris or an equivalent JPL-based library — NEVER with the LLM. Follow the ACCURACY SPEC below exactly. Output: Saturn sign, house (Placidus, only if birth time), return window (month–month), phase (approaching/in window/peak/separating/complete), and one LLM-written paragraph using the PREVIEW PROMPT below. Show the result on the same page under the form. Add the $29/$19 checkout buttons under the preview as placeholders that scroll to pricing until checkout ships. Replace the landing page hero with the ABOVE-THE-FOLD copy below. Verify with these test cases: born 1 Sep 1996 → Aries \~6°, single hit 3 Apr 2026, separating now; born 14 Mar 1997 → Aries \~8°, three hits 22 Apr 2026 / 23 Nov 2026 / 28 Dec 2026; born 15 Jun 1998 → Taurus, window from Apr 2028. If any test fails, do not ship.
>
> &#91;paste: Accuracy spec · Preview prompt · Landing page "Above the fold"\]

**Edit: Add Stripe checkout for the Saturn Return report**

> Stripe Checkout, two prices: $29 (birth time given) and $19 (no birth time); pick automatically from the preview state. Collect email at checkout. On `checkout.session.completed`, store the purchase with the natal data and trigger report generation. Success page = the report page. Add a refund endpoint: any email to support containing "refund" within 30 days triggers a full refund automatically and a one-line reply.

**Edit: Generate and save the personalized paid Saturn Return guide**

> Code computes every input listed in the REPORT PROMPT (window, peak, exact hits, phase). The LLM receives them and writes the report using the REPORT PROMPT below as the system prompt, verbatim. Save the markdown and the inputs. Any date in the output not present in the inputs is a bug — add a check that rejects and regenerates.
>
> &#91;paste: Report generation prompt\]

**Edit: Show each purchased guide on a reloadable report page**

> `/r/{token}` — unguessable token in the delivery email; no login. Renders the saved markdown with the WHEN section as a dated list, and a "Save my card" button (share card task). Include the Saturn Season upsell block at the bottom with the $7/mo and $59/yr prices.

**Edit: Email a PDF of the purchased Saturn Return guide**

> Use EMAIL TEMPLATE 1 below verbatim; fill the brackets from the saved inputs. Attach the PDF (same content, A4, serif body). Reply-to goes to the support inbox.
>
> &#91;paste: Email templates · template 1\]

**Edit: Add a Saturn Return share card to report delivery**

> &#91;paste: Share card brief\] — implement exactly; also render the free-preview variant.

**New (after checkout works): Saturn Season subscription**

> $7/month or $59/year Stripe subscription, offered on the report page and in the delivery email. Every Monday 07:00 in the subscriber's timezone, compute current Saturn longitude vs. natal, orb, motion (retrograde/direct), phase, and send EMAIL TEMPLATE 2. When orb exceeds 5° separating, send TEMPLATE 3 once and cancel the subscription automatically.
>
> &#91;paste: Email templates · templates 2 and 3\]

**New (after checkout works): SEO pages**

> Generate static pages: `/saturn-return/saturn-in-{sign}` (12), `/saturn-return/saturn-in-the-{nth}-house` (12), and `/saturn-return/saturn-in-{sign}-{nth}-house` (144). Each page: H1 from the hook, the "work"/"where it lands" line, the three beats as a short section, the cohort dates for that sign from the COHORT TABLE, and the preview form embedded. Sign×house pages stitch the sign section then the house section. Add a `/saturn-return/{year}` page per birth year 1960–2005 stating that year's Saturn sign(s) and return window. Sitemap, canonical tags, no AI filler beyond the kit text.
>
> &#91;paste: Cohort calendar · Sign posts table · House posts table\]

**Keep as-is**: Clarify Rite's optional birth-time choice. **Keep gated**: Reddit test (already edited).

**Do not create**: any research task, any GTM/strategy document, any competitor analysis, any audience research, any "brand guide". All of that is here or not needed.
