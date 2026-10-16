// Design system ported from the Rite canvas: Bricolage Grotesque display, Hanken Grotesk body,
// ground #0E1014, card #14171D, ink #EDE6D6, gold #F2B544, cream (offer) #EDE6D6 / #14110A.
import { html, raw } from "hono/html";

export const MARK = `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="6.5" fill="#EDE6D6"></circle><ellipse cx="15" cy="15" rx="13.5" ry="4" fill="none" stroke="#F2B544" stroke-width="1.8" transform="rotate(-22 15 15)"></ellipse></svg>`;
export const ARROW = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h12M10 4l5 5-5 5"></path></svg>`;
export const LOCK = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5"></rect><path d="M5 7V5a3 3 0 0 1 6 0v2"></path></svg>`;

export const THEME_CSS = `
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:#0E1014;color:#EDE6D6;font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:17px;line-height:1.5;overflow-x:clip}
a{color:#F2B544}a:hover{color:#FFD27A}
.disp{font-family:'Bricolage Grotesque',serif;font-optical-sizing:auto}
.muted{color:#A7A196}
.wrap{max-width:1240px;margin:0 auto;padding:0 clamp(16px,4vw,48px)}
header.top{max-width:1240px;margin:0 auto;padding:28px clamp(16px,4vw,48px);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.brand{color:#EDE6D6;text-decoration:none;font-size:28px;font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:10px;font-family:'Bricolage Grotesque',serif}
.brand:hover{color:#EDE6D6}
nav.main{display:flex;align-items:center;gap:8px 28px;flex-wrap:wrap}
nav.main a{color:#BDB6A8;text-decoration:none;font-weight:500}nav.main a:hover{color:#EDE6D6}
.cta{height:56px;border:0;border-radius:999px;background:#F2B544;color:#14110A;font:600 17px 'Hanken Grotesk',sans-serif;padding:0 28px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;transition:transform .25s cubic-bezier(.2,.8,.2,1),background .2s}
.cta:hover{background:#FFC85C;color:#14110A;transform:translateY(-2px)}
.cta svg{transition:transform .25s}.cta:hover svg{transform:translateX(4px)}
.cta.dark{background:#14110A;color:#EDE6D6}.cta.dark:hover{background:#2a2419;color:#EDE6D6}
.cta[disabled]{opacity:.6;cursor:wait;transform:none}
.ghost{min-height:44px;border-radius:999px;border:1px solid rgba(237,230,214,.25);background:none;color:#EDE6D6;padding:0 20px;display:inline-flex;align-items:center;gap:9px;text-decoration:none;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer;transition:border-color .2s,background .2s,color .2s}
.ghost:hover{color:#EDE6D6;border-color:#F2B544;background:rgba(242,181,68,.08)}
.ghost.done{border-color:#F2B544;color:#F2B544}
.solid{min-height:48px;border-radius:999px;border:0;background:#F2B544;color:#14110A;padding:0 22px;display:inline-flex;align-items:center;gap:10px;font:600 16px 'Hanken Grotesk',sans-serif;cursor:pointer;text-decoration:none}
.solid:hover{background:#FFC85C;color:#14110A}
.pill{min-height:44px;padding:0 20px;border-radius:999px;border:1px solid rgba(237,230,214,.22);background:transparent;color:#EDE6D6;font:500 15px 'Hanken Grotesk',sans-serif;cursor:pointer;transition:all .2s}
.pill:hover{border-color:#F2B544}.pill.on{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.card{background:#14171D;border-radius:28px;padding:clamp(22px,3vw,34px)}
.stat{background:#14171D;border-radius:22px;padding:20px 22px;display:flex;flex-direction:column;gap:6px}
.stat b{font-family:'Bricolage Grotesque',serif;font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.05}
.stat span{font-size:14px;color:#A7A196}
.chip{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(237,230,214,.18);font-size:14px;color:#CFC8BA}
.chip.warm{border-color:rgba(242,181,68,.45);color:#F2B544}
.field{display:flex;flex-direction:column;gap:8px}
.field label{font-size:14px;color:#A7A196}
.field input{height:52px;border-radius:14px;border:1px solid rgba(237,230,214,.18);background:#14171D;color:#EDE6D6;font:500 17px 'Hanken Grotesk',sans-serif;padding:0 16px;color-scheme:dark;transition:border-color .2s,box-shadow .2s;width:100%}
.field input:focus{outline:none;border-color:#F2B544;box-shadow:0 0 0 4px rgba(242,181,68,.18)}
.inp{flex:1 1 220px;min-width:0;min-height:52px;border-radius:999px;border:1px solid rgba(237,230,214,.2);background:#0E1014;color:#EDE6D6;font:500 16px 'Hanken Grotesk',sans-serif;padding:0 20px;color-scheme:dark}
.inp:focus{outline:none;border-color:#F2B544}
.ta{width:100%;min-height:96px;border-radius:16px;border:1px solid rgba(237,230,214,.16);background:#0E1014;color:#EDE6D6;font:400 16px/1.55 'Hanken Grotesk',sans-serif;padding:14px 16px;resize:vertical}
.ta:focus{outline:none;border-color:#F2B544}.ta::placeholder{color:#6B675F}
.err{color:#E08A7A;margin:0;font-size:15px}
footer.bottom{border-top:1px solid rgba(237,230,214,.1)}
footer.bottom .in{max-width:1240px;margin:0 auto;padding:36px clamp(16px,4vw,48px);display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px;font-size:15px;color:#A7A196}
footer.bottom a{color:#EDE6D6;text-decoration:none;font-weight:600;font-size:18px;font-family:'Bricolage Grotesque',serif}
/* motion */
.w{display:inline-block;opacity:0;transform:translateY(60%) rotate(4deg);animation:wIn 1s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes wIn{to{opacity:1;transform:none}}
.fade{opacity:0;animation:fIn 1.2s ease forwards}
@keyframes fIn{to{opacity:1}}
.swap{animation:swap .7s cubic-bezier(.2,.8,.2,1)}
@keyframes swap{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
.a{opacity:0}.in .a,.in.a{animation:aIn .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes aIn{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:none}}
.f{opacity:0}.in .f,.in.f{animation:fIn 1.1s ease both}
.d1{animation-delay:.1s!important}.d2{animation-delay:.2s!important}.d3{animation-delay:.32s!important}.d4{animation-delay:.44s!important}.d5{animation-delay:.56s!important}.d6{animation-delay:.68s!important}
.pulse{animation:pulse 2s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
@keyframes pulse{0%,100%{transform:scale(1);opacity:.9}50%{transform:scale(2.2);opacity:0}}
.draw{stroke-dasharray:1000;stroke-dashoffset:1000;animation:draw 2.6s cubic-bezier(.4,.1,.2,1) .3s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
@supports (animation-timeline: view()){
.rv{animation:rv linear both;animation-timeline:view();animation-range:entry 0% cover 25%}
@keyframes rv{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion: reduce){html{scroll-behavior:auto}*{animation:none!important;transition:none!important}.w,.fade,.a,.f,.swap{opacity:1;transform:none}.draw{stroke-dashoffset:0}}
@media print{body{background:#fff;color:#111}header.top,footer.bottom,.noprint{display:none!important}.card,.stat{background:#f4f2ec;color:#111}.muted{color:#555}a{color:#111}}
`;

