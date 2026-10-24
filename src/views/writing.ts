// Shown at /r/:tok while the reading is being written (and if writing failed).
import { html } from "hono/html";
import { shell } from "./theme";
import type { Computed } from "../compute";

const CSS = `
.wr{min-height:calc(100svh - 120px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:36px;padding:40px clamp(16px,4vw,48px) 80px;text-align:center}
.vb{transform-box:view-box;transform-origin:50% 50%}
.orbit{animation:orbit 9s cubic-bezier(.45,.05,.55,.95) infinite}@keyframes orbit{to{transform:rotate(360deg)}}
.dialspin{animation:dialspin 90s linear infinite}@keyframes dialspin{to{transform:rotate(360deg)}}
.halo{animation:halo 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes halo{0%,100%{opacity:.1;transform:scale(1)}50%{opacity:.28;transform:scale(1.25)}}
.tail{animation:tail 9s cubic-bezier(.45,.05,.55,.95) infinite}@keyframes tail{0%{opacity:.15}50%{opacity:.9}100%{opacity:.15}}
.ringtilt{animation:tilt 9s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes tilt{0%,100%{transform:rotate(-22deg)}50%{transform:rotate(-14deg)}}
.tw{animation:tw 3s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.15}50%{opacity:.9}}
.ping{animation:ping 4s ease-out infinite;transform-box:fill-box;transform-origin:center}@keyframes ping{0%{transform:scale(.3);opacity:.5}100%{transform:scale(2.2);opacity:0}}
.ln{opacity:.35;transition:opacity .6s,color .6s,transform .6s;transform:translateY(0)}.ln.on{opacity:1;color:#EDE6D6}.ln.done{opacity:.55;color:#A7A196}
.chs{display:flex;gap:10px;justify-content:center}.chs i{width:10px;height:10px;border-radius:50%;background:rgba(237,230,214,.12);transition:background .6s,transform .6s}.chs i.on{background:#F2B544;transform:scale(1.25)}
.dots::after{content:'';animation:dots 1.6s steps(4,end) infinite}@keyframes dots{0%{content:''}25%{content:'.'}50%{content:'..'}75%{content:'...'}}
@media (prefers-reduced-motion: reduce){.ln{opacity:1;transform:none}}
`;

