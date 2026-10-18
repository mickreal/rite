// Year-ahead reading pages (build 11): the reading itself (/r/:tok/year/:yyyy), the offer (/r/:tok/year) and the
// writing / failed state. Every date and position is printed by code from the engine's facts; the model's prose sits
// beside them.
import { html } from "hono/html";
import { shell } from "./theme";
import { fmtDay } from "../compute";
import { periodLabel, relationText, motionText, teaser, fmtYm, type YearAhead, type YearReport } from "../year-ahead";

const CSS = `
.ya h1{margin:0;font-size:clamp(52px,8vw,120px);line-height:.9;letter-spacing:-.045em;font-weight:800}
.ya .kicker{font-size:15px;color:#F2B544}
.ya p.body{margin:0;font-size:19px;line-height:1.7;color:#CFC8BA;max-width:680px}
.ya h2{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(34px,3.6vw,52px);line-height:1;letter-spacing:-.03em;font-weight:700;color:#EDE6D6}
.ya .ev{display:grid;grid-template-columns:130px minmax(0,1fr);gap:16px;padding:14px 0;border-top:1px solid rgba(237,230,214,.1);font-size:16px;line-height:1.55}
.ya .ev b{color:#F2B544;font-weight:600}
.ya .mrow{display:grid;grid-template-columns:150px 150px minmax(0,1fr);gap:18px;align-items:baseline;padding:20px 0;border-top:1px solid rgba(237,230,214,.1)}
.ya .badge{display:inline-flex;font-size:13px;font-weight:600;padding:3px 10px;border-radius:999px;width:fit-content;background:rgba(237,230,214,.08);color:#CFC8BA}.ya .badge.r{background:rgba(242,181,68,.14);color:#F2B544}
.ya .tag{font-size:13px;color:#F2B544}
.ya .carry{font-family:'Bricolage Grotesque',serif;font-size:clamp(24px,2.8vw,34px);line-height:1.2;color:#F2B544;border-left:3px solid #F2B544;padding:8px 0 8px 22px;margin:0}
@media (max-width:720px){.ya .mrow{grid-template-columns:1fr;gap:6px}.ya .ev{grid-template-columns:1fr;gap:2px}}
@media print{nav,form,button{display:none!important}}
`;
const SCOPE = "This reading follows one planet, Saturn, measured against the Saturn in your birth chart: its exact contacts with your natal Saturn (the return, the two squares and the opposition), where it stands still and turns, and when it changes sign. It doesn't look at other planets.";

export function yearPage(o: { siteUrl: string; token: string; y: YearAhead; r: YearReport; firstName: string | null; birthLabel: string; placeLabel: string; others: Array<{ year: number; label: string }> }) {
  const { y, r } = o;
  const body = html`
<div class="wrap ya" style="padding-top:32px;padding-bottom:96px;display:flex;flex-direction:column;gap:40px">
  <div style="display:flex;flex-direction:column;gap:16px">
    <p class="muted" style="margin:0;font-size:17px">${o.firstName ? `Prepared for ${o.firstName}. ` : ""}Born ${o.birthLabel}, ${o.placeLabel}. Natal Saturn ${Math.floor(y.natal.deg)}° ${y.natal.sign}.</p>
    <h1 class="disp">Your year <span style="color:#F2B544">ahead.</span></h1>
    <p class="disp" style="margin:0;font-size:clamp(20px,2vw,28px);line-height:1.3">${periodLabel(y)}</p>
    <p class="body">${r.intro}</p>
  </div>

  <section style="display:flex;flex-direction:column;gap:12px">
    <span class="kicker">Dated by the engine</span><h2>The year at a glance</h2>
    <div style="border-bottom:1px solid rgba(237,230,214,.1)">
      ${y.events.length ? y.events.map((e) => html`<div class="ev"><b>${fmtDay(e.date)}</b><span>${e.label}.</span></div>`) : html`<div class="ev"><b>No dates</b><span>No contact, station or sign change falls in these twelve months.</span></div>`}
      ${y.closest ? html`<div class="ev"><b>${fmtDay(y.closest.date)}</b><span>The nearest Saturn comes this year to a point on your cycle: ${y.closest.orb}° from ${y.closest.point === "return" ? "your natal Saturn" : y.closest.point === "opposition" ? "the opposition to your natal Saturn" : y.closest.point === "square1" ? "the first square to your natal Saturn" : "the closing square to your natal Saturn"}, without an exact contact.</span></div>` : ""}
    </div>
  </section>

  <section style="display:flex;flex-direction:column;gap:12px">
    <span class="kicker">Twelve months</span><h2>Month by month</h2>
    <div style="border-bottom:1px solid rgba(237,230,214,.1)">
      ${y.months.map((m, i) => html`<div class="mrow">
        <div style="display:flex;flex-direction:column;gap:4px"><span class="disp" style="font-size:22px;font-weight:600">${m.name} ${m.year}</span>${m.events.length ? html`<span class="tag">${m.events.map((k) => fmtDay(y.events[k].date).replace(/ \d{4}$/, "")).join(" · ")}</span>` : ""}</div>
        <div style="display:flex;flex-direction:column;gap:6px"><span class="badge ${m.retro ? "r" : ""}">${motionText(m, y.events)}</span><span class="muted" style="font-size:13px">${Math.floor(m.mid.deg)}° ${m.mid.sign} · ${relationText(m)}</span></div>
        <span style="font-size:16px;line-height:1.6;color:#CFC8BA">${r.months[i]?.body ?? ""}</span>
      </div>`)}
    </div>
  </section>

  <p class="carry">${r.carry}</p>
  <p class="muted" style="margin:0;font-size:14px;max-width:720px">${SCOPE} Tropical zodiac. Dates are UTC and exact to the day. Positions are for the 15th of each month unless a date is given.</p>
  <div style="display:flex;gap:12px;flex-wrap:wrap"><a class="ghost" href="/r/${o.token}">Back to your Saturn return reading</a><a class="ghost" href="javascript:window.print()">Printable PDF</a>
    ${o.others.map((x) => html`<a class="ghost" href="/r/${o.token}/year/${x.year}">${x.label}</a>`)}</div>
</div>`;
  return shell({ title: `Your year ahead · Rite`, body, extraCss: CSS, description: `Saturn against your chart, ${periodLabel(y)}.`, nav: html`<nav class="main"><a href="/r/${o.token}" class="ghost">Your reading</a></nav>` });
}

