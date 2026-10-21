// Privacy, terms and refund pages. Plain English, same shell as the rest of the site.
import { html } from "hono/html";
import { shell } from "./theme";

const CSS = `
.legal{max-width:760px;margin:0 auto;padding:48px clamp(16px,4vw,48px) 140px;display:flex;flex-direction:column;gap:22px}
.legal h1{margin:0 0 8px;font-family:'Bricolage Grotesque',serif;font-size:clamp(44px,6vw,80px);line-height:.95;letter-spacing:-.04em;font-weight:800}
.legal h2{margin:28px 0 0;font-family:'Bricolage Grotesque',serif;font-size:26px;letter-spacing:-.02em;font-weight:600}
.legal p,.legal li{margin:0;font-size:17px;line-height:1.7;color:#CFC8BA}
.legal ul{margin:0;padding-left:22px;display:flex;flex-direction:column;gap:8px}
.legal .meta{font-size:14px;color:#8F897E}
.legal a{color:#F2B544}
`;

const OPERATOR = "Rite is operated by MickMade (Australia)";

export function legalPage(opts: { siteUrl: string; page: "privacy" | "terms" | "refunds"; supportEmail: string }) {
  const updated = "17 October 2026";
  const e = opts.supportEmail;
  const pages = {
    privacy: {
      title: "Privacy",
      body: html`
<p>${OPERATOR}. This page says what we collect, why, and who else touches it. If anything here is unclear, email <a href="mailto:${e}">${e}</a>.</p>
<h2>What we collect</h2>
<ul>
  <li><b>Birth details</b> you type in: date, place, and time if you give it. We need these to work out where Saturn was when you were born. The place is turned into coordinates and a time zone.</li>
  <li><b>Your email and first name</b> when you buy a reading, a gift, a reminder or Saturn Season. We use them to send what you bought.</li>
  <li><b>Payment</b> is handled by Stripe. We never see or store your card number; we keep Stripe's reference for the order so we can refund it.</li>
  <li><b>Your questions</b> in the "Ask" chapter, and the answers, so they show on your reading page.</li>
  <li><b>Workbook and history notes</b> you write on the reading page stay in your own browser (local storage). They are never sent to us.</li>
  <li><b>Usage</b>: which pages were visited and where people drop off (page views, previews started, purchases). We use PostHog for this, without session recordings and without selling or sharing it.</li>
</ul>
<h2>Who else processes it</h2>
<ul>
  <li><b>Cloudflare</b> hosts the site and stores the data above.</li>
  <li><b>Anthropic</b> (Claude) writes the prose of your reading from a set of computed inputs: your Saturn sign, degree, house, the dates, and your first name if you gave one. Anthropic does not get your email or birthplace.</li>
  <li><b>ElevenLabs</b> turns the reading's text into audio if you press play. It receives the narration script (which includes your first name if you gave one), not your email or birthplace. If ElevenLabs is unavailable, <b>Cloudflare Workers AI</b> (Deepgram's voice model) is used instead. The audio is kept so it doesn't need regenerating.</li>
  <li><b>Resend</b> delivers our email.</li>
  <li><b>Stripe</b> takes payment. Stripe's own privacy policy applies to the checkout page.</li>
  <li><b>Nominatim (OpenStreetMap)</b> turns the birthplace you type into coordinates. Only the place name is sent.</li>
</ul>
<h2>How long we keep it</h2>
<p>Your reading stays at its link so you can come back to it as your cycle moves on; that means we keep the purchase and the birth details behind it until you ask us to delete them. Free previews that were never bought are deleted after 90 days.</p>
<h2>Your choices</h2>
<ul>
  <li>Email <a href="mailto:${e}">${e}</a> and we will delete your reading, birth details and email, or send you a copy of what we hold. We do this by hand, usually within a few days.</li>
  <li>Every reminder, follow-up and Saturn Season email has a link to stop it, and stopping takes effect straight away. You can also reply to any of them. The delivery email is sent once.</li>
  <li>We don't sell data, run ads, or share your details with anyone not listed above.</li>
</ul>
<h2>Cookies</h2>
<p>None for tracking. The site uses your browser's local storage for your workbook answers and to remember a few conveniences, and PostHog sets a first-party identifier so visits can be counted. No third-party advertising cookies.</p>
<h2>Children</h2>
<p>The site is for adults. We don't knowingly collect details from anyone under 18; a first Saturn return happens at about 29.</p>`,
    },
    terms: {
      title: "Terms",
      body: html`
<p>${OPERATOR}. Short version: you buy a reading written for your chart, it's yours to keep at its link, and if it isn't useful you can have your money back within 14 days.</p>
<h2>What you're buying</h2>
<ul>
  <li>A <b>reading</b>: a page built from the dates of your Saturn return, with written chapters, a narration, calendar files, a workbook, and five follow-up questions. It stays at its link and updates as your cycle moves on.</li>
  <li>A <b>gift code</b>: the same reading, redeemed by someone else with their own birth details. One use, no expiry.</li>
  <li><b>Saturn Season</b>: a weekly email through your return window, billed monthly or yearly until you cancel or the window closes, whichever comes first.</li>
</ul>
<h2>What it is and isn't</h2>
<p>The dates are real astronomy: Saturn's position computed from the same ephemeris professional astrologers use, checked against Swiss Ephemeris. The interpretation is astrology, written for reflection. It is not medical, psychological, legal or financial advice, and it does not predict events. Decisions you make are yours.</p>
<h2>Accuracy</h2>
<p>Dates depend on the birth details you enter. Without a birth time we use noon and leave out the houses, and say so. If a sign or date is wrong because of our maths, tell us and we'll fix it or refund you.</p>
<h2>Your reading link</h2>
<p>The link is unguessable but not password-protected: anyone you give it to can read it. Don't post it publicly unless you want it public. The share card has no personal details on it.</p>
<h2>Payment and refunds</h2>
<p>Prices are in US dollars and shown before you pay. Payment is by Stripe. Refunds are covered on the <a href="/refunds">refund page</a>; nothing here limits your rights under Australian Consumer Law or the consumer law where you live.</p>
<h2>Fair use</h2>
<p>Readings are for the person whose chart they're built from (or the person they were gifted to). Please don't scrape the site, resell readings, or use the calculator to build a competing dataset.</p>
<h2>Changes</h2>
<p>We may update these terms; the date below changes when we do. Material changes to something you've already bought won't apply to you retroactively.</p>
<h2>Contact</h2>
<p><a href="mailto:${e}">${e}</a></p>`,
    },
    refunds: {
      title: "Refunds",
      body: html`
<p>${OPERATOR}. We'd rather refund you than have you keep something you don't want.</p>
<h2>Readings</h2>
<p>If your reading isn't right for you, write to us within <b>14 days</b> of purchase: email <a href="mailto:${e}">${e}</a> from the address you bought with, or reply to your delivery email. Tell us what's missing and we'll make it right, whether that's answering your questions, correcting something or a full refund. Refunds go back to the original payment method and usually show within 5–10 business days depending on your bank. Once a reading is refunded, its link closes, along with its narration, questions and calendar.</p>
<h2>Gift codes</h2>
<p>Unredeemed gift codes are refundable within 14 days of purchase. Once a code has been redeemed, the 14-day window applies to the recipient's reading instead.</p>
<h2>Saturn Season</h2>
<p>Stop it any time from the link in any note. It stops straight away: no more notes and no more charges. On a yearly plan, the full months you haven't used are refunded to your card automatically; a monthly plan has nothing left to refund. It also stops itself when your window closes, with the same refund on a yearly plan. If you refund a Saturn Season payment through us for any other reason, the subscription stops too.</p>
<h2>Wrong sign or date</h2>
<p>If a sign or date in your reading is wrong because of our calculation, we'll correct it and refund you at any time, not only in the first 14 days.</p>
<h2>Consumer law</h2>
<p>Nothing on this page limits your rights under the Australian Consumer Law or the consumer protection law of the country you're in.</p>`,
    },
  } as const;
  const pg = pages[opts.page];
  const body = html`<article class="legal"><h1>${pg.title}</h1><p class="meta">Updated ${updated} · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/refunds">Refunds</a></p>${pg.body}</article>`;
  return shell({ title: `${pg.title} · Rite`, description: `Rite ${pg.title.toLowerCase()} policy.`, canonical: `${opts.siteUrl}/${opts.page}`, body, extraCss: CSS, nav: html`<nav class="main"><a href="/">Saturn return calculator</a></nav>` });
}
