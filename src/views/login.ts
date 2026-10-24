// GET/POST /admin/login: step 1 the admin key, step 2 (when ADMIN_TOTP_SECRET is set) the authenticator code.
// The key is never echoed back into the page; only `next` (validated by safeNext) and the signed pending token are.
import { html } from "hono/html";
import { adminShell } from "./admin-shell";

const CSS = `
.lg{max-width:460px;margin:0 auto;padding:clamp(8px,6vh,64px) 16px 96px}
.lg-card{display:flex;flex-direction:column;gap:18px;border:1px solid rgba(237,230,214,.08)}
.lg h1{margin:0;font:800 clamp(30px,7vw,40px)/1 'Bricolage Grotesque',serif;letter-spacing:-.03em}
.lg p{margin:0}
.lg form{display:flex;flex-direction:column;gap:16px;margin:0}
.lg .pw{position:relative;display:flex}
.lg .pw input{padding-right:84px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:16px;letter-spacing:.02em}
.lg .pw-toggle{position:absolute;right:6px;top:50%;transform:translateY(-50%);min-height:40px;padding:0 14px;border-radius:10px;border:0;background:rgba(237,230,214,.08);color:#EDE6D6;font:500 14px 'Hanken Grotesk',sans-serif;cursor:pointer}
.lg .pw-toggle:hover{background:rgba(237,230,214,.14)}
.lg .code{font:600 28px ui-monospace,SFMono-Regular,Menlo,monospace!important;letter-spacing:.35em;text-align:center;height:64px!important}
.lg .cta{width:100%}
.lg .note{padding:12px 14px;border-radius:14px;font-size:15px;line-height:1.45}
.lg .note.err{background:rgba(224,138,122,.1);border:1px solid rgba(224,138,122,.45);color:#F1B5A8}
.lg .note.info{background:rgba(242,181,68,.08);border:1px solid rgba(242,181,68,.4);color:#EDE6D6}
.lg .note.ok{background:rgba(143,195,160,.1);border:1px solid rgba(143,195,160,.4);color:#CFE6D6}
.lg .meta{font-size:14px;color:#A7A196}
.lg .meta a{color:#BDB6A8}
`;

export type LoginNotice = "key-in-url" | "signed-out" | "signed-out-all" | "expired";
const NOTICES: Record<LoginNotice, { cls: string; text: string }> = {
  "key-in-url": { cls: "info", text: "Sign in to continue." },
  "signed-out": { cls: "ok", text: "Signed out." },
  "signed-out-all": { cls: "ok", text: "Signed out on every device. Sign in again to carry on." },
  "expired": { cls: "info", text: "Your session ended. Sign in again to carry on." },
};

const TOGGLE = `(function(){var b=document.querySelector('.pw-toggle'),i=document.getElementById('key');if(!b||!i)return;b.hidden=false;
b.addEventListener('click',function(){var show=i.type==='password';i.type=show?'text':'password';b.textContent=show?'Hide':'Show';b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Hide password':'Show password');i.focus()});
var f=i.form;if(f)f.addEventListener('submit',function(){i.type='password'})})();`;

export function loginPage(d: { next: string; step?: "key" | "code"; pending?: string; error?: string; notice?: LoginNotice | null; status?: number }) {
  const step = d.step ?? "key";
  const notice = d.notice ? NOTICES[d.notice] : null;
  const err = d.error ? html`<p class="note err" role="alert" id="login-err">${d.error}</p>` : "";
  const keyStep = html`<form method="post" action="/admin/login" autocomplete="on">
<input type="hidden" name="next" value="${d.next}">
<input class="vh" type="text" name="username" value="rite-admin" autocomplete="username" tabindex="-1" aria-hidden="true" readonly>
<div class="field"><label for="key">Password</label>
<div class="pw"><input id="key" name="key" type="password" autocomplete="current-password" required autofocus spellcheck="false" autocapitalize="off" autocorrect="off"${d.error ? html` aria-invalid="true" aria-describedby="login-err"` : ""}>
<button type="button" class="pw-toggle" aria-controls="key" aria-pressed="false" aria-label="Show password" hidden>Show</button></div></div>
${err}
<button class="cta" type="submit">Sign in</button>
</form>`;
  const codeStep = html`<form method="post" action="/admin/login" autocomplete="off">
<input type="hidden" name="next" value="${d.next}">
<input type="hidden" name="pending" value="${d.pending ?? ""}">
<div class="field"><label for="code">Verification code</label>
<input id="code" name="code" class="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required autofocus${d.error ? html` aria-invalid="true" aria-describedby="login-err"` : ""}></div>
${err}
<button class="cta" type="submit">Verify</button>
</form>
<p class="meta"><a href="/admin/login?next=${encodeURIComponent(d.next)}">Start again</a></p>`;
  const body = html`<main class="lg"><section class="card lg-card" aria-labelledby="h-login">
<h1 id="h-login">${step === "code" ? "Verify" : "Sign in"}</h1>
${notice ? html`<p class="note ${notice.cls}" role="status">${notice.text}</p>` : ""}
${step === "code" ? codeStep : keyStep}
</section></main>`;
  return adminShell({ title: "Sign in", body, extraCss: CSS, nav: null, script: step === "key" ? TOGGLE : undefined });
}