export function shell(opts: { title: string; description?: string; canonical?: string; og?: string; body: unknown; extraCss?: string; script?: string; nav?: unknown; noFooter?: boolean }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title}</title>
<meta name="description" content="${opts.description ?? "Your Saturn return, dated. Your sign, your window and every pass, free in ten seconds."}">
<meta name="theme-color" content="#0E1014">
${opts.canonical ? html`<link rel="canonical" href="${opts.canonical}">` : ""}
<meta property="og:title" content="${opts.title}">
<meta property="og:description" content="${opts.description ?? "Your sign, window and every pass. Free in ten seconds."}">
<meta property="og:type" content="website">
${opts.og ? html`<meta property="og:image" content="${opts.og}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Hanken+Grotesk:wght@400;500;600&display=swap">
<style>${raw(THEME_CSS)}${raw(opts.extraCss ?? "")}</style>
</head>
<body>
<header class="top">
  <a href="/" class="brand">${raw(MARK)} Rite</a>
  ${opts.nav ?? html`<nav class="main"><a href="/#reading">The reading</a><a href="/#price">Price</a><a href="/#faq">Questions</a><a href="/#start" class="ghost">Get my dates</a></nav>`}
</header>
${opts.body}
${opts.noFooter ? "" : html`<footer class="bottom"><div class="in"><a href="/">Rite: Saturn Return</a><span style="display:flex;gap:18px;flex-wrap:wrap;align-items:center"><span>Personal guidance for the transits that have names.</span><a href="/privacy" style="font:inherit;color:#A7A196;font-weight:500">Privacy</a><a href="/terms" style="font:inherit;color:#A7A196;font-weight:500">Terms</a><a href="/refunds" style="font:inherit;color:#A7A196;font-weight:500">Refunds</a></span></div></footer>`}
${opts.script ? html`<script>${raw(opts.script)}</script>` : ""}
</body>
</html>`;
}
