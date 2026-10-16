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

P.S. Saturn Season is a weekly note through your window: where Saturn is this week relative to your chart, and one thing to do with it. $7 a month or $59 a year, and it stops itself when your window closes: ${p.upsellUrl}`;
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

This is the last note. There's nothing left to track, so the subscription has cancelled itself; you won't be charged again.
${p.readingUrl ? `\nYour reading stays at ${p.readingUrl} and keeps updating through the long arc${p.nextAge ? ` (the next turning point is around age ${p.nextAge})` : ""}.\n` : ""}
See you at the next one.

— Rite`,
  };
}

export function stageReminderEmail(p: { firstName: string | null; label: string; onDate: string; readingUrl: string; stageKey: string }) {
  const what: Record<string, string> = {
    contact: "Saturn reaches the degree it held when you were born. This is the part people mean when they say Saturn return. The work is deciding, not waiting to see.",
    integration: "Saturn crosses your degree for the last time this return. From here what you chose becomes structure; the work is keeping the promises, small and often.",
    close: "Saturn leaves your natal sign and your return window closes. Your reading stays at the link below and keeps updating as the cycle moves on.",
    square1: "Saturn squares its own position: the first real test of what you built at your return. Fix what is not working rather than starting again.",
    square2: "Saturn squares its own position for the last time before your next return. Choose what to finish and what to close.",
    opposition: "Saturn opposes its own position. You see clearly what you have built and how others see it. An honest review, especially of roles and relationships.",
  };
  const subject = `A week out: ${p.label}`;
  const text = `${p.firstName ?? "Hi"},

On ${p.onDate}: ${p.label.toLowerCase()}.

${what[p.stageKey] ?? "A new stage of your Saturn cycle opens."}

Your reading has a chapter for it, with the prompts for this phase now open: ${p.readingUrl}#c7

— Rite

Sent once, a week before each stage of your cycle. Reply to stop these.`;
  return { subject, text };
}

export function giftEmail(p: { code: string; link: string; from: string | null }) {
  const subject = `Your Rite gift code: ${p.code}`;
  const text = `Thanks${p.from ? `, ${p.from}` : ""}.

Here's the gift. Send them either of these:

Code: ${p.code}
Link: ${p.link}

They open the link (or enter the code on the site), put in their own birth date, place and time if they know it, and the full reading is theirs. It works with or without a birth time. One use.

If you'd like it refunded instead, reply to this within 14 days.

— Rite`;
  return { subject, text };
}
