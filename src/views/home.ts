import { html, raw } from "hono/html";
import { page } from "./layout";
import type { Computed } from "../compute";
import { fmtDay, fmtMonth, fmtDeg, phaseLabel, houseLabel } from "../compute";
import { SIGN_NOTES } from "../content/notes";

const FIG = `<svg viewBox="0 0 520 520" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<circle cx="260" cy="260" r="218" class="ring"/><circle cx="260" cy="260" r="174" class="ring"/><circle cx="260" cy="260" r="124" class="ring"/>
${[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a) => `<line x1="260" y1="44" x2="260" y2="${a % 90 === 0 ? 88 : 66}" transform="rotate(${a} 260 260)" class="ring"/>`).join("")}
<ellipse cx="260" cy="260" rx="194" ry="96" transform="rotate(-28 260 260)" class="orbit"/>
<circle cx="260" cy="260" r="26" class="planet"/><ellipse cx="260" cy="260" rx="68" ry="23" transform="rotate(-28 260 260)" class="orbit"/>
</svg>`;

export interface PreviewView {
  id: string;
  c: Computed;
  text: string;
  placeLabel: string;
  hasTime: boolean;
}

export function previewBlock(p: PreviewView) {
  const w = p.c.window;
  const hl = houseLabel(p.c);
  return html`
<div class="result" id="result">
  <p class="sigline">Saturn in <em>${p.c.sign}</em>${hl ? html` · <em>${hl}</em>` : ""}<span class="stamp">${phaseLabel[p.c.phase]}</span></p>
  <p class="mono" style="margin:0 0 10px">${fmtDeg(p.c.degree)} ${p.c.sign} · ${p.c.returnNumber === 1 ? "first" : p.c.returnNumber === 2 ? "second" : "third"} return · ${p.placeLabel}</p>
  <div class="dates">
    <div><b>Window</b><span>${fmtMonth(w.windowStart)} – ${fmtMonth(w.windowEnd)}</span></div>
    <div><b>Peak</b><span>${fmtMonth(w.peakStart)} – ${fmtMonth(w.peakEnd)}</span></div>
    <div><b>Exact ${w.hits.length === 1 ? "hit" : "hits"}</b><span>${w.hits.length === 1 ? fmtDay(w.hits[0]) : "Locked — in the report"}</span></div>
  </div>
  <p>${p.text}</p>
  ${!p.hasTime ? html`<p class="hint">No birth time, so no house. Add one above to see where this lands — or skip it; the sign is the bigger half.</p>` : ""}
  <div class="toolbar">
    <form method="post" action="/checkout"><input type="hidden" name="preview" value="${p.id}"><button class="btn" type="submit">Get my full report — $${p.hasTime ? "29" : "19"}</button></form>
    <a class="btn ghost" href="/card/${p.id}.svg" download="rite-saturn-return.svg">Save my card</a>
  </div>
  <p class="fine">Delivered in under a minute as a web page you can print or save as PDF. If the Saturn sign is wrong, full refund.</p>
</div>`;
}

