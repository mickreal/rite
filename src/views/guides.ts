// Evergreen explainer pages: /saturn-return/when and /saturn-return/first-vs-second.
// Every date on these pages comes from code: the cohorts from content/sign-periods.json (via signData in index.ts),
// Saturn's position today from saturnLongitude, the worked examples from compute(), the ages from content/return-ages.ts.
import { html, raw } from "hono/html";
import { shell, ARROW } from "./theme";
import { CSS as SIGN_CSS } from "./sign";
import { SIGNS, type Sign } from "../astro/saturn";
import { fmtMonth, fmtDay } from "../compute";
import { RETURN_AGES, WINDOW_YEARS, ageSpan } from "../content/return-ages";

export type Period = { from: string; to: string };
/** One sign's current stretch and who it is a return for. */
export interface Cohort {
  sign: Sign;
  current: Period[];     // Saturn's stretch through the sign (a first dip, the main stretch, a last pass back)
  firstBorn: Period[];   // birth ranges whose first return is this stretch
  secondBorn: Period[];
  thirdBorn: Period[];
}
export interface Example { born: string; sign: Sign; degree: number; windowStart: string; windowEnd: string; hits: string[] }
export interface WhenData { now: string; saturn: { sign: Sign; degree: number }; cohort: Cohort; next: Cohort; examples: Example[] }
export interface CompareData { now: string; saturn: { sign: Sign; degree: number }; cohorts: Cohort[] } // cohorts[0]: the sign Saturn is in today

const CSS = SIGN_CSS + `
.cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.cmp .card{display:flex;flex-direction:column;gap:14px}
.cmp h3{margin:0;font-family:'Bricolage Grotesque',serif;font-size:30px;line-height:1.05;letter-spacing:-.02em;font-weight:700}
.cmp ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;color:#CFC8BA;font-size:17px;line-height:1.5}
.cmp p{margin:0;font-size:17px;line-height:1.6;color:#CFC8BA}
.kv{display:flex;flex-direction:column;gap:2px}.kv span:first-child{font-size:14px;color:#A7A196}.kv b{font-family:'Bricolage Grotesque',serif;font-size:22px;font-weight:700;letter-spacing:-.01em}
.calc{display:flex;flex-direction:column;gap:16px;max-width:720px}
.calc .row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
@media (max-width:520px){.calc .row2{grid-template-columns:1fr}}
.related{margin:0;font-size:17px;line-height:1.6;color:#A7A196}
`;

const span = (p: Period) => `${fmtMonth(p.from)} to ${fmtMonth(p.to)}`;
const days = (p: Period) => Date.parse(p.to) - Date.parse(p.from);
const ORD = ["first", "second", "third"] as const;
/** "a, b or c" */
const orList = (ps: Period[]) => ps.length === 1 ? span(ps[0]) : `${ps.slice(0, -1).map(span).join(", ")} or ${span(ps[ps.length - 1])}`;
const whole = (c: Cohort): Period => ({ from: c.current[0].from, to: c.current[c.current.length - 1].to });
const gaps = (c: Cohort): Period[] => c.current.slice(1).map((p, i) => ({ from: c.current[i].to, to: p.from }));
const bornList = (c: Cohort, n: 1 | 2 | 3) => [c.firstBorn, c.secondBorn, c.thirdBorn][n - 1];

/** Fact card listing birth ranges: the longest stretch as the headline, the rest small (same as the sign pages). */
function bornCard(label: string, ps: Period[]) {
  if (ps.length === 0) return html`<div class="fact"><span class="muted" style="font-size:14px">${label}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">No one this cycle</span></div>`;
  const main = ps.reduce((a, b) => (days(b) > days(a) ? b : a));
  const rest = ps.filter((p) => p !== main);
  return html`<div class="fact"><span class="muted" style="font-size:14px">${label}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${span(main)}</span>${rest.length ? html`<span class="muted" style="font-size:14px">also ${rest.map(span).join(" and ")}</span>` : ""}</div>`;
}
function factCard(label: string, big: string, small?: string) {
  return html`<div class="fact"><span class="muted" style="font-size:14px">${label}</span><span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">${big}</span>${small ? html`<span class="muted" style="font-size:14px">${small}</span>` : ""}</div>`;
}

