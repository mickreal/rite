// Creator program pages (build 8): GET /creators (what creators get, and the application form), GET /creators/d/:token
// (a creator's own dashboard) and GET /admin/creators (Mick's view). Everything from the database goes through hono/html
// interpolation (escaped); raw() is only used by shell() for CSS.
import { html } from "hono/html";
import { shell } from "./theme";
import { adminShell, type AdminNav } from "./admin-shell";
import type { CreatorRow, CreatorNumbers, PayoutRow } from "../creator-ops";
import { COUNTRIES, PLATFORMS } from "../creator-ops";
import type { CreatorsMode } from "../creators";

const money = (cents: number, cur = "usd") => { try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(cents / 100); } catch { return (cents / 100).toFixed(2); } };
const when = (iso: string | null | undefined) => (iso ?? "").replace("T", " ").slice(0, 16);
const day = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const CSS = `
.cr{display:flex;flex-direction:column;gap:40px;padding-top:40px;padding-bottom:120px}
.cr h1{margin:0;font-size:clamp(44px,7vw,104px);line-height:.92;letter-spacing:-.045em;font-weight:800}
.cr h2{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(26px,3vw,34px);letter-spacing:-.02em;font-weight:700}
.cr .lede{margin:0;font-size:20px;line-height:1.6;color:#BDB6A8;max-width:720px}
.cr .gets{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:14px}
.cr .gets .card{display:flex;flex-direction:column;gap:8px}
.cr .gets b{font-family:'Bricolage Grotesque',serif;font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1;color:#F2B544}
.cr .gets p{margin:0;color:#CFC8BA;line-height:1.55}
.cr form.apply{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:16px;max-width:760px}
.cr form.apply .wide{grid-column:1/-1}
.cr select{height:52px;border-radius:14px;border:1px solid rgba(237,230,214,.18);background:#14171D;color:#EDE6D6;font:500 17px 'Hanken Grotesk',sans-serif;padding:0 14px;color-scheme:dark;width:100%}
.cr .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.cr ul.fine{margin:0;padding-left:20px;color:#BDB6A8;line-height:1.7;max-width:760px}
.cr .ok{color:#8FC3A0}.cr .warn{color:#F2B544}
.cr .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,170px),1fr));gap:12px}
.cr .code{font-family:'Bricolage Grotesque',serif;font-size:clamp(30px,6vw,52px);font-weight:800;letter-spacing:-.02em;color:#F2B544;overflow-wrap:anywhere}
.cr .scroll{overflow-x:auto}
.cr table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.cr th{text-align:left;font-weight:500;color:#A7A196;padding:6px 10px 8px 0;border-bottom:1px solid rgba(237,230,214,.14);white-space:nowrap}
.cr td{padding:8px 10px 8px 0;border-bottom:1px solid rgba(237,230,214,.07);vertical-align:top}
.cr td.n,.cr th.n{text-align:right}
.cr .copy{overflow-wrap:anywhere;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:15px;color:#EDE6D6}
`;

