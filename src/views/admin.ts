// GET /admin: the /admin/stats numbers plus recent errors, stories and email queues, as one plain page.
// Everything from the database goes through hono/html interpolation (escaped); raw() is only used by shell() for CSS.
import { html } from "hono/html";
import { adminShell, type AdminNav } from "./admin-shell";
import type { AdminStats, AdminExtras, AdminMoney, AdminLogin } from "../admin";

const CSS = `
.adm{max-width:1240px;margin:0 auto;padding:8px clamp(16px,4vw,48px) 120px;display:flex;flex-direction:column;gap:28px}
.adm h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:44px;letter-spacing:-.03em;font-weight:800;line-height:1}
.adm h2{margin:0 0 14px;font-family:'Bricolage Grotesque',serif;font-size:24px;letter-spacing:-.02em;font-weight:600}
.adm .bar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
.adm .days{display:flex;gap:8px}
.adm .days a{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(237,230,214,.22);color:#EDE6D6;text-decoration:none;font-size:15px}
.adm .days a.on{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.adm .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.adm .grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:20px}
.adm .card{padding:22px 24px;border-radius:22px;min-width:0}
.adm .scroll{overflow-x:auto}
.adm table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.adm th{text-align:left;font-weight:500;color:#A7A196;padding:6px 10px 8px 0;border-bottom:1px solid rgba(237,230,214,.14);white-space:nowrap}
.adm td{padding:7px 10px 7px 0;border-bottom:1px solid rgba(237,230,214,.07);vertical-align:top}
.adm td.n,.adm th.n{text-align:right}
.adm .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;color:#CFC8BA}
.adm .story{border-bottom:1px solid rgba(237,230,214,.08);padding:12px 0;display:flex;flex-direction:column;gap:6px}
.adm .story:last-child{border-bottom:0}
.adm .story p{margin:0;white-space:pre-wrap;line-height:1.55;color:#E3DCCB}
.adm .meta{font-size:14px;color:#A7A196;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.adm .chip{min-height:26px;padding:0 10px;font-size:13px}
.adm .empty{color:#8F897E;margin:0}
.adm .sec{display:flex;flex-direction:column;gap:12px}
.adm .sec form{margin:0}
.adm .logins{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:15px}
.adm .logins li{display:flex;gap:4px 12px;flex-wrap:wrap;border-bottom:1px solid rgba(237,230,214,.07);padding-bottom:6px}
.adm .logins li:last-child{border-bottom:0}
.adm .ok{color:#8FC3A0}.adm .warn{color:#F2B544}
@media (max-width:520px){.adm h1{font-size:34px}.adm .days{flex-wrap:wrap}}
`;

const num = (v: unknown) => (typeof v === "number" ? v : v == null ? 0 : Number(v) || 0);
const when = (iso: string | null | undefined) => (iso ?? "").replace("T", " ").slice(0, 16);

export interface AdminSecurity { totp: boolean; recent: AdminLogin[]; failed24h: number }
export interface AdminPageData { stats: AdminStats; extras: AdminExtras; money?: AdminMoney; currency: string; generatedAt?: string; nav?: AdminNav; security?: AdminSecurity }

/** One admin_login row's detail as a line: when, where from, and whether the code was asked for. */
function loginLine(r: AdminLogin) {
  let d: { ip?: string; country?: string; ua?: string; mfa?: boolean } = {};
  try { d = JSON.parse(r.detail ?? "{}"); } catch { /* keep empty */ }
  return html`<li><span>${when(r.at)} UTC</span><span class="muted">${d.ip ?? "?"}${d.country ? ` (${d.country})` : ""}</span><span class="muted">${(d.ua ?? "").slice(0, 80)}</span><span class="${d.mfa ? "ok" : "warn"}">${d.mfa ? "with code" : "key only"}</span></li>`;
}

function security(x: AdminSecurity, csrf: string) {
  return html`<section class="card sec" aria-labelledby="h-sec"><h2 id="h-sec" style="margin:0">Sign-in and security</h2>
<p style="margin:0">Two-factor is ${x.totp ? html`<b class="ok">on</b>: signing in takes the key and a code from your authenticator app.` : html`<b class="warn">off</b>: the key alone signs in. Run <code>npm run admin:totp</code> and follow what it prints.`}
Sessions last 14 days on each device. Failed attempts in the last 24 h: <b class="${x.failed24h ? "warn" : ""}">${x.failed24h}</b>.</p>
<h3 style="margin:4px 0 0;font-size:16px">Last 5 sign-ins</h3>
${x.recent.length ? html`<ul class="logins">${x.recent.map(loginLine)}</ul>` : html`<p class="empty">None recorded yet.</p>`}
<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="everywhere" value="1"><button class="ghost" type="submit">Sign out everywhere</button></form>
<p class="meta" style="margin:0">Signs out every browser, this one included. Scripts using the bearer key aren't affected; to cut those off, change <code>ADMIN_KEY</code>.</p>
</section>`;
}

