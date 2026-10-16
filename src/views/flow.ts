// Mobile stepper (/start): intro → date → place → time → building → redirects to /p/:id.
import { html, raw } from "hono/html";
import { shell, MARK } from "./theme";

const CSS = `
body{min-height:100svh}
header.top,footer.bottom{display:none}
.flow{min-height:100svh;max-width:480px;margin:0 auto;display:flex;flex-direction:column;position:relative;overflow:hidden}
.step{flex:1;display:none;flex-direction:column;gap:18px;padding:52px 24px 30px;min-height:100svh;box-sizing:border-box}.step.on{display:flex}
.finp{height:60px;border-radius:16px;border:1px solid rgba(237,230,214,.2);background:#14171D;color:#EDE6D6;font:500 20px 'Hanken Grotesk',sans-serif;padding:0 18px;color-scheme:dark;width:100%;box-sizing:border-box}
.finp:focus{outline:none;border-color:#F2B544;box-shadow:0 0 0 4px rgba(242,181,68,.18)}
.fcta{height:58px;border:0;border-radius:999px;background:#F2B544;color:#14110A;font:600 18px 'Hanken Grotesk',sans-serif;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:10px;text-decoration:none}.fcta:hover{background:#FFC85C;color:#14110A}
.txt{background:none;border:0;color:#A7A196;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer;min-height:44px;padding:0 4px;text-decoration:underline;text-underline-offset:4px}
.back{width:44px;height:44px;border-radius:50%;border:1px solid rgba(237,230,214,.2);background:none;color:#EDE6D6;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}
.in{animation:in .55s cubic-bezier(.2,.8,.2,1)}@keyframes in{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}
.vb{transform-box:view-box;transform-origin:50% 50%}
.eDial{animation:eDial 1.5s cubic-bezier(.3,.6,.3,1) both}@keyframes eDial{0%{opacity:0;transform:scale(.35) rotate(-140deg)}55%{opacity:1;transform:scale(1.07) rotate(10deg)}75%{transform:scale(.97) rotate(-3deg)}100%{opacity:1;transform:none}}
.eRing{animation:eRing 1.2s cubic-bezier(.3,.6,.3,1) both}@keyframes eRing{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:none}}
.satEnter{animation:satEnter 2.6s cubic-bezier(.15,.6,.2,1) .7s both}@keyframes satEnter{0%{opacity:0;transform:rotate(-200deg)}12%{opacity:1}100%{opacity:1;transform:rotate(0)}}
.orbit{animation:orbit 38s linear 3.3s infinite}@keyframes orbit{to{transform:rotate(360deg)}}
.spin{animation:spin 2.4s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.halo{animation:halo 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}@keyframes halo{0%,100%{opacity:.1;transform:scale(1)}50%{opacity:.28;transform:scale(1.25)}}
.ln{opacity:0;animation:ln .6s ease forwards}@keyframes ln{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
.err{color:#F2B544;font-size:15px;margin:0;display:none}
@media (prefers-reduced-motion: reduce){*{animation:none!important}.w,.fade,.ln{opacity:1;transform:none}}
`;

