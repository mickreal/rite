// The support inbox (build 3b): GET /admin/inbox (threads), GET /admin/inbox/t/:id (one thread, with the reply box) and
// GET /admin/login. Plain server-rendered HTML in the /admin style, built for a phone first. Everything from the
// database or an email goes through hono/html interpolation (escaped); raw() is only used by shell() for CSS.
import { html } from "hono/html";
import { shell } from "./theme";
import type { ThreadSummary, ThreadView, Tab, TimelineItem } from "../inbox-ui";
import { STATUS_LABEL } from "../inbox-ui";

const CSS = `
.ib{max-width:880px;margin:0 auto;padding:4px 16px 120px;display:flex;flex-direction:column;gap:18px}
.ib h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(30px,8vw,44px);letter-spacing:-.03em;font-weight:800;line-height:1.05;overflow-wrap:anywhere}
.ib h2{margin:0 0 10px;font-family:'Bricolage Grotesque',serif;font-size:22px;letter-spacing:-.02em;font-weight:600}
.ib p{margin:0}
.ib a{color:#F2B544}
.ib .top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.ib .tabs{display:flex;gap:8px;flex-wrap:wrap}
.ib .tabs a{display:inline-flex;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;border:1px solid rgba(237,230,214,.22);color:#EDE6D6;text-decoration:none;font-size:15px}
.ib .tabs a.on{background:#EDE6D6;color:#0E1014;border-color:#EDE6D6}
.ib .list{display:flex;flex-direction:column;gap:10px}
.ib a.th{display:block;padding:14px 16px;border-radius:18px;background:#14171D;color:#EDE6D6;text-decoration:none;min-width:0}
.ib a.th:hover,.ib a.th:focus-visible{background:#1A1E25}
.ib .r1{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.ib .who{font-weight:600;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ib .when{color:#A7A196;font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
.ib .subj{font-size:16px;margin-top:3px;overflow-wrap:anywhere}
.ib .snip{color:#A7A196;font-size:14px;margin-top:4px;overflow-wrap:anywhere;line-height:1.45}
.ib .badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;align-items:center}
.ib .st{display:inline-flex;align-items:center;font-size:12px;line-height:1;padding:5px 10px;border-radius:999px;border:1px solid rgba(237,230,214,.2);color:#CFC8BA;white-space:nowrap}
.ib .st.needs_mick{background:#F2B544;color:#14110A;border-color:#F2B544;font-weight:600}
.ib .st.mick_replied{border-color:#8FC3A0;color:#8FC3A0}
.ib .st.closed{color:#8F897E}
.ib .st.mine{border-color:#EDE6D6;color:#EDE6D6}
.ib .meta{font-size:13px;color:#A7A196;display:flex;gap:4px 12px;flex-wrap:wrap}
.ib .warn{color:#F2B544}
.ib .ok{color:#8FC3A0}
.ib .empty{color:#8F897E}
.ib .msg{padding:14px 16px;border-radius:18px;background:#14171D;min-width:0}
.ib .msg.out{background:#191D24;border-left:3px solid #A7A196}
.ib .msg.out.mick{border-left-color:#8FC3A0}
.ib .msg.failed{border-left-color:#E07A5F}
.ib .bd{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin-top:8px;font-size:15px;color:#E3DCCB}
.ib details summary{cursor:pointer;color:#A7A196;font-size:13px;margin-top:8px}
.ib .mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px;white-space:pre-wrap;overflow-wrap:anywhere;color:#CFC8BA;margin:8px 0 0}
.ib .actions{display:flex;gap:8px;flex-wrap:wrap}
.ib form{margin:0}
.ib textarea{width:100%;min-height:240px;border-radius:14px;border:1px solid rgba(237,230,214,.18);background:#0E1014;color:#EDE6D6;font:16px/1.5 'Hanken Grotesk',sans-serif;padding:12px 14px;color-scheme:dark;resize:vertical}
.ib textarea:focus{outline:none;border-color:#F2B544;box-shadow:0 0 0 4px rgba(242,181,68,.18)}
.ib .reply{display:flex;flex-direction:column;gap:10px}
.ib .reply .cta{align-self:flex-start}
.ib .note{padding:12px 14px;border-radius:14px;background:#1B1F26;font-size:15px}
.ib .login{max-width:420px;display:flex;flex-direction:column;gap:12px}
@media (max-width:520px){.ib .reply .cta{align-self:stretch}.ib .cta{width:100%}}
`;

