// Renders the link-preview PNGs into public/: og.png (from ogSvg) and og/<sign>.png per sign
// (from signOgSvg, with the current or next stretch of Saturn in that sign as of today).
// Run with: bun scripts/gen-og.ts   (re-run when a sign's stretch rolls over, roughly every 2–3 years)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { ogSvg, signOgSvg, FONT_TEXT } from "../src/card";
import SIGN_PERIODS from "../src/content/sign-periods.json";

const root = new URL("../", import.meta.url);
// the Node binding takes font paths (fontBuffers is wasm-only); system fonts off so nothing else can stand in
const fontFiles = ["bricolage-700", "bricolage-800", "hanken-400", "hanken-600"].map((f) => fileURLToPath(new URL(`src/fonts/${f}.bin`, root)));
const png = (svg: string) => new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: FONT_TEXT } }).render().asPng();

/** The stretch (main transit plus any dip within 18 months) Saturn is in now, else the next one. */
export function stretch(periods: Array<{ from: string; to: string }>, today: string) {
  const groups: Array<Array<{ from: string; to: string }>> = [];
  for (const p of periods) { const g = groups[groups.length - 1]; if (g && Date.parse(p.from) - Date.parse(g[g.length - 1].to) < 548 * 86400000) g.push(p); else groups.push([p]); }
  const cur = groups.find((g) => today >= g[0].from && today <= g[g.length - 1].to);
  const g = cur ?? groups.find((x) => x[0].from > today) ?? groups[groups.length - 1];
  return { from: g[0].from, to: g[g.length - 1].to, now: !!cur };
}

const today = new Date().toISOString().slice(0, 10);
writeFileSync(new URL("public/og.png", root), png(ogSvg()));
mkdirSync(new URL("public/og/", root), { recursive: true });
for (const [sign, periods] of Object.entries(SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>)) {
  const s = stretch(periods, today);
  const years = `${s.from.slice(0, 4)}–${s.to.slice(0, 4)}`;
  writeFileSync(new URL(`public/og/${sign.toLowerCase()}.png`, root), png(signOgSvg(sign, years, s.now)));
  console.log(sign, years, s.now ? "(now)" : "(next)");
}
console.log("wrote public/og.png and", Object.keys(SIGN_PERIODS).length, "sign images");
