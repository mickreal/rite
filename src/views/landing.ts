import { html, raw } from "hono/html";
import { shell, ARROW, MARK } from "./theme";

const CSS = `
.artLayer{position:sticky;top:0;height:100vh;margin-bottom:-100vh;pointer-events:none;z-index:0}
.artInner{max-width:1240px;height:100%;margin:0 auto;padding:104px clamp(16px,4vw,48px);display:flex;align-items:center;justify-content:flex-end}
.art{width:max(240px,min(540px,42vw,calc(100svh - 330px)));display:flex;flex-direction:column;align-items:center;gap:clamp(14px,2.6vh,26px)}
.hero{position:relative;z-index:1;max-width:1240px;margin:0 auto;padding:104px clamp(16px,4vw,48px);min-height:100svh;display:flex;align-items:center}
.heroText{width:fit-content;max-width:min(620px,52%);display:flex;flex-direction:column;gap:clamp(18px,3.4vh,32px)}
.linger{height:28vh}
.hint{color:#6B675F;font-size:14px;line-height:1.6;text-align:center;margin:-8px 0 0}
.ctaRow{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
.topbar{position:absolute;top:0;left:0;right:0;z-index:3}
@media (max-width:900px){
.artLayer{position:relative;height:auto;margin-bottom:0;pointer-events:auto}
.artInner{justify-content:center;padding:8px clamp(16px,4vw,48px) 0}
.art{width:min(440px,100%)}
.hero{min-height:0;display:block;padding:24px clamp(16px,4vw,48px) 96px}
.heroText{max-width:none;width:auto}
.linger{display:none}
.topbar{position:relative}
}
.vb{transform-box:view-box;transform-origin:50% 50%}
.eDial{animation:eDial 1.5s cubic-bezier(.3,.6,.3,1) both}
@keyframes eDial{0%{opacity:0;transform:scale(.35) rotate(-140deg)}55%{opacity:1;transform:scale(1.07) rotate(10deg)}75%{transform:scale(.97) rotate(-3deg)}100%{opacity:1;transform:none}}
.eRing{animation:eRing 1.2s cubic-bezier(.3,.6,.3,1) both}
@keyframes eRing{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.05)}100%{opacity:1;transform:none}}
.eF{animation:fIn 1s ease both}
.eDrop{animation:eDrop .8s cubic-bezier(.2,1.5,.4,1) both}
@keyframes eDrop{from{opacity:0;transform:translateY(-36px)}to{opacity:1;transform:none}}
.satEnter{animation:satEnter 2.6s cubic-bezier(.15,.6,.2,1) .7s both}
@keyframes satEnter{0%{opacity:0;transform:rotate(-200deg)}12%{opacity:1}100%{opacity:1;transform:rotate(0)}}
.pIn{transform-box:fill-box;transform-origin:center;animation:pIn 1.3s cubic-bezier(.2,1.4,.4,1) .9s both}
@keyframes pIn{from{transform:scale(0)}to{transform:scale(1)}}
.sat.free{animation:orbit 38s linear 3.3s infinite}
.sat.set{animation:none;transition:transform 1.6s cubic-bezier(.3,.7,.2,1)}
@keyframes orbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.arc{transition:stroke-dasharray 1.6s cubic-bezier(.3,.7,.2,1)}
.halo{animation:halo 3.2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes halo{0%,100%{opacity:.10;transform:scale(1)}50%{opacity:.28;transform:scale(1.25)}}
.ping{animation:ping 4s ease-out infinite;transform-box:fill-box;transform-origin:center}.ping.b{animation-delay:2s}
@keyframes ping{0%{opacity:.5;transform:scale(.2)}100%{opacity:0;transform:scale(1)}}
.tw{animation:tw 3s ease-in-out infinite}@keyframes tw{0%,100%{opacity:.2}50%{opacity:.9}}
.ringtilt{animation:tilt 9s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes tilt{0%,100%{transform:rotate(-22deg)}50%{transform:rotate(-14deg)}}
@supports (animation-timeline: scroll()){.dial{animation:spin linear both;animation-timeline:scroll()}@keyframes spin{to{transform:rotate(140deg)}}}
.rd0{display:flex;align-items:center;gap:12px;font-size:17px;color:#BDB6A8;white-space:nowrap}
.dot{width:8px;height:8px;border-radius:50%;background:#F2B544;flex:0 0 auto;animation:dotp 2s ease-in-out infinite}
@keyframes dotp{0%,100%{box-shadow:0 0 0 0 rgba(242,181,68,.5)}50%{box-shadow:0 0 0 8px rgba(242,181,68,0)}}
.rd1{display:flex;align-items:center;gap:18px}
.glyph{opacity:0}.in .glyph{animation:glyph 1.1s cubic-bezier(.2,1.3,.4,1) .25s both}
@keyframes glyph{from{opacity:0;transform:scale(.4) rotate(-120deg)}to{opacity:1;transform:none}}
.ringd{stroke-dasharray:440;stroke-dashoffset:440}.in .ringd{animation:ringd 1.4s cubic-bezier(.4,.1,.2,1) .35s forwards}
@keyframes ringd{to{stroke-dashoffset:0}}
.fillt{transform:scaleX(0);transform-origin:left center}.in .fillt{animation:fillt 1.4s cubic-bezier(.4,.1,.2,1) .45s forwards}
@keyframes fillt{to{transform:scaleX(1)}}
.popd{opacity:0}.in .popd{animation:popd .7s cubic-bezier(.2,1.6,.4,1) 1.7s both}
@keyframes popd{from{opacity:0;transform:scale(0)}to{opacity:1;transform:none}}
.drawp{stroke-dasharray:900;stroke-dashoffset:900}.in .drawp{animation:draw 2.2s cubic-bezier(.4,.1,.2,1) .5s forwards}
.pg{position:absolute;width:300px;height:400px;border-radius:14px;background:#EDE6D6;color:#14110A;box-shadow:0 30px 60px rgba(0,0,0,.45);padding:28px;display:flex;flex-direction:column;gap:14px;opacity:0}
.bar{height:8px;border-radius:4px;background:rgba(20,17,10,.14)}
.in .p1{animation:pg1 1.6s cubic-bezier(.3,.7,.2,1) both}.in .p3{animation:pg3 1.6s cubic-bezier(.3,.7,.2,1) .1s both}.in .p2{animation:pg2 1.1s cubic-bezier(.2,1.2,.4,1) .2s both}
@keyframes pg1{0%{opacity:0;transform:translateY(180px) rotate(-18deg)}50%{opacity:1;transform:none}100%{opacity:1;transform:translate(-120px,24px) rotate(-9deg)}}
@keyframes pg3{0%{opacity:0;transform:translateY(180px) rotate(18deg)}50%{opacity:1;transform:none}100%{opacity:1;transform:translate(120px,24px) rotate(9deg)}}
@keyframes pg2{from{opacity:0;transform:translateY(200px) rotate(6deg)}to{opacity:1;transform:none}}
.chap{display:flex;flex-wrap:wrap;gap:6px 24px;padding:22px 0;border-top:1px solid rgba(237,230,214,.12)}
.tick{display:flex;gap:12px;align-items:flex-start;font-size:17px;line-height:1.5}
.age{background:none;border:0;cursor:pointer;padding:0;text-align:left;color:#3A3D44;transition:color .4s;font-variant-numeric:tabular-nums;font-family:'Bricolage Grotesque',serif;font-size:clamp(110px,16vw,240px);font-weight:800;letter-spacing:-.05em;line-height:.85;min-width:1.15em}
.age:hover{color:#6B6E75}.age.on{color:#F2B544}
.faqb{width:100%;background:none;border:0;color:#EDE6D6;text-align:left;cursor:pointer;padding:26px 0;display:flex;justify-content:space-between;align-items:center;gap:24px;font:600 22px 'Bricolage Grotesque',serif;letter-spacing:-.01em}
.faqb:hover{color:#F2B544}.faqb svg{flex:0 0 auto;transition:transform .35s cubic-bezier(.2,.8,.2,1)}.faqb.open svg{transform:rotate(45deg)}
.faqa{display:none;margin:0;padding:0 48px 28px 0;font-size:18px;line-height:1.6;color:#BDB6A8}.faqa.open{display:block;animation:swap .5s cubic-bezier(.2,.8,.2,1)}
.row{opacity:0}.in .row{animation:aIn .8s cubic-bezier(.2,.8,.2,1) both}
.mq{display:flex;width:max-content;animation:mq 70s linear infinite}@keyframes mq{to{transform:translateX(-50%)}}
.echoLine{opacity:0}.in .echoLine{animation:fIn 1.2s ease 2.6s both}
.nw{white-space:nowrap}@media (max-width:520px){.nw{white-space:normal}}
@media (max-width:900px){.echo{right:-360px!important;opacity:.7}}
`;

