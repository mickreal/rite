import { html } from "hono/html";
import { shell } from "./theme";

/** A refunded reading's link: closed, with what happened and where to write. Same for every page under /r/<tok>. */
export function refundedPage(opts: { supportEmail: string }) {
  const e = opts.supportEmail;
  const body = html`
<section class="wrap" style="padding-top:64px;padding-bottom:140px;display:flex;flex-direction:column;gap:28px;max-width:720px">
  <span class="kicker" style="color:#F2B544">Refunded</span>
  <h1 class="disp" style="margin:0;font-size:clamp(44px,6vw,88px);line-height:.92;letter-spacing:-.045em;font-weight:800">This reading<br>was refunded.</h1>
  <p style="margin:0;font-size:19px;line-height:1.6;color:#BDB6A8">The refund went back to your original payment method, so this link and everything attached to it (narration, questions, the calendar) are closed. If that's a mistake, write to <a href="mailto:${e}">${e}</a>.</p>
  <div><a href="/" class="ghost">Back to Rite</a></div>
</section>`;
  return shell({ title: "Refunded · Rite", description: "This Rite reading was refunded.", body });
}