/** "Today Saturn is at 2° Aries. This stretch through Aries runs from … to …, with a break …" */
function stretchSentence(c: Cohort, saturn: { sign: Sign; degree: number }) {
  const w = whole(c), g = gaps(c);
  return `Today Saturn is at ${Math.floor(saturn.degree)}° ${saturn.sign}. This stretch through ${c.sign} runs from ${fmtMonth(w.from)} to ${fmtMonth(w.to)}${g.length ? `, with ${g.length === 1 ? "a break" : "breaks"} ${g.map((x) => `from ${fmtMonth(x.from)} to ${fmtMonth(x.to)}`).join(" and ")} when Saturn stepped out of the sign` : ""}.`;
}
/** Who this stretch is a return for, in one sentence. */
function whoSentence(c: Cohort) {
  const parts = ([1, 2, 3] as const).filter((n) => bornList(c, n).length).map((n) => `a ${ORD[n - 1]} return if you were born ${orList(bornList(c, n))}`);
  return `If Saturn was in ${c.sign} when you were born, your return is this stretch: ${parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, or ${parts[parts.length - 1]}` : parts[0]}.`;
}

const faqLd = (faq: Array<[string, string]>) => JSON.stringify({
  "@context": "https://schema.org", "@type": "FAQPage",
  mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
}).replace(/</g, "\\u003c");

function faqSection(title: string, faq: Array<[string, string]>) {
  return html`
<section id="faq" class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700">${title}</h2>
  <div style="max-width:820px">${faq.map(([q, a], i) => html`<div class="rv" style="border-bottom:1px solid rgba(237,230,214,.14);${i === 0 ? "border-top:1px solid rgba(237,230,214,.14);" : ""}"><button type="button" class="faqb ${i === 0 ? "open" : ""}" aria-expanded="${i === 0}">${q}<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4v14M4 11h14"/></svg></button><p class="faqa ${i === 0 ? "open" : ""}">${a}</p></div>`)}</div>
</section>
<script type="application/ld+json">${raw(faqLd(faq))}</script>`;
}

function signsSection(other: { href: string; label: string }) {
  return html`
<section class="wrap" style="padding-bottom:120px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:26px;font-weight:600">Saturn return by sign</h2>
  <div class="rv" style="display:flex;flex-wrap:wrap;gap:10px">${SIGNS.map((x) => html`<a href="/saturn-return/saturn-in/${x.toLowerCase()}" class="sign">${x}</a>`)}</div>
  <p class="related rv">Related: <a href="${other.href}">${other.label}</a></p>
</section>`;
}

const FAQ_JS = `document.querySelectorAll('.faqb').forEach(function(b){b.addEventListener('click',function(){var open=b.classList.contains('open');document.querySelectorAll('.faqb').forEach(function(x){x.classList.remove('open');x.setAttribute('aria-expanded','false')});document.querySelectorAll('.faqa').forEach(function(x){x.classList.remove('open')});if(!open){b.classList.add('open');b.setAttribute('aria-expanded','true');b.nextElementSibling.classList.add('open')}})});`;
const NAV = html`<nav class="main"><a href="/">Saturn return calculator</a><a href="#faq">Questions</a></nav>`;

// ---------- /saturn-return/when ----------

export function whenFaq(d: WhenData): Array<[string, string]> {
  const a = RETURN_AGES;
  return [
    ["How is a Saturn return calculated?", "Take the exact degree Saturn held on the day you were born, then find the days, about 29 and a half years later, when Saturn crosses that degree again. Rite counts the window as the whole stretch Saturn spends in your birth sign around those crossings."],
    ["How old are you at your Saturn return?", `For a first return the exact passes land between ${ageSpan(a[1].pass)}, and the whole window sits between ${ageSpan(a[1].window)}. A second return's passes land between ${ageSpan(a[2].pass)}, a third's between ${ageSpan(a[3].pass)}.`],
    ["Why does my Saturn return have three dates?", "Each year Saturn appears to slow, back up for a few months, and move forward again. If your birth degree sits inside one of those loops, Saturn crosses it three times: forward, back, and forward once more. Otherwise it crosses once."],
    ["How long does a Saturn return last?", `The window runs between ${WINDOW_YEARS[0]} and ${WINDOW_YEARS[1]} years, depending on where in the sign your Saturn sits and how the loops fall. The exact passes are the sharpest part of it, not the whole of it.`],
    [`Who is in their Saturn return right now?`, `${stretchSentence(d.cohort, d.saturn).replace(/^Today /, "")} ${whoSentence(d.cohort)}`],
    ["Do I need my birth time?", "No. Saturn moves slowly, so your dates hold without it; noon is used. With a time and place the reading can also place Saturn in a house."],
  ];
}

export function whenPage(opts: { siteUrl: string; ref?: string; d: WhenData }) {
  const { d } = opts; const c = d.cohort, n = d.next, a = RETURN_AGES;
  const faq = whenFaq(d);
  const nextOpen = n.current[0].from;
  const nextLine = `${nextOpen > d.now ? `Saturn moves into ${n.sign} in ${fmtMonth(nextOpen)}` : `Saturn first reached ${n.sign} in ${fmtMonth(nextOpen)}`} and stays until ${fmtMonth(whole(n).to)}. That stretch is the first return for anyone born ${n.firstBorn.length ? orList(n.firstBorn) : "with Saturn there in the last cycle"}${n.secondBorn.length ? `, and the second for anyone born ${orList(n.secondBorn)}` : ""}.`;
  const body = html`
