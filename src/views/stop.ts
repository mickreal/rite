import { html } from "hono/html";
import { shell } from "./theme";

/**
 * Stop reminder and follow-up emails. A GET only shows the button (mail scanners open links, so a GET must never
 * unsubscribe); the POST does it. Season notes have their own manage page, linked when there is a subscription.
 */
export function stopPage(opts: { siteUrl: string; tok: string; kind: "reading" | "preview"; done: boolean; seasonUrl?: string | null }) {
  const what = opts.kind === "reading"
    ? "the reminder a week before each stage of your cycle, and the two follow-ups after your reading arrived"
    : "the pass reminders you asked for on your preview";
  const body = html`
<section class="wrap" style="padding-top:64px;padding-bottom:140px;display:flex;flex-direction:column;gap:28px;max-width:720px">
  <span class="kicker" style="color:#F2B544">${opts.done ? "Done" : "Emails"}</span>
  <h1 class="disp" style="margin:0;font-size:clamp(44px,6vw,88px);line-height:.92;letter-spacing:-.045em;font-weight:800">${opts.done ? "Stopped." : html`Stop these<br>emails?`}</h1>
  <p style="margin:0;font-size:19px;line-height:1.6;color:#BDB6A8">${opts.done
    ? html`We won't send ${what}. ${opts.kind === "reading" ? "Your reading stays at its link and keeps updating." : "Your preview stays at its link."}`
    : html`This stops ${what}. ${opts.kind === "reading" ? "Your reading isn't affected." : ""}`}</p>
  ${opts.done ? "" : html`<form method="post" action="/stop/${opts.tok}"><button type="submit" class="cta">Stop these emails</button></form>`}
  ${opts.seasonUrl ? html`<p style="margin:0;font-size:16px;line-height:1.6;color:#A7A196">Saturn Season notes are separate: <a href="${opts.seasonUrl}">change plan or stop them here</a>.</p>` : ""}
  <div><a href="${opts.kind === "reading" ? `/r/${opts.tok}` : `/p/${opts.tok}`}" class="ghost">${opts.kind === "reading" ? "Open your reading" : "Open your preview"}</a></div>
</section>`;
  return shell({ title: "Stop emails · Rite", description: "Stop Rite reminder and follow-up emails.", body });
}