const ORBIT = `<svg viewBox="0 0 600 600" style="width:100%;height:100%;display:block;overflow:visible" role="img" aria-label="Saturn orbiting back toward the point it held when you were born">
<g class="eF" style="animation-delay:1.2s">
<circle class="tw" cx="62" cy="120" r="1.6" fill="#EDE6D6"/><circle class="tw" cx="540" cy="80" r="1.2" fill="#EDE6D6" style="animation-delay:1s"/><circle class="tw" cx="560" cy="470" r="1.8" fill="#EDE6D6" style="animation-delay:2s"/><circle class="tw" cx="40" cy="520" r="1.2" fill="#EDE6D6" style="animation-delay:.5s"/><circle class="tw" cx="470" cy="580" r="1.4" fill="#EDE6D6" style="animation-delay:1.6s"/><circle class="tw" cx="120" cy="20" r="1" fill="#EDE6D6" style="animation-delay:2.4s"/>
</g>
<circle class="vb eRing" cx="300" cy="300" r="288" fill="none" stroke="rgba(237,230,214,.08)" style="animation-delay:.35s"/>
<g class="vb eDial"><g class="dial vb">
<circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.32)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/>
<circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.6)" stroke-width="18" stroke-dasharray="1.6 137.6739" stroke-dashoffset="0.8"/>
</g></g>
<circle class="vb eRing" cx="300" cy="300" r="230" fill="none" stroke="rgba(237,230,214,.2)" stroke-dasharray="2 7" style="animation-delay:.5s"/>
<circle class="vb eRing" cx="300" cy="300" r="168" fill="none" stroke="rgba(237,230,214,.07)" style="animation-delay:.62s"/>
<circle class="vb eRing" cx="300" cy="300" r="108" fill="none" stroke="rgba(237,230,214,.05)" style="animation-delay:.74s"/>
<circle id="arc" class="arc eF" cx="300" cy="300" r="230" fill="none" stroke="#F2B544" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 300 300)" style="stroke-dasharray:0 2000;animation-delay:2.6s"/>
<g class="eF" style="animation-delay:2.2s"><circle class="ping" cx="300" cy="300" r="80" fill="none" stroke="#F2B544" stroke-width="1"/><circle class="ping b" cx="300" cy="300" r="80" fill="none" stroke="#F2B544" stroke-width="1"/></g>
<circle class="vb eRing" cx="300" cy="300" r="7" fill="#EDE6D6" style="animation-delay:.2s"/>
<g class="eDrop" style="animation-delay:1.3s"><line x1="300" y1="40" x2="300" y2="100" stroke="#F2B544" stroke-width="2"/><circle cx="300" cy="70" r="5" fill="#0E1014" stroke="#F2B544" stroke-width="2"/></g>
<g class="vb satEnter"><g id="sat" class="sat vb free" style="transform:rotate(0deg)">
<g class="pIn"><circle class="halo" cx="300" cy="70" r="34" fill="#F2B544"/><circle cx="300" cy="70" r="17" fill="#EDE6D6"/><path d="M285 64 Q300 60 315 64" stroke="rgba(14,16,20,.18)" stroke-width="2.5" fill="none"/><path d="M284 74 Q300 78 316 74" stroke="rgba(14,16,20,.12)" stroke-width="2" fill="none"/><g class="ringtilt"><ellipse cx="300" cy="70" rx="32" ry="8" fill="none" stroke="#F2B544" stroke-width="2.5"/></g></g>
</g></g>
</svg>`;

