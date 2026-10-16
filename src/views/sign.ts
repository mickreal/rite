import { html } from "hono/html";
import { shell } from "./theme";
import { SIGNS, type Sign } from "../astro/saturn";
import { SIGN_PAGES } from "../content/signs";
import { fmtMonth } from "../compute";

export interface SignPageData {
  sign: Sign;
  current: Array<{ from: string; to: string }>;   // the transit(s) through the sign that make up the return happening now / next (incl. a dip)
  firstBorn: Array<{ from: string; to: string }>; // birth ranges whose first return this is
  secondBorn: Array<{ from: string; to: string }>;
  now: string;                                    // YYYY-MM-DD
}

const CSS = `
.fact{background:#14171D;border-radius:24px;padding:24px;display:flex;flex-direction:column;gap:8px}
.art p{margin:0;font-size:19px;line-height:1.7;color:#CFC8BA;max-width:680px}
.art h2{margin:24px 0 0;font-family:'Bricolage Grotesque',serif;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700;color:#EDE6D6}
.sign{min-height:48px;padding:0 20px;border-radius:999px;border:1px solid rgba(237,230,214,.18);color:#EDE6D6;text-decoration:none;display:inline-flex;align-items:center;font-weight:500;transition:border-color .2s,background .2s}
.sign:hover{color:#EDE6D6;border-color:#F2B544;background:rgba(242,181,68,.08)}.sign.cur{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.grow{transform-origin:left center;animation:grow 1.4s cubic-bezier(.3,.7,.2,1) both}@keyframes grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
`;

const span = (p: { from: string; to: string }) => `${fmtMonth(p.from)} to ${fmtMonth(p.to)}`;

