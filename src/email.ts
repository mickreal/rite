// Transactional email via Resend.
interface Env { RESEND_API_KEY: string; FROM_EMAIL: string; SUPPORT_EMAIL: string; SITE_URL: string }

export async function sendEmail(env: Env, to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) { console.warn("RESEND_API_KEY missing; email not sent", { to, subject }); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], reply_to: env.SUPPORT_EMAIL, subject, text, html }),
  });
  if (!res.ok) { console.error("resend", res.status, await res.text()); return false; }
  return true;
}

export function deliveryEmail(p: {
  firstName: string | null; sign: string; housePhrase: string; windowStart: string; windowEnd: string;
  hitSentence: string; reportUrl: string; upsellUrl: string;
}) {
  const name = p.firstName ?? "Hi";
  const subject = `Your Saturn return — ${p.sign}, ${p.windowStart} to ${p.windowEnd}`;
  const text = `${name},

Your reading's ready: ${p.reportUrl}

The short version: Saturn in ${p.sign}${p.housePhrase}. Your window runs ${p.windowStart} to ${p.windowEnd}. ${p.hitSentence}

Keep that link; the page updates as you move through the cycle, so it reads differently next year. At the top you can listen to it, add every date to your calendar, print it to PDF, and save a share card (no personal details on it, just the sign and the dates). Five follow-up questions are included at the bottom.

If the Saturn sign is wrong, reply to this and I'll refund you.

— Mick, Rite

P.S. Saturn Season is a weekly note through your window: where Saturn is this week relative to your chart, and one thing to do with it. $7 a month, or $59 a year if your window has nine months or more left, and it stops itself when your window closes: ${p.upsellUrl}`;
  return { subject, text };
}

export function seasonEmail(p: { firstName: string | null; transitDeg: string; transitSign: string; orb: string; dir: string; motionSentence: string; body: string; comingUp: string; rereadName: string; rereadUrl: string; manageUrl: string; welcome?: boolean }) {
  const where = parseFloat(p.orb) < 1 ? "on your degree" : `${p.orb} ${p.dir === "from" ? "short of" : "past"} your degree`;
  const subject = p.welcome ? `Saturn Season starts: ${where}` : `Saturn this week: ${where}`;
  const text = `${p.firstName ?? "Hi"},
${p.welcome ? `
Welcome to Saturn Season. This is the first note; the rest land on Monday mornings where you are, until your window closes.
` : ""}
Saturn is at ${p.transitDeg} ${p.transitSign}, ${p.orb} ${p.dir} your natal degree. ${p.motionSentence}

${p.body}

${p.comingUp}

Reread: ${p.rereadName}: ${p.rereadUrl}

— Rite

Change plan or stop these: ${p.manageUrl}`;
  return { subject, text };
}

export function seasonCompleteEmail(p: { firstName: string | null; readingUrl?: string; nextAge?: number | null }) {
  return {
    subject: "Your Saturn return is over",
    text: `${p.firstName ?? "Hi"},

As of this week Saturn has left your natal sign. The window's closed.

What you built in it is yours now. What you let go stays gone.

This is the last note. There's nothing left to track, so the subscription has cancelled itself; you won't be charged again. If you were on the yearly plan, the full months you hadn't used are refunded to your card.
${p.readingUrl ? `\nYour reading stays at ${p.readingUrl} and keeps updating through the long arc${p.nextAge ? ` (the next turning point is around age ${p.nextAge})` : ""}.\n` : ""}
See you at the next one.

— Rite`,
  };
}