<section class="wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px">
  <h1 class="disp" style="margin:0;font-size:clamp(56px,8.4vw,136px);line-height:.88;letter-spacing:-.05em;font-weight:800">When is my<br><span style="color:#F2B544">Saturn return?</span></h1>
  <p class="disp" style="margin:0;max-width:720px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">When Saturn gets back to the exact degree it held on the day you were born. It takes about 29 and a half years to get there, and the return is a season of a few years, not a single day.</p>
  <p style="margin:0;max-width:680px;font-size:20px;line-height:1.6;color:#BDB6A8">${stretchSentence(c, d.saturn)} If Saturn was in ${c.sign} when you were born, your return is open now.</p>
  <form id="start" class="card calc" method="post" action="/preview">
    <input type="hidden" name="ref" value="${opts.ref ?? ""}">
    <h2 class="disp" style="margin:0;font-size:26px;font-weight:600">Find yours</h2>
    <div class="row2">
      <div class="field"><label for="bd">Birth date</label><input id="bd" name="date" type="date" required min="1930-01-01" max="2012-12-31"></div>
      <div class="field"><label for="bt">Birth time, if you know it</label><input id="bt" name="time" type="time"></div>
    </div>
    <div class="field"><label for="bp">Birth place</label><input id="bp" name="place" type="text" required placeholder="Town or city, country" autocomplete="off"></div>
    <p id="ans" aria-live="polite" style="margin:0;font-size:18px;line-height:1.5;display:none"></p>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px"><button type="submit" class="cta" id="go">Show my Saturn return ${raw(ARROW)}</button><span style="font-size:14px;color:#A7A196">Free. No account, no email.</span></div>
  </form>
</section>
<section class="wrap rv" style="padding-bottom:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
  ${factCard("Saturn today", `${Math.floor(d.saturn.degree)}° ${d.saturn.sign}`, `as of ${fmtDay(d.now)}`)}
  ${factCard(`Saturn in ${c.sign}`, span(whole(c)), c.current.length > 1 ? `in ${c.current.length} parts: ${c.current.map(span).join(", ")}` : undefined)}
  ${bornCard("First return now, born", c.firstBorn)}
  ${bornCard("Second return now, born", c.secondBorn)}
</section>
<section class="wrap rv" style="padding-bottom:96px">
  <p style="margin:0;max-width:720px;font-size:19px;line-height:1.6;color:#CFC8BA">${nextLine} <a href="/saturn-return/saturn-in/${n.sign.toLowerCase()}">Saturn return in ${n.sign}</a>.</p>
