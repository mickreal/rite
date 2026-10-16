import { html, raw } from "hono/html";
import { shell, LOCK } from "./theme";
import type { Computed } from "../compute";
import { fmtDay, fmtMonth } from "../compute";
import { windowChart, fmtMonYrL, untilText } from "../astro/cycle";

const CSS = `
.pass{flex:1 1 220px;text-align:left;background:#14171D;border:1px solid rgba(237,230,214,.1);border-radius:22px;padding:20px 22px;color:#EDE6D6;cursor:pointer;display:flex;flex-direction:column;gap:6px;font-family:'Hanken Grotesk',sans-serif;transition:border-color .25s,transform .25s cubic-bezier(.2,.8,.2,1)}
.pass:hover{border-color:rgba(242,181,68,.5);transform:translateY(-3px)}.pass.on{border-color:#F2B544;background:#1A1D23}
.lock{display:flex;gap:14px;align-items:flex-start;padding:16px 0;border-top:1px solid rgba(20,17,10,.12);font-size:17px;line-height:1.45}
.lock svg{flex:0 0 auto;margin-top:3px;color:#8A6A1E}
.mk{opacity:0;animation:mk .5s ease forwards}@keyframes mk{to{opacity:1}}
`;

const PASS3 = [
  ["First contact", "Saturn reaches your natal degree for the first time. Whatever has been vague about work, home or commitments starts asking for a decision."],
  ["The backtrack", "Saturn backs over the same point in retrograde. What you started at the first pass gets tested, revised or dropped."],
  ["The settle", "The last crossing. What survived the backtrack becomes the structure you carry into the next 29 years."],
];
const PASS1 = [["The pass", "Saturn crosses your natal degree once, cleanly. There is no retrograde second look this time: what you decide here is what you build on. It tends to feel quieter than people expect, and more binding."]];
const ORD = ["first", "second", "third"];