export function signPage(opts: { siteUrl: string; d: SignPageData }) {
  const { d } = opts; const s = d.sign; const copy = SIGN_PAGES[s];
  const main = d.current[d.current.length - 1];
  const inNow = d.current.some((p) => d.now >= p.from && d.now <= p.to);
  const lede = inNow ? `Saturn is in ${s} until ${fmtMonth(main.to)}. If it was in ${s} when you were born, this is your return.`
    : d.now < d.current[0].from ? `Saturn enters ${s} in ${fmtMonth(d.current[0].from)} and stays until ${fmtMonth(main.to)}. If it was in ${s} when you were born, that's your return.`
    : `Saturn left ${s} in ${fmtMonth(main.to)}. If it was in ${s} when you were born, your return is over; Saturn comes back in about 29 years.`;
  // timeline bar across the whole current stretch (first dip to final exit)
  const t0 = Date.parse(d.current[0].from), t1 = Date.parse(main.to);
  const bars = d.current.map((p, i) => ({ left: (Date.parse(p.from) - t0) / (t1 - t0) * 100, width: (Date.parse(p.to) - Date.parse(p.from)) / (t1 - t0) * 100, main: i === d.current.length - 1 }));
  const title = `Saturn return in ${s}: dates, who it's for, what it asks`;
  const desc = `${lede} Enter your birth date and get your exact passes free.`;
  const body = html`
<section class="wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px">
  <h1 class="disp" style="margin:0;font-size:clamp(56px,8.4vw,136px);line-height:.88;letter-spacing:-.05em;font-weight:800">Saturn return<br><span style="color:#F2B544">in ${s}</span></h1>
  <p style="margin:0;max-width:680px;font-size:20px;line-height:1.6;color:#BDB6A8">${lede}</p>
  <div class="card" style="display:flex;flex-direction:column;gap:16px;max-width:720px">
    <label for="sd" class="disp" style="font-size:22px;font-weight:600">Is it yours? Enter your birth date.</label>
    <div style="display:flex;flex-wrap:wrap;gap:12px"><input id="sd" class="inp" type="date" name="date" required min="1920-01-01" max="2015-12-31"><a href="/#start" id="go" class="cta">Get exact dates</a></div>
    <p id="ans" class="swap" style="margin:0;font-size:18px;line-height:1.5;display:none"></p>
  </div>
</section>
<section class="wrap rv" style="padding-bottom:80px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
  <div class="fact"><span class="muted" style="font-size:14px">Saturn in ${s} ${inNow ? "now" : d.now < d.current[0].from ? "next" : "most recently"}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(main)}</span>${d.current.length > 1 ? html`<span class="muted" style="font-size:14px">after a first dip, ${span(d.current[0])}</span>` : ""}</div>
  <div class="fact"><span class="muted" style="font-size:14px">First return, born</span>${d.firstBorn.map((p, i) => i === 0 ? html`<span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(p)}</span>` : html`<span class="muted" style="font-size:14px">and ${span(p)}</span>`)}</div>
  <div class="fact"><span class="muted" style="font-size:14px">Second return, born</span>${d.secondBorn.map((p, i) => i === 0 ? html`<span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(p)}</span>` : html`<span class="muted" style="font-size:14px">and ${span(p)}</span>`)}</div>
  <div class="fact"><span class="muted" style="font-size:14px">How long it lasts</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">About 2 to 3 years</span></div>
</section>
<section class="wrap rv" style="padding-bottom:96px">
  <div class="card" style="display:flex;flex-direction:column;gap:18px">
    <h2 class="disp" style="margin:0;font-size:26px;font-weight:600">When Saturn is in ${s}</h2>
    <div style="position:relative;height:56px;border-radius:14px;background:rgba(237,230,214,.05);overflow:hidden" aria-hidden="true">
      ${bars.map((b, i) => html`<div class="grow" style="position:absolute;left:${b.left.toFixed(1)}%;width:${Math.max(b.width, 1).toFixed(1)}%;top:12px;bottom:12px;border-radius:8px;background:${b.main ? "#F2B544" : "rgba(242,181,68,.45)"};animation-delay:${i * 0.3}s"></div>`)}
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:15px;color:#A7A196">
      ${d.current.map((p, i) => html`<span>${span(p)}, ${i === d.current.length - 1 ? (d.current.length > 1 ? "the main stretch" : "the whole stretch") : "a first dip"}</span>`)}
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
<section class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:26px;font-weight:600">Saturn return by sign</h2>
  <div class="rv" style="display:flex;flex-wrap:wrap;gap:10px">${SIGNS.map((x) => html`<a href="/saturn-return/saturn-in/${x.toLowerCase()}" class="sign ${x === s ? "cur" : ""}" ${x === s ? 'aria-current="page"' : ""}>${x}</a>`)}</div>
</section>`;
  const script = `
(function(){var SIGN=${JSON.stringify(s)};var i=document.getElementById('sd'),a=document.getElementById('ans'),go=document.getElementById('go');var tm;
go.addEventListener('click',function(e){if(i.value){e.preventDefault();location.href='/?d='+i.value+'#start'}});
i.addEventListener('change',function(){clearTimeout(tm);if(!i.value)return;tm=setTimeout(function(){fetch('/api/calc?date='+i.value).then(function(r){return r.json()}).then(function(d){if(!d||!d.sign)return;a.style.display='';a.classList.remove('swap');void a.offsetWidth;a.classList.add('swap');
if(d.sign===SIGN){a.style.color='#F2B544';a.textContent='Yes. Saturn was in '+SIGN+' when you were born, so this is your '+(d.returnNumber===1?'first':d.returnNumber===2?'second':'third')+' return.'}else{a.style.color='#EDE6D6';a.innerHTML='';a.append('Saturn was in '+d.sign+' on that date, so your return falls there. ');var l=document.createElement('a');l.href='/saturn-return/saturn-in/'+d.sign.toLowerCase();l.textContent='Saturn return in '+d.sign;a.append(l);a.append('.')}}).catch(function(){})},150)});
})();`;
  return shell({ title, description: desc, canonical: `${opts.siteUrl}/saturn-return/saturn-in/${s.toLowerCase()}`, og: `${opts.siteUrl}/og/${s.toLowerCase()}.png`, body, extraCss: CSS, script, nav: html`<nav class="main"><a href="/">Saturn return calculator</a></nav>` });
}
