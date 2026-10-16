// Contrast calculator: node cr.mjs  -> prints candidate nudges
const hx = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
export const ratio = (a, b) => { const l1 = lum(typeof a === "string" ? hx(a) : a), l2 = lum(typeof b === "string" ? hx(b) : b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
export const over = (fg, a, bg) => { const F = hx(fg), B = hx(bg); return F.map((x, i) => x * a + B[i] * (1 - a)); };
const toHex = (c) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
// lighten a colour along its own hue (scale towards white) until it passes `need` on every bg
export function nudge(fg, bgs, need) { const F = hx(fg); for (let t = 0; t <= 1; t += 0.005) { const c = F.map((x) => x + (255 - x) * t); if (bgs.every((b) => ratio(c, b) >= need)) return toHex(c); } }
export function darken(fg, bgs, need) { const F = hx(fg); for (let t = 0; t <= 1; t += 0.005) { const c = F.map((x) => x * (1 - t)); if (bgs.every((b) => ratio(c, b) >= need)) return toHex(c); } }
if ((process.argv[1] ?? "").endsWith("cr.mjs")) {
  const BGS = ["#0E1014", "#14171D", "#1A1D23"];
  console.log("#6B675F ->", nudge("#6B675F", BGS, 4.5), "on", BGS.map((b) => ratio(nudge("#6B675F", BGS, 4.5), b).toFixed(2)));
  console.log("#B9861F on cream", ratio("#B9861F", "#EDE6D6").toFixed(2), "-> #8A6A1E", ratio("#8A6A1E", "#EDE6D6").toFixed(2));
  for (const a of [0.5, 0.55, 0.6, 0.62, 0.65]) console.log("ink a", a, ratio(over("#14110A", a, "#EDE6D6"), "#EDE6D6").toFixed(2));
  for (const op of [0.72, 0.8, 0.82, 0.85, 0.88]) console.log("A7A196 op", op, "on 14171D", ratio(over("#A7A196", op, "#14171D"), "#14171D").toFixed(2), "on 25282C(st.past)", ratio(over("#A7A196", op, "#25282C"), over("#25282C", op, "#14171D")).toFixed(2));
  console.log("#3A3D44 age", ratio("#3A3D44", "#0E1014").toFixed(2), "-> 3:1", nudge("#3A3D44", ["#0E1014"], 3));
  console.log("#E08A7A err on 0E1014", ratio("#E08A7A", "#0E1014").toFixed(2), "on 14171D", ratio("#E08A7A", "#14171D").toFixed(2));
}