export function homePage(opts: { siteUrl: string; preview?: PreviewView; error?: string; form?: { date?: string; place?: string; time?: string }; ref?: string }) {
  const f = opts.form ?? {};
  const body = html`
<section class="hero">
  <div>
    <p class="eyebrow">Saturn Return · Ages 27–30 · 56–60</p>
    <h1>Find out exactly when your Saturn return hits.</h1>
    <p class="lede">Born April 1996 to June 1998? You're in it right now. Enter your birth details and get your Saturn sign, your window, and what it's asking of you — free, in ten seconds.</p>
    <div class="card">
      <form method="post" action="/preview" id="f">
        <input type="hidden" name="ref" value="${opts.ref ?? ""}">
        <div class="row">
          <div><label for="date">Birth date <span style="color:var(--gold)">*</span></label><input id="date" name="date" type="date" required value="${f.date ?? ""}" min="1930-01-01" max="2010-12-31"><p class="hint">The local date where you were born.</p></div>
          <div><label for="place">Birth place <span style="color:var(--gold)">*</span></label><input id="place" name="place" type="text" required placeholder="Brisbane, Australia" value="${f.place ?? ""}" autocomplete="off"><p class="hint">City and country. We resolve coordinates and timezone.</p></div>
          <div><label for="time">Birth time <small>optional</small></label><input id="time" name="time" type="time" value="${f.time ?? ""}"><p class="hint">Without it we use noon and leave houses out.</p></div>
        </div>
        <button class="btn" type="submit" id="go">Show my Saturn return ↗</button>
        <p class="fine">No account. No email needed for the preview.</p>
        ${opts.error ? html`<p class="err">${opts.error}</p>` : ""}
      </form>
      ${opts.preview ? previewBlock(opts.preview) : ""}
    </div>
  </div>
  <figure class="fig">${raw(FIG)}</figure>
</section>

<section class="sell" id="report">
  <p class="eyebrow">The full report</p>
  <h2>The full report dates every exact hit.</h2>
  <div class="cols">
    <div><div class="n">01 — WHEN</div><h3>Your window to the month, your exact hits to the day.</h3><p class="shade">One pass or three, with the dates. Computed from the ephemeris, not guessed.</p></div>
    <div><div class="n">02 — WHAT</div><h3>What your Saturn sign is asking you to make permanent.</h3><p class="shade">The work, the failure mode under pressure, and what the mature version looks like.</p></div>
    <div><div class="n">03 — WHERE</div><h3>The life area it lands in.</h3><p class="shade">With a birth time: the house. Three things to build, three to let go, one line to carry.</p></div>
  </div>
  <div class="price">
    <div class="card"><div class="mono">With birth time · houses included</div><div class="amt">$29</div><div class="sub">Full chart report. Web page + printable. Under a minute.</div></div>
    <div class="card"><div class="mono">Without birth time · no houses</div><div class="amt">$19</div><div class="sub">Sign, window, exact hits, build / let go. Same voice.</div></div>
  </div>
  <p class="fine">Enter your details above first — the report is generated from your preview.</p>
  <div class="proof"><span>Calculated with the same ephemeris professional astrologers use.</span><span>No predictions. No mysticism. Dates and work.</span><span>Wrong sign? Full refund, no questions.</span></div>
</section>

<section class="faq">
  <p class="eyebrow">Questions</p>
  <details><summary>What is a Saturn return?</summary><p>Saturn takes about 29.5 years to orbit the Sun. When it returns to where it was when you were born — around 27–30, again around 57–60 — that's your return. It's the astrological marker for growing up, and most people feel it whether or not they believe in astrology.</p></details>
  <details><summary>How accurate are the dates?</summary><p>To the day. We compute Saturn's position from a planetary ephemeris and verify it against Swiss Ephemeris — the standard in professional astrology software. Not a lookup table, not an AI guess.</p></details>
  <details><summary>I don't know my birth time.</summary><p>You still get your Saturn sign, window and exact dates — that's most of the report. Birth time only adds the house (the life area). The $19 version is for you.</p></details>
  <details><summary>Is this a prediction?</summary><p>No. Saturn describes a kind of work, not an event. The report tells you what the season is for and when it peaks. What you do with that is yours.</p></details>
  <details><summary>I'm 31. Did I miss it?</summary><p>Possibly not — depending on your Saturn degree, your window may run past 30. Enter your details; the preview tells you.</p></details>
  <details><summary>I'm 58.</summary><p>Same product, different season. The report is written for second returns too.</p></details>
  <details><summary>Refunds?</summary><p>If the report is wrong about your Saturn sign, full refund, no questions. If you just didn't like it, email us and we'll usually refund anyway.</p></details>
</section>
<script>
document.getElementById('f').addEventListener('submit',function(){var b=document.getElementById('go');b.disabled=true;b.textContent='Calculating…';});
${opts.preview ? "document.getElementById('result').scrollIntoView({behavior:'smooth',block:'start'});" : ""}
</script>`;
  return page("Find out exactly when your Saturn return hits · Rite", body, { siteUrl: opts.siteUrl, canonical: opts.siteUrl + "/" });
}

export function signSentence(c: Computed): string {
  return SIGN_NOTES[c.sign].hook;
}