</section>
<article class="art wrap" style="padding-bottom:64px;display:flex;flex-direction:column;gap:22px">
  <h2 class="rv">How it's worked out</h2>
  <p class="rv">Saturn takes about 29 and a half years to go once around the zodiac. Your return is the stretch when it comes back to the degree it held when you were born. Dating it takes two steps: find that birth degree, then find the days Saturn crosses it again.</p>
  <p class="rv">Every year Saturn appears to stop, go backwards for a few months, and turn forward again. If your birth degree falls where it moves straight through, you get one exact pass. If it falls inside one of those loops, you get three: forward, back, and forward once more.</p>
  <p class="rv">The passes are the sharp part. Rite counts the window as the whole stretch Saturn spends in your birth sign around them, from the day it first enters, including an early dip, to the day it leaves for good. That runs between ${WINDOW_YEARS[0]} and ${WINDOW_YEARS[1]} years.</p>
</article>
<section class="wrap rv" style="padding-bottom:96px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
  ${d.examples.map((e) => html`<div class="card" style="display:flex;flex-direction:column;gap:12px">
    <span class="muted" style="font-size:14px">Worked example: born ${fmtDay(e.born)}, noon</span>
    <span class="disp" style="font-size:26px;font-weight:700;line-height:1.15">Saturn at ${Math.floor(e.degree)}° ${e.sign}</span>
    <span style="font-size:17px;line-height:1.5;color:#CFC8BA">${e.hits.length === 1 ? "One exact pass" : `${e.hits.length === 3 ? "Three" : e.hits.length} exact passes`}: <span style="color:#F2B544;font-weight:600">${e.hits.map(fmtDay).join(", ")}</span></span>
    <span class="muted" style="font-size:15px">Window ${fmtMonth(e.windowStart)} to ${fmtMonth(e.windowEnd)}</span>
  </div>`)}
</section>
<article class="art wrap" style="padding-bottom:64px;display:flex;flex-direction:column;gap:22px">
  <h2 class="rv">The ages</h2>
  <p class="rv">Ages come from the same calculation run across every birth date since 1930. Birth time barely moves Saturn, so the dates hold without one.</p>
</article>
<section class="wrap rv" style="padding-bottom:28px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
  ${([1, 2, 3] as const).map((k) => factCard(`${ORD[k - 1][0].toUpperCase()}${ORD[k - 1].slice(1)} return`, `Passes between ${ageSpan(a[k].pass)}`, `window between ${ageSpan(a[k].window)}`))}
</section>
<section class="wrap rv" style="padding-bottom:96px">
  <p style="margin:0;max-width:720px;font-size:19px;line-height:1.6;color:#CFC8BA">Same planet, same degree, different questions each time. <a href="/saturn-return/first-vs-second">First, second and third returns compared</a>.</p>
  <div style="margin-top:28px"><a href="#start" class="cta">Find your exact passes ${raw(ARROW)}</a></div>
</section>
${faqSection("Questions about timing", faq)}
${signsSection({ href: "/saturn-return/first-vs-second", label: "First, second and third Saturn returns" })}`;
  const script = `
