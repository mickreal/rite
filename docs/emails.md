# Email copy

Written 17 Oct 2026. Copy only; nothing here is wired. Voice is `VOICE` in `src/content/prompts.ts`: direct, warm, grown-up, plain English, second person, no banned words ("cosmic", "the universe", "energy", "manifest", "journey", "vibration", "align"), no emoji, no event predictions, never "29" as a birthday. Every date in an email comes from code; the brackets below are the slots.

Sample dates in this file were computed with `src/compute.ts` on 17 Oct 2026 (see `launch-kit-v2.md` for the method).

---

## 1. Review of the existing templates in `src/email.ts`

Line edits only; the code is not touched here. Overall the three templates are already in voice. The issues are small: one subject line that reads as broken, one sentence that can be wrong, and a couple of places where "I" and "Rite" are mixed.

### `deliveryEmail`
- Subject `Your Saturn return — Aries, May 2025 to Apr 2028` is good. Keep.
- "Your reading's ready:" good.
- "The short version: Saturn in Aries, in your ninth house. Your window runs May 2025 to Apr 2028. One exact hit: 29 Apr 2027." Fine. Suggest "exact pass" rather than "exact hit" everywhere in email, to match the reading page ("the pass and the turn"); `hitSentence()` in `compute.ts` still says "hit". One word, consistent.
- "Keep that link; the page updates as you move through the cycle, so it reads differently next year." Good, keep. Add the narration in the same sentence as the calendar, since it is the thing nobody expects: "At the top you can listen to it, add every date to your calendar, print it to PDF, and save a share card".
- "If the Saturn sign is wrong, reply to this and I'll refund you." Keep the "I". It is the one place first person earns its keep. But then sign off "— Mick, Rite" rather than "— Rite", or the "I" has no referent.
- P.S. is right. Add the price pair so the next email doesn't have to: "$7 a month or $59 a year, stops itself when your window closes".

### `seasonEmail`
- Subject: `Saturn this week — 7.2° from` is a fragment (the code passes `orb` and `dir` as "7.2°" and "from"). Suggest `Saturn this week: 7.2° from your degree` / `Saturn this week: 3.1° past your degree`. If the orb is under 1°, `Saturn this week: on your degree`.
- Opening line "Saturn is at 10° Aries, 7.2° from your natal degree." Good.
- `motionSentence`: the retrograde branch appends ", so this is a second pass" whenever the reading has three passes. That is wrong for a three-pass person whose loop is next year (born 26 Mar – 20 May 1998, say, during the 2026 retrograde): Saturn is retrograde but nowhere near them. Only say "second pass" when today is between pass 1 and pass 2. Otherwise: "It's retrograde until 11 Dec 2026, moving away from your degree for now."
- The direct branch "It's direct and closing in; your exact hit is 29 Apr 2027" is good; "pass" for "hit" as above.
- "Stop these:" → "Manage or stop:" once `/season/manage/:tok` exists (S2 in `gtm-plan.md`).
- Sign-off "— Rite" is right here (the note is the product, not Mick).

### `seasonCompleteEmail`
- "As of this week Saturn has left your natal sign. The window's closed." Good.
- "What you built in it is yours now. What you let go stays gone." Keep.
- "I'm going to stop these emails — there's nothing left to track." Mixed voice again ("I" then "— Rite"). Suggest: "This is the last note. There's nothing left to track, so the subscription has cancelled itself; you won't be charged again."
- Add the reading link: "Your reading stays at {reading_url} and keeps updating through the long arc (the first square is around age 36)." The age comes from `cycle().ahead`, so pass it in rather than hard-coding.
- "See you at the next one." Keep.

### Also, while here
- `stageReminderEmail` "contact" text: "Whatever you have been circling tends to ask for a decision around it." sits close to a prediction. Safer: "This is the part people mean when they say Saturn return. The work is deciding, not waiting to see."
- `giftEmail` is fine. "One use." could be "One use, no expiry." if that is true in the code (check `gifts` handling before promising it).

---

## 2. Day-3 nudge: did you add the dates?

Trigger: three days after `emailed`, reading owners only, once. Skip if `calendar` was already fired for that purchase (PostHog) or if the window is already closed.

