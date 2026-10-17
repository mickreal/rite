# Email review, 17 Oct 2026

Every template in `src/email.ts`, checked against `VOICE` (`src/content/prompts.ts`), the refund page (`src/views/legal.ts`), and how the product works now: ElevenLabs narration, and Season stopping straight away with unused full months refunded on yearly plans. The two emails written inline in `src/index.ts` (`runReminders`) are reviewed as well but were not edited, because the brief limits edits to `src/email.ts`.

Voice check: no banned words, no emoji, no "29" used as a birthday, and no predictions in any template. Every date and price comes from code, except the hard-coded prices noted below.

## Fixed in `src/email.ts`

| Template | Defect | Fix |
|---|---|---|
| `stageReminderEmail` | `label.toLowerCase()` lowercased the whole label, so the close reminder read "On 12 Apr 2028: saturn leaves aries: your window closes." | Only the first letter is lowercased, and labels starting with "Saturn" are left alone: "On 12 Apr 2028: Saturn leaves Aries: your window closes." / "On 28 Apr 2027: contact: your first exact pass." |
| `stageReminderEmail` | Said "with the prompts for this phase now open", but the email goes out a week early and workbook prompts stay locked until the phase opens (README, Gifts/reminders/narration). Wrong fact. | "Your reading covers it: …#c7. Workbook prompts for a phase open on the day that phase starts, not before." |
| `stageReminderEmail` | No copy for the `approach` stage. `compute.ts` schedules it for anyone who buys before their window opens, and it fell back to "A new stage of your Saturn cycle opens." | Added an `approach` line in the same register as the others: window opens, nothing exact yet, decide what this return will test. |
| `day3Email` | "Three days ago you opened your reading." It is sent three days after the reading was *written*, whether or not it was opened. | "Three days ago your reading arrived." |
| `day10Email` | Commercial upsell with no way to opt out (Spam Act 2003 needs a working unsubscribe in commercial email). | Footer: `Sent once. Reply "stop" and we'll send nothing but what you've bought.` Replies have to be handled by hand (see launch checklist B4 and D9). |
| `deliveryEmail` | P.S. offered "$59 a year" to everyone. Yearly is only offered when the window has at least nine months left (`yearlyAllowed`). | "$7 a month, or $59 a year if your window has nine months or more left, and it stops itself…" |
| `seasonCompleteEmail` | Didn't mention the refund that `/refunds` promises when a yearly plan closes itself ("the same refund on a yearly plan"). | Added: "If you were on the yearly plan, the full months you hadn't used are refunded to your card." |
| `giftEmail` | "or enter the code on the site": there's no code field anywhere on the site. The only way in is `/gift/:code`. | "They open the link, put in…" |
| `giftEmail` | "One use." The terms say "One use, no expiry", and the code has no expiry. | "One use, no expiry." |
| `giftEmail` | "reply to this within 14 days" left out that a redeemed code moves the refund to the recipient (`/refunds`). | "…within 14 days, before the code is used." |

`npx tsc --noEmit -p .` is clean and `npx vitest run` passes (174 tests). No test asserted any of the changed copy.

## Checked, no change needed

- **`deliveryEmail`**: the subject, "listen to it" (narration), the calendar, PDF, share card and five questions are all accurate. "If the Saturn sign is wrong, reply to this and I'll refund you" matches "Wrong sign or date" on `/refunds`, and "— Mick, Rite" gives the "I" a name.
- **`seasonEmail`**: the subject reads "Saturn this week: 7.2° short of your degree" or "on your degree" (the fragment from emails.md §1 is gone). "the rest land on Monday mornings where you are" matches the cron (07:00 local). "Change plan or stop these" links the manage page, and stopping is immediate, which matches `/refunds`.
- **`day10Email`**: the yearly price drops out when `yearlyAllowed` is false, and "It stops itself the week Saturn leaves your sign" is accurate.

## Not fixed (outside `src/email.ts`, or more than a copy edit)

1. **The gift recipient gets the buyer's delivery email.** `/redeem` runs `generateReport`, which sends `deliveryEmail`. So the recipient reads "If the Saturn sign is wrong, reply to this and I'll refund you" for a reading they didn't pay for. emails.md §5 has gift-recipient copy, but it isn't wired. To fix: pass `gift: true` into `deliveryEmail` and swap that line to "…and we'll fix it", or wire §5. Owner: Claude, after Mick approves.
2. **Every "reply to this" goes to `hello@rite.report`**, which has no inbox until the domain is bought and Email Routing is on. That covers delivery refunds, day 3, day 10 "stop", stage reminders "Reply to stop these" and the gift refund. Launch blocker (checklist B4).
3. **Stage reminders say "Reply to stop these."** There's no stop link and no automated suppression. The privacy page says "Reminder and Saturn Season emails each have a stop link", which is only true for Season. Either add a stop link (`/r/:tok/stop-reminders` setting `stage_reminders.sent_at='skipped:stop'` and `followups.sent_at='skipped:stop'`), or change the privacy line. Owner: Claude.
4. **Inline pass reminder** (`index.ts`, `runReminders`): "Nothing has to happen on the day — but whatever you have been circling tends to ask for a decision around it." emails.md §1 already flagged this as close to a prediction, and the stage-reminder version was softened, but this one wasn't. Suggest: "This is the part people mean when they say Saturn return. The work is deciding, not waiting to see." The subject also still uses an em dash ("…a week away — 13 May 2026") where every other subject uses a colon.
5. **Inline window-open reminder** (`index.ts`): it's in voice, but it differs from the approved emails.md §4 copy (no first pass, no price). Either is fine. Pick one so the docs and code agree.
6. **Hard-coded prices**: `deliveryEmail` says "$7 a month, or $59 a year", while `day10Email` and `stageReminderEmail` take prices from env. If `PRICE_SEASON_*_CENTS` ever changes, the delivery P.S. goes stale. The cheapest fix is to pass `monthlyPrice` and `yearlyPrice` the way `day10Email` does (needs an `index.ts` edit).
7. **`housePhrase`** renders as "Saturn in Aries, ninth house." emails.md wanted "in your ninth house". The `housePhrase` is built in `index.ts`, so it wasn't changed here.
8. **Server-side yearly gate**: `POST /season/:tok` accepts `plan=year` even when `yearlyAllowed` is false (the page hides the button, but the route doesn't check). The same goes for a reading whose window has already closed: Season can be bought, and the first cron run then completes and refunds it. Code, not copy. Listed in the launch checklist.
9. **Reread line**: "Reread: The pass and the turn: https://…" has two colons. It's cosmetic. "Reread “The pass and the turn”: …" would read better.