const when = (iso: string | null | undefined) => (iso ?? "").replace("T", " ").slice(0, 16);
const nav = html`<nav class="main"><a href="/">Site</a></nav>`;
const page = (title: string, body: unknown) => shell({ title, description: "Admin", body, extraCss: CSS, noFooter: true, nav });
/** ?key=… (or &key=…) when the page was opened with the key; empty with a cookie session. */
const withKey = (path: string, key?: string | null) => (key ? `${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(key)}` : path);

export function threadsPage(d: { threads: ThreadSummary[]; counts: Record<Tab, number>; tab: Tab; auto: boolean; missing006?: boolean; missing007?: boolean; key?: string | null; csrf: string; session: boolean; generatedAt?: string }) {
  const tab = (t: Tab, label: string) => html`<a href="${withKey(`/admin/inbox${t === "needs" ? "" : `?tab=${t}`}`, d.key)}" class="${d.tab === t ? "on" : ""}" ${d.tab === t ? html`aria-current="page"` : ""}>${label} (${d.counts[t]})</a>`;
  const body = html`<main class="ib">
<div class="top"><h1>Inbox</h1>${d.session ? html`<form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${d.csrf}"><button class="ghost" type="submit">Sign out</button></form>` : ""}</div>
<p class="muted">Every email to hello@, by thread, newest activity first${d.generatedAt ? html` · ${when(d.generatedAt)} UTC` : ""}. INBOX_AUTO is <b class="${d.auto ? "ok" : "warn"}">${d.auto ? "on" : "off"}</b>${d.auto ? "" : ": the assistant only drafts; every message comes to you"}. <a href="${withKey("/admin", d.key)}">Admin</a></p>
${d.missing006 ? html`<p class="warn">The support_messages table doesn't exist yet: run <code>npm run db:migrate:b3</code>.</p>` : ""}
${d.missing007 && !d.missing006 ? html`<p class="warn">Read-only until migration 007 is applied (statuses are worked out, replies can't be stored or sent): run <code>npm run db:migrate:b3b</code>.</p>` : ""}
<nav class="tabs" aria-label="Filter">${tab("needs", "Needs me")}${tab("all", "All")}${tab("closed", "Closed")}</nav>
<div class="list">
${d.threads.length ? d.threads.map((t) => html`<a class="th" href="${withKey(`/admin/inbox/t/${t.urlKey}`, d.key)}">
<div class="r1"><span class="who">${t.from}</span><span class="when">${when(t.lastAt)}</span></div>
<div class="subj">${t.subject}</div>
<div class="snip">${t.snippet || "(empty)"}</div>
<div class="badges"><span class="st ${t.status}">${STATUS_LABEL[t.status]}</span>${t.owner === "mick" && t.status !== "mick_replied" ? html`<span class="st mine">Yours</span>` : ""}${t.cls ? html`<span class="st">${t.cls}</span>` : ""}<span class="meta">${t.messages} in${t.replies ? html` · ${t.replies} out` : ""}</span></div>
</a>`) : html`<p class="empty">${d.tab === "needs" ? "Nothing needs you." : "Nothing here."}</p>`}
</div>
</main>`;
  return page("Rite inbox", body);
}

function item(it: TimelineItem) {
  if (it.kind === "out") {
    const who = it.author === "mick" ? "You" : "Assistant";
    return html`<article class="msg out ${it.author}${it.status === "sent" ? "" : " failed"}">
<div class="meta"><b>${who}</b><span>to ${it.to}</span><span>${when(it.at)} UTC</span>${it.status === "sent" ? "" : html`<span class="warn">${it.status === "failed" ? "not sent" : "sending (check Resend)"}</span>`}${it.legacy ? html`<span>(build 3 reply)</span>` : ""}</div>
<div class="bd">${it.body || "(not kept)"}</div>
</article>`;
  }
  const quoted = it.own.trim() !== it.body.trim();
  return html`<article class="msg in">
<div class="meta"><b>${it.from}</b><span>${when(it.at)} UTC</span>${it.cls ? html`<span>${it.cls}${it.confidence !== null && it.confidence !== undefined ? ` ${Number(it.confidence).toFixed(2)}` : ""}</span>` : ""}<span class="mono" style="margin:0">${it.action ?? "-"} → ${it.outcome ?? "-"}</span>${it.authPass ? "" : html`<span class="warn">SPF/DKIM fail</span>`}${it.attachment ? html`<span class="warn">attachment (in your forwarded copy)</span>` : ""}</div>
${it.subject ? html`<div class="subj" style="font-size:15px;margin-top:6px">${it.subject}</div>` : ""}
<div class="bd">${it.own || "(empty)"}</div>
${quoted ? html`<details><summary>Full message</summary><p class="mono">${it.body}</p></details>` : ""}
${it.authDetail && !it.authPass ? html`<details><summary>Auth results</summary><p class="mono">${it.authDetail}</p></details>` : ""}
</article>`;
}

export function threadPage(d: { t: ThreadView; key?: string | null; csrf: string; nonce: string; auto: boolean; flash?: { ok?: string; error?: string }; text?: string }) {
  const t = d.t;
  const act = (a: string, label: string) => html`<form method="post" action="${withKey(`/admin/inbox/t/${t.urlKey}/state`, d.key)}"><input type="hidden" name="csrf" value="${d.csrf}"><input type="hidden" name="do" value="${a}"><button class="ghost" type="submit">${label}</button></form>`;
  const text = d.text ?? t.draft ?? "";
  const body = html`<main class="ib">
<p><a href="${withKey("/admin/inbox", d.key)}">← Inbox</a></p>
<h1>${t.subject}</h1>
<div class="badges"><span class="st ${t.status}">${STATUS_LABEL[t.status]}</span>${t.owner === "mick" ? html`<span class="st mine">Yours: the assistant won't act</span>` : html`<span class="st">Assistant can act${d.auto ? "" : " (INBOX_AUTO off)"}</span>`}<span class="meta">${t.from}</span></div>
${d.flash?.ok ? html`<p class="note ok" role="status">${d.flash.ok}</p>` : ""}
${d.flash?.error ? html`<p class="note warn" role="alert">${d.flash.error}</p>` : ""}
${t.missing007 ? html`<p class="warn">Read-only: run <code>npm run db:migrate:b3b</code> (migration 007) to reply, close or take over from here.</p>` : ""}
<div class="actions">
${t.status === "closed" ? act("reopen", "Reopen") : act("close", "Close")}
${t.owner === "mick" ? act("handback", "Hand back to assistant") : act("take", "I've got this")}
</div>
<section class="list" aria-label="Conversation">${t.items.map(item)}</section>
${t.replyTo ? html`<section class="msg reply" aria-labelledby="h-reply">
<h2 id="h-reply">Reply</h2>
<p class="meta"><span>To ${t.replyTo}</span><span>from hello@ as "Rite", threaded</span></p>
${t.draft && d.text === undefined ? html`<p class="meta">Prefilled with the assistant's draft. Edit the {…} parts; it won't send with one left in.</p>` : ""}
<form method="post" action="${withKey(`/admin/inbox/t/${t.urlKey}/reply`, d.key)}" class="reply">
<input type="hidden" name="csrf" value="${d.csrf}"><input type="hidden" name="nonce" value="${d.nonce}">
<label for="body" class="meta">Message</label>
<textarea id="body" name="body" required>${text}</textarea>
<button class="cta" type="submit"${t.missing007 ? html` disabled` : ""}>Send</button>
</form>
<p class="meta">Sending takes the thread over: the assistant won't act on it again until you hand it back.</p>
</section>` : html`<p class="empty">No customer address left to reply to.</p>`}
<section class="msg" aria-labelledby="h-cust"><h2 id="h-cust">Customer</h2>${t.history ? html`<p class="mono">${t.history}</p>` : html`<p class="empty">No history (address deleted or unknown).</p>`}</section>
</main>`;
  return page("Rite inbox · thread", body);
}

export function loginPage(d: { next: string; error?: string }) {
  const body = html`<main class="ib">
<h1>Admin</h1>
<form method="post" action="/admin/login" class="login">
<input type="hidden" name="next" value="${d.next}">
<label for="key" class="meta">Admin key</label>
<input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
${d.error ? html`<p class="warn" role="alert">${d.error}</p>` : ""}
<button class="cta" type="submit">Sign in</button>
<p class="meta">Keeps you signed in on this device for 30 days.</p>
</form>
</main>`;
  return page("Rite admin", body);
}