(function(){var $=function(s){return document.querySelector(s)};var ORD=['first','second','third'];var tm;
function T(n,p){try{window.rite&&window.rite.track(n,p)}catch(e){}}
function calc(){var d=$('#bd').value,t=$('#bt').value;if(!d)return;clearTimeout(tm);tm=setTimeout(function(){fetch('/api/calc?date='+encodeURIComponent(d)+'&time='+encodeURIComponent(t||'')).then(function(r){return r.ok?r.json():null}).then(function(c){if(!c||!c.sign)return;var a=$('#ans');a.style.display='';a.classList.remove('swap');void a.offsetWidth;a.classList.add('swap');
a.textContent='Saturn was at '+c.degree+'\\u00B0 '+c.sign+' when you were born. Your '+ORD[c.returnNumber-1]+' return window '+(c.inside?'is open now, until '+c.windowClose+'.':c.opensIn==='Closed'?'ran '+c.windowOpen+' to '+c.windowClose+'.':'opens '+c.windowOpen+' and closes '+c.windowClose+'.')+' Add your birth place for the exact passes.'}).catch(function(){})},250)}
$('#bd').addEventListener('change',calc);$('#bt').addEventListener('change',calc);
$('#start').addEventListener('submit',function(){T('preview_submit',{has_time:!!$('#bt').value,from:'when'});var b=$('#go');b.disabled=true;b.textContent='Calculating\\u2026'});
document.querySelectorAll('a[href="#start"]').forEach(function(l){l.addEventListener('click',function(e){e.preventDefault();var f=$('#start'),d=$('#bd'),p=$('#bp');if(d.value&&p.value.trim()){f.requestSubmit?f.requestSubmit():$('#go').click();return}window.scrollTo({top:Math.max(0,f.getBoundingClientRect().top+window.pageYOffset-24),behavior:'smooth'});setTimeout(function(){(!d.value?d:p).focus({preventScroll:true})},500)})});
${FAQ_JS}
})();`;
  return shell({
    title: "When is my Saturn return? Dates, ages and how it's worked out · Rite",
    description: "Your Saturn return is when Saturn gets back to its birth degree. How the dates are worked out, the ages, and who is in theirs right now.",
    canonical: `${opts.siteUrl}/saturn-return/when`, og: `${opts.siteUrl}/og.png`, body, extraCss: CSS, script, nav: NAV,
  });
}

// ---------- /saturn-return/first-vs-second ----------

const ABOUT: Record<1 | 2 | 3, { about: string; questions: string[] }> = {
  1: {
    about: "The first time adult life gets weighed properly. It tends to be about work, commitments and the shape of a life: which parts you chose and which you drifted into. The question underneath is what you are building, and whether it is yours.",
    questions: ["What am I doing only because I started?", "What would I build if it took ten years?", "Whose standards am I measuring myself against?"],
  },
  2: {
    about: "A review of what the first return set going. Less about proving, more about keeping: which structures still carry weight, what you are finished carrying, and what you want to outlast you. It tends to be quieter on the surface and more searching underneath.",
    questions: ["What have I built that still fits?", "What am I done proving, and to whom?", "What do I want to hand on?"],
  },
  3: {
    about: "For those who reach it, the third return tends to be about what is settled and what is passed on. Less about building anything new, more about meaning: what the long run added up to, and what you want people to keep from it.",
    questions: ["What do I know now that I wish I'd known at the first?", "What is finished, and can be put down?", "What do I want remembered, and by whom?"],
  },
};

export function compareFaq(d: CompareData): Array<[string, string]> {
  const a = RETURN_AGES, c = d.cohorts[0];
  const until = fmtMonth(whole(c).to);
  return [
    ["What is the difference between a first and second Saturn return?", "The mechanics are the same: Saturn back on the degree it held when you were born. What changes is what you bring to it. The first tends to ask what you will build; the second tends to ask what is worth keeping, and what you are done proving."],
    ["How old are you at your second Saturn return?", `The exact passes land between ${ageSpan(a[2].pass)}, and the whole window sits between ${ageSpan(a[2].window)}. A first return's passes land between ${ageSpan(a[1].pass)}.`],
    ["Who is having their second Saturn return now?", c.secondBorn.length ? `Saturn is in ${c.sign} until ${until}, so anyone born ${orList(c.secondBorn)}.` : `Saturn is in ${c.sign} until ${until}, and no one born in the cycle before last had Saturn there, so no one is in a second return in this stretch.`],
    ["Who is having their first Saturn return now?", c.firstBorn.length ? `Saturn is in ${c.sign} until ${until}, so anyone born ${orList(c.firstBorn)}.` : `No one this stretch: Saturn wasn't in ${c.sign} in the last cycle.`],
    ["Does everyone get a third Saturn return?", `Only those who live into their late eighties. The exact passes land between ${ageSpan(a[3].pass)}${c.thirdBorn.length ? `; right now that is anyone born ${orList(c.thirdBorn)}` : ""}.`],
    ["Is the second return easier than the first?", "Neither is easier by rule. The second usually comes with more to review and less to prove, and what it asks depends a lot on what the first one left you with."],
  ];
}