/** /r/:tok/year: what the next year-ahead covers (code-only teaser, no dates) and the button; or why it isn't on sale yet. */
export function yearOfferPage(o: { token: string; y: YearAhead | null; price: string; nextFrom: string | null; current: { year: number; label: string } | null; cancelled?: boolean }) {
  const body = html`
<div class="wrap ya" style="padding-top:32px;padding-bottom:96px;display:flex;flex-direction:column;gap:28px;max-width:860px">
  <span class="kicker">Year-ahead reading</span>
  <h1 class="disp">Your year <span style="color:#F2B544">ahead.</span></h1>
  ${o.y ? html`
  <p class="body">The next twelve months of Saturn against your chart, ${periodLabel(o.y)}, month by month: where Saturn is each month relative to your natal Saturn, every date that matters, and what each month is good for. Written for your chart from the birth details you already gave us.</p>
  <div class="card" style="display:flex;flex-direction:column;gap:12px">
    <span class="muted" style="font-size:14px">In your year</span>
    ${teaser(o.y).map((t) => html`<p style="margin:0;font-size:17px;line-height:1.55">${t}</p>`)}
  </div>
  ${o.cancelled ? html`<p class="muted" style="margin:0">No charge was made. It's here whenever you want it.</p>` : ""}
  <form method="post" action="/r/${o.token}/year/checkout" style="display:flex;gap:14px;flex-wrap:wrap;align-items:center"><button type="submit" class="solid">Get my year ahead, $${o.price}</button><span class="muted" style="font-size:14px">One payment. Ready in about a minute. Refundable within 14 days.</span></form>
  <p class="muted" style="margin:0;font-size:14px">${SCOPE}</p>`
  : html`<p class="body">${o.current ? html`Your year ahead for ${o.current.label} is still running. ` : ""}The next one carries on where it ends, and you can get it from ${o.nextFrom ? fmtDay(o.nextFrom) : "two months before then"}.</p>
  ${o.current ? html`<div><a class="ghost" href="/r/${o.token}/year/${o.current.year}">Open ${o.current.label}</a></div>` : ""}`}
  <div><a href="/r/${o.token}">Back to your Saturn return reading</a></div>
</div>`;
  return shell({ title: `Your year ahead · Rite`, body, extraCss: CSS, nav: html`<nav class="main"><a href="/r/${o.token}" class="ghost">Your reading</a></nav>` });
}

/** While the year-ahead is being written (refreshes itself), or after writing failed. */
export function yearStatePage(o: { token: string; year: number; state: "writing" | "failed"; supportEmail: string; period: string }) {
  const body = html`
<div class="wrap ya" style="padding-top:64px;padding-bottom:120px;display:flex;flex-direction:column;gap:22px;max-width:760px">
  <span class="kicker">Year-ahead reading · ${o.period}</span>
  ${o.state === "writing" ? html`<h2>Writing your year ahead<span class="dots"></span></h2><p class="body">The dates are worked out; the months are being written up. This page refreshes itself, and the link is in your email too.</p>`
  : html`<h2>That didn't finish.</h2><p class="body">Your payment went through and nothing is lost. <a href="/r/${o.token}/year/${o.year}?retry=1">Try again</a>, or reply to the receipt or email ${o.supportEmail} and a person will sort it out.</p>`}
</div>`;
  return shell({ title: `Your year ahead · Rite`, body, extraCss: CSS + ".dots::after{content:'...'}", script: o.state === "writing" ? "setTimeout(function(){location.reload()},5000)" : undefined });
}

export const yearLabel = (start: string, end: string) => periodLabel({ start, end });
export { fmtYm };