// ---------- /creators ----------
export interface CreatorsPageData { siteUrl: string; pct: number; off: number; holdDays: number; minCents: number; error?: string; done?: boolean; form?: Record<string, string> }
export function creatorsPage(d: CreatorsPageData) {
  const f = d.form ?? {};
  const v = (k: string) => f[k] ?? "";
  const body = html`<section class="wrap cr">
  <div style="display:flex;flex-direction:column;gap:18px">
    <span class="kicker" style="color:#F2B544">For creators</span>
    <h1 class="disp">Talk about Saturn returns.<br><span style="color:#F2B544">Get paid for it.</span></h1>
    <p class="lede">If you make astrology content, Rite pays you for every reading your audience buys through you. No script, no posting schedule, no minimum audience.</p>
  </div>
  <div class="gets">
    <div class="card"><b>Free</b><p>Your own full reading, on us, so you can see what your audience gets before you say anything about it.</p></div>
    <div class="card"><b>${d.off}% off</b><p>A personal code (RITE-YOURNAME) and a link for your audience. The link applies the code by itself and remembers them for 30 days.</p></div>
    <div class="card"><b>${d.pct}%</b><p>Of what every sale through your code or link pays, after tax and refunds. Readings and gifts both count.</p></div>
    <div class="card"><b>Monthly</b><p>Paid on the 1st of each month, straight to your bank through Stripe. A dashboard shows clicks, sales and what you're owed.</p></div>
  </div>
  ${d.done ? html`<div class="card" role="status" style="max-width:760px;display:flex;flex-direction:column;gap:10px"><h2>Thanks, that's in.</h2><p style="margin:0;color:#CFC8BA;line-height:1.6">Mick reads every application himself. If it's a fit you'll get an email with your code, your link, your free reading and your dashboard, usually within a few days.</p><p style="margin:0"><a href="/">Back to Rite</a></p></div>`
  : html`<div style="display:flex;flex-direction:column;gap:18px">
    <h2 id="apply">Apply</h2>
    ${d.error ? html`<p class="err" role="alert">${d.error}</p>` : ""}
    <form class="apply" method="post" action="/creators/apply">
      <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" required autocomplete="email" value="${v("email")}"></div>
      <div class="field"><label for="c-handle">Your handle</label><input id="c-handle" name="handle" required autocomplete="off" placeholder="@yourname" value="${v("handle")}"></div>
      <div class="field"><label for="c-name">Name (optional)</label><input id="c-name" name="name" autocomplete="name" value="${v("name")}"></div>
      <div class="field"><label for="c-platform">Where you post most</label><select id="c-platform" name="platform">${PLATFORMS.map((p) => html`<option ${v("platform") === p ? "selected" : ""}>${p}</option>`)}</select></div>
      <div class="field wide"><label for="c-url">Link to your profile</label><input id="c-url" name="profile_url" type="url" inputmode="url" placeholder="https://" value="${v("profile_url")}"></div>
      <div class="field"><label for="c-aud">Roughly how many followers (optional)</label><input id="c-aud" name="audience" inputmode="numeric" value="${v("audience")}"></div>
      <div class="field"><label for="c-country">Where you live (for payouts)</label><select id="c-country" name="country">${COUNTRIES.map(([k, n]) => html`<option value="${k}" ${v("country") === k ? "selected" : ""}>${n}</option>`)}</select></div>
      <div class="field wide"><label for="c-note">Anything we should know (optional)</label><textarea id="c-note" name="note" class="ta" maxlength="1000">${v("note")}</textarea></div>
      <div class="hp" aria-hidden="true"><label for="c-web">Leave this empty</label><input id="c-web" name="website" tabindex="-1" autocomplete="off"></div>
      <div class="wide"><button type="submit" class="cta">Apply</button></div>
    </form>
  </div>`}
  <div style="display:flex;flex-direction:column;gap:12px">
    <h2>The small print</h2>
    <ul class="fine">
      <li>Commission is ${d.pct}% of the amount the buyer actually paid, minus any sales tax in it. A refunded sale earns nothing; a partly refunded one earns its share.</li>
      <li>Each commission waits ${d.holdDays} days (past our 14-day refund window), then goes out on the next 1st once you're owed ${money(d.minCents)} or more. Less than that carries to the next month.</li>
      <li>Payouts go through Stripe Connect: you give Stripe your identity and bank details once, and Stripe handles the tax forms. Rite never sees your bank details.</li>
      <li>Your own purchases with your code don't earn commission. Codes posted to coupon sites can be paused.</li>
      <li>No script, no deadline, no obligation to post. Say what you honestly think.</li>
    </ul>
  </div>
