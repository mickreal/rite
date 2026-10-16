import { html, raw } from "hono/html";
import { shell } from "./theme";
import { SIGNS, type Sign } from "../astro/saturn";
import { SIGN_PAGES } from "../content/signs";
import { fmtMonth } from "../compute";

type Period = { from: string; to: string };

export interface SignPageData {
  sign: Sign;
  current: Period[];      // the transit(s) through the sign nearest to now (incl. a dip): happening now, next, or most recent
  firstBorn: Period[];    // birth ranges whose first return this is
  secondBorn: Period[];
  now: string;            // YYYY-MM-DD
  prev?: Period;          // the whole previous stretch through the sign, when `current` is in the future
  next?: Period;          // the whole following stretch, when `current` is in the past
}

const CSS = `
.fact{background:#14171D;border-radius:24px;padding:24px;display:flex;flex-direction:column;gap:8px}
.art p{margin:0;font-size:19px;line-height:1.7;color:#CFC8BA;max-width:680px}
.art h2{margin:24px 0 0;font-family:'Bricolage Grotesque',serif;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700;color:#EDE6D6}
.sign{min-height:48px;padding:0 20px;border-radius:999px;border:1px solid rgba(237,230,214,.18);color:#EDE6D6;text-decoration:none;display:inline-flex;align-items:center;font-weight:500;transition:border-color .2s,background .2s}
.sign:hover{color:#EDE6D6;border-color:#F2B544;background:rgba(242,181,68,.08)}.sign.cur{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.grow{transform-origin:left center;animation:grow 1.4s cubic-bezier(.3,.7,.2,1) both}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.faqb{width:100%;background:none;border:0;color:#EDE6D6;text-align:left;cursor:pointer;padding:26px 0;display:flex;justify-content:space-between;align-items:center;gap:24px;font:600 22px 'Bricolage Grotesque',serif;letter-spacing:-.01em}
.faqb:hover{color:#F2B544}.faqb svg{flex:0 0 auto;transition:transform .35s cubic-bezier(.2,.8,.2,1)}.faqb.open svg{transform:rotate(45deg)}
.faqa{display:none;margin:0;padding:0 48px 28px 0;font-size:18px;line-height:1.6;color:#BDB6A8}.faqa.open{display:block;animation:swap .5s cubic-bezier(.2,.8,.2,1)}
@media (max-width:640px){.faqb{font-size:19px;padding:20px 0}.faqa{padding-right:0}}
`;

const span = (p: Period) => `${fmtMonth(p.from)} to ${fmtMonth(p.to)}`;
/** "a, b or c" */
const list = (ps: Period[]) => ps.length === 0 ? "in an earlier cycle" : ps.length === 1 ? span(ps[0]) : `${ps.slice(0, -1).map(span).join(", ")} or ${span(ps[ps.length - 1])}`;
const fill = (t: string, vars: Record<string, string>) => t.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);
const days = (p: Period) => Date.parse(p.to) - Date.parse(p.from);

/** Fact card listing birth ranges: the longest stretch as the headline, the rest small. */
function bornCard(label: string, ps: Period[]) {
  if (ps.length === 0) return html`<div class="fact"><span class="muted" style="font-size:14px">${label}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">No one this cycle</span></div>`;
  const main = ps.reduce((a, b) => (days(b) > days(a) ? b : a));
  const rest = ps.filter((p) => p !== main);
  return html`<div class="fact"><span class="muted" style="font-size:14px">${label}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(main)}</span>${rest.length ? html`<span class="muted" style="font-size:14px">also ${rest.map(span).join(" and ")}</span>` : ""}</div>`;
}

