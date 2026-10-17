// GET /admin/inbox: the last 100 support messages (build 3), newest first, in the /admin style. Everything from the
// database goes through hono/html interpolation (escaped).
import { html } from "hono/html";
import { shell } from "./theme";

export interface InboxRow {
  id: string; received_at: string; from_addr: string; subject: string | null; body_text: string | null; class: string | null; confidence: number | null;
  status: string; action: string | null; outcome: string | null; auth_pass: number; auth_detail?: string | null; has_attachment: number; draft: string | null;
}

const CSS = `
.adm{max-width:1240px;margin:0 auto;padding:8px clamp(16px,4vw,48px) 120px;display:flex;flex-direction:column;gap:24px}
.adm h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:44px;letter-spacing:-.03em;font-weight:800;line-height:1}
.adm .scroll{overflow-x:auto}
.adm table{width:100%;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.adm th{text-align:left;font-weight:500;color:#A7A196;padding:6px 10px 8px 0;border-bottom:1px solid rgba(237,230,214,.14);white-space:nowrap}
.adm td{padding:7px 10px 7px 0;border-bottom:1px solid rgba(237,230,214,.07);vertical-align:top}
.adm .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;color:#CFC8BA}
.adm details summary{cursor:pointer;color:#E3DCCB}
.adm .meta{font-size:14px;color:#A7A196}
.adm .warn{color:#F2B544}
.adm .empty{color:#8F897E;margin:0}
`;

const when = (iso: string | null | undefined) => (iso ?? "").replace("T", " ").slice(0, 16);

export function inboxPage(d: { rows: InboxRow[]; auto: boolean; missing?: boolean; key?: string | null; generatedAt?: string }) {
  const k = d.key ? `?key=${encodeURIComponent(d.key)}` : "";
  const body = html`<main class="adm">
<h1>Inbox</h1>
<p class="muted" style="margin:-12px 0 0">Last 100 emails to hello@${d.generatedAt ? html` · as of ${when(d.generatedAt)} UTC` : ""}. INBOX_AUTO is <b class="${d.auto ? "" : "warn"}">${d.auto ? "on" : "off"}</b>${d.auto ? "" : ": nothing is sent to customers; every message goes to you with the draft and what it would do"}. <a href="/admin${k}" style="color:#F2B544">Admin</a></p>
${d.missing ? html`<p class="warn">The support_messages table doesn't exist yet: run <code>npm run db:migrate:b3</code>.</p>` : ""}
<div class="scroll"><table><thead><tr><th>At (UTC)</th><th>From</th><th>Class</th><th>Status</th><th>Action → outcome</th><th>Message</th></tr></thead><tbody>
${d.rows.length ? d.rows.map((r) => html`<tr>
<td style="white-space:nowrap">${when(r.received_at)}</td>
<td class="mono">${r.from_addr}${r.auth_pass ? "" : html`<br><span class="warn">SPF/DKIM fail</span>`}${r.has_attachment ? html`<br><span class="meta">attachment</span>` : ""}</td>
<td>${r.class ?? "-"}${r.confidence !== null && r.confidence !== undefined ? html`<br><span class="meta">${Number(r.confidence).toFixed(2)}</span>` : ""}</td>
<td>${r.status}</td>
<td class="mono">${r.action ?? "-"} → ${r.outcome ?? "-"}</td>
<td><details><summary>${r.subject || "(no subject)"}</summary><p class="mono">${(r.body_text ?? "").slice(0, 3000)}</p>${r.auth_detail ? html`<p class="meta">Auth: ${r.auth_detail}</p>` : ""}${r.draft ? html`<p class="meta">Reply${r.status === "forwarded" ? " (draft)" : ""}:</p><p class="mono">${r.draft}</p>` : ""}</details></td>
</tr>`) : html`<tr><td colspan="6" class="empty">Nothing yet.</td></tr>`}
</tbody></table></div>
</main>`;
  return shell({ title: "Rite inbox", description: "Admin", body, extraCss: CSS, noFooter: true, nav: html`<nav class="main"><a href="/">Site</a></nav>` });
}
