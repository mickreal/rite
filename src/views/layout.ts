import { html, raw } from "hono/html";

export const GLYPH = `<svg aria-hidden="true" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="22" cy="22" r="7.5" fill="currentColor"/><ellipse cx="22" cy="22" rx="19" ry="7.8" stroke="currentColor" stroke-width="1.5" transform="rotate(-28 22 22)"/><path d="M5.5 27.2c4.2 1.4 11.7.5 19.1-2.8 5.8-2.6 10.4-5.8 13-8.7" stroke="currentColor" stroke-width="1.5"/></svg>`;

export const CSS = `
:root{--bg:#111418;--bg2:#171b20;--ink:#ece6d8;--ink2:#b5ad9b;--mute:#6f6a60;--gold:#d4b66a;--gold2:#b9995a;--line:#2a2f36;--err:#e08a7a}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Crimson Pro",Georgia,serif;font-size:19px;line-height:1.5}
a{color:var(--gold);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
header.top{display:flex;justify-content:space-between;align-items:center;padding:22px 0;border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;color:var(--ink);font-family:Cinzel,serif;font-size:22px;letter-spacing:.08em}
.brand svg{width:28px;height:28px;color:var(--gold)}
.mono{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2)}
.eyebrow{font-family:Cinzel,serif;font-size:12px;letter-spacing:.22em;color:var(--gold);text-transform:uppercase;margin:0 0 18px}
h1{font-family:Cinzel,serif;font-weight:400;font-size:clamp(40px,7vw,84px);line-height:1.02;margin:0 0 24px;letter-spacing:.01em}
h2{font-family:Cinzel,serif;font-weight:400;font-size:clamp(26px,3.4vw,38px);line-height:1.15;margin:0 0 14px}
h3{font-family:Cinzel,serif;font-weight:400;font-size:20px;margin:0 0 8px;letter-spacing:.02em}
.lede{font-size:clamp(19px,2vw,24px);color:var(--ink);max-width:620px;margin:0 0 30px}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:40px;padding:70px 0 40px;align-items:center}
@media(max-width:860px){.hero{grid-template-columns:1fr;padding:40px 0 20px}.fig{display:none}}
.fig{position:relative;aspect-ratio:1;max-width:520px;margin:0 auto;color:var(--line)}
.fig svg{width:100%;height:100%}
.fig .orbit{stroke:var(--gold);stroke-width:1.6;fill:none}.fig .planet{fill:var(--gold)}.fig .ring{stroke:var(--line);fill:none;stroke-width:1.2}
.card{background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:26px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
form .row{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:16px}
@media(max-width:640px){form .row{grid-template-columns:1fr}}
label{display:block;font-weight:600;font-size:17px;margin-bottom:6px}label small{font-weight:400;color:var(--mute);font-size:15px}
input{width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:8px;background:#0f1216;color:var(--ink);font:inherit;font-size:18px;color-scheme:dark}
input:focus{outline:2px solid var(--gold2);outline-offset:1px;border-color:var(--gold2)}
.hint{color:var(--mute);font-size:14.5px;margin:6px 0 0;line-height:1.35}
.btn{display:inline-block;background:var(--gold);color:#1a1409;border:0;border-radius:999px;padding:14px 26px;font:inherit;font-weight:700;font-size:18px;cursor:pointer;margin-top:18px}
.btn:hover{background:#e3c87f;text-decoration:none}.btn.ghost{background:transparent;color:var(--gold);border:1px solid var(--gold2)}
.btn[disabled]{opacity:.6;cursor:wait}
.fine{color:var(--mute);font-size:15px;margin:12px 0 0}
.result{margin-top:22px;padding-top:22px;border-top:1px solid var(--line)}
.sigline{font-family:Cinzel,serif;font-size:clamp(26px,3vw,34px);margin:0 0 6px;color:var(--ink)}
.sigline em{font-style:normal;color:var(--gold)}
.stamp{display:inline-block;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;border:1px solid var(--gold2);color:var(--gold);border-radius:4px;padding:4px 8px;margin-left:10px;vertical-align:middle}
.dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}
.dates div{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#0f1216}
.dates b{display:block;font-family:"JetBrains Mono",monospace;font-size:11px;letter-spacing:.14em;color:var(--mute);text-transform:uppercase;margin-bottom:6px;font-weight:500}
.dates span{font-family:"JetBrains Mono",monospace;font-size:15px;color:var(--ink)}
.err{color:var(--err);margin-top:14px}
.sell{padding:40px 0 70px;border-top:1px solid var(--line);margin-top:40px}
.cols{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin:26px 0}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.cols .n{font-family:"JetBrains Mono",monospace;color:var(--gold);font-size:12px;letter-spacing:.2em;margin-bottom:10px}
.price{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:10px}
@media(max-width:640px){.price{grid-template-columns:1fr}}
.price .card{padding:22px}.price .amt{font-family:Cinzel,serif;font-size:44px;margin:4px 0 2px}.price .sub{color:var(--mute);font-size:15px}
.price form{margin-top:12px}.price .btn{margin-top:10px;width:100%;text-align:center}
.proof{display:flex;gap:28px;flex-wrap:wrap;color:var(--ink2);font-size:16px;margin:30px 0 0}
.faq{padding:40px 0 60px;border-top:1px solid var(--line)}
.faq details{border-bottom:1px solid var(--line);padding:16px 0}.faq summary{cursor:pointer;font-weight:600;font-size:19px;list-style:none}
.faq summary::-webkit-details-marker{display:none}.faq summary::before{content:"+";color:var(--gold);display:inline-block;width:22px}.faq details[open] summary::before{content:"–"}
.faq p{color:var(--ink2);margin:10px 0 0 22px}
footer.bottom{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:30px 0 50px;border-top:1px solid var(--line);color:var(--mute);font-size:15px;flex-wrap:wrap}
/* report */
.report{max-width:760px;margin:0 auto;padding:50px 0 80px}
.report h1{font-size:clamp(34px,5vw,56px)}
.report h2{margin-top:44px;padding-top:18px;border-top:1px solid var(--line)}
.report p,.report li{font-size:20px;line-height:1.6}
.report ul{padding-left:22px}
.report .carry{font-family:Cinzel,serif;font-size:clamp(22px,3vw,30px);color:var(--gold);border-left:3px solid var(--gold);padding:10px 0 10px 22px;margin:20px 0 0}
.toolbar{display:flex;gap:12px;flex-wrap:wrap;margin:26px 0 0}
.shade{opacity:.7}
@media print{body{background:#fff;color:#111;font-size:12pt}.wrap{max-width:none}header.top,footer.bottom,.toolbar,.noprint{display:none!important}.report{padding:0}.report h2{border-color:#ccc}.report .carry{color:#111;border-color:#111}a{color:#111}}
`;

export function page(title: string, body: unknown, opts: { description?: string; canonical?: string; siteUrl: string; og?: string }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<meta name="description" content="${opts.description ?? "Find out exactly when your Saturn return hits. Your sign, your window, your exact dates — free preview."}">
<meta name="theme-color" content="#111418">
${opts.canonical ? html`<link rel="canonical" href="${opts.canonical}">` : ""}
<meta property="og:title" content="${title}">
<meta property="og:description" content="${opts.description ?? "Personal reports for the transits that have names."}">
<meta property="og:type" content="website">
${opts.og ? html`<meta property="og:image" content="${opts.og}">` : ""}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${raw(CSS)}</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="brand" href="/">${raw(GLYPH)}<span>Rite</span></a>
  <span class="mono">Saturn Return · 27–30 · 56–60</span>
</header>
${body}
<footer class="bottom">
  <span><a class="brand" href="/" style="font-size:16px">${raw(GLYPH)} Rite</a></span>
  <span>Reports for the transits that have names. · <a href="mailto:hello@rite.report">hello@rite.report</a></span>
</footer>
</div>
</body>
</html>`;
}
