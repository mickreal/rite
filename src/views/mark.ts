// The Rite mark: Saturn with its ring passing BEHIND the planet at the top and IN FRONT of it at the bottom.
// Drawn in three layers: the whole ring (its top half ends up hidden behind the planet), the planet, then the ring's
// front (lower) half again on top. Every mark and every dial Saturn on the site comes from here, so it can't drift.
// No ids (no clipPath), so any number can sit on one page.

export type SaturnOpts = {
  cx: number; cy: number;          // centre
  r: number;                       // planet radius
  rx: number; ry: number;          // ring radii
  planet: string; ring: string;    // fills / stroke colour
  sw: number;                      // ring stroke width
  tilt?: number;                   // ring angle in degrees (default -22)
  /** CSS class that animates the ring's tilt (e.g. "ringtilt"); both ring layers get it, sized identically. */
  ringClass?: string;
  /** One-colour marks (planet and ring the same colour): the background colour, cut as a thin gap either side of the
   *  front ring so it still reads as passing in front. */
  gap?: string;
};

/** Lower half of the ring, in the ring's own (untilted) frame: from the left end to the right end through the bottom. */
const frontArc = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}`;

export function saturn(o: SaturnOpts): string {
  const { cx, cy, r, rx, ry, planet, ring, sw } = o;
  const tilt = o.tilt ?? -22;
  const stroke = `fill="none" stroke="${ring}" stroke-width="${sw}"`;
  if (o.ringClass) {
    // Animated tilt: each ring layer sits in its own group with an invisible full ellipse, so both groups have the
    // same box and rotate about the same centre in step.
    const box = `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="none"/>`;
    return `<g class="${o.ringClass}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${stroke}/></g>`
      + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${planet}"/>`
      + `<g class="${o.ringClass}">${box}<path d="${frontArc(cx, cy, rx, ry)}" ${stroke} stroke-linecap="butt"/></g>`;
  }
  const t = `transform="rotate(${tilt} ${cx} ${cy})"`;
  const gap = o.gap ? `<path d="${frontArc(cx, cy, rx, ry)}" fill="none" stroke="${o.gap}" stroke-width="${+(sw * 1.9).toFixed(2)}" ${t}/>` : "";
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" ${stroke} ${t}/>`
    + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${planet}"/>`
    + gap + `<path d="${frontArc(cx, cy, rx, ry)}" ${stroke} ${t}/>`;
}

/** The logo mark in a 30×30 box (header, emails, cards). */
export const markSvgInner = (planet = "#EDE6D6", ring = "#F2B544") =>
  saturn({ cx: 15, cy: 15, r: 6.5, rx: 13.5, ry: 4, planet, ring, sw: 1.8 });

export const markSvg = (size = 30, planet = "#EDE6D6", ring = "#F2B544", extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 30 30" aria-hidden="true"${extra}>${markSvgInner(planet, ring)}</svg>`;