/** Price test: previews, purchases, purchase rate and revenue per preview (net of tax) for each arm, and the result once done. */
function priceTest(m: AdminMoney, money: (c: unknown) => string) {
  let done: { winner?: string; reason?: string } | null = null;
  if (m.price_test_done?.detail) { try { done = JSON.parse(m.price_test_done.detail); } catch { done = {}; } }
  return html`<section class="card" aria-labelledby="h-price"><h2 id="h-price">Price test</h2>
<p class="muted" style="margin:0 0 12px">${done ? html`Stopped ${when(m.price_test_done!.at)} UTC (${done.reason === "previews" ? "600 previews per arm" : "14 days"}). Winner by revenue per preview: <b>arm ${done.winner ?? "?"}</b>. New previews see arm A; switching the price is a config change.` : "Running: new previews split by a hash of their id. Stops itself after 14 days or 600 previews per arm."}</p>
<div class="scroll"><table><thead><tr><th>Arm</th><th class="n">Previews</th><th class="n">Purchases</th><th class="n">Purchase rate</th><th class="n">Revenue (net of tax)</th><th class="n">Per preview</th></tr></thead><tbody>
${m.arms.length ? m.arms.map((a) => html`<tr><td>${a.arm}</td><td class="n">${num(a.previews)}</td><td class="n">${num(a.purchases)}</td><td class="n">${a.previews ? (num(a.purchases) / num(a.previews) * 100).toFixed(1) : "0.0"}%</td><td class="n">${money(a.cents)}</td><td class="n">${money(a.previews ? num(a.cents) / num(a.previews) : 0)}</td></tr>`) : html`<tr><td colspan="6" class="empty">Nothing yet.</td></tr>`}
</tbody></table></div></section>`;
}

