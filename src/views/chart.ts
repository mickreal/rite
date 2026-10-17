// Layout helpers for the 1000x300 window chart on /p and in reading chapter 2.
import type { ReturnWindow } from "../astro/saturn";
import { pathPoints, type WindowChart } from "../astro/cycle";

/** The shaded return-window band: x of windowStart and windowEnd from compute(). */
export function windowBand(chart: WindowChart, w: ReturnWindow) {
  const x0 = chart.x(Date.parse(w.windowStart)), x1 = chart.x(Date.parse(w.windowEnd));
  return { x0, x1, width: x1 - x0 };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
export interface LabelPos { x: number; y: number; anchor: "start" | "end"; box: Box }

/** Rough advance width of Hanken Grotesk text; deliberately generous so clearance holds in fallbacks too. */
export const textWidth = (s: string, fontSize: number) => s.length * fontSize * 0.56;

/**
 * Where to put the "your natal Saturn" label so the curve never crosses it.
 * Prefers the design's spot (right end, just above the natal line), then just below it, then slides
 * left along the line. Obstacles: the curve (sampled from the same ephemeris as the path), the exact-pass
 * markers on the natal line, the today line, and any extra boxes (other labels).
 */
export function natalLabelPos(chart: WindowChart, natalLon: number, hits: string[], text: string, opts: { fontSize?: number; boxes?: Box[]; top?: number; bottom?: number } = {}): LabelPos {
  const fs = opts.fontSize ?? 13, top = opts.top ?? 16, bottom = opts.bottom ?? 260;
  const w = textWidth(text, fs);
  const pts = pathPoints(natalLon, chart.t0, chart.t1, 2).map(([t, o]) => [chart.x(t), chart.y(o)] as const);
  const marks = hits.map((h) => chart.x(Date.parse(h)));
  const pad = 9; // clear air around the text: covers the 3px stroke and the 7px turn/station rings that sit on the curve
  const conflict = (b: Box) => {
    const e = { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
    if (b.y0 < top + 2 || b.y1 > bottom - 2) return true;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      if (Math.max(ax, bx) < e.x0 || Math.min(ax, bx) > e.x1) continue;
      if (Math.max(ay, by) >= e.y0 && Math.min(ay, by) <= e.y1) return true;
    }
    for (const mx of marks) if (mx + 12 >= e.x0 && mx - 12 <= e.x1 && chart.y0 + 12 >= e.y0 && chart.y0 - 12 <= e.y1) return true;
    if (chart.todayX > 0 && chart.todayX >= e.x0 && chart.todayX <= e.x1) return true;
    for (const o of opts.boxes ?? []) if (o.x1 >= e.x0 && o.x0 <= e.x1 && o.y1 >= e.y0 && o.y0 <= e.y1) return true;
    return false;
  };
  const above = chart.y0 - 10, below = chart.y0 + 10 + fs; // baselines
  const boxAt = (x: number, y: number, anchor: "start" | "end"): Box => {
    const x0 = anchor === "end" ? x - w : x;
    return { x0, x1: x0 + w, y0: y - fs * 0.78, y1: y + fs * 0.24 };
  };
  const cands: LabelPos[] = [];
  for (let x = 958; x - w >= 42; x -= 20) for (const y of [above, below]) cands.push({ x, y, anchor: "end", box: boxAt(x, y, "end") });
  const ok = cands.find((c) => !conflict(c.box));
  if (ok) return ok;
  // Nowhere fully clear (not seen for any real chart): take the spot farthest from the curve.
  const dist = (b: Box) => Math.min(...pts.map(([px, py]) => Math.hypot(Math.max(b.x0 - px, 0, px - b.x1), Math.max(b.y0 - py, 0, py - b.y1))));
  return cands.reduce((a, c) => (dist(c.box) > dist(a.box) ? c : a));
}