export function signPage(opts: { siteUrl: string; d: SignPageData }) {
  const { d } = opts; const s = d.sign; const copy = SIGN_PAGES[s];
  const first = d.current[0], last = d.current[d.current.length - 1];
  const mainIdx = d.current.reduce((bi, p, i, a) => (days(p) > days(a[bi]) ? i : bi), 0);
  const main = d.current[mainIdx];                       // the longest pass; the others are a first dip or a last pass back
  const multi = d.current.length > 1;
  const curIdx = d.current.findIndex((p) => d.now >= p.from && d.now <= p.to);
  const inNow = curIdx >= 0;
  const inGroup = d.now >= first.from && d.now <= last.to; // inside the stretch, possibly between two passes
  const future = d.now < first.from;
  const partLabel = (i: number) => (i < mainIdx ? "a first dip" : i > mainIdx ? "a last pass back" : multi ? "the main stretch" : "the whole stretch");
  let lede: string;
  if (inNow) {
    const later = d.current.slice(curIdx + 1);
    lede = `Saturn is in ${s} until ${fmtMonth(d.current[curIdx].to)}${later.length ? `, then back ${later.map(span).join(" and ")}` : ""}. If it was in ${s} when you were born, this is your return.`;
  } else if (inGroup) {
    const bi = d.current.findIndex((p) => p.from > d.now);
    lede = `Saturn is between passes through ${s}: it left in ${fmtMonth(d.current[bi - 1].to)} and comes back ${span(d.current[bi])}. If it was in ${s} when you were born, this is your return and it isn't over.`;
  } else if (future) {
    lede = `Saturn enters ${s} in ${fmtMonth(first.from)} and ${multi ? "leaves for good in" : "stays until"} ${fmtMonth(last.to)}. If it was in ${s} when you were born, that's your return.`;
  } else {
    lede = `Saturn left ${s} in ${fmtMonth(last.to)}${d.next ? ` and comes back in ${fmtMonth(d.next.from)}` : ""}. If it was in ${s} when you were born, your return either just finished or is a full cycle away; the birth years below say which.`;
  }
  const before = d.current.slice(0, mainIdx), after = d.current.slice(mainIdx + 1);
  // timeline bar across the whole current stretch (first entry to final exit)
  const t0 = Date.parse(first.from), t1 = Date.parse(last.to);
  const bars = d.current.map((p, i) => ({ left: (Date.parse(p.from) - t0) / (t1 - t0) * 100, width: (Date.parse(p.to) - Date.parse(p.from)) / (t1 - t0) * 100, main: i === mainIdx }));
  const years = `${first.from.slice(0, 4)} to ${last.to.slice(0, 4)}`;
  const title = `Saturn return in ${s}: dates, who it's for, what it asks`;
  const desc = fill(copy.meta, { years });
  const forWhom = fill(copy.forWhom, { firstBorn: list(d.firstBorn), secondBorn: list(d.secondBorn) });
  const faqLd = JSON.stringify({
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: copy.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  }).replace(/</g, "\\u003c");
  const body = html`
<section class="wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px">
  <h1 class="disp" style="margin:0;font-size:clamp(56px,8.4vw,136px);line-height:.88;letter-spacing:-.05em;font-weight:800">Saturn return<br><span style="color:#F2B544">in ${s}</span></h1>
  <p class="disp" style="margin:0;max-width:720px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">${copy.opener}</p>
  <p style="margin:0;max-width:680px;font-size:20px;line-height:1.6;color:#BDB6A8">${lede}</p>
  <div class="card" style="display:flex;flex-direction:column;gap:16px;max-width:720px">
    <label for="sd" class="disp" style="font-size:22px;font-weight:600">Is it yours? Enter your birth date.</label>
    <div style="display:flex;flex-wrap:wrap;gap:12px"><input id="sd" class="inp" type="date" name="date" required min="1920-01-01" max="2015-12-31"><a href="/#start" id="go" class="cta">Get exact dates</a></div>
    <p id="ans" class="swap" style="margin:0;font-size:18px;line-height:1.5;display:none"></p>
  </div>
</section>
<section class="wrap rv" style="padding-bottom:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
  <div class="fact"><span class="muted" style="font-size:14px">Saturn in ${s} ${inGroup ? "now" : future ? "next" : "most recently"}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(main)}</span>${before.length ? html`<span class="muted" style="font-size:14px">after a first dip, ${before.map(span).join(" and ")}</span>` : ""}${after.length ? html`<span class="muted" style="font-size:14px">then a last pass back, ${after.map(span).join(" and ")}</span>` : ""}${future && d.prev ? html`<span class="muted" style="font-size:14px">last there ${span(d.prev)}</span>` : ""}${!future && !inGroup && d.next ? html`<span class="muted" style="font-size:14px">back ${span(d.next)}</span>` : ""}</div>
  ${bornCard("First return, born", d.firstBorn)}
  ${bornCard("Second return, born", d.secondBorn)}
  <div class="fact"><span class="muted" style="font-size:14px">How long it lasts</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">About 2 to 3 years</span></div>
</section>
<section class="wrap rv" style="padding-bottom:80px">
  <p style="margin:0;max-width:720px;font-size:19px;line-height:1.6;color:#CFC8BA">${forWhom} Not sure where Saturn was? The date box above tells you.</p>
</section>
<section class="wrap rv" style="padding-bottom:96px">
  <div class="card" style="display:flex;flex-direction:column;gap:18px">
    <h2 class="disp" style="margin:0;font-size:26px;font-weight:600">When Saturn is in ${s}</h2>
    <div style="position:relative;height:56px;border-radius:14px;background:rgba(237,230,214,.05);overflow:hidden" aria-hidden="true">
      ${bars.map((b, i) => html`<div class="grow" style="position:absolute;left:${b.left.toFixed(1)}%;width:${Math.max(b.width, 1).toFixed(1)}%;top:12px;bottom:12px;border-radius:8px;background:${b.main ? "#F2B544" : "rgba(242,181,68,.45)"};animation-delay:${i * 0.3}s"></div>`)}
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:15px;color:#A7A196">
      ${d.current.map((p, i) => html`<span>${span(p)}, ${partLabel(i)}</span>`)}
    </div>
  </div>
</section>
<article class="art wrap" style="padding-bottom:96px;display:flex;flex-direction:column;gap:22px">
  <h2 class="rv">What it tends to be about</h2>
  <p class="rv">${copy.about}</p>
  <p class="rv">${copy.questions}</p>
  <h2 class="rv">Why it lasts years, not days</h2>
  <p class="rv">Saturn takes about 29 years to circle the zodiac and moves slowly enough to cross the same degree up to three times as it goes retrograde and direct again. Your exact passes depend on the degree Saturn held on the day you were born, which is why two people born a year apart get different dates.</p>
  <div class="rv" style="margin-top:12px"><a href="/#start" class="cta">Find your exact passes</a></div>
</article>
<section id="faq" class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Questions people with Saturn in ${s} ask</h2>
  <div style="max-width:820px">${copy.faq.map(([q, a], i) => html`<div class="rv" style="border-bottom:1px solid rgba(237,230,214,.14);${i === 0 ? "border-top:1px solid rgba(237,230,214,.14);" : ""}"><button type="button" class="faqb ${i === 0 ? "open" : ""}" aria-expanded="${i === 0}">${q}<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4v14M4 11h14"/></svg></button><p class="faqa ${i === 0 ? "open" : ""}">${a}</p></div>`)}</div>
</section>
<script type="application/ld+json">${raw(faqLd)}</script>
<section class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:26px;font-weight:600">Saturn return by sign</h2>
  <div class="rv" style="display:flex;flex-wrap:wrap;gap:10px">${SIGNS.map((x) => html`<a href="/saturn-return/saturn-in/${x.toLowerCase()}" class="sign ${x === s ? "cur" : ""}" ${x === s ? 'aria-current="page"' : ""}>${x}</a>`)}</div>
</section>`;
  const script = `
(function(){var SIGN=${JSON.stringify(s)};var i=document.getElementById('sd'),a=document.getElementById('ans'),go=document.getElementById('go');var tm;
go.addEventListener('click',function(e){if(i.value){e.preventDefault();location.href='/?d='+i.value+'#start'}});
i.addEventListener('change',function(){clearTimeout(tm);if(!i.value)return;tm=setTimeout(function(){fetch('/api/calc?date='+i.value).then(function(r){return r.json()}).then(function(d){if(!d||!d.sign)return;a.style.display='';a.classList.remove('swap');void a.offsetWidth;a.classList.add('swap');
if(d.sign===SIGN){a.style.color='#F2B544';a.textContent='Yes. Saturn was in '+SIGN+' when you were born, so this is your '+(d.returnNumber===1?'first':d.returnNumber===2?'second':'third')+' return.'}else{a.style.color='#EDE6D6';a.innerHTML='';a.append('Saturn was in '+d.sign+' on that date, so your return falls there. ');var l=document.createElement('a');l.href='/saturn-return/saturn-in/'+d.sign.toLowerCase();l.textContent='Saturn return in '+d.sign;a.append(l);a.append('.')}}).catch(function(){})},150)});
document.querySelectorAll('.faqb').forEach(function(b){b.addEventListener('click',function(){var open=b.classList.contains('open');document.querySelectorAll('.faqb').forEach(function(x){x.classList.remove('open');x.setAttribute('aria-expanded','false')});document.querySelectorAll('.faqa').forEach(function(x){x.classList.remove('open')});if(!open){b.classList.add('open');b.setAttribute('aria-expanded','true');b.nextElementSibling.classList.add('open')}})});
})();`;
  return shell({ title, description: desc, canonical: `${opts.siteUrl}/saturn-return/saturn-in/${s.toLowerCase()}`, og: `${opts.siteUrl}/og/${s.toLowerCase()}.png`, body, extraCss: CSS, script, nav: html`<nav class="main"><a href="/">Saturn return calculator</a><a href="#faq">Questions</a></nav>` });
}