export function adminPage(d: AdminPageData) {

  const { stats: s, extras: x } = d;
  const money = (cents: unknown) => {
    try { return new Intl.NumberFormat("en-US", { style: "currency", currency: (d.currency || "usd").toUpperCase() }).format(num(cents) / 100); }
    catch { return (num(cents) / 100).toFixed(2); }
  };
  const rev = (s.revenue ?? {}) as Record<string, unknown>;
  const gifts = (s.gifts ?? {}) as Record<string, unknown>;
  const href = (days: number) => `/admin?days=${days}`;
  const f = s.funnel;
  const tile = (v: unknown, label: string) => html`<div class="stat"><b>${v}</b><span>${label}</span></div>`;
  const rows = <T,>(list: T[], cols: number, fn: (r: T) => unknown) => list.length ? list.map(fn) : html`<tr><td colspan="${cols}" class="empty">Nothing yet.</td></tr>`;
  const queue = (label: string, q: { pending: number; due: number }) => html`<tr><td>${label}</td><td class="n">${q.pending}</td><td class="n">${q.due}</td></tr>`;

  const body = html`<main class="adm">
<div class="bar"><h1>Dashboard</h1><nav class="days" aria-label="Period">${[7, 30, 90].map((n) => html`<a href="${href(n)}" class="${n === s.days ? "on" : ""}" ${n === s.days ? html`aria-current="page"` : ""}>${n} days</a>`)}</nav></div>
<p class="muted" style="margin:-16px 0 0">Last ${s.days} days${d.generatedAt ? html` · as of ${when(d.generatedAt)} UTC` : ""}. Same numbers as <code>/admin/stats?days=${s.days}</code>.</p>

<section aria-labelledby="h-funnel"><h2 id="h-funnel">Funnel</h2><div class="tiles">
${tile(f.previews, "previews")}${tile(f.checkouts, `checkouts · ${f.preview_to_checkout}% of previews`)}${tile(f.paid, `paid · ${f.checkout_to_paid}% of checkouts`)}${tile(f.generated, "readings written")}
${tile(money(rev.cents), `revenue · ${num(rev.n)} purchases`)}${tile(num(rev.free_or_gift), "free or gift")}
${d.money ? html`${tile(money(d.money.tax_30d), "tax collected (30d)")}${tile(num(d.money.bumps_30d.n), `order bumps (30d) · ${money(d.money.bumps_30d.cents)}`)}` : ""}
</div></section>
${d.money && (d.money.arms.length || d.money.price_test_done) ? priceTest(d.money, money) : ""}

<div class="grid2">
<section class="card" aria-labelledby="h-season"><h2 id="h-season">Saturn Season</h2><table><thead><tr><th>Status</th><th class="n">Subscriptions</th></tr></thead><tbody>
${rows(s.subscriptions as Array<{ status: string; n: number }>, 2, (r) => html`<tr><td>${r.status}</td><td class="n">${r.n}</td></tr>`)}
</tbody></table></section>
<section class="card" aria-labelledby="h-gifts"><h2 id="h-gifts">Gifts</h2><table><tbody>
<tr><td>Sold</td><td class="n">${num(gifts.sold)}</td></tr><tr><td>Redeemed</td><td class="n">${num(gifts.redeemed)}</td></tr>
</tbody></table></section>
<section class="card" aria-labelledby="h-queues"><h2 id="h-queues">Email queues</h2><table><thead><tr><th>Queue</th><th class="n">Pending</th><th class="n">Due now</th></tr></thead><tbody>
${queue("Follow-ups (day 3 / day 10)", x.followups)}${queue("Pass reminders", x.reminders)}${queue("Stage reminders", x.stage_reminders)}
</tbody></table></section>
<section class="card" aria-labelledby="h-events"><h2 id="h-events">Events</h2><table><thead><tr><th>Kind</th><th class="n">Count</th></tr></thead><tbody>
${rows(s.events as Array<{ kind: string; n: number }>, 2, (r) => html`<tr><td>${r.kind}</td><td class="n">${r.n}</td></tr>`)}
</tbody></table></section>
</div>

<div class="grid2">
<section class="card" aria-labelledby="h-ref"><h2 id="h-ref">By ref</h2><div class="scroll"><table><thead><tr><th>Ref</th><th class="n">Previews</th><th class="n">Purchases</th><th class="n">Revenue</th></tr></thead><tbody>
${rows(s.by_ref as Array<{ ref: string; previews: number; purchases: number; cents: number }>, 4, (r) => html`<tr><td>${r.ref}</td><td class="n">${r.previews}</td><td class="n">${r.purchases}</td><td class="n">${money(r.cents)}</td></tr>`)}
</tbody></table></div></section>
<section class="card" aria-labelledby="h-sign"><h2 id="h-sign">By sign</h2><div class="scroll"><table><thead><tr><th>Sign</th><th class="n">Return</th><th class="n">Previews</th><th class="n">Purchases</th></tr></thead><tbody>
${rows(s.by_sign as Array<{ sign: string; rn: number; previews: number; purchases: number }>, 4, (r) => html`<tr><td>${r.sign}</td><td class="n">${r.rn}</td><td class="n">${r.previews}</td><td class="n">${r.purchases}</td></tr>`)}
</tbody></table></div></section>
</div>

<section class="card" aria-labelledby="h-daily"><h2 id="h-daily">Daily</h2><div class="scroll"><table><thead><tr><th>Day (UTC)</th><th class="n">Previews</th><th class="n">Checkouts</th><th class="n">Paid</th></tr></thead><tbody>
${rows(s.daily as Array<{ day: string; previews: number; checkouts: number; paid: number }>, 4, (r) => html`<tr><td>${r.day}</td><td class="n">${r.previews}</td><td class="n">${r.checkouts}</td><td class="n">${r.paid}</td></tr>`)}
</tbody></table></div></section>

<section class="card" aria-labelledby="h-errors"><h2 id="h-errors">Last 20 errors</h2><div class="scroll"><table><thead><tr><th>At (UTC)</th><th>Ref</th><th>Detail</th></tr></thead><tbody>
${rows(x.errors, 3, (r) => html`<tr><td style="white-space:nowrap">${when(r.at)}</td><td class="mono">${r.ref ? `${r.ref.slice(0, 6)}…` : "-"}</td><td class="mono">${r.detail ?? ""}</td></tr>`)}
</tbody></table></div></section>

<section class="card" aria-labelledby="h-stories"><h2 id="h-stories">Last 20 stories</h2>
${x.stories.length ? x.stories.map((r) => html`<div class="story"><div class="meta"><span>${when(r.created_at)}</span><span>${r.first_name ?? "no name"}</span><span>Saturn in ${r.sign ?? "?"}</span>${r.can_quote ? html`<span class="chip warm">can quote</span>` : html`<span class="chip">private</span>`}<span class="mono">${r.purchase_id.slice(0, 6)}…</span></div><p>${r.text}</p></div>`) : html`<p class="empty">Nothing yet.</p>`}
</section>
${d.security ? security(d.security, d.nav?.csrf ?? "") : ""}
</main>`;

  const banner = d.security && !d.security.totp
    ? html`<b>Two-factor is off.</b> Anyone with the admin key can sign in. Run <code>npm run admin:totp</code>, add <code>ADMIN_TOTP_SECRET</code> and deploy (README, "Admin").`
    : null;
  return adminShell({ title: "Rite admin · Dashboard", body, extraCss: CSS, nav: d.nav ?? { section: "dashboard", csrf: "" }, banner });
}