const SATURN_TICK = `<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true" style="flex:0 0 auto;margin-top:1px"><circle cx="13" cy="11" r="4.5" fill="#8A6A1E"></circle><ellipse cx="13" cy="11" rx="11" ry="3" fill="none" stroke="#8A6A1E" stroke-width="1.6" transform="rotate(-22 13 11)"></ellipse></svg>`;

const FAQ: Array<[string, string]> = [
  ["I don't know my birth time. Does that matter?", "Your dates stay accurate, because Saturn moves slowly. Without a time we use noon and leave houses out of the reading."],
  ["How accurate are the dates?", "They are calculated from actual planetary positions, checked against Swiss Ephemeris, and given to the day."],
  ["Tropical or sidereal?", "Tropical, the Western default. It is the system behind the April 1996 to June 1998 window."],
  ["Is this a subscription?", "No. You pay once and the reading is yours, including a printable copy."],
  ["What if it isn't useful?", "Email us within 14 days for a full refund."],
];

export function landingPage(opts: { siteUrl: string; ref?: string; error?: string; form?: { date?: string; place?: string; time?: string } }) {
  const f = opts.form ?? {};
  const body = html`
<div style="position:relative">
<div class="artLayer"><div class="artInner"><div class="art" id="art" style="transition:opacity .2s linear,transform .2s linear">
  <div style="width:100%;aspect-ratio:1;position:relative">${raw(ORBIT)}
    <div class="disp eF" style="position:absolute;top:-6px;left:50%;transform:translate(-50%,-100%);font-size:13px;color:#F2B544;white-space:nowrap;font-weight:500;animation-delay:1.6s">where Saturn was when you were born</div>
  </div>
  <div class="eF" style="animation-delay:2.6s;min-height:72px;display:flex;align-items:center;justify-content:center">
    <div id="rd0" class="rd0"><span class="dot"></span><span>Add your birth date to place Saturn.</span></div>
    <div id="rd1" class="rd1 swap" style="display:none">
      <span class="disp" style="font-size:64px;font-weight:800;letter-spacing:-.04em;line-height:.9;color:#F2B544;font-variant-numeric:tabular-nums"><span id="pct">0</span><span style="font-size:30px">%</span></span>
      <span style="display:flex;flex-direction:column;gap:4px;font-size:17px;line-height:1.3"><span>of the way round</span><span id="nextLine" class="muted" style="white-space:nowrap"></span></span>
    </div>
  </div>
</div></div></div>

<section id="top" class="hero">
  <div class="heroText">
    <h1 class="disp" aria-label="Your Saturn return, dated." style="margin:0 0 -.15em;font-size:clamp(44px,min(5.6vw,9.6vh),90px);letter-spacing:-.045em;font-weight:700">
      <span aria-hidden="true" style="display:block;overflow:hidden;font-size:.34em;font-weight:500;font-style:italic;letter-spacing:-.01em;line-height:1;color:#BDB6A8;padding:.1em 0 .12em .12em"><span class="w" style="animation-delay:.05s">Your</span></span>
      <span aria-hidden="true" style="display:block;overflow:hidden;line-height:.86;padding-bottom:.04em;white-space:nowrap"><span class="w" style="animation-delay:.16s">Saturn</span> <span class="w" style="animation-delay:.26s">return,</span></span>
      <span aria-hidden="true" style="display:block;overflow:hidden;font-size:1.62em;font-weight:800;letter-spacing:-.06em;line-height:.8;margin-top:-.04em;padding:.02em 0;color:#F2B544;white-space:nowrap"><span class="w" style="animation-delay:.38s">dated.</span></span>
    </h1>
    <p class="fade" style="margin:0;font-size:19px;line-height:1.6;color:#BDB6A8;animation-delay:.6s;text-wrap:pretty">Born between April 1996 and June 1998? You're in it now. Get your Saturn sign, your window and every pass, free, in about ten seconds.</p>
    <form id="start" class="fade" method="post" action="/preview" style="animation-delay:.8s;background:#14171D;border:1px solid rgba(237,230,214,.1);border-radius:28px;padding:clamp(20px,2.8vh,28px);display:flex;flex-direction:column;gap:clamp(12px,2vh,18px)">
      <input type="hidden" name="ref" value="${opts.ref ?? ""}">
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">
        <div class="field"><label for="bd">Birth date</label><input id="bd" name="date" type="date" required value="${f.date ?? ""}" min="1930-01-01" max="2012-12-31"></div>
        <div class="field"><label for="bt">Birth time, if you know it</label><input id="bt" name="time" type="time" value="${f.time ?? ""}"></div>
      </div>
      <div class="field"><label for="bp">Birth place</label><input id="bp" name="place" type="text" required placeholder="Town or city, country" autocomplete="off" value="${f.place ?? ""}"></div>
      <div class="ctaRow">
        <button type="submit" class="cta" id="go" style="flex:0 0 auto;padding:0 24px">Show my Saturn return ${raw(ARROW)}</button>
        <span style="font-size:14px;color:#A7A196;white-space:nowrap">Free. No account, no email.</span>
      </div>
      ${opts.error ? html`<p class="err">${opts.error}</p>` : ""}
    </form>
    <p class="fade hint" style="animation-delay:.95s">Use the local date where you were born. No birth time?<br>We use noon and leave houses out. <a href="/start" style="white-space:nowrap">One step at a time instead</a></p>
  </div>
</section>
<div class="linger" aria-hidden="true"></div>

<section class="season" style="position:relative;z-index:2">
<div class="wrap" style="padding-top:140px;padding-bottom:120px;display:flex;flex-wrap:wrap;gap:64px;align-items:flex-start">
  <div data-rv style="flex:1 1 360px;min-width:0;position:sticky;top:40px;display:flex;flex-direction:column;gap:24px">
    <h2 class="disp a" style="margin:0;font-size:clamp(44px,5vw,76px);line-height:.98;letter-spacing:-.03em;font-weight:700">A long season, made legible.</h2>
    <p class="a d2" style="margin:0;font-size:19px;line-height:1.6;color:#BDB6A8;max-width:400px">A Saturn return is not a single day. It plays out over months. Your reading lays the whole thing out so you can see where you are in it.</p>
  </div>
  <div style="flex:999 1 560px;min-width:0;display:flex;flex-direction:column;gap:28px">
    <article data-rv class="a" style="background:#14171D;border-radius:32px;padding:clamp(28px,4vw,48px);display:flex;flex-wrap:wrap;gap:32px;align-items:center">
      <div style="flex:0 0 auto;width:140px;height:140px;position:relative;display:flex;align-items:center;justify-content:center" aria-hidden="true">
        <svg viewBox="0 0 140 140" style="position:absolute;inset:0;width:100%;height:100%"><circle class="ringd" cx="70" cy="70" r="69" fill="none" stroke="rgba(242,181,68,.45)" stroke-width="1.2" transform="rotate(-90 70 70)"/></svg>
        <span id="glyph" class="glyph disp" style="font-size:76px;color:#F2B544;line-height:1">♄</span>
      </div>
      <div style="flex:1 1 280px;display:flex;flex-direction:column;gap:12px">
        <span id="signMeta" class="swap" style="font-size:14px;color:#F2B544;display:none"></span>
        <h3 id="signTitle" class="disp a d3" style="margin:0;font-size:34px;letter-spacing:-.02em;font-weight:600">Your Saturn sign</h3>
        <p id="signText" class="a d4" style="margin:0;font-size:17px;line-height:1.6;color:#BDB6A8">The kind of responsibility and structure this return is asking you to take seriously.</p>
      </div>
    </article>
    <article data-rv class="a" style="background:#14171D;border-radius:32px;padding:clamp(28px,4vw,48px);display:flex;flex-direction:column;gap:32px">
      <div style="display:flex;flex-direction:column;gap:12px"><h3 class="disp a d2" style="margin:0;font-size:34px;letter-spacing:-.02em;font-weight:600">Your return window</h3><p class="a d3" style="margin:0;font-size:17px;line-height:1.6;color:#BDB6A8;max-width:520px">When it opens, when it closes, and where today sits inside it.</p></div>
      <div aria-hidden="true" style="display:flex;flex-direction:column;gap:14px">
        <div style="position:relative;height:14px;border-radius:999px;background:rgba(237,230,214,.08)">
          <div id="fill" class="fillt" style="position:absolute;left:0;top:0;bottom:0;width:62%;border-radius:999px;background:#F2B544;transition:width .9s cubic-bezier(.3,.7,.2,1)"></div>
          <div id="ticks"></div>
          <div id="dot" class="popd" style="position:absolute;left:62%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#0E1014;border:3px solid #EDE6D6;transition:left .9s cubic-bezier(.3,.7,.2,1)"></div>
        </div>
        <div style="position:relative;height:20px;font-size:14px;color:#A7A196">
          <span id="winOpen" class="f d4" style="position:absolute;left:0;white-space:nowrap">Opens</span>
          <span id="here" class="f d6" style="position:absolute;left:62%;transform:translateX(-50%);color:#EDE6D6;white-space:nowrap;transition:left .9s cubic-bezier(.3,.7,.2,1)">You are here</span>
          <span id="winClose" class="f d6" style="position:absolute;right:0;white-space:nowrap">Closes</span>
        </div>
      </div>
    </article>
    <article data-rv class="a" style="background:#14171D;border-radius:32px;padding:clamp(28px,4vw,48px);display:flex;flex-direction:column;gap:28px">
      <div style="display:flex;flex-direction:column;gap:12px"><h3 class="disp a d2" style="margin:0;font-size:34px;letter-spacing:-.02em;font-weight:600">Your exact hits</h3><p class="a d3" style="margin:0;font-size:17px;line-height:1.6;color:#BDB6A8;max-width:540px">Saturn moves forward, stalls, backs up and moves on again. Depending on timing it crosses your natal degree once or three times. Every crossing gets a date.</p></div>
      <div id="pills" class="a d4" style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="pill" data-p="1">One pass</button><button type="button" class="pill on" data-p="3">Three passes</button></div>
      <div id="real" class="swap" style="display:none;flex-direction:column;gap:14px"><p id="hitsSummary" class="disp" style="margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em"></p><div id="chips" style="display:flex;gap:10px;flex-wrap:wrap"></div></div>
      <div class="a d5" style="border-radius:20px;background:#0E1014;padding:20px">
        <svg id="hitsSvg" viewBox="0 0 520 220" style="width:100%;display:block" role="img" aria-label="Saturn crossing the natal degree">
          <line id="natalLine" x1="10" y1="110" x2="510" y2="110" stroke="rgba(237,230,214,.35)" stroke-dasharray="4 6"/>
          <text id="natalLabel" x="12" y="100" fill="#A7A196" font-size="12" font-family="Hanken Grotesk, sans-serif">your natal Saturn</text>
          <g id="realChart" style="display:none"><line id="todayL" x1="-999" y1="10" x2="-999" y2="212" stroke="#EDE6D6" stroke-width="1.2" stroke-dasharray="2 4" opacity=".7"/><text id="todayT" x="-999" y="8" text-anchor="middle" fill="#EDE6D6" font-size="11" font-family="Hanken Grotesk, sans-serif">today</text><path id="chartPath" class="drawp" pathLength="900" d="M0 0" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path id="markPath" d="M0 0" fill="#0E1014" stroke="#F2B544" stroke-width="2.5"/></g>
          <path id="demo3" class="drawp" d="M20 196 C 90 160, 120 92, 190 74 S 250 150, 300 142 S 390 70, 505 26" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round"/>
          <path id="demo1" class="drawp" style="display:none" d="M20 196 C 180 170, 330 70, 505 26" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round"/>
        </svg>
      </div>
    </article>
  </div>
</div>
</section>
</div>

<section id="reading" data-rv class="wrap" style="padding-top:60px;padding-bottom:140px;display:flex;flex-wrap:wrap;gap:72px;align-items:center">
  <div aria-hidden="true" style="flex:1 1 460px;min-width:0;height:520px;position:relative;display:flex;justify-content:center;align-items:center">
    <div class="pg p1"><div class="disp" style="font-size:13px;color:#8A6A1E;font-weight:600">The window</div><svg viewBox="0 0 244 90" style="width:100%"><line x1="4" y1="45" x2="240" y2="45" stroke="rgba(20,17,10,.25)" stroke-dasharray="3 4"/><path d="M6 80 C 60 60, 80 30, 110 26 S 140 64, 160 60 S 200 24, 238 10" fill="none" stroke="#B9861F" stroke-width="2.5"/></svg><div class="bar" style="width:90%"></div><div class="bar" style="width:76%"></div><div class="bar" style="width:84%"></div><div class="bar" style="width:60%"></div></div>
    <div class="pg p3"><div class="disp" style="font-size:13px;color:#8A6A1E;font-weight:600">Pass two</div><div class="disp" style="font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1">The backtrack</div><div class="bar" style="width:92%"></div><div class="bar" style="width:70%"></div><div class="bar" style="width:86%"></div><div style="margin-top:auto;border-top:1px solid rgba(20,17,10,.15);padding-top:12px;display:flex;flex-direction:column;gap:8px"><div class="bar" style="width:50%"></div><div class="bar" style="width:64%"></div></div></div>
    <div class="pg p2" style="z-index:2"><svg width="40" height="40" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="6.5" fill="#14110A"/><ellipse cx="15" cy="15" rx="13.5" ry="4" fill="none" stroke="#B9861F" stroke-width="1.8" transform="rotate(-22 15 15)"/></svg><div class="disp" style="font-size:40px;font-weight:700;letter-spacing:-.03em;line-height:.95">Your Saturn</div><div style="font-size:14px;color:rgba(20,17,10,.6)">Sign, house and the degree it all turns on</div><div class="bar" style="width:94%;margin-top:10px"></div><div class="bar" style="width:82%"></div><div class="bar" style="width:88%"></div><div class="bar" style="width:56%"></div><div style="margin-top:auto;font-size:12px;color:rgba(20,17,10,.5)">Page 1</div></div>
  </div>
  <div style="flex:1 1 460px;min-width:0;display:flex;flex-direction:column;gap:28px">
    <h2 class="disp a" style="margin:0;font-size:clamp(40px,4.6vw,68px);line-height:1;letter-spacing:-.03em;font-weight:700;animation-delay:.7s">What's in the reading</h2>
    <p class="a" style="margin:0;font-size:19px;line-height:1.6;color:#BDB6A8;max-width:480px;animation-delay:.85s">Nine chapters built from your chart, with real dates throughout. It opens the moment you pay, and you can print it.</p>
    <div style="display:flex;flex-direction:column">
      ${[["Your Saturn", "Sign, house and the exact degree your return is measured against."], ["Your window, charted", "Saturn's real path against your degree, phase by phase."], ["The pass and the turn", "Each crossing dated, with what to do the week before, on the day and after."], ["Month by month", "Every month of your window, with what each one is good for."], ["Your Saturn history", "The checkpoints at about 7, 14 and 21, with prompts to make sense of them."], ["A workbook", "Prompts for the phase you are in, and the ones ahead."], ["Ask about it", "Five follow-up questions, answered from your chart."]].map(([t, d], i) => html`<div class="chap a" style="animation-delay:${(1 + i * 0.12).toFixed(2)}s;${i === 6 ? "border-bottom:1px solid rgba(237,230,214,.12)" : ""}"><span class="disp" style="font-size:22px;font-weight:600;flex:0 0 220px">${t}</span><span style="color:#BDB6A8;flex:1 1 240px;line-height:1.5">${d}</span></div>`)}
    </div>
  </div>
</section>

<section id="price" data-rv class="wrap" style="padding-bottom:140px">
  <div class="f" style="position:relative;overflow:hidden;background:#EDE6D6;color:#14110A;border-radius:40px;padding:clamp(40px,5.5vw,80px) clamp(28px,5vw,72px);display:flex;flex-wrap:wrap;gap:56px 72px;align-items:center">
    <svg aria-hidden="true" viewBox="0 0 600 600" class="echo" style="position:absolute;right:-180px;top:calc(50% - 340px);width:680px;height:680px;pointer-events:none;overflow:visible">
      <circle cx="300" cy="300" r="266" fill="none" stroke="rgba(20,17,10,.16)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/><circle cx="300" cy="300" r="266" fill="none" stroke="rgba(20,17,10,.22)" stroke-width="18" stroke-dasharray="1.6 137.6739" stroke-dashoffset="0.8"/>
      <circle cx="300" cy="300" r="230" fill="none" stroke="rgba(20,17,10,.14)" stroke-dasharray="2 7"/><circle cx="300" cy="300" r="168" fill="none" stroke="rgba(20,17,10,.06)"/>
      <circle id="arc2" cx="300" cy="300" r="230" fill="none" stroke="#B9861F" stroke-width="2.5" stroke-linecap="round" transform="rotate(-90 300 300)" style="stroke-dasharray:0 2000;transition:stroke-dasharray 1.6s"/>
      <circle cx="300" cy="300" r="6" fill="rgba(20,17,10,.3)"/><line x1="300" y1="46" x2="300" y2="94" stroke="#B9861F" stroke-width="2"/><circle cx="300" cy="70" r="5" fill="#EDE6D6" stroke="#B9861F" stroke-width="2"/>
      <g id="sat2" class="vb" style="transform:rotate(0deg);transition:transform 1.6s cubic-bezier(.3,.7,.2,1)"><circle cx="300" cy="70" r="30" fill="#B9861F" opacity=".14"/><circle cx="300" cy="70" r="15" fill="#14110A"/><ellipse cx="300" cy="70" rx="29" ry="7.5" fill="none" stroke="#B9861F" stroke-width="2.5" transform="rotate(-22 300 70)"/></g>
    </svg>
    <div style="flex:1 1 380px;display:flex;flex-direction:column;gap:22px;position:relative">
      <div class="disp" style="display:flex;align-items:flex-start;font-size:clamp(104px,12vw,176px);font-weight:800;letter-spacing:-.05em;line-height:.82"><span style="font-size:.4em;font-weight:600;margin:.1em .06em 0 0">$</span><span>29</span></div>
      <p style="margin:-6px 0 0;font-size:15px;font-style:italic;color:rgba(20,17,10,.6)">A dollar for every year Saturn takes to come back.</p>
      <p class="disp" style="margin:8px 0 0;font-size:clamp(24px,2.2vw,30px);font-weight:600;letter-spacing:-.02em;line-height:1.15">One payment. The reading is yours.</p>
      <p style="margin:0;font-size:17px;line-height:1.6;color:rgba(20,17,10,.7)"><span class="nw">No subscription. No trial that becomes a charge.</span><br><span class="nw">Not useful? Full refund within 14 days.</span><br><span class="nw">No birth time? $19.</span></p>
      <p class="echoLine" style="margin:10px 0 0;display:flex;align-items:center;gap:12px;font-size:15px;line-height:1.45;color:rgba(20,17,10,.62)"><span class="dot" style="background:#B9861F"></span><span id="echoLine">Saturn is already on its way back to where it was when you were born.</span></p>
    </div>
    <div style="flex:1 1 360px;display:flex;flex-direction:column;gap:18px;position:relative">
      ${["Nine chapters built from your chart", "Every pass and turn dated to the day", "A month-by-month forecast and a workbook", "Five follow-up questions, plus a reminder before each pass"].map((t) => html`<div class="tick">${raw(SATURN_TICK)}<span>${t}</span></div>`)}
      <div style="display:flex;flex-wrap:wrap;gap:14px 20px;align-items:center;margin-top:12px"><a href="#start" class="cta dark">Start with the free preview</a></div>
    </div>
  </div>
</section>

<section data-rv id="ages" style="padding:80px 0 140px;overflow:hidden">
  <div class="wrap" style="display:flex;flex-direction:column;gap:48px">
    <h2 class="disp a" style="margin:0;font-size:clamp(40px,4.6vw,68px);line-height:1;letter-spacing:-.03em;font-weight:700;max-width:760px">Saturn comes back about every 29 years.</h2>
    <div style="display:flex;flex-wrap:wrap;gap:8px 48px;align-items:flex-end;min-height:1em">
      <button type="button" class="age on" data-age="29">0</button><button type="button" class="age" data-age="58" style="display:none">0</button><button type="button" class="age" data-age="87" style="display:none">0</button>
    </div>
    <div id="ageInfo" class="swap" style="display:none;flex-wrap:wrap;gap:16px 48px;align-items:baseline;border-top:1px solid rgba(237,230,214,.12);padding-top:28px">
      <p id="ageTitle" class="disp" style="margin:0;font-size:30px;font-weight:600;letter-spacing:-.02em"></p><p id="ageBody" style="margin:0;font-size:18px;line-height:1.6;color:#BDB6A8;max-width:560px"></p>
    </div>
  </div>
</section>

<section id="faq" data-rv style="max-width:920px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 160px;display:flex;flex-direction:column;gap:24px">
  <h2 class="disp f" style="margin:0 0 12px;font-size:clamp(40px,4.6vw,68px);line-height:1;letter-spacing:-.03em;font-weight:700">Questions</h2>
  <div>${FAQ.map(([q, a], i) => html`<div class="row" style="border-bottom:1px solid rgba(237,230,214,.14);${i === 0 ? "border-top:1px solid rgba(237,230,214,.14);" : ""}animation-delay:${(0.25 + i * 0.12).toFixed(2)}s"><button type="button" class="faqb ${i === 0 ? "open" : ""}" aria-expanded="${i === 0}">${q}<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M11 4v14M4 11h14"/></svg></button><p class="faqa ${i === 0 ? "open" : ""}">${a}</p></div>`)}</div>
</section>

<section data-rv style="padding:0 0 120px;overflow:hidden">
  <div class="f" aria-hidden="true" style="animation-duration:2s"><div class="mq disp" style="font-size:clamp(120px,20vw,300px);font-weight:800;letter-spacing:-.05em;line-height:.9;color:#1A1D23;white-space:nowrap"><span style="padding-right:.5em">Ten seconds. Free.</span><span style="padding-right:.5em">Ten seconds. Free.</span><span style="padding-right:.5em">Ten seconds. Free.</span><span style="padding-right:.5em">Ten seconds. Free.</span></div></div>
  <div class="wrap" style="margin-top:-40px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:32px;position:relative">
    <h2 class="disp a d3" style="margin:0;font-size:clamp(36px,4vw,56px);line-height:1.02;letter-spacing:-.03em;font-weight:700;max-width:640px">See your return window before you decide anything else.</h2>
    <a href="#start" class="cta a d6">Show my Saturn return ${raw(ARROW)}</a>
  </div>
</section>`;

  const script = `
(function(){
var $=function(s){return document.querySelector(s)};
var SIGNS=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
var SL=${JSON.stringify(["Learning to lead yourself with patience rather than force.", "Building security that rests on your own values, not only on what you own.", "Turning scattered curiosity into a voice people can rely on.", "Making a home and an inner life that can hold real weight.", "Earning confidence through what you make rather than the applause.", "Finding work and routines that are useful without being punishing.", "Committing properly, and keeping things fair in your partnerships.", "Facing what you would rather control, and sharing power honestly.", "Turning big beliefs into a direction you will actually follow.", "Taking full ownership of your ambitions and what they cost.", "Finding your place in a group without losing your own line.", "Giving your sensitivity a shape, and some boundaries."])};
var ORD=['first','second','third'];
// reveals
var io=('IntersectionObserver' in window)?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);if(e.target.id==='ages')startCount();}})},{threshold:.15,rootMargin:'0px 0px -6% 0px'}):null;
document.querySelectorAll('[data-rv]').forEach(function(el){io?io.observe(el):el.classList.add('in')});
if(!io)startCount();
// pills
document.querySelectorAll('#pills .pill').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('#pills .pill').forEach(function(x){x.classList.remove('on')});b.classList.add('on');var three=b.dataset.p==='3';$('#demo3').style.display=three?'':'none';$('#demo1').style.display=three?'none':'';})});
// faq
document.querySelectorAll('.faqb').forEach(function(b){b.addEventListener('click',function(){var open=b.classList.contains('open');document.querySelectorAll('.faqb').forEach(function(x){x.classList.remove('open');x.setAttribute('aria-expanded','false')});document.querySelectorAll('.faqa').forEach(function(x){x.classList.remove('open')});if(!open){b.classList.add('open');b.setAttribute('aria-expanded','true');b.nextElementSibling.classList.add('open')}})});
// ages
var AGES={29:['The first return','Usually somewhere between 27 and 30. The one most people mean when they say Saturn return.'],58:['The second return','Usually between 56 and 60. Saturn checks back in on what you built after the first.'],87:['The third return','Around 87 or 88, for those who reach it.']};
var counting=false;
function startCount(){if(counting)return;counting=true;var btns=document.querySelectorAll('.age');var seq=[[0,29],[29,58],[58,87]],dur=[1200,950,950],stage=0,t0=null;
function step(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur[stage]),e=1-Math.pow(1-p,3);btns[stage].style.display='';btns[stage].textContent=Math.round(seq[stage][0]+(seq[stage][1]-seq[stage][0])*e);btns.forEach(function(b,i){b.classList.toggle('on',i===stage)});if(p<1){requestAnimationFrame(step);return}if(stage<2){stage++;t0=null;setTimeout(function(){requestAnimationFrame(step)},260)}else{showAge(29)}}
setTimeout(function(){requestAnimationFrame(step)},350)}
function showAge(a){document.querySelectorAll('.age').forEach(function(b){b.classList.toggle('on',+b.dataset.age===a)});$('#ageTitle').textContent=AGES[a][0];$('#ageBody').textContent=AGES[a][1];var i=$('#ageInfo');i.style.display='flex';i.classList.remove('swap');void i.offsetWidth;i.classList.add('swap')}
document.querySelectorAll('.age').forEach(function(b){b.addEventListener('click',function(){showAge(+b.dataset.age)})});
// live calc
var C=2*Math.PI*230,timer=null;
function calc(){var d=$('#bd').value,t=$('#bt').value;if(!d)return;clearTimeout(timer);timer=setTimeout(function(){fetch('/api/calc?date='+encodeURIComponent(d)+'&time='+encodeURIComponent(t||'')).then(function(r){return r.ok?r.json():null}).then(function(c){if(c)apply(c)}).catch(function(){})},250)}
function apply(c){
  var ang=c.angle;$('#sat').className.baseVal='sat vb set';$('#sat').style.transform='rotate('+ang+'deg)';$('#arc').style.strokeDasharray=(ang/360*C).toFixed(1)+' 2000';
  $('#sat2').style.transform='rotate('+ang+'deg)';$('#arc2').style.strokeDasharray=(ang/360*C).toFixed(1)+' 2000';
  $('#rd0').style.display='none';var r1=$('#rd1');r1.style.display='flex';$('#pct').textContent=c.pct;
  $('#nextLine').textContent=c.inside?'Inside your '+ORD[c.returnNumber-1]+' return now':(ORD[c.returnNumber-1].charAt(0).toUpperCase()+ORD[c.returnNumber-1].slice(1))+' return opens '+c.windowOpenLong;
  $('#echoLine').textContent='Saturn is '+c.pct+'% of the way back to where it was when you were born.';
  var si=SIGNS.indexOf(c.sign);$('#glyph').textContent=String.fromCharCode(0x2648+si)+'\\uFE0E';$('#signTitle').textContent='Saturn in '+c.sign;$('#signText').textContent=SL[si];var m=$('#signMeta');m.style.display='';m.textContent=c.degree+'\\u00B0 '+c.sign+' when you were born';
  $('#winOpen').textContent='Opens '+c.windowOpen;$('#winClose').textContent='Closes '+c.windowClose;
  var fw=(c.frac*100).toFixed(1)+'%';$('#fill').style.width=fw;var dot=$('#dot');dot.style.display=c.inside?'':'none';dot.style.left=fw;var here=$('#here');here.style.left=c.inside?fw:'50%';here.textContent=c.inside?'You are here':c.opensIn;
  $('#ticks').innerHTML=c.ticks.map(function(p){return '<div style="position:absolute;left:'+p+'%;top:-5px;bottom:-5px;width:2px;margin-left:-1px;border-radius:1px;background:#EDE6D6;opacity:.6"></div>'}).join('');
  $('#pills').style.display='none';var real=$('#real');real.style.display='flex';$('#hitsSummary').textContent='Your '+ORD[c.returnNumber-1]+' return has '+(c.hits.length===1?'one exact pass.':['','one','two','three'][c.hits.length]+' exact passes.');
  $('#chips').innerHTML=c.hits.map(function(h,i){return '<span style="display:inline-flex;align-items:baseline;gap:8px;min-height:44px;padding:11px 18px;border-radius:999px;border:1px solid rgba(237,230,214,.22);font-size:15px"><span style="color:#A7A196">Pass '+['one','two','three'][i]+'</span><span style="color:#F2B544;font-weight:600">'+h+'</span></span>'}).join('');
  $('#demo3').style.display='none';$('#demo1').style.display='none';$('#realChart').style.display='';$('#chartPath').setAttribute('d',c.chart.path);$('#markPath').setAttribute('d',c.chart.mark);$('#natalLine').setAttribute('y1',c.chart.y0);$('#natalLine').setAttribute('y2',c.chart.y0);$('#natalLabel').setAttribute('y',c.chart.y0-10);$('#natalLabel').textContent='your natal Saturn, '+c.degree+'\\u00B0 '+c.sign;$('#todayL').setAttribute('x1',c.chart.todayX);$('#todayL').setAttribute('x2',c.chart.todayX);$('#todayT').setAttribute('x',c.chart.todayX);
}
// fade the pinned art as the season cards scroll over it
var season=$('.season'),art=$('#art'),raf=null;
function fade(){raf=null;if(window.innerWidth<=900){art.style.opacity='';art.style.transform='';return}var top=season.getBoundingClientRect().top,h=window.innerHeight,o=Math.max(0,Math.min(1,(top-h*0.25)/(h*0.5)));art.style.opacity=(0.08+0.92*o).toFixed(3);art.style.transform='translateY('+((1-o)*-24).toFixed(1)+'px) scale('+(0.97+0.03*o).toFixed(3)+')'}
window.addEventListener('scroll',function(){if(!raf)raf=requestAnimationFrame(fade)},{passive:true});fade();
$('#bd').addEventListener('change',calc);$('#bt').addEventListener('change',calc);var qd=new URLSearchParams(location.search).get('d');if(qd&&!$('#bd').value&&/^\\d{4}-\\d{2}-\\d{2}$/.test(qd))$('#bd').value=qd;if($('#bd').value)calc();
$('#start').addEventListener('submit',function(){var b=$('#go');b.disabled=true;b.textContent='Calculating\\u2026'});
})();`;

  return shell({
    title: "Your Saturn return, dated. · Rite", body, extraCss: CSS, script,
    canonical: opts.siteUrl + "/", og: opts.siteUrl + "/og.png",
    nav: html`<nav class="main"><a href="#reading">The reading</a><a href="#price">Price</a><a href="#faq">Questions</a><a href="#start" class="ghost">Get my dates</a></nav>`,
  });
}
