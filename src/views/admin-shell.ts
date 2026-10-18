// The one layout every admin HTML page uses (b12-admin): Rite's theme with an admin header (gold rule, "Admin" tag) and a
// section nav (Dashboard, Inbox with its "Needs me" count, Creators, KPI, Voice, Sign out). On a phone the nav is one
// horizontally scrolling row under the brand, so the page itself never scrolls sideways.
import { html, raw } from "hono/html";
import { THEME_CSS, MARK } from "./theme";

export type AdminSection = "dashboard" | "inbox" | "creators" | "kpi" | "voice";
export interface AdminNav { section: AdminSection | null; csrf: string; needs?: number | null }

export const ADMIN_SECTIONS: ReadonlyArray<{ id: AdminSection; label: string; href: string }> = [
  { id: "dashboard", label: "Dashboard", href: "/admin" },
  { id: "inbox", label: "Inbox", href: "/admin/inbox" },
  { id: "creators", label: "Creators", href: "/admin/creators" },
  { id: "kpi", label: "KPI", href: "/admin/kpi" },
  { id: "voice", label: "Voice", href: "/admin/voice" },
];

export const ADMIN_CSS = `
body{min-height:100vh}
.ah{border-top:3px solid #F2B544;background:#111318;border-bottom:1px solid rgba(237,230,214,.08);margin-bottom:28px}
.ah-in{max-width:1240px;margin:0 auto;padding:12px clamp(16px,4vw,48px);display:flex;align-items:center;gap:10px 24px;min-width:0}
.ah-brand{display:flex;align-items:center;gap:10px;color:#EDE6D6;text-decoration:none;font:700 22px 'Bricolage Grotesque',serif;letter-spacing:-.02em;flex:none}
.ah-brand:hover{color:#EDE6D6}
.ah-tag{font:600 11px 'Hanken Grotesk',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#14110A;background:#F2B544;border-radius:999px;padding:4px 9px;line-height:1}
.ah-nav{display:flex;align-items:center;gap:4px;flex:1 1 auto;min-width:0;overflow-x:auto;padding:4px 0;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain}
.ah-nav::-webkit-scrollbar{display:none}
.ah-nav a,.ah-nav button{flex:none;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;border-radius:999px;color:#BDB6A8;text-decoration:none;font:500 15px 'Hanken Grotesk',sans-serif;white-space:nowrap;border:1px solid transparent;background:none;cursor:pointer}
.ah-nav a:hover,.ah-nav button:hover{color:#EDE6D6;background:rgba(237,230,214,.06)}
.ah-nav a.on{color:#0E1014;background:#EDE6D6}
.ah-nav .badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:#F2B544;color:#14110A;font:700 12px 'Hanken Grotesk',sans-serif;line-height:1}
.ah-nav .sp{flex:1 1 auto;min-width:8px}
.ah-nav form{margin:0;flex:none}
.ah-nav .site{color:#8F897E}
.ah-nav button.out{border-color:rgba(237,230,214,.18)}
.vh{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.abanner{max-width:1240px;margin:-12px auto 20px;padding:0 clamp(16px,4vw,48px)}
.abanner .in{border:1px solid rgba(242,181,68,.45);background:rgba(242,181,68,.08);border-radius:18px;padding:12px 16px;font-size:15px;color:#EDE6D6}
.abanner b{color:#F2B544}
.abanner code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
@media (max-width:760px){
.ah-in{flex-wrap:wrap;padding-top:10px;padding-bottom:6px}
.ah-nav{flex:1 1 100%;margin:0 calc(-1 * clamp(16px,4vw,48px));padding:4px clamp(16px,4vw,48px) 6px;-webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}
.ah-nav .sp{display:none}
}
@media print{.ah,.abanner{display:none!important}}
`;

// On a phone, scroll the nav so the current section is in view (the page itself doesn't move).
const NAV_SCRIPT = `(function(){var n=document.querySelector('.ah-nav'),a=n&&n.querySelector('a.on');if(a&&n.scrollWidth>n.clientWidth)n.scrollLeft=a.offsetLeft-n.clientWidth/2+a.offsetWidth/2})();`;

function navBar(n: AdminNav) {
  const needs = typeof n.needs === "number" && n.needs > 0 ? n.needs : 0;
  return html`<nav class="ah-nav" aria-label="Admin sections">${ADMIN_SECTIONS.map((s) => html`<a href="${s.href}"${s.id === n.section ? html` class="on" aria-current="page"` : ""}>${s.label}${s.id === "inbox" && needs ? html`<span class="badge" aria-label="${needs} need you">${needs > 99 ? "99+" : needs}</span>` : ""}</a>`)}<span class="sp"></span><a href="/" class="site">Site</a><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${n.csrf}"><button class="out" type="submit">Sign out</button></form></nav>`;
}

/** A whole admin page. Without `nav` (the login page) the header shows the brand and a link back to the site only. */
export function adminShell(o: { title: string; body: unknown; nav?: AdminNav | null; extraCss?: string; script?: string; banner?: unknown }) {
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="same-origin">
<title>${o.title}</title>
<meta name="theme-color" content="#111318">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&family=Hanken+Grotesk:wght@400;500;600&display=swap">
<style>${raw(THEME_CSS)}${raw(ADMIN_CSS)}${raw(o.extraCss ?? "")}</style>
</head>
<body class="admin">
<header class="ah"><div class="ah-in">
<a href="/admin" class="ah-brand">${raw(MARK)} Rite <span class="ah-tag">Admin</span></a>
${o.nav ? navBar(o.nav) : html`<nav class="ah-nav" aria-label="Site"><span class="sp"></span><a href="/" class="site">Back to the site</a></nav>`}
</div></header>
${o.banner ? html`<aside class="abanner" role="note"><div class="in">${o.banner}</div></aside>` : ""}
${o.body}
${o.nav ? html`<script>${raw(NAV_SCRIPT)}</script>` : ""}
${o.script ? html`<script>${raw(o.script)}</script>` : ""}
</body>
</html>`;
}
