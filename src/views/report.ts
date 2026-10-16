import { html, raw } from "hono/html";
import { page } from "./layout";
import type { Computed } from "../compute";
import { fmtDay, fmtMonth, phaseLabel, houseLabel } from "../compute";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");

/** Minimal markdown → HTML for the report (headings, paragraphs, bullet/numbered lists). The "One line to carry" section is styled as a pull quote. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let carry = false;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw0 of lines) {
    const line = raw0.trimEnd();
    if (!line.trim()) { closeList(); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = h[1].length === 1 ? 1 : 2;
      carry = /one line to carry/i.test(h[2]);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    const ul = line.match(/^[-*]\s+(.*)$/), ol = line.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((ul ?? ol)![1])}</li>`);
      continue;
    }
    closeList();
    out.push(carry ? `<p class="carry">${inline(line)}</p>` : `<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
}

export function reportPage(opts: {
  siteUrl: string; token: string; c: Computed; md: string; firstName: string | null; placeLabel: string;
  seasonUrl: string | null; subscribed: boolean;
}) {
  const w = opts.c.window; const hl = houseLabel(opts.c);
  const body = html`
<article class="report">
  <p class="eyebrow">Rite · Saturn Return · ${opts.c.returnNumber === 1 ? "First" : opts.c.returnNumber === 2 ? "Second" : "Third"} return</p>
  <p class="sigline">Saturn in <em>${opts.c.sign}</em>${hl ? html` · <em>${hl}</em>` : ""}<span class="stamp">${phaseLabel[opts.c.phase]}</span></p>
  <p class="mono">${opts.placeLabel} · ${w.hits.length} exact ${w.hits.length === 1 ? "hit" : "hits"}</p>
  <div class="dates">
    <div><b>Window</b><span>${fmtMonth(w.windowStart)} – ${fmtMonth(w.windowEnd)}</span></div>
    <div><b>Peak</b><span>${fmtMonth(w.peakStart)} – ${fmtMonth(w.peakEnd)}</span></div>
    ${w.hits.map((h, i) => html`<div><b>Exact ${w.hits.length > 1 ? i + 1 : ""}</b><span>${fmtDay(h)}</span></div>`)}
  </div>
  ${raw(renderMarkdown(opts.md))}
  <div class="toolbar noprint">
    <a class="btn ghost" href="javascript:window.print()">Print / Save as PDF</a>
    <a class="btn ghost" href="/card/r/${opts.token}.svg" download="rite-saturn-return.svg">Save my card</a>
  </div>
  ${opts.seasonUrl && !opts.subscribed ? html`
  <div class="card noprint" style="margin-top:40px">
    <p class="eyebrow">Saturn Season</p>
    <h3>A weekly note through your window.</h3>
    <p class="shade">Every Monday: where Saturn is this week relative to your chart, whether it's applying or separating, and one thing to do. It stops itself when your window closes.</p>
    <form method="post" action="${opts.seasonUrl}"><button class="btn" type="submit">Start Saturn Season — $7/month</button></form>
    <p class="fine">Or $59 for the year. Cancel any time. Auto-cancels when your return ends.</p>
  </div>` : ""}
  ${opts.subscribed ? html`<p class="fine noprint" style="margin-top:30px">Saturn Season is on. Next note Monday morning. <a href="/season/stop/${opts.token}">Stop</a>.</p>` : ""}
</article>`;
  return page(`Your Saturn return — ${opts.c.sign} · Rite`, body, { siteUrl: opts.siteUrl, description: "Your Saturn return report." });
}