export function resultPage(opts: { siteUrl: string; id: string; c: Computed; text: string; placeLabel: string; birthLabel: string; hasTime: boolean; reminded?: boolean; gift?: { code: string; state: "ok" | "used" | "bad"; from: string | null; message: string | null } | null; today?: Date }) {
  const { c } = opts; const w = c.window; const today = opts.today ?? new Date();
  const now = today.getTime(), open = Date.parse(w.windowStart), close = Date.parse(w.windowEnd);
  const frac = (now - open) / (close - open);
  const nextHit = w.hits.find((h) => Date.parse(h) > now);
  const lede = (() => {
    const ord = ORD[c.returnNumber - 1];
    if (now < open) return `Your ${ord} return opens ${fmtMonYrL(open)} and runs into ${fmtMonth(w.windowEnd)}. You're on the approach; the first exact pass is ${untilText(today, Date.parse(w.hits[0]))}.`;
    if (now > close) return `Your ${ord} return ran ${fmtMonYrL(open)} to ${fmtMonYrL(close)}. It's over, and the reading now reads as a retrospective.`;
    const where = frac < 0.34 ? "about a third of the way in" : frac < 0.67 ? "about halfway through" : "in the last stretch";
    return `Your ${ord} return opened in ${fmtMonYrL(open)} and runs into ${fmtMonth(w.windowEnd)}. You are ${where}${nextHit ? `, and the next exact pass is ${untilText(today, Date.parse(nextHit))}` : `; the last exact pass is behind you`}.`;
  })();
  const chart = windowChart(c.natalLon, w, today);
  const P = w.hits.length === 1 ? PASS1 : PASS3;
  const passes = w.hits.map((h, i) => ({ label: w.hits.length === 1 ? "Exact pass" : `Pass ${["one", "two", "three"][i]}`, month: fmtMonYrL(Date.parse(h)), name: P[Math.min(i, P.length - 1)][0], body: P[Math.min(i, P.length - 1)][1], x: chart.x(Date.parse(h)) }));
  const price = opts.hasTime ? 29 : 19;

  const body = html`
<section class="wrap" style="padding-top:32px;padding-bottom:40px;display:flex;flex-direction:column;gap:24px">
  <p class="muted" style="margin:0;font-size:17px">Born ${opts.birthLabel}, ${opts.placeLabel}</p>
  <h1 class="disp" style="margin:0;font-size:clamp(56px,8vw,128px);line-height:.9;letter-spacing:-.045em;font-weight:800"><span style="display:block;overflow:hidden"><span class="w">Saturn</span> <span class="w" style="animation-delay:.08s">in</span> <span class="w" style="animation-delay:.16s;color:#F2B544">${c.sign}</span></span></h1>
  <p class="disp" style="margin:0;max-width:760px;font-size:clamp(22px,2.2vw,30px);line-height:1.3;letter-spacing:-.01em">${lede}</p>
  ${opts.text ? html`<p style="margin:0;max-width:720px;font-size:19px;line-height:1.65;color:#BDB6A8">${opts.text}</p>` : ""}
</section>

<section class="wrap" style="padding-bottom:32px">
  <div style="background:#14171D;border-radius:32px;padding:clamp(20px,3vw,40px);overflow-x:auto">
    <svg viewBox="0 0 1000 300" style="width:100%;min-width:640px;display:block" role="img" aria-label="Saturn's path across your natal degree">
      <rect x="${chart.contactX0.toFixed(1)}" y="16" width="${(chart.contactX1 - chart.contactX0 + 8).toFixed(1)}" height="244" rx="8" fill="rgba(242,181,68,.06)"/>
      <line x1="40" y1="${chart.y0.toFixed(1)}" x2="960" y2="${chart.y0.toFixed(1)}" stroke="rgba(237,230,214,.4)" stroke-dasharray="4 6"/>
      <text x="958" y="${(chart.y0 - 10).toFixed(1)}" text-anchor="end" fill="#A7A196" font-size="13" font-family="Hanken Grotesk, sans-serif">your natal Saturn, ${Math.floor(c.degree)}° ${c.sign}</text>
      <line x1="40" y1="260" x2="960" y2="260" stroke="rgba(237,230,214,.15)"/>
      ${chart.yearTicks.map((t) => html`<text x="${t.x.toFixed(1)}" y="288" text-anchor="middle" fill="#6B675F" font-size="13" font-family="Hanken Grotesk, sans-serif">${t.label}</text>`)}
      ${chart.todayX > 0 ? html`<line x1="${chart.todayX.toFixed(1)}" y1="16" x2="${chart.todayX.toFixed(1)}" y2="260" stroke="#EDE6D6" stroke-width="1.5" stroke-dasharray="2 4"/><rect x="${(chart.todayX - 32).toFixed(1)}" y="2" width="64" height="24" rx="12" fill="#EDE6D6"/><text x="${chart.todayX.toFixed(1)}" y="18" text-anchor="middle" fill="#0E1014" font-size="12" font-weight="600" font-family="Hanken Grotesk, sans-serif">Today</text>` : ""}
      <path class="draw" pathLength="1000" d="${chart.path}" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${passes.map((p, i) => html`<g class="mk" style="animation-delay:${(1.6 + i * 0.5).toFixed(1)}s"><circle class="pulse pp" data-i="${i}" cx="${p.x.toFixed(1)}" cy="${chart.y0.toFixed(1)}" r="10" fill="#F2B544" style="opacity:${i === 0 ? 1 : 0}"/><circle cx="${p.x.toFixed(1)}" cy="${chart.y0.toFixed(1)}" r="8" fill="#0E1014" stroke="#F2B544" stroke-width="3"/></g>`)}
    </svg>
  </div>
</section>

<section class="wrap" style="padding-bottom:72px;display:flex;flex-direction:column;gap:20px">
  <div style="display:flex;flex-wrap:wrap;gap:16px">
    ${passes.map((p, i) => html`<button type="button" class="pass ${i === 0 ? "on" : ""}" data-i="${i}" aria-pressed="${i === 0}"><span style="font-size:14px;color:#A7A196">${p.label}</span><span class="disp" style="font-size:30px;font-weight:700;letter-spacing:-.02em">${p.month}</span></button>`)}
  </div>
  <div id="passInfo" class="swap" style="border-top:1px solid rgba(237,230,214,.12);padding-top:28px;display:flex;flex-wrap:wrap;gap:20px 56px;align-items:flex-start">
    <div style="flex:0 1 320px;display:flex;flex-direction:column;gap:10px">
      <h2 id="passName" class="disp" style="margin:0;font-size:40px;letter-spacing:-.03em;font-weight:700;line-height:1">${passes[0].name}</h2>
      <span style="display:inline-flex;align-items:center;gap:8px;font-size:15px;color:#A7A196">${raw(LOCK)}Exact day in the full reading</span>
    </div>
    <p id="passBody" style="margin:0;flex:1 1 360px;font-size:19px;line-height:1.6;color:#BDB6A8">${passes[0].body}</p>
  </div>
</section>

<section class="wrap" style="padding-bottom:120px;display:flex;flex-wrap:wrap;gap:20px">
  <div data-rv class="rv" style="flex:1 1 340px;background:#14171D;border-radius:28px;padding:32px;display:flex;flex-direction:column;gap:16px">
    <h3 class="disp" style="margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em">Share your dates</h3>
    <p style="margin:0;font-size:16px;line-height:1.55;color:#BDB6A8">A card with your sign and passes. No birth details on it.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a href="/card/${opts.id}.svg" download="rite-saturn-return.svg" class="ghost"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 2v10M5 6l4-4 4 4M3 11v4h12v-4"/></svg>Make my card</a><button type="button" id="shareBtn" class="ghost" data-url="${opts.siteUrl}/?r=share&utm_source=share&utm_medium=result&utm_campaign=${c.sign.toLowerCase()}" data-text="Saturn in ${c.sign}. My Saturn return ${c.window.hits.length === 1 ? "hits" : "hits first"} ${fmtMonYrL(Date.parse(c.window.hits[0]))}. Find yours free:">Share</button><span id="shareDone" class="muted" style="font-size:14px;align-self:center;display:none">Link copied</span></div>
  </div>
  <div id="remind" class="rv" style="flex:1 1 440px;background:#14171D;border-radius:28px;padding:32px;display:flex;flex-direction:column;gap:16px;scroll-margin-top:24px">
    <h3 class="disp" style="margin:0;font-size:26px;font-weight:600;letter-spacing:-.02em">Get a heads-up before each pass</h3>
    ${opts.reminded ? html`<p class="swap" style="margin:0;font-size:17px;line-height:1.55">Done. ${nextHit ? `The first one lands a week before your ${fmtMonYrL(Date.parse(nextHit))} pass.` : "Nothing ahead to remind you of — your passes are behind you."}</p>` : html`
    <form method="post" action="/remind" style="display:flex;flex-wrap:wrap;gap:12px"><input type="hidden" name="preview" value="${opts.id}"><label for="em" style="position:absolute;left:-9999px">Email</label><input id="em" name="email" class="inp" type="email" required placeholder="you@example.com"><button type="submit" class="ghost" style="min-height:52px">Remind me</button></form>
    <p style="margin:0;font-size:14px;color:#8F897E">${w.hits.length === 1 ? "One email, a week before your pass." : "Up to three emails, one a week before each pass."} Nothing else unless you ask.</p>`}
  </div>
</section>

<section class="wrap" style="padding-bottom:120px">
  <div class="rv" style="background:#EDE6D6;color:#14110A;border-radius:40px;padding:clamp(32px,5vw,72px);display:flex;flex-wrap:wrap;gap:48px 72px">
    <div style="flex:1 1 380px;display:flex;flex-direction:column;gap:20px">
      <h2 class="disp" style="margin:0;font-size:clamp(40px,4.6vw,64px);line-height:1;letter-spacing:-.03em;font-weight:700">Your full reading</h2>
      <p style="margin:0;font-size:18px;line-height:1.6;color:rgba(20,17,10,.72);max-width:440px">Everything above, plus the exact days, ${opts.hasTime ? "your Saturn house" : "every month of your window"} and what to do in each phase. Built from this chart, ready the moment you pay.</p>
      <div style="display:flex;align-items:baseline;gap:14px;margin-top:8px"><span class="disp" style="font-size:88px;font-weight:800;letter-spacing:-.05em;line-height:.85">$${price}</span><span style="font-size:16px;color:rgba(20,17,10,.7)">once, no subscription</span></div>
      ${opts.gift?.state === "ok" ? html`<form method="post" action="/redeem" style="display:flex;flex-direction:column;gap:12px;max-width:440px"><input type="hidden" name="preview" value="${opts.id}"><input type="hidden" name="gift" value="${opts.gift.code}">
        <p style="margin:0;font-size:16px;line-height:1.5;color:#14110A"><b>This one's a gift${opts.gift.from ? ` from ${opts.gift.from}` : ""}.</b> Nothing to pay. Where should the link go?</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px"><label for="gfn" style="position:absolute;left:-9999px">First name</label><input id="gfn" name="first_name" class="inp" type="text" placeholder="First name (optional)" style="flex:1 1 160px;background:#fff;color:#14110A;border-color:rgba(20,17,10,.25)"><label for="gem" style="position:absolute;left:-9999px">Email</label><input id="gem" name="email" class="inp" type="email" required placeholder="Your email" style="flex:2 1 220px;background:#fff;color:#14110A;border-color:rgba(20,17,10,.25)"></div>
        <div><button type="submit" class="cta dark">Open my reading</button></div></form>`
      : html`<form method="post" action="/checkout" style="display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center"><input type="hidden" name="preview" value="${opts.id}"><button type="submit" class="cta dark">Unlock the full reading</button><a href="/gift" style="color:#14110A;font-weight:500">Buy one as a gift</a></form>
      ${opts.gift?.state === "used" ? html`<p style="margin:0;font-size:15px;color:#8A3B1E">That gift code has already been used.</p>` : opts.gift?.state === "bad" ? html`<p style="margin:0;font-size:15px;color:#8A3B1E">That gift code doesn't match anything. Check it and try the link again.</p>` : ""}
      <p style="margin:0;font-size:14px;color:rgba(20,17,10,.6)">Not useful? Full refund within 14 days.${opts.hasTime ? "" : " Add a birth time first and the house chapter comes with it, $29."}</p>`}
    </div>
    <div style="flex:1 1 380px;display:flex;flex-direction:column">
      <div class="lock">${raw(LOCK)}<span><strong>Your Saturn.</strong> Sign${opts.hasTime ? ", house" : ""} and the exact degree your return is measured against.</span></div>
      <div class="lock">${raw(LOCK)}<span><strong>The window.</strong> How your return opens, peaks and closes, phase by phase.</span></div>
      <div class="lock">${raw(LOCK)}<span><strong>Every pass, to the day.</strong> ${w.hits.length === 1 ? "The crossing dated, and the retrograde turn that comes closest" : "All three crossings dated"}, with what each tends to ask of you.</span></div>
      <div class="lock">${raw(LOCK)}<span><strong>The checkpoints.</strong> Saturn's squares and opposition at about 7, 14 and 21.</span></div>
      <div class="lock" style="border-bottom:1px solid rgba(20,17,10,.12)">${raw(LOCK)}<span><strong>What to do with it.</strong> Month by month, plus a workbook for each phase.</span></div>
    </div>
  </div>
</section>`;

  const script = `
function T(n,p){try{window.rite&&window.rite.track(n,p)}catch(e){}}
document.querySelectorAll('form[action="/checkout"]').forEach(function(f){f.addEventListener('submit',function(){T('checkout_click',{has_time:${opts.hasTime ? "true" : "false"}})})});document.querySelectorAll('form[action="/remind"]').forEach(function(f){f.addEventListener('submit',function(){T('remind_submit')})});document.querySelectorAll('a[href="/gift"]').forEach(function(a){a.addEventListener('click',function(){T('gift_click')})});document.querySelectorAll('a[download]').forEach(function(a){a.addEventListener('click',function(){T('share_card')})});
var sb=document.getElementById('shareBtn');if(sb)sb.addEventListener('click',function(){var d={title:'Rite: Saturn return, dated',text:sb.dataset.text,url:sb.dataset.url};T('share_click',{native:!!navigator.share});if(navigator.share){navigator.share(d).catch(function(){})}else if(navigator.clipboard){navigator.clipboard.writeText(d.text+' '+d.url).then(function(){var k=document.getElementById('shareDone');k.style.display='';setTimeout(function(){k.style.display='none'},2500)})}});
(function(){var P=${JSON.stringify(passes.map((p) => ({ name: p.name, body: p.body })))};
document.querySelectorAll('.pass').forEach(function(b){b.addEventListener('click',function(){var i=+b.dataset.i;document.querySelectorAll('.pass').forEach(function(x){x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',x===b)});document.querySelectorAll('.pp').forEach(function(c){c.style.opacity=+c.dataset.i===i?1:0});document.getElementById('passName').textContent=P[i].name;document.getElementById('passBody').textContent=P[i].body;var el=document.getElementById('passInfo');el.classList.remove('swap');void el.offsetWidth;el.classList.add('swap')})});
})();`;

  return shell({
    title: `Saturn in ${c.sign} — your return, dated · Rite`, body, extraCss: CSS, script,
    description: lede,
    nav: html`<nav class="main"><a href="/">Check another birthday</a></nav>`,
  });
}
