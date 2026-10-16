// /season: what Saturn Season is, for people who arrive from a forwarded note or the landing page. Same shell and type
// scale as the legal and gift pages. The sample note is built by code at request time for a real chart in the current
// Aries cohort, so its numbers are true for this week.
import { html, raw } from "hono/html";
import { shell, ARROW } from "./theme";

const CSS = `
.sl{max-width:1040px;margin:0 auto;padding:48px clamp(16px,4vw,48px) 140px;display:flex;flex-direction:column;gap:72px}
.sl h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(48px,7vw,104px);line-height:.9;letter-spacing:-.045em;font-weight:800}
.sl h2{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(32px,3.6vw,48px);line-height:1;letter-spacing:-.03em;font-weight:700}
.sl p{margin:0;font-size:18px;line-height:1.65;color:#CFC8BA}
.sl .lede{font-size:20px;line-height:1.6;color:#BDB6A8;max-width:680px}
.sl .kick{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#F2B544;font-weight:600}
.paper{background:#EDE6D6;color:#14110A;border-radius:32px;padding:clamp(26px,4.5vw,56px);display:flex;flex-direction:column;gap:22px;position:relative}
.paper p{color:rgba(20,17,10,.82);font-size:18px;line-height:1.65}
.paper .meta{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:14px;color:rgba(20,17,10,.6);border-bottom:1px solid rgba(20,17,10,.14);padding-bottom:18px}
.paper .tag{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:999px;background:#14110A;color:#EDE6D6;font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.paper .pos{font-family:'Bricolage Grotesque',serif;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.015em;color:#14110A;font-weight:600}
.paper .lab{font-weight:600;color:#14110A}
.paper ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:16px;color:rgba(20,17,10,.82)}
.paper ul b{font-weight:600;color:#8A6A1E;font-variant-numeric:tabular-nums}
.paper .foot{font-size:14px;color:rgba(20,17,10,.55);border-top:1px solid rgba(20,17,10,.14);padding-top:16px}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:28px}
.cols div{display:flex;flex-direction:column;gap:10px;border-top:2px solid rgba(237,230,214,.12);padding-top:18px}
.cols h3{margin:0;font-family:'Bricolage Grotesque',serif;font-size:24px;letter-spacing:-.02em;font-weight:600}
.cols p{font-size:17px}
.prices{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.price{background:#14171D;border-radius:28px;padding:28px;display:flex;flex-direction:column;gap:8px}
.price b{font-family:'Bricolage Grotesque',serif;font-size:64px;font-weight:800;letter-spacing:-.05em;line-height:.9}
.price b small{font-size:.38em;font-weight:600;letter-spacing:-.01em;color:#A7A196;margin-left:6px}
.price span{font-size:15px;line-height:1.55;color:#A7A196}
.start{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;border-top:1px solid rgba(237,230,214,.12);padding-top:40px}
`;

export interface SeasonSample {
  bornLabel: string;      // "1 Jun 1997, Melbourne"
  noteDate: string;       // "Mon 19 Oct 2026"
  windowEnd: string;      // "12 Apr 2028"
  position: string;       // the note's first line
  body: string;           // paragraph + "One thing this week:" + "One line to carry:" lines
  upcoming: Array<{ date: string; label: string }>; // formatted
  reread: string;         // chapter name
}

export function seasonLandingPage(opts: { siteUrl: string; sample: SeasonSample; monthlyPrice: number; yearlyPrice: number }) {
  const s = opts.sample;
  const lines = s.body.split("\n").filter(Boolean);
  const label = (l: string) => { const m = /^(One thing this week:|One line to carry:)\s*(.*)$/.exec(l); return m ? html`<p><span class="lab">${m[1]}</span> ${m[2]}</p>` : html`<p>${l}</p>`; };
  const save = Math.round((1 - opts.yearlyPrice / (opts.monthlyPrice * 12)) * 100);
  const body = html`
<main class="sl">
  <section style="display:flex;flex-direction:column;gap:22px">
    <span class="kick">Saturn Season</span>
    <h1>A note every Monday,<br><span style="color:#F2B544">until your window closes.</span></h1>
    <p class="lede">Your reading is the map. Saturn Season is the "you are here" dot: where Saturn is this week against your own chart, what's dated in the month ahead, and one thing to do with it. It stops itself the week Saturn leaves your sign.</p>
  </section>

  <section style="display:flex;flex-direction:column;gap:20px" aria-labelledby="sampleH">
    <h2 id="sampleH" style="font-size:clamp(26px,2.6vw,34px)">What lands in your inbox</h2>
    <article class="paper">
      <div class="meta"><span class="tag">Sample</span><span>For a chart born ${s.bornLabel}</span><span>Note for ${s.noteDate}, 7am</span></div>
      <p class="pos">${s.position}</p>
      ${lines.map(label)}
      <div style="display:flex;flex-direction:column;gap:8px">
        <span class="lab" style="font-size:16px">Coming up in the next 30 days</span>
        ${s.upcoming.length ? html`<ul>${s.upcoming.map((u) => html`<li><b>${u.date}</b> · ${u.label}</li>`)}</ul>` : html`<p style="font-size:16px">Nothing dated. Steady transit.</p>`}
      </div>
      <p style="font-size:16px"><span class="lab">Reread:</span> ${s.reread}, with a link straight to that chapter of your reading.</p>
      <p class="foot">This sample is worked out fresh for this week, for a real birth date in the current Aries cohort. Yours uses your own chart, and the weekly paragraph is written for your sign and phase. Every date in a note comes from the ephemeris, never from the writing. This chart's window closes ${s.windowEnd}; its notes would stop then.</p>
    </article>
  </section>

  <section class="cols">
    <div><h3>Where Saturn is</h3><p>Its degree this week, how far it is from your natal degree, and whether it's closing in or moving away.</p></div>
    <div><h3>What's dated</h3><p>Every pass, station and stage change inside the next 30 days, so nothing arrives as a surprise.</p></div>
    <div><h3>One thing to do</h3><p>A short paragraph for the phase you're in (setting up, holding, or consolidating) and one concrete action for the week.</p></div>
  </section>

  <section style="display:flex;flex-direction:column;gap:20px">
    <h2>Price</h2>
    <div class="prices">
      <div class="price"><b>$${opts.monthlyPrice}<small>a month</small></b><span>Cancel any time from the link in every note.</span></div>
      <div class="price"><b>$${opts.yearlyPrice}<small>a year</small></b><span>${save}% less than monthly. Offered when at least nine months of your window remain; if it closes early, the unused months are refunded.</span></div>
    </div>
    <p>Either way it <b style="color:#EDE6D6;font-weight:600">stops itself when your window closes</b>. Saturn leaves your sign, you get a last note, the subscription cancels. Nothing to remember.</p>
  </section>

  <section class="start">
    <div style="display:flex;flex-direction:column;gap:10px;max-width:560px">
      <h2>It starts from your reading.</h2>
      <p>The notes are worked out from your chart and your window, so Saturn Season is added at the end of your reading. Already have one? Open it from your delivery email and scroll to the bottom.</p>
    </div>
    <a href="/#start" class="cta">Get your reading first ${raw(ARROW)}</a>
  </section>
</main>`;
  return shell({
    title: "Saturn Season: a weekly note through your Saturn return · Rite",
    description: `A short note every Monday through your Saturn return window: where Saturn is against your chart, what's dated next, one thing to do. $${opts.monthlyPrice} a month; stops itself when your window closes.`,
    canonical: `${opts.siteUrl}/season`, og: `${opts.siteUrl}/og.png`, body, extraCss: CSS,
  });
}
