// SVG → PNG in the Worker with resvg (wasm). resvg can't fetch web fonts, so the brand fonts ship
// in the bundle as Latin subsets (src/fonts/*.bin, SIL OFL; `.bin` so wrangler's default rules
// import them as ArrayBuffers). Their family names match FONT_DISPLAY / FONT_TEXT in card.ts.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import bricolage700 from "./fonts/bricolage-700.bin";
import bricolage800 from "./fonts/bricolage-800.bin";
import hanken400 from "./fonts/hanken-400.bin";
import hanken600 from "./fonts/hanken-600.bin";
import { FONT_TEXT } from "./card";

let ready: Promise<void> | null = null;
const fontBuffers = [bricolage700, bricolage800, hanken400, hanken600].map((b) => new Uint8Array(b));

export async function svgToPng(svg: string): Promise<Uint8Array> {
  ready ??= initWasm(resvgWasm).catch((e) => { ready = null; throw e; });
  await ready;
  const r = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: FONT_TEXT } });
  try { const img = r.render(); try { return img.asPng(); } finally { img.free(); } } finally { r.free(); }
}