export function comparePage(opts: { siteUrl: string; d: CompareData }) {
  const { d } = opts; const a = RETURN_AGES;
  const faq = compareFaq(d);
  const body = html`
<section class="wrap" style="padding-top:40px;padding-bottom:64px;display:flex;flex-direction:column;gap:28px">
  <h1 class="disp" style="margin:0;font-size:clamp(52px,7.6vw,124px);line-height:.88;letter-spacing:-.05em;font-weight:800">First, second<br><span style="color:#F2B544">and third return</span></h1>
  <p class="disp" style="margin:0;max-width:720px;font-size:clamp(22px,2.4vw,30px);line-height:1.25;letter-spacing:-.02em;font-weight:600;color:#EDE6D6">Saturn comes back to your birth degree roughly every 29 and a half years. Most people meet it twice, some three times. Same planet, same degree, different questions.</p>
  <p style="margin:0;max-width:680px;font-size:20px;line-height:1.6;color:#BDB6A8">${stretchSentence(d.cohorts[0], d.saturn)}</p>
</section>
${d.cohorts.map((c, i) => html`
<section class="wrap rv" style="padding-bottom:${i === d.cohorts.length - 1 ? 96 : 28}px;display:flex;flex-direction:column;gap:14px">
  ${i > 0 ? html`<p style="margin:0;max-width:720px;font-size:19px;line-height:1.6;color:#CFC8BA">Saturn is also between passes through ${c.sign} (${span(whole(c))}), so its returns are still open too:</p>` : html`<h2 class="disp" style="margin:0;font-size:26px;font-weight:600">In their return right now</h2>`}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
    ${bornCard(`First return, Saturn in ${c.sign}, born`, c.firstBorn)}
    ${bornCard(`Second return, Saturn in ${c.sign}, born`, c.secondBorn)}
    ${bornCard(`Third return, Saturn in ${c.sign}, born`, c.thirdBorn)}
  </div>
</section>`)}
<section class="wrap" style="padding-bottom:96px;display:flex;flex-direction:column;gap:20px">
  <h2 class="disp rv" style="margin:0;font-size:clamp(32px,3.4vw,48px);line-height:1.05;letter-spacing:-.03em;font-weight:700">Side by side</h2>
  <div class="cmp rv">${([1, 2, 3] as const).map((k) => html`<div class="card">
    <h3>${ORD[k - 1][0].toUpperCase()}${ORD[k - 1].slice(1)} return</h3>
    <div style="display:flex;flex-wrap:wrap;gap:12px 28px"><div class="kv"><span>Exact passes, age</span><b>${ageSpan(a[k].pass, "to")}</b></div><div class="kv"><span>Whole window, age</span><b>${ageSpan(a[k].window, "to")}</b></div></div>
    <p>${ABOUT[k].about}</p>
    <span class="muted" style="font-size:14px">Questions it tends to bring</span>
    <ul>${ABOUT[k].questions.map((q) => html`<li>${q}</li>`)}</ul>
  </div>`)}</div>
</section>
<article class="art wrap" style="padding-bottom:96px;display:flex;flex-direction:column;gap:22px">
  <h2 class="rv">What stays the same</h2>
  <p class="rv">Each return is worked out the same way: the degree Saturn held when you were born, and the days it crosses that degree again. Each has one exact pass or three, and each window is the stretch Saturn spends in your birth sign around them, between ${WINDOW_YEARS[0]} and ${WINDOW_YEARS[1]} years.</p>
  <p class="rv">Your second return lands in the same sign as your first, at nearly the same degree, so the theme carries over. The difference is the years in between. Saturn describes the work, not the outcome, and by the second time you have more to look back on.</p>
  <p class="rv"><a href="/saturn-return/when">How the dates are worked out</a>, with worked examples.</p>
  <div class="rv" style="margin-top:12px"><a href="/" class="cta">Find your exact passes ${raw(ARROW)}</a></div>
</article>
${faqSection("Questions about first, second and third returns", faq)}
${signsSection({ href: "/saturn-return/when", label: "When is my Saturn return?" })}`;
  return shell({
    title: "First, second and third Saturn return: ages and what each asks · Rite",
    description: "First, second and third Saturn returns compared: the ages, what each tends to be about, and who is in theirs right now, by birth date.",
    canonical: `${opts.siteUrl}/saturn-return/first-vs-second`, og: `${opts.siteUrl}/og.png`, body, extraCss: CSS, script: `(function(){${FAQ_JS}})();`, nav: NAV,
  });
}