export function flowPage(opts: { siteUrl: string; ref?: string; form?: { date?: string; place?: string; time?: string } }) {
  const f = opts.form ?? {};
  const body = html`
<div class="flow">
  <section id="s0" class="step on" style="padding-top:36px">
    <div class="disp" style="display:flex;align-items:center;gap:9px;font-size:24px;font-weight:700;letter-spacing:-.02em">${raw(MARK)}Rite</div>
    <svg viewBox="0 0 600 600" style="width:min(220px,40svh);height:min(220px,40svh);align-self:center;overflow:visible;margin:4px 0" aria-hidden="true">
      <g class="vb eDial"><circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.32)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/><circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.6)" stroke-width="18" stroke-dasharray="1.6 137.6739" stroke-dashoffset="0.8"/></g>
      <circle class="vb eRing" cx="300" cy="300" r="230" fill="none" stroke="rgba(237,230,214,.2)" stroke-dasharray="2 7" style="animation-delay:.4s"/>
      <circle class="vb eRing" cx="300" cy="300" r="150" fill="none" stroke="rgba(237,230,214,.07)" style="animation-delay:.55s"/>
      <circle class="vb eRing" cx="300" cy="300" r="8" fill="#EDE6D6" style="animation-delay:.2s"/>
      <g class="fade" style="animation-delay:1.2s"><line x1="300" y1="40" x2="300" y2="100" stroke="#F2B544" stroke-width="3"/><circle cx="300" cy="70" r="6" fill="#0E1014" stroke="#F2B544" stroke-width="3"/></g>
      <g class="vb satEnter"><g class="vb orbit"><circle class="halo" cx="300" cy="70" r="40" fill="#F2B544"/><circle cx="300" cy="70" r="20" fill="#EDE6D6"/><ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke="#F2B544" stroke-width="3.5" transform="rotate(-22 300 70)"/></g></g>
    </svg>
    <h1 class="disp" style="margin:0;font-size:46px;letter-spacing:-.045em;font-weight:700">
      <span style="display:block;overflow:hidden;font-size:.36em;font-weight:500;font-style:italic;letter-spacing:-.01em;line-height:1;color:#BDB6A8;padding:.1em 0 .12em .1em"><span class="w" style="animation-delay:.1s">Your</span></span>
      <span style="display:block;overflow:hidden;line-height:.86;padding-bottom:.04em;white-space:nowrap"><span class="w" style="animation-delay:.2s">Saturn</span> <span class="w" style="animation-delay:.3s">return,</span></span>
      <span style="display:block;overflow:hidden;font-size:1.62em;font-weight:800;letter-spacing:-.06em;line-height:.8;padding:.02em 0;color:#F2B544"><span class="w" style="animation-delay:.42s">dated.</span></span>
    </h1>
    <p class="fade" style="margin:0;font-size:16px;line-height:1.55;color:#BDB6A8;animation-delay:.7s">Your Saturn sign, your window and every exact pass. Free, in about ten seconds.</p>
    <div class="fade" style="margin-top:auto;display:flex;flex-direction:column;gap:12px;align-items:center;animation-delay:.9s">
      <button type="button" class="fcta" data-go="1">Find my dates <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5"/></svg></button>
      <span style="font-size:14px;color:#8F897E">No account, no email.</span>
    </div>
  </section>

  <form id="flowForm" method="post" action="/preview" novalidate>
    <input type="hidden" name="ref" value="${opts.ref ?? ""}">
    ${[1, 2, 3].map((n) => html`<section id="s${n}" class="step">
      <div style="display:flex;align-items:center;gap:16px">
        <button type="button" class="back" aria-label="Back" data-go="${n - 1}"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 9H3M8 4L3 9l5 5"/></svg></button>
        <div style="flex:1;display:flex;flex-direction:column;gap:8px"><span style="font-size:14px;color:#A7A196">Step ${n} of 3</span><div style="height:4px;border-radius:2px;background:rgba(237,230,214,.1);overflow:hidden"><div style="height:100%;background:#F2B544;width:${n * 33.3}%"></div></div></div>
      </div>
      ${n === 1 ? html`<div class="in" style="flex:1;display:flex;flex-direction:column;gap:18px;padding-top:44px">
        <h2 class="disp" style="margin:0;font-size:40px;line-height:1;letter-spacing:-.035em;font-weight:700">When were you born?</h2>
        <p style="margin:0;font-size:16px;line-height:1.5;color:#A7A196">Use the local date where you were born.</p>
        <label for="fd" style="position:absolute;left:-9999px">Birth date</label><input id="fd" class="finp" type="date" name="date" value="${f.date ?? ""}" min="1930-01-01" max="2012-12-31" required>
        <p class="err" id="e1">Enter your birth date.</p>
        <div style="margin-top:auto"><button type="button" class="fcta" data-go="2">Continue</button></div></div>` : n === 2 ? html`<div class="in" style="flex:1;display:flex;flex-direction:column;gap:18px;padding-top:44px">
        <h2 class="disp" style="margin:0;font-size:40px;line-height:1;letter-spacing:-.035em;font-weight:700">Where were you born?</h2>
        <p style="margin:0;font-size:16px;line-height:1.5;color:#A7A196">We look up the coordinates and time zone for you.</p>
        <label for="fp" style="position:absolute;left:-9999px">Birth place</label><input id="fp" class="finp" type="text" name="place" placeholder="Town or city" autocomplete="off" value="${f.place ?? ""}" required>
        <p class="err" id="e2">Enter the town or city you were born in.</p>
        <div style="margin-top:auto"><button type="button" class="fcta" data-go="3">Continue</button></div></div>` : html`<div class="in" style="flex:1;display:flex;flex-direction:column;gap:18px;padding-top:44px">
        <h2 class="disp" style="margin:0;font-size:40px;line-height:1;letter-spacing:-.035em;font-weight:700">What time?</h2>
        <p style="margin:0;font-size:16px;line-height:1.5;color:#A7A196">Optional. Your dates stay accurate without it; a time adds your Saturn house.</p>
        <label for="ft" style="position:absolute;left:-9999px">Birth time</label><input id="ft" class="finp" type="time" name="time" value="${f.time ?? ""}">
        <p class="err" id="e3">Something went wrong. Try again.</p>
        <div style="margin-top:auto;display:flex;flex-direction:column;gap:10px;align-items:center"><button type="submit" class="fcta">Show my Saturn return</button><button type="button" class="txt" id="notime">I don't know my birth time</button></div></div>`}
    </section>`)}
  </form>

  <section id="s4" class="step" style="align-items:center;justify-content:center;gap:34px">
    <svg viewBox="0 0 600 600" style="width:280px;height:280px;overflow:visible" aria-hidden="true">
      <circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.3)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/>
      <circle cx="300" cy="300" r="230" fill="none" stroke="rgba(237,230,214,.18)" stroke-dasharray="2 7"/>
      <circle id="barc" cx="300" cy="300" r="230" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" transform="rotate(-90 300 300)" style="stroke-dasharray:0 2000;transition:stroke-dasharray 3s cubic-bezier(.5,0,.2,1)"/>
      <line x1="300" y1="40" x2="300" y2="100" stroke="#F2B544" stroke-width="3"/><circle cx="300" cy="300" r="8" fill="#EDE6D6"/>
      <g id="bsat" class="vb spin"><circle class="halo" cx="300" cy="70" r="40" fill="#F2B544"/><circle cx="300" cy="70" r="20" fill="#EDE6D6"/><ellipse cx="300" cy="70" rx="38" ry="10" fill="none" stroke="#F2B544" stroke-width="3.5" transform="rotate(-22 300 70)"/></g>
    </svg>
    <div style="display:flex;flex-direction:column;gap:12px;text-align:center;font-size:17px;color:#BDB6A8">
      <span class="ln" style="animation-delay:.2s">Placing Saturn on the day you were born</span>
      <span class="ln" id="bl1" style="animation-delay:1.2s;color:#EDE6D6"></span>
      <span class="ln" style="animation-delay:2.2s">Tracking it forward, retrogrades included</span>
      <span class="ln" id="bl2" style="animation-delay:3.1s;color:#F2B544"></span>
    </div>
  </section>
</div>`;
  const script = `
(function(){var $=function(s){return document.querySelector(s)};var cur=0;
function show(n){cur=n;document.querySelectorAll('.step').forEach(function(s){s.classList.toggle('on',s.id==='s'+n)});window.scrollTo(0,0);var f=n===1?$('#fd'):n===2?$('#fp'):n===3?$('#ft'):null;if(f)setTimeout(function(){f.focus()},350)}
function ok(n){if(n>=2&&!/^\\d{4}-\\d{2}-\\d{2}$/.test($('#fd').value)){$('#e1').style.display='';show(1);return false}if(n>=3&&!$('#fp').value.trim()){$('#e2').style.display='';show(2);return false}return true}
document.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){var n=+b.dataset.go;if(ok(n))show(n)})});
document.querySelectorAll('.finp').forEach(function(i){i.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();var n=i.id==='fd'?2:i.id==='fp'?3:4;if(n===4)build();else if(ok(n))show(n)}})});
$('#notime').addEventListener('click',function(){$('#ft').value='';build()});
$('#flowForm').addEventListener('submit',function(e){e.preventDefault();build()});
var busy=false;
function build(){if(busy||!ok(3))return;busy=true;show(4);var NW=['','One','Two','Three','Four'];
 fetch('/api/calc?date='+encodeURIComponent($('#fd').value)+'&time='+encodeURIComponent($('#ft').value||'')).then(function(r){return r.ok?r.json():null}).then(function(c){if(!c)return;$('#bl1').textContent='Saturn in '+c.sign+', '+c.degree+'\\u00B0';var n=(c.hits||[]).length;$('#bl2').textContent=n===1?'One exact pass found':(NW[n]||n)+' exact passes found';$('#bsat').classList.remove('spin');$('#bsat').style.transition='transform 3s cubic-bezier(.5,0,.2,1)';$('#bsat').style.transform='rotate('+c.angle+'deg)';$('#barc').style.strokeDasharray=(c.angle/360*2*Math.PI*230).toFixed(1)+' 2000'}).catch(function(){});
 var t0=Date.now();fetch('/preview',{method:'POST',body:new FormData($('#flowForm')),redirect:'follow'}).then(function(r){var wait=Math.max(0,3600-(Date.now()-t0));var url=r.redirected?r.url:null;
  if(!url)return r.text().then(function(h){var m=h.match(/<p class="err">([^<]*)</);var msg=m?m[1]:'Something went wrong. Try again.';var n=/place|city|find/i.test(msg)?2:/date/i.test(msg)?1:3;$('#e'+n).textContent=msg;$('#e'+n).style.display='';busy=false;show(n)});setTimeout(function(){location.href=url},wait)}).catch(function(){$('#e3').style.display='';busy=false;show(3)})}
})();`;
  return shell({ title: "Your Saturn return, dated · Rite", body, extraCss: CSS, script, canonical: `${opts.siteUrl}/start`, og: `${opts.siteUrl}/og.png`, noFooter: true, nav: html`` });
}