export function writingPage(opts: { token: string; c: Computed; state: "writing" | "failed"; supportEmail: string }) {
  const { c } = opts;
  const angle = opts.state === "writing" ? 0 : 140;
  const body = html`
<section class="wr">
  <svg viewBox="0 0 600 600" style="width:min(300px,60vw);height:min(300px,60vw);overflow:visible" aria-hidden="true">
    <g style="opacity:.9"><circle class="tw" cx="62" cy="120" r="1.6" fill="#EDE6D6"/><circle class="tw" cx="540" cy="80" r="1.2" fill="#EDE6D6" style="animation-delay:1s"/><circle class="tw" cx="560" cy="470" r="1.8" fill="#EDE6D6" style="animation-delay:2s"/><circle class="tw" cx="40" cy="520" r="1.2" fill="#EDE6D6" style="animation-delay:.5s"/><circle class="tw" cx="470" cy="580" r="1.4" fill="#EDE6D6" style="animation-delay:1.6s"/><circle class="tw" cx="120" cy="20" r="1" fill="#EDE6D6" style="animation-delay:2.4s"/></g>
    <g class="vb ${opts.state === "writing" ? "dialspin" : ""}"><circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.3)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/><circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.55)" stroke-width="18" stroke-dasharray="1.6 137.6739" stroke-dashoffset="0.8"/></g>
    <circle cx="300" cy="300" r="230" fill="none" stroke="rgba(237,230,214,.18)" stroke-dasharray="2 7"/>
    <circle cx="300" cy="300" r="168" fill="none" stroke="rgba(237,230,214,.07)"/>
    ${opts.state === "writing" ? html`<circle class="ping" cx="300" cy="300" r="80" fill="none" stroke="#F2B544" stroke-width="1"/><circle class="ping" cx="300" cy="300" r="80" fill="none" stroke="#F2B544" stroke-width="1" style="animation-delay:2s"/>` : ""}
    <circle id="arc" cx="300" cy="300" r="230" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" transform="rotate(-90 300 300)" style="stroke-dasharray:0 2000;transition:stroke-dasharray 1.2s ease"/>
    <line x1="300" y1="40" x2="300" y2="100" stroke="#F2B544" stroke-width="3"/><circle cx="300" cy="300" r="8" fill="#EDE6D6"/>
    <g class="vb ${opts.state === "writing" ? "orbit" : ""}" style="transform:rotate(${angle}deg)">
      ${opts.state === "writing" ? html`<circle class="tail" cx="300" cy="300" r="230" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" stroke-dasharray="260 2000" transform="rotate(-150 300 300)"/>` : ""}
      <circle class="halo" cx="300" cy="70" r="40" fill="#F2B544"/>
      <g class="ringtilt"><ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke="#F2B544" stroke-width="3.5"/></g>
      <circle cx="300" cy="70" r="20" fill="#EDE6D6"/>
      <g class="ringtilt"><ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke="none"/><path d="M262 70 A38 10 0 0 0 338 70" fill="none" stroke="#F2B544" stroke-width="3.5"/></g>
    </g>
  </svg>
  ${opts.state === "writing" ? html`
  <div style="display:flex;flex-direction:column;gap:14px;max-width:560px">
    <h1 class="disp" style="margin:0;font-size:clamp(34px,5vw,56px);line-height:1;letter-spacing:-.035em;font-weight:700">Writing your reading<span class="dots"></span></h1>
    <p class="muted" style="margin:0;font-size:17px;line-height:1.55">Saturn in ${c.sign}, ${Math.floor(c.degree)}°. Nine chapters, every date checked against the ephemeris. Usually under a minute; this page opens it the moment it's ready.</p>
  </div>
  <div id="steps" style="display:flex;flex-direction:column;gap:12px;font-size:17px;color:#BDB6A8">
    <span class="ln on">Placing Saturn on the day you were born</span>
    <span class="ln">Tracking it through your window, retrogrades included</span>
    <span class="ln">Dating every pass${c.returnNumber === 1 ? "" : ""} and turn</span>
    <span class="ln">Weighing where it lands in your chart</span>
    <span class="ln">Writing the chapters</span>
  </div>
  <div class="chs" aria-hidden="true">${Array.from({ length: 9 }, () => html`<i></i>`)}</div>
  <p id="slow" class="muted" style="margin:0;font-size:14px;display:none">Taking longer than usual. It's still writing; you can leave this page open or come back to this link later.</p>`
  : html`
  <div style="display:flex;flex-direction:column;gap:14px;max-width:560px">
    <h1 class="disp" style="margin:0;font-size:clamp(34px,5vw,56px);line-height:1;letter-spacing:-.035em;font-weight:700">One moment.</h1>
    <p style="margin:0;font-size:17px;line-height:1.6;color:#CFC8BA">Your reading didn't write cleanly. It's paid for and nothing is lost. Try again, or email <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a> and we'll sort it by hand.</p>
  </div>
  <a href="/r/${opts.token}?retry=1" class="cta">Try again</a>`}
</section>`;
  const script = opts.state === "writing" ? `
(function(){var TOK=${JSON.stringify(opts.token)};var n=0,arc=document.getElementById('arc');
var lines=document.querySelectorAll('#steps .ln'),dots=document.querySelectorAll('.chs i'),li=0,di=0;
var stepT=setInterval(function(){if(li<lines.length-1){lines[li].classList.remove('on');lines[li].classList.add('done');li++;lines[li].classList.add('on')}else clearInterval(stepT)},2600);
var dotT=setInterval(function(){if(di<8){dots[di].classList.add('on');di++}else clearInterval(dotT)},5500);
function finish(){clearInterval(stepT);clearInterval(dotT);lines.forEach(function(l){l.classList.remove('on');l.classList.add('done')});dots.forEach(function(d){d.classList.add('on')});arc.style.strokeDasharray='1445 2000'}
function tick(){n++;arc.style.strokeDasharray=Math.min(1300,n*55)+' 2000';if(n===18)document.getElementById('slow').style.display='';if(n%50===0){location.replace('/r/'+TOK);return}
 fetch('/r/'+TOK+'/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(s){if(s.ready){finish();setTimeout(function(){location.replace('/r/'+TOK)},900)}else if(s.failed){location.replace('/r/'+TOK)}else setTimeout(tick,4000)}).catch(function(){setTimeout(tick,6000)})}
setTimeout(tick,4000)})();` : "";
  return shell({ title: opts.state === "writing" ? "Writing your reading · Rite" : "One moment · Rite", body, extraCss: CSS, script, nav: html``, noFooter: true });
}
