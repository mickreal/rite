import { html } from "hono/html";
import { shell } from "./theme";

export function giftPage(opts: { siteUrl: string; price: number; bought?: { code: string; email: string } }) {
  const b = opts.bought;
  const body = html`
<section class="wrap" style="padding-top:48px;padding-bottom:120px;display:flex;flex-direction:column;gap:40px">
  <div style="display:flex;flex-direction:column;gap:18px;max-width:760px">
    <span class="kicker" style="color:#F2B544">${b ? "Done" : "A gift"}</span>
    <h1 class="disp" style="margin:0;font-size:clamp(48px,7vw,112px);line-height:.9;letter-spacing:-.045em;font-weight:800">${b ? html`Their code is<br><span style="color:#F2B544">${b.code}</span>` : html`Give someone<br>their <span style="color:#F2B544">Saturn return.</span>`}</h1>
    <p style="margin:0;font-size:20px;line-height:1.6;color:#BDB6A8">${b ? html`We've emailed it to ${b.email} as well. Send them the code or this link: <a href="${opts.siteUrl}/gift/${b.code}" style="white-space:nowrap">${opts.siteUrl.replace(/^https?:\/\//, "")}/gift/${b.code}</a>` : "The full reading, paid for now and opened by them with their own birth details. Works whether or not they know their birth time. One code, one use, no expiry."}</p>
  </div>
  ${b ? html`<div class="card" style="display:flex;flex-direction:column;gap:12px;max-width:640px"><h3 class="disp" style="margin:0;font-size:24px;font-weight:600">What happens next</h3><p style="margin:0;color:#CFC8BA;line-height:1.6">They open the link, enter their birth date, place and time if they know it, and the reading is written for them on the spot. The link they get is theirs for good; it keeps updating as their cycle moves on. If they never use it, reply to the email within 14 days for a refund.</p><div><a href="/" class="ghost">Back to Rite</a></div></div>`
  : html`<div class="rv cream" style="background:#EDE6D6;color:#14110A;border-radius:40px;padding:clamp(32px,5vw,72px);display:flex;flex-wrap:wrap;gap:48px 72px;align-items:center">
    <div style="flex:1 1 380px;display:flex;flex-direction:column;gap:20px">
      <div style="display:flex;align-items:baseline;gap:14px"><span class="disp" style="font-size:88px;font-weight:800;letter-spacing:-.05em;line-height:.85">$${opts.price}</span><span style="font-size:16px;color:rgba(20,17,10,.7)">once, no subscription</span></div>
      <p style="margin:0;font-size:17px;line-height:1.6;color:rgba(20,17,10,.72);max-width:460px">You pay now and get a code by email. They redeem it with their own details; you never need to know their birth time. Add your name and a short note at checkout if you like.</p>
      <form method="post" action="/checkout"><input type="hidden" name="gift" value="1"><button type="submit" class="cta dark">Buy a gift code</button></form>
      <p style="margin:0;font-size:14px;color:rgba(20,17,10,.6)">Unused within 14 days? Full refund.</p>
    </div>
    <div style="flex:1 1 320px;display:flex;flex-direction:column;gap:14px">
      ${["Nine chapters built from their chart", "Every pass and turn dated to the day", "A month-by-month forecast and a workbook", "Five follow-up questions, and a reminder before each stage"].map((x) => html`<div style="display:flex;gap:12px;align-items:flex-start;font-size:17px;line-height:1.5"><span aria-hidden="true" style="color:#8A6A1E">◆</span><span>${x}</span></div>`)}
    </div>
  </div>`}
</section>`;
  return shell({ title: b ? "Your Rite gift code" : "Give a Saturn return reading · Rite", description: "The full Saturn return reading as a gift: a code they redeem with their own birth details.", canonical: `${opts.siteUrl}/gift`, og: `${opts.siteUrl}/og.png`, body });
}
