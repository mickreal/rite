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

Your report's ready: ${p.reportUrl}

The short version: Saturn in ${p.sign}${p.housePhrase}. Your window runs ${p.windowStart} to ${p.windowEnd}. ${p.hitSentence}

Your share card is at the bottom of the report page — no personal details on it, just the sign and the dates. Use your browser's print or "Save as PDF" on the report page for a copy to keep.

If the Saturn sign is wrong, reply to this and I'll refund you.

— Rite

P.S. Saturn Season is a weekly note through your window — where Saturn is this week relative to your chart, one line on what that's for. $7/month, stop any time: ${p.upsellUrl}`;
  return { subject, text };
}

export function seasonEmail(p: { firstName: string | null; transitDeg: string; transitSign: string; orb: string; dir: string; motionSentence: string; body: string; manageUrl: string }) {
  const subject = `Saturn this week — ${p.orb} ${p.dir}`;
  const text = `${p.firstName ?? "Hi"},

Saturn is at ${p.transitDeg} ${p.transitSign}, ${p.orb} ${p.dir} your natal degree. ${p.motionSentence}

${p.body}

— Rite

Stop these: ${p.manageUrl}`;
  return { subject, text };
}

export function seasonCompleteEmail(p: { firstName: string | null }) {
  return {
    subject: "Your Saturn return is over",
    text: `${p.firstName ?? "Hi"},

As of this week Saturn is more than 5° past your natal degree. The window's closed.

What you built in it is yours now. What you let go stays gone.

I'm going to stop these emails — there's nothing left to track. Your subscription has been cancelled; you won't be charged again. See you at the next one.

— Rite`,
  };
}