**Subject:** Did you put the dates in your calendar?

```
{first_name},

Three days ago you opened your reading. The part people skip is the part that does the most: the dates.

At the top of chapter three there's a calendar button. One file per date (each exact pass, the closest turn, the day your window closes), or all of them at once: {reading_url}#c3

Put them in whatever calendar you actually look at. A pass you didn't see coming is just a hard week. A pass you've dated is a week you can plan around.

Then open the workbook: {reading_url}#c7. The prompts for the phase you're in now are unlocked. The rest open when their phase does, so there's nothing to do early.

— Rite

Sent once. Reply to this and a person answers.
```
(123 words)

---

## 3. Day-10 Saturn Season nudge

Trigger: ten days after `emailed`, reading owners with no active subscription, once. Skip if the window closes within 60 days. The sample note is for a reading with natal Saturn at 17° Aries (born 1 Jun 1997), on Monday 19 Oct 2026; every figure in it is what the code produces for that chart on that day.

**Subject:** What a Monday note looks like

```
{first_name},

Your reading is the map. Saturn Season is the "you are here" dot, once a week, until your window closes on {window_end}.

Here's the note you'd have got this Monday:

> Saturn is at 10° Aries, 7.2° from your natal degree. It's retrograde until 11 Dec 2026.
>
> You're in the approach: Saturn is moving away from your degree for now, and the pressure you feel is real but nothing is being decided yet. Use the distance to choose the thing you'll still be doing when it turns direct in December and comes for your degree on 5 Apr 2027. Aries work is starting what you'll also finish, so pick one.
>
> One thing this week: write down the one commitment, with a daily shape.

Every Monday, 7am your time. $7 a month or $59 a year. It stops itself the week Saturn leaves your sign, so you can't forget to cancel: {season_url}

— Rite
```
(158 words)

---

## 4. Window-open reminder

Trigger: the "notify me when my window opens" capture (`reminders`, `kind: window_open`), sent 30 days before `windowStart`. The sample is a Taurus reading (born 1 Apr 1999): window opens 13 Apr 2028, first pass 10 May 2028. Send date would be 14 Mar 2028.

**Subject:** Your Saturn return window opens on {window_start}

```
{first_name},

A while ago you asked to be told when your Saturn return starts. It starts in a month.

Saturn enters {sign} on {window_start}. That's the day your window opens; it stays open until {window_end}. Your first exact pass is {first_pass}.

Your preview is where you left it: {preview_url}. It shows the window, the pass dates and which phase you're in, and it updates as Saturn moves.

If you want the full reading before the window opens, it's $29 ($19 without a birth time): ten chapters, narrated, every date as a calendar file, a workbook that opens phase by phase.

Nothing happens on the day. The approach is the part you can prepare for, and it starts now.

— Rite

Sent once. Reply to stop anything from us.
```
(128 words)

Filled example: "Saturn enters Taurus on 13 Apr 2028. That's the day your window opens; it stays open until 31 May 2030. Your first exact pass is 10 May 2028."

---

## 5. Gift-recipient welcome

Trigger: `POST /redeem` succeeds (a `$0` purchase is created and the reading is being written). Replaces the standard delivery email for gift readings. `{from}` is the buyer's optional name; if absent, drop the first sentence and start at "Your reading is being written".

**Subject:** {from} gave you your Saturn return

```
{first_name},

{from} bought you this. No strings on their side and none on ours.

Your reading is being written now and will be at this link in about a minute: {reading_url}

The short version: Saturn in {sign}{house_phrase}. Your window runs {window_start} to {window_end}. {hit_sentence}

Keep the link. The page updates as you move through the cycle, so it reads differently next year. At the top you can listen to it, add every date to your calendar, print it, and save a share card (no personal details on it, just the sign and the dates). Five follow-up questions are included at the end; the answers come from your chart, not a script.

If the Saturn sign is wrong, reply here and we'll fix it.

— Rite

P.S. If you'd like to say thanks to {from}, the share card is the easy way.
```
(141 words)

Filled example for a reading born 1 Aug 1997: "Saturn in Aries. Your window runs May 2025 to Apr 2028. One exact pass: 29 Apr 2027."
