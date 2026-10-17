# Support replies and admin steps

Saved replies for `hello@rite.report`, each with the admin step behind it. Policy is `/refunds` and `/privacy`; these match them as of 17 Oct 2026. Sign every reply "Mick, Rite" (the delivery email is from Mick).

**Replies are sent from `/admin/inbox`** (build 3b), not from your own mail app, so they come from `hello@`, thread under the customer's message, and are kept with the thread. When something needs you, a short note arrives at `ADMIN_EMAIL` (with the original forwarded beside it) linking to the thread: open it, the assistant's draft (one of the replies below) is already in the box; edit the `{…}` parts (it won't send with one left in) and press Send. Sending takes the thread over: the assistant won't act on that thread again, even with `INBOX_AUTO` on, and the customer's next message comes straight to you. "I've got this" takes it over without replying; "Hand back to assistant" undoes it; Close / Reopen file it. Do the admin step (the curl below) before you send a reply that says it's done.

Sign in once per device at `/admin/login` with `ADMIN_KEY` (a signed, HttpOnly cookie for 30 days; `?key=` still works). **Optional extra layer, free:** Cloudflare Zero Trust → Access → Applications → Add → Self-hosted, domain `rite.report`, path `admin` (it covers `/admin` and everything under it), policy "Allow" with an Include rule "Emails: <your address>" (one-time PIN login). Access then asks for a code by email before any `/admin` page loads, in front of the key. Leave `/webhook/*` and `/internal/*` outside it. Curl calls to `/admin/*` would then need an Access service token, so add a second policy "Service Auth" with a service token if you keep using them.

Admin calls use `ADMIN_KEY` (`.dev.vars`), never pasted into a reply:

```sh
A="Authorization: Bearer $ADMIN_KEY"; H='content-type: application/json'; S=https://rite.report
```

Answer within 2 hours on launch days, within one business day after that. Refunds the same day.

---

## 1. Refund (within 14 days, any reason)

**Do:** `curl -X POST $S/admin/refund -H "$A" -H "$H" -d '{"email":"<their email>"}'`. That refunds in Stripe, marks the purchase refunded and skips their follow-ups. The reading link stays up. Check `/admin` shows a `refund` event.

> Hi {name},
>
> Done. The full $29 is on its way back to your card. Banks usually show it in 5 to 10 business days.
>
> Thanks for giving it a go.
>
> Mick, Rite

**Past 14 days, no calculation error:** the policy is 14 days. Say so kindly, and offer to answer whatever wasn't useful. A goodwill refund is your call; it's the same command.

## 2. Wrong sign or date (refund at any time)

**Do:** check the birth details they entered (`/admin`, or `SELECT birth_date, birth_time, place_label FROM previews p JOIN purchases u ON u.preview_id=p.id WHERE u.email='<x>'`). Run the same date and place at `/start`.

- **They typed it wrong** (wrong year, wrong city): offer a fresh reading with the right details. Make a gift code for them (checklist B7 shows the insert), then refund the first purchase if they want.
- **Our calculation is wrong:** refund (macro 1), then log it in `docs/launch-log.md` with the inputs. That's a bug to fix the same day.

> Hi {name},
>
> Thanks for flagging it. {You entered 14 March 1996, so the reading used that. Here's a code for a fresh one with the right date: {link}. | You're right, that one's on us. I've refunded you in full and I'm fixing the calculation.}
>
> Mick, Rite

## 3. "Where's my reading?" (paid, no email or the page is stuck)

Until the domain is verified in Resend, **no customer email arrives**. Expect this message.

**Do:**
1. Find them: `SELECT id, status, created_at FROM purchases WHERE email='<x>' ORDER BY created_at DESC LIMIT 3`.
2. `generated`: send them `https://rite.report/r/<id>`.
3. `writing` for more than 4 minutes, or `failed`: kick it with `curl -X POST $S/admin/fulfil -H "$A" -H "$H" -d '{"session_id":"cs_…"}'` (session id from Stripe). Then send the link.
4. No row at all but Stripe shows the payment: the webhook was lost. Run `/admin/fulfil` with the session id; it creates the purchase and writes the reading.

> Hi {name},
>
> Sorry about that. Your reading's here: {link}. Keep the link; it's yours for good and updates as your cycle moves on.
>
> Mick, Rite

## 4. Stop emails

Every reminder and follow-up now has a stop link (`/stop/<token>`), and mail apps show their own unsubscribe button. Use this only when someone replies "stop" instead.

**Do:** open `https://rite.report/stop/<purchase id>` (or `/stop/<preview id>` for free pass reminders) and press the button. Or in SQL:
`UPDATE stage_reminders SET sent_at='skipped:stop' WHERE purchase_id='<id>' AND sent_at IS NULL; UPDATE followups SET sent_at='skipped:stop' WHERE purchase_id='<id>' AND sent_at IS NULL;`
For Saturn Season, stop it from `/season/manage/<id>` (it refunds unused months on a yearly plan) or `curl -X POST $S/admin/refund -H "$A" -H "$H" -d '{"email":"<x>","season":true}'`.

Required within 5 business days (Spam Act); aim for same day.

> Hi {name}, done. You won't get any more reminders. Your reading stays at its link. Mick, Rite

## 5. Delete my data

**Do:** by hand, within a few days (the privacy page says "usually within a few days").
1. Take a D1 export first (checklist D5).
2. Stop Season if active (macro 4).
3. Delete in this order, for each of their purchase ids and the preview behind it:
   `DELETE FROM asks WHERE purchase_id=?; DELETE FROM stories WHERE purchase_id=?; DELETE FROM followups WHERE purchase_id=?; DELETE FROM stage_reminders WHERE purchase_id=?; DELETE FROM subscriptions WHERE purchase_id=?; DELETE FROM purchases WHERE id=?; DELETE FROM reminders WHERE preview_id=?; DELETE FROM previews WHERE id=?;`
4. Narration audio is cached in KV under `audio:…:<purchase id>:<chapter>`: `npx wrangler kv key list --binding CACHE --remote --prefix audio:`, then delete the keys containing their purchase id. Their share card is `card:png:…` (same listing with `--prefix card:png:`).
5. Stripe keeps payment records (legal requirement). Say so.

> Hi {name},
>
> Done. Your reading, birth details and email are deleted from Rite. Stripe keeps its own record of the payment, which it's required to; that's covered by Stripe's privacy policy.
>
> Mick, Rite

## 6. Gift problems

- **"The code says already used":** check `SELECT redeemed_purchase_id FROM gifts WHERE code=?`. If they redeemed it themselves, send `/r/<redeemed_purchase_id>`.
- **"The code was refunded":** the buyer refunded it. Point them to the buyer.
- **Buyer wants a refund, code unused, within 14 days:** macro 1 with the buyer's email refunds the gift and kills the code.
- **Order bump ("a reading for someone else", bought with their own reading):** it is one payment with the reading. Macro 1 refunds both and kills the unused code. To refund **only** the bump, refund $15 on the payment in the Stripe dashboard (a partial refund, which Rite ignores on purpose), then kill the code by hand: `npx wrangler d1 execute rite --remote --command "UPDATE gifts SET redeemed_at='refunded' WHERE code='<CODE>' AND redeemed_at IS NULL"`. Find the code with `SELECT code FROM gifts WHERE stripe_session_id=(SELECT stripe_session_id FROM purchases WHERE email='<their email>' ORDER BY created_at DESC LIMIT 1)`. A code that has already been redeemed keeps its reading either way.

## 7. "Is this real / how is it calculated?"

> Hi {name},
>
> The dates come from Saturn's real position, calculated for your birth date, time and place and checked against the Swiss Ephemeris (the standard astronomical reference) to within 0.02 degrees. Nothing is made up: every pass date in the reading is a moment Saturn is exactly on the degree it held when you were born. The writing around those dates is generated for your chart and checked so it can only repeat dates the calculation produced.
>
> Mick, Rite

Never argue astrology. Answer the mechanics, then leave it.