// ---------- GET /admin/kpi: the Monday KPI email's text, laid out (the text itself stays at /admin/kpi.txt) ----------
const KPI_CSS = `
.kpi{max-width:880px;margin:0 auto;padding:0 clamp(16px,4vw,48px) 120px;display:flex;flex-direction:column;gap:18px}
.kpi h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(32px,7vw,44px);letter-spacing:-.03em;font-weight:800;line-height:1}
.kpi .head{font:600 clamp(19px,4.4vw,24px)/1.3 'Bricolage Grotesque',serif;letter-spacing:-.01em;margin:0;color:#EDE6D6;overflow-wrap:anywhere}
.kpi .head.look{color:#F2B544}
.kpi .card{padding:18px 20px;border-radius:22px}
.kpi h2{margin:0 0 10px;font:600 13px 'Hanken Grotesk',sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#A7A196}
.kpi dl{margin:0;display:grid;grid-template-columns:minmax(0,max-content) minmax(0,1fr);gap:8px 18px;font-size:15px}
.kpi dt{color:#A7A196;white-space:nowrap}
.kpi dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.kpi .line{margin:0;font-size:15px;overflow-wrap:anywhere}
.kpi .bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
.kpi .warnline{color:#F2B544}
@media (max-width:560px){.kpi dl{grid-template-columns:1fr;gap:2px}.kpi dd{margin-bottom:8px}}
`;

interface KpiBlock { title: string | null; rows: Array<{ k: string | null; v: string }> }

/** Split the KPI text: line 1 the headline, then paragraphs; an unindented line starts a section, "  Label: value" is a row. */
export function kpiBlocks(text: string): { headline: string; intro: string[]; blocks: KpiBlock[] } {
  const lines = text.replace(/\n+$/, "").split("\n");
  const headline = lines.shift() ?? "";
  const intro: string[] = [];
  const blocks: KpiBlock[] = [];
  let cur: KpiBlock | null = null;
  for (const l of lines) {
    if (!l.trim()) { cur = null; continue; }
    if (/^\s/.test(l)) {
      if (!cur) { cur = { title: null, rows: [] }; blocks.push(cur); }
      const t = l.trim(), i = t.indexOf(": ");
      cur.rows.push(i > 0 && i < 48 ? { k: t.slice(0, i), v: t.slice(i + 2) } : { k: null, v: t });
    } else if (/^[A-Z][A-Z0-9 &/_-]*$/.test(l.replace(/\s*\(.*\)\s*$/, ""))) { cur = { title: l, rows: [] }; blocks.push(cur); }
    else if (!blocks.length) intro.push(l);
    else { cur = { title: null, rows: [{ k: null, v: l }] }; blocks.push(cur); }
  }
  return { headline, intro, blocks };
}

export function kpiPage(d: { text: string; nav?: AdminNav; generatedAt?: string }) {
  const k = kpiBlocks(d.text);
  const warn = (v: string) => /FAILED|NOT available|failed|isn't applied/.test(v);
  const body = html`<main class="kpi">
<div class="bar"><h1>KPI</h1><a class="ghost" href="/admin/kpi.txt">Plain text</a></div>
<p class="head${k.headline.startsWith("Look at") ? " look" : ""}">${k.headline}</p>
${k.intro.map((l) => html`<p class="muted" style="margin:0">${l}</p>`)}
${k.blocks.map((b) => html`<section class="card">${b.title ? html`<h2>${b.title}</h2>` : ""}${b.rows.some((r) => r.k) ? html`<dl>${b.rows.map((r) => (r.k ? html`<dt>${r.k}</dt><dd class="${warn(r.v) ? "warnline" : ""}">${r.v}</dd>` : html`<dd style="grid-column:1/-1" class="${warn(r.v) ? "warnline" : ""}">${r.v}</dd>`))}</dl>` : b.rows.map((r) => (/^https?:\/\/\S+$/.test(r.v) ? html`<p class="line"><a href="${r.v}">${r.v}</a></p>` : html`<p class="line${warn(r.v) ? " warnline" : ""}">${r.v}</p>`))}</section>`)}
<p class="meta muted" style="margin:0;font-size:14px">The same text the Monday email sends${d.generatedAt ? html`, built ${when(d.generatedAt)} UTC` : ""}. Scripts: <code>curl -H "Authorization: Bearer $ADMIN_KEY" …/admin/kpi.txt</code>.</p>
</main>`;
  return adminShell({ title: "Rite admin · KPI", body, extraCss: KPI_CSS, nav: d.nav ?? { section: "kpi", csrf: "" } });
}
