// Saturn Season manage page: plan, next note, when it stops itself, switch plan, cancel.
import { html } from "hono/html";
import { shell } from "./theme";
import type { SeasonPlan } from "../season";

const CSS = `
.sm{max-width:760px;margin:0 auto;padding:48px clamp(16px,4vw,48px) 140px;display:flex;flex-direction:column;gap:28px}
.sm h1{margin:0;font-family:'Bricolage Grotesque',serif;font-size:clamp(44px,6vw,80px);line-height:.95;letter-spacing:-.04em;font-weight:800}
.sm h2{margin:0;font-family:'Bricolage Grotesque',serif;font-size:26px;letter-spacing:-.02em;font-weight:600}
.sm p{margin:0;font-size:17px;line-height:1.65;color:#CFC8BA}
.kicker{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#F2B544;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.note{border:1px solid rgba(242,181,68,.45);background:rgba(242,181,68,.06);border-radius:18px;padding:16px 20px;font-size:16px;line-height:1.55}
.danger{color:#E08A7A}
form.inline{display:inline}
`;

export interface SeasonManageData {
  token: string;
  status: "active" | "past_due" | "canceled" | "complete" | "none";
  plan: SeasonPlan | null;
  nextNote: string | null;     // formatted, in the subscriber's zone
  tz: string;
  windowEnd: string;           // formatted
  yearlyAllowed: boolean;
  monthlyPrice: number; yearlyPrice: number;
  flash?: "switched" | "canceled" | "error" | null;
}

export function seasonManagePage(opts: { siteUrl: string; d: SeasonManageData; supportEmail: string }) {
  const { d } = opts;
  const planLabel = d.plan === "year" ? `$${d.yearlyPrice} a year` : d.plan === "month" ? `$${d.monthlyPrice} a month` : "monthly or yearly";
  const statusLabel: Record<SeasonManageData["status"], string> = {
    active: "On", past_due: "Paused: last payment failed", canceled: "Stopped", complete: "Finished: your window closed", none: "Not subscribed",
  };
  const flash = d.flash === "switched" ? html`<div class="note">Done. Your plan is now ${planLabel}. Stripe prorates the change on your next invoice.</div>`
    : d.flash === "canceled" ? html`<div class="note">Stopped. You won't be charged again, and the Monday notes end here. Your reading stays where it is.</div>`
    : d.flash === "error" ? html`<div class="note danger">That didn't go through on Stripe's side. Nothing changed. Try again in a minute, or email <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a>.</div>` : "";

  const body = html`
<main class="sm">
  <div style="display:flex;flex-direction:column;gap:10px">
    <span class="kicker">Saturn Season</span>
    <h1>Your weekly note</h1>
    <p>Every Monday at 7am where you are: where Saturn is this week relative to your chart, the dates inside the next month, and one thing to do. It stops itself when your window closes.</p>
  </div>
  ${flash}
  <div class="grid">
    <div class="stat"><b>${statusLabel[d.status]}</b><span>Status</span></div>
    <div class="stat"><b>${d.status === "active" || d.status === "past_due" ? planLabel : "—"}</b><span>Plan</span></div>
    <div class="stat"><b>${d.status === "active" && d.nextNote ? d.nextNote : "—"}</b><span>Next note (${d.tz})</span></div>
    <div class="stat"><b>${d.windowEnd}</b><span>Stops itself</span></div>
  </div>

  ${d.status === "active" ? html`
  <section style="display:flex;flex-direction:column;gap:14px">
    <h2>Change plan</h2>
    ${d.plan === "year" ? html`
      <p>You're on the yearly plan. Switching to monthly takes effect now; the unused part of the year becomes a credit that covers your monthly invoices until it runs out.</p>
      <form method="post" action="/season/plan/${d.token}"><input type="hidden" name="plan" value="month"><button type="submit" class="ghost">Switch to $${d.monthlyPrice} a month</button></form>`
    : d.yearlyAllowed ? html`
      <p>Yearly is $${d.yearlyPrice} for the full year (${Math.round((1 - d.yearlyPrice / (d.monthlyPrice * 12)) * 100)}% less than twelve months). Stripe credits the unused part of this month and charges the difference today. If your window closes before the year is up, the unused months come back to you automatically.</p>
      <form method="post" action="/season/plan/${d.token}"><input type="hidden" name="plan" value="year"><button type="submit" class="solid">Switch to $${d.yearlyPrice} a year</button></form>`
    : html`<p>You're on monthly. Yearly isn't offered this close to the end of your window (it needs at least nine months left), so monthly is the better deal for you.</p>`}
  </section>

  <section style="display:flex;flex-direction:column;gap:14px">
    <h2>Stop it</h2>
    <p>Stops the notes and the billing straight away. No questions, nothing to confirm by email. Your reading at <a href="/r/${d.token}">this link</a> stays exactly as it is.</p>
    <form method="post" action="/season/cancel/${d.token}" onsubmit="return confirm('Stop Saturn Season now? You can start it again from your reading.')"><button type="submit" class="ghost">Stop Saturn Season</button></form>
  </section>`
  : d.status === "past_due" ? html`
  <section style="display:flex;flex-direction:column;gap:14px">
    <h2>Payment failed</h2>
    <p>Stripe couldn't take the last payment, so the notes are paused. Stripe will retry on its own schedule and email you a link to update your card; once it goes through the notes resume by themselves. Or stop it here and nothing more is charged.</p>
    <form method="post" action="/season/cancel/${d.token}"><button type="submit" class="ghost">Stop Saturn Season</button></form>
  </section>`
  : html`
  <section style="display:flex;flex-direction:column;gap:14px">
    <h2>${d.status === "complete" ? "That's the season" : "Start it again"}</h2>
    <p>${d.status === "complete" ? "Saturn has left your natal sign, so there's nothing weekly left to track. Your reading keeps updating as the long cycle moves on." : "Subscribe from the bottom of your reading whenever you like."} <a href="/r/${d.token}#season">Back to your reading</a>.</p>
  </section>`}

  <p style="font-size:14px;color:#8F897E">Questions, or something looks wrong: <a href="mailto:${opts.supportEmail}">${opts.supportEmail}</a>.</p>
</main>`;

  return shell({
    title: "Saturn Season · Rite", body, extraCss: CSS, description: "Manage your Saturn Season weekly note.",
    nav: html`<nav class="main"><a href="/r/${d.token}">Your reading</a></nav>`,
  });
}