</section>`;
  return shell({ title: "Creators · Rite", description: `Free reading, a ${d.off}%-off code for your audience, and ${d.pct}% of every sale through it, paid monthly.`, canonical: `${d.siteUrl}/creators`, body, extraCss: CSS });
}

// ---------- /creators/d/:token ----------
export interface DashboardData { siteUrl: string; c: CreatorRow; n: CreatorNumbers; payouts: PayoutRow[]; nextPayout: string; minCents: number; holdDays: number; connect?: "done" | "unavailable" | "failed" | null }
export function dashboardPage(d: DashboardData) {
  const { c, n } = d;
  const cur = n.currency;
  const link = `${d.siteUrl}/?c=${c.handle}`;
  const pay = c.payouts_enabled ? html`<p class="ok" style="margin:0">Payouts are set up. The next one is on ${day(d.nextPayout)}.</p>`
    : c.connect_account_id ? html`<p class="warn" style="margin:0">Stripe still needs a few details before it can pay you.</p><form method="post" action="/creators/d/${c.token}/connect"><button class="cta" type="submit">Finish payout setup</button></form>`
    : html`<p style="margin:0;color:#CFC8BA">Set up payouts once: Stripe asks for your identity and bank details. Your commission is recorded either way.</p><form method="post" action="/creators/d/${c.token}/connect"><button class="cta" type="submit">Set up payouts</button></form>`;
  const flash = d.connect === "done" ? html`<p class="ok" role="status" style="margin:0">Thanks: you're back from Stripe. ${c.payouts_enabled ? "Everything's in place." : "If Stripe asked for more, you'll see the button again below."}</p>`
    : d.connect === "unavailable" ? html`<p class="warn" role="status" style="margin:0">Payout setup isn't open yet on our side. Your commission is recorded and safe; we'll email you as soon as you can connect.</p>`
    : d.connect === "failed" ? html`<p class="warn" role="status" style="margin:0">Stripe didn't answer just then. Try again in a minute; if it keeps failing, reply to any Rite email.</p>` : "";
  const body = html`<section class="wrap cr" style="gap:28px">
  <div style="display:flex;flex-direction:column;gap:10px"><span class="kicker" style="color:#F2B544">@${c.handle}${c.status === "paused" ? " · paused" : ""}</span><h1 class="disp" style="font-size:clamp(40px,6vw,72px)">Your Rite dashboard</h1></div>
  ${flash}
  <div class="card" style="display:flex;flex-direction:column;gap:12px">
    <span class="muted">Your code</span><span class="code">${c.code ?? "(being made)"}</span>
    <span class="muted">Your link</span><span class="copy">${link}</span>
    ${c.gift_code ? html`<span class="muted">Your own reading</span><a class="copy" href="${d.siteUrl}/gift/${c.gift_code}">${d.siteUrl}/gift/${c.gift_code}</a>` : ""}
  </div>
  <div class="tiles">
    <div class="stat"><b>${n.clicks30}</b><span>link clicks, 30 days (${n.clicks} all time)</span></div>
    <div class="stat"><b>${n.sales}</b><span>sales through you</span></div>
    <div class="stat"><b>${money(n.held, cur)}</b><span>commission waiting out the ${d.holdDays}-day refund window</span></div>
    <div class="stat"><b>${money(n.payable, cur)}</b><span>ready for the next payout${n.payable > 0 && n.payable < d.minCents ? ` (under ${money(d.minCents, cur)}, carried over)` : ""}</span></div>
    <div class="stat"><b>${money(n.paid, cur)}</b><span>paid to you</span></div>
  </div>
  <div class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Payouts</h2>${pay}
    ${d.payouts.length ? html`<div class="scroll"><table><thead><tr><th>Month</th><th class="n">Amount</th><th>Status</th></tr></thead><tbody>${d.payouts.map((p) => html`<tr><td>${p.period}</td><td class="n">${money(p.amount_cents, p.currency)}</td><td>${p.status === "paid" ? "Sent" : p.status === "failed" ? "Didn't go through; we're on it" : "Sending"}</td></tr>`)}</tbody></table></div>` : ""}
  </div>
  <p class="muted" style="margin:0">Keep this page's link to yourself: anyone with it can see these numbers. Questions: reply to any Rite email.</p>
</section>`;
  return shell({ title: "Your Rite dashboard", description: "Rite creator dashboard", body, extraCss: CSS, noFooter: true });
}

