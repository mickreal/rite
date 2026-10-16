// Share card (1080×1920, Stories) and link-preview image (1200×630) as SVG, in the Rite design.
// Pure SVG: no rasteriser in the Worker. Fonts fall back to the viewer's system fonts when the
// Google fonts aren't reachable (e.g. opened as a file); the layout is sized to survive that.
import type { Computed } from "./compute";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monYY = (iso: string) => `${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${iso.slice(2, 4)}`;

const FONTS = `<style>@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&amp;family=Hanken+Grotesk:wght@400;500;600&amp;display=swap');.d{font-family:'Bricolage Grotesque','Helvetica Neue',Arial,sans-serif}.h{font-family:'Hanken Grotesk','Helvetica Neue',Arial,sans-serif}</style>`;
const MARK = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s / 30})"><circle cx="15" cy="15" r="6.5" fill="#EDE6D6"/><ellipse cx="15" cy="15" rx="13.5" ry="4" fill="none" stroke="#F2B544" stroke-width="1.8" transform="rotate(-22 15 15)"/></g>`;

/** The orbit dial: progress arc = how far round the cycle Saturn is (0–360°). */
function dial(x: number, y: number, size: number, angle: number, opacity = 1): string {
  const Cw = 2 * Math.PI * 230;
  return `<g transform="translate(${x} ${y}) scale(${size / 600})" opacity="${opacity}">
<circle cx="300" cy="300" r="266" fill="none" stroke="rgba(237,230,214,.32)" stroke-width="10" stroke-dasharray="1.2 22.0126" stroke-dashoffset="0.6"/>
<circle cx="300" cy="300" r="230" fill="none" stroke="rgba(237,230,214,.2)" stroke-dasharray="2 7"/>
<circle cx="300" cy="300" r="230" fill="none" stroke="#F2B544" stroke-width="3" stroke-linecap="round" transform="rotate(-90 300 300)" stroke-dasharray="${(angle / 360 * Cw).toFixed(1)} 2000"/>
<line x1="300" y1="40" x2="300" y2="100" stroke="#F2B544" stroke-width="2.5"/>
<circle cx="300" cy="300" r="8" fill="#EDE6D6"/>
<g transform="rotate(${angle.toFixed(1)} 300 300)"><circle cx="300" cy="70" r="34" fill="#F2B544" opacity=".18"/><circle cx="300" cy="70" r="18" fill="#EDE6D6"/><ellipse cx="300" cy="70" rx="34" ry="9" fill="none" stroke="#F2B544" stroke-width="3" transform="rotate(-22 300 70)"/></g>
</g>`;
}

export function shareCardSvg(c: Computed, opts: { site: string; angle: number }): string {
  const hits = c.window.hits;
  const labels = hits.length === 1 ? ["Exact pass"] : hits.length === 2 ? ["Pass one", "Pass two"] : ["Pass one", "Pass two", "Pass three"];
  const n = hits.length; const gap = 24; const tw = (888 - gap * (n - 1)) / n;
  const tiles = hits.map((h, i) => { const x = 96 + i * (tw + gap); return `<rect x="${x}" y="1360" width="${tw.toFixed(1)}" height="190" rx="36" fill="none" stroke="rgba(237,230,214,.16)" stroke-width="2"/>
<text class="h" x="${x + 28}" y="1428" font-size="30" fill="#A7A196">${labels[i]}</text>
<text class="d" x="${x + 28}" y="1508" font-size="${n === 3 ? 64 : 72}" font-weight="700" letter-spacing="-2" fill="#EDE6D6">${monYY(h)}</text>`; }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">${FONTS}
<rect width="1080" height="1920" fill="#0E1014"/>
${MARK(96, 110, 58)}<text class="d" x="172" y="156" font-size="52" font-weight="700" letter-spacing="-1" fill="#EDE6D6">Rite</text>
<text class="h" x="96" y="290" font-size="40" fill="#A7A196">My Saturn return</text>
<text class="d" x="96" y="470" font-size="190" font-weight="800" letter-spacing="-9" fill="#EDE6D6">Saturn in</text>
<text class="d" x="96" y="634" font-size="190" font-weight="800" letter-spacing="-9" fill="#F2B544">${esc(c.sign)}</text>
${dial(220, 680, 640, opts.angle)}
${tiles}
<line x1="96" y1="1700" x2="984" y2="1700" stroke="rgba(237,230,214,.14)" stroke-width="2"/>
<text class="d" x="96" y="1800" font-size="46" font-weight="600" letter-spacing="-1" fill="#EDE6D6">Find your dates</text>
<text class="h" x="984" y="1800" text-anchor="end" font-size="40" font-weight="600" fill="#F2B544">${esc(opts.site)}</text>
</svg>`;
}

export function ogSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">${FONTS}
<rect width="1200" height="630" fill="#0E1014"/>
${dial(680, -5, 640, 275)}
${MARK(80, 150, 42)}<text class="d" x="136" y="184" font-size="38" font-weight="700" letter-spacing="-1" fill="#EDE6D6">Rite</text>
<text class="d" font-size="84" font-weight="800" letter-spacing="-4" fill="#EDE6D6"><tspan x="80" y="300">When does your</tspan><tspan x="80" y="378"><tspan fill="#F2B544">Saturn</tspan> return hit?</tspan></text>
<text class="h" x="80" y="460" font-size="26" fill="#BDB6A8">Your sign, window and every pass. Free in ten seconds.</text>
</svg>`;
}