export function stageReminderEmail(p: { firstName: string | null; label: string; onDate: string; readingUrl: string; stageKey: string; subscribed?: boolean; seasonUrl?: string | null; monthlyPrice?: number }) {
  const what: Record<string, string> = {
    approach: "Saturn enters your natal sign and your return window opens. Nothing is exact yet. The work is deciding what this return is going to test and setting it up before the first pass.",
    contact: "Saturn reaches the degree it held when you were born. This is the part people mean when they say Saturn return. The work is deciding, not waiting to see.",
    integration: "Saturn crosses your degree for the last time this return. From here what you chose becomes structure; the work is keeping the promises, small and often.",
    close: "Saturn leaves your natal sign and your return window closes. Your reading stays at the link below and keeps updating as the cycle moves on.",
    square1: "Saturn squares its own position: the first real test of what you built at your return. Fix what is not working rather than starting again.",
    square2: "Saturn squares its own position for the last time before your next return. Choose what to finish and what to close.",
    opposition: "Saturn opposes its own position. You see clearly what you have built and how others see it. An honest review, especially of roles and relationships.",
  };
  const subject = `A week out: ${p.label}`;
  const text = `${p.firstName ?? "Hi"},

On ${p.onDate}: ${/^Saturn\b/.test(p.label) ? p.label : p.label.charAt(0).toLowerCase() + p.label.slice(1)}.

${what[p.stageKey] ?? "A new stage of your Saturn cycle opens."}

Your reading covers it: ${p.readingUrl}#c7. Workbook prompts for a phase open on the day that phase starts, not before.
${!p.subscribed && p.seasonUrl ? `
If you'd rather hear from us every week than only at the turning points, Saturn Season is a short note each Monday until your window closes${p.monthlyPrice ? `, $${p.monthlyPrice} a month` : ""}, and it stops itself: ${p.seasonUrl}
` : ""}
— Rite

Sent once, a week before each stage of your cycle. Reply to stop these.`;
  return { subject, text };
}

/** Day 3 after the reading: put the dates in a calendar, open the workbook. Copy: docs/emails.md §2. */
export function day3Email(p: { firstName: string | null; readingUrl: string }) {
  return {
    subject: "Did you put the dates in your calendar?",
    text: `${p.firstName ?? "Hi"},

Three days ago your reading arrived. The part people skip is the part that does the most: the dates.

At the top of chapter three there's a calendar button. One file per date (each exact pass, the closest turn, the day your window closes), or all of them at once: ${p.readingUrl}#c3

Put them in whatever calendar you actually look at. A pass you didn't see coming is just a hard week. A pass you've dated is a week you can plan around.

Then open the workbook: ${p.readingUrl}#c7. The prompts for the phase you're in now are unlocked. The rest open when their phase does, so there's nothing to do early.

— Rite

Sent once. Reply to this and a person answers.`,
  };
}

/**
 * Day 10 after the reading, to owners without Saturn Season: what a Monday note looks like, with a sample built by code
 * for their own chart (position, orb, motion, the code-only paragraph, the 30-day list). Copy: docs/emails.md §3.
 */
export function day10Email(p: { firstName: string | null; windowEnd: string; position: string; body: string; comingUp: string; seasonUrl: string; monthlyPrice: number; yearlyPrice: number | null }) {
  const lines = [p.position, "", ...p.body.split("\n").flatMap((l, i) => (i === 0 ? [l] : ["", l])), "", ...p.comingUp.split("\n")];
  const quote = lines.map((l) => (l ? `> ${l}` : ">")).join("\n");
  return {
    subject: "What a Monday note looks like",
    text: `${p.firstName ?? "Hi"},

Your reading is the map. Saturn Season is the "you are here" dot, once a week, until your window closes on ${p.windowEnd}.

Here's the note you'd have got this Monday:

${quote}

Every Monday, 7am your time. $${p.monthlyPrice} a month${p.yearlyPrice ? ` or $${p.yearlyPrice} a year` : ""}. It stops itself the week Saturn leaves your sign, so you can't forget to cancel: ${p.seasonUrl}

— Rite

Sent once. Reply "stop" and we'll send nothing but what you've bought.`,
  };
}

export function giftEmail(p: { code: string; link: string; from: string | null }) {
  const subject = `Your Rite gift code: ${p.code}`;
  const text = `Thanks${p.from ? `, ${p.from}` : ""}.

Here's the gift. Send them either of these:

Code: ${p.code}
Link: ${p.link}

They open the link, put in their own birth date, place and time if they know it, and the full reading is theirs. It works with or without a birth time. One use, no expiry.

If you'd like it refunded instead, reply to this within 14 days, before the code is used.

— Rite`;
  return { subject, text };
}