// ---------- /admin/creators ----------
export interface AdminCreatorRow { c: CreatorRow; n: CreatorNumbers }
export interface AdminCreatorsData { rows: AdminCreatorRow[]; payouts: PayoutRow[]; mode: CreatorsMode; pct: number; off: number; minCents: number; capCents: number; csrf: string; nav?: AdminNav; flash?: { ok?: string; error?: string }; missing?: boolean; nextPayout: string; connectProblem?: string | null }
export function adminCreatorsPage(d: AdminCreatorsData) {
  const withKey = (p: string) => p;
  const act = (c: CreatorRow, a: string, label: string, ghost = true) => html`<form method="post" action="${withKey(`/admin/creators/${c.id}/${a === "approve" ? "approve" : "state"}`)}" style="display:inline"><input type="hidden" name="csrf" value="${d.csrf}">${a !== "approve" ? html`<input type="hidden" name="do" value="${a}">` : ""}<button class="${ghost ? "ghost" : "solid"}" type="submit">${label}</button></form>`;
  const pending = d.rows.filter((r) => r.c.status === "pending"), others = d.rows.filter((r) => r.c.status !== "pending");
  const modeNote = d.mode === "on" ? html`<b class="ok">on</b>: payouts move money on the 1st` : d.mode === "dry" ? html`<b class="warn">dry</b>: payouts are worked out and emailed to you, nothing is sent` : html`<b class="warn">off</b>: no payouts run (sales and commission are still recorded)`;
  const body = html`<main class="wrap cr" style="gap:24px;padding-top:8px">
<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center"><h1 class="disp" style="font-size:clamp(32px,7vw,44px);margin:0">Creators</h1></div>
<p class="muted" style="margin:0">CREATORS is ${modeNote}. Codes take ${d.off}% off; commission ${d.pct}% of net of tax; minimum payout ${money(d.minCents)}; unpaid cap ${money(d.capCents)} until you lift it. Next run ${day(d.nextPayout)}, 09:00 Brisbane.</p>
${d.missing ? html`<p class="warn">The creator tables don't exist yet: run <code>npm run db:migrate:b8</code>.</p>` : ""}
${d.connectProblem ? html`<p class="warn" role="alert">Stripe Connect: ${d.connectProblem}</p>` : ""}
${d.flash?.ok ? html`<p class="ok" role="status">${d.flash.ok}</p>` : ""}${d.flash?.error ? html`<p class="err" role="alert">${d.flash.error}</p>` : ""}
<section class="card" aria-labelledby="h-pend"><h2 id="h-pend">Applications (${pending.length})</h2>
${pending.length ? pending.map(({ c }) => html`<div style="border-bottom:1px solid rgba(237,230,214,.08);padding:14px 0;display:flex;flex-direction:column;gap:8px">
  <div><b>@${c.handle}</b> · ${c.platform ?? "?"} · ${c.audience ?? "audience not given"} · ${c.country ?? "country not given"} · <span class="muted">${when(c.created_at)} UTC</span></div>
  <div class="muted">${c.name ?? ""} ${c.email}${c.profile_url ? html` · <a href="${c.profile_url}" rel="noopener noreferrer" target="_blank">profile</a>` : ""}</div>
  ${c.note ? html`<div style="white-space:pre-wrap;color:#CFC8BA">${c.note}</div>` : ""}
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
    <form method="post" action="${withKey(`/admin/creators/${c.id}/approve`)}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="hidden" name="csrf" value="${d.csrf}"><input class="inp" name="code" placeholder="RITE-${c.handle.toUpperCase().replace(/[^A-Z0-9]/g, "")}" aria-label="Code (leave empty for the default)" style="flex:0 1 240px"><button class="solid" type="submit">Approve and make code</button></form>
    ${act(c, "reject", "Reject")}
  </div></div>`) : html`<p class="muted" style="margin:0">None waiting.</p>`}
</section>
<section class="card" aria-labelledby="h-cr"><h2 id="h-cr">Creators (${others.length})</h2><div class="scroll"><table>
<thead><tr><th>Creator</th><th>Status</th><th>Code</th><th class="n">Clicks 30d</th><th class="n">Sales</th><th class="n">Net sales</th><th class="n">Held</th><th class="n">Payable</th><th class="n">Paid</th><th>Payouts</th><th></th></tr></thead><tbody>
${others.length ? others.map(({ c, n }) => html`<tr>
<td><b>@${c.handle}</b><br><span class="muted">${c.email}</span></td>
<td>${c.status}${c.uncapped ? "" : html`<br><span class="muted">capped</span>`}</td>
<td>${c.code ?? "-"}</td><td class="n">${n.clicks30}</td><td class="n">${n.sales}</td><td class="n">${money(n.netCents, n.currency)}</td>
<td class="n">${money(n.held, n.currency)}</td><td class="n">${money(n.payable, n.currency)}</td><td class="n">${money(n.paid, n.currency)}</td>
<td>${c.payouts_enabled ? html`<span class="ok">ready</span>` : c.connect_account_id ? "onboarding" : "not started"}</td>
<td style="white-space:nowrap">${c.status === "active" ? act(c, "pause", "Pause") : c.status === "paused" ? act(c, "resume", "Resume") : ""} ${c.uncapped ? "" : act(c, "uncap", "Lift cap")} ${c.status === "active" && !c.code ? act(c, "approve", "Retry code", false) : ""} <a href="/creators/d/${c.token}" rel="noreferrer">dashboard</a></td>
</tr>`) : html`<tr><td colspan="11" class="muted">Nobody yet.</td></tr>`}
</tbody></table></div></section>
<section class="card" aria-labelledby="h-po"><h2 id="h-po">Payouts</h2>
<form method="post" action="${withKey("/admin/creators/payouts")}" style="margin:0 0 14px"><input type="hidden" name="csrf" value="${d.csrf}"><button class="ghost" type="submit">${d.mode === "on" ? "Run payouts now" : d.mode === "dry" ? "Dry-run payouts now" : "Payouts are off"}</button></form>
<div class="scroll"><table><thead><tr><th>Month</th><th>Creator</th><th class="n">Amount</th><th>Status</th><th>Transfer</th></tr></thead><tbody>
${d.payouts.length ? d.payouts.map((p) => html`<tr><td>${p.period}</td><td>@${p.handle ?? p.creator_id}</td><td class="n">${money(p.amount_cents, p.currency)}</td><td>${p.status}${p.error ? html`<br><span class="err" style="font-size:13px">${p.error}</span>` : ""}</td><td class="copy" style="font-size:13px">${p.transfer_id ?? ""}</td></tr>`) : html`<tr><td colspan="5" class="muted">None yet.</td></tr>`}
</tbody></table></div></section>
</main>`;
  return adminShell({ title: "Rite admin · Creators", body, extraCss: CSS, nav: d.nav ?? { section: "creators", csrf: d.csrf } });
}
