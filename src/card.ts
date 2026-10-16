// Share card as SVG (1080×1920 Stories). Pure SVG so it renders anywhere without a WASM rasteriser;
// Instagram accepts SVG via the share sheet on iOS; for a PNG endpoint later, rasterise this with resvg-wasm.
import type { Computed } from "./compute";
import { fmtDay, fmtMonth, phaseLabel, houseLabel } from "./compute";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function shareCardSvg(c: Computed, opts: { carry?: string | null; site: string }): string {
  const w = c.window;
  const hl = houseLabel(c);
  const nextHit = w.hits.find((h) => h >= new Date().toISOString().slice(0, 10));
  const hitLabel = nextHit ? `NEXT EXACT · ${fmtDay(nextHit).toUpperCase()}` : `EXACT · ${fmtDay(w.hits[w.hits.length - 1]).toUpperCase()}`;
  const carry = opts.carry ? esc(opts.carry) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
<defs>
<style>
  .cz{font-family:Cinzel,'Times New Roman',serif}.cr{font-family:'Crimson Pro',Georgia,serif}.mo{font-family:'JetBrains Mono',Menlo,monospace}
</style>
</defs>
<rect width="1080" height="1920" fill="#111418"/>
<rect x="60" y="60" width="960" height="1800" fill="none" stroke="#2a2f36" stroke-width="2"/>
<g transform="translate(540 560)" fill="none" stroke="#2a2f36" stroke-width="2">
  <circle r="300"/><circle r="236"/><circle r="168"/>
  <ellipse rx="268" ry="132" transform="rotate(-28)" stroke="#d4b66a" stroke-width="3"/>
  <circle r="36" fill="#d4b66a" stroke="none"/><ellipse rx="94" ry="32" transform="rotate(-28)" stroke="#d4b66a" stroke-width="3"/>
</g>
<text x="540" y="150" text-anchor="middle" class="cz" font-size="34" letter-spacing="14" fill="#d4b66a">RITE</text>
<text x="540" y="960" text-anchor="middle" class="cz" font-size="44" letter-spacing="10" fill="#b5ad9b">SATURN RETURN</text>
<text x="540" y="1075" text-anchor="middle" class="cz" font-size="${hl ? 84 : 110}" fill="#ece6d8">${esc(c.sign.toUpperCase())}${hl ? ` · ${esc(hl.toUpperCase())}` : ""}</text>
<text x="540" y="1160" text-anchor="middle" class="mo" font-size="30" letter-spacing="6" fill="#b5ad9b">${fmtMonth(w.windowStart).toUpperCase()} — ${fmtMonth(w.windowEnd).toUpperCase()}</text>
<text x="540" y="1240" text-anchor="middle" class="mo" font-size="30" letter-spacing="6" fill="#d4b66a">${esc(hitLabel)}</text>
${carry ? `<foreignObject x="140" y="1330" width="800" height="300"><div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'Crimson Pro',Georgia,serif;font-size:44px;line-height:1.3;color:#ece6d8;text-align:center;font-style:italic">${carry}</div></foreignObject>` : ""}
<rect x="800" y="110" width="200" height="56" rx="6" fill="none" stroke="#b9995a" stroke-width="2"/>
<text x="900" y="147" text-anchor="middle" class="mo" font-size="22" letter-spacing="4" fill="#d4b66a">${esc(phaseLabel[c.phase].toUpperCase())}</text>
<text x="540" y="1780" text-anchor="middle" class="mo" font-size="28" letter-spacing="8" fill="#6f6a60">${esc(opts.site.toUpperCase())}</text>
</svg>`;
}
