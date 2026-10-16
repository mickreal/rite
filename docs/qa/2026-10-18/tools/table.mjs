// Markdown table: WCAG ratio of each text token in theme.ts / page CSS against each surface it is used on.
import { ratio, over } from "./cr.mjs";
const toHex = (c) => "#" + c.map((x) => Math.round(x).toString(16).padStart(2, "0")).join("").toUpperCase();
const rows = [
  // [label, fg, alpha, bgs, need, where]
  ["ink #EDE6D6", "#EDE6D6", 1, ["#0E1014", "#14171D", "#1A1D23", "#14110A"], 4.5, "body text, headings, .cta.dark"],
  ["#CFC8BA", "#CFC8BA", 1, ["#0E1014", "#14171D"], 4.5, ".chip, reading body"],
  ["#BDB6A8", "#BDB6A8", 1, ["#0E1014", "#14171D"], 4.5, "nav, lede paragraphs, FAQ answers"],
  ["muted #A7A196", "#A7A196", 1, ["#0E1014", "#14171D", "#1A1D23"], 4.5, ".muted, labels, footer, .stat span"],
  ["#8F897E", "#8F897E", 1, ["#0E1014", "#14171D"], 4.5, "small print (/p, /season/manage, /start)"],
  ["#6B675F (before)", "#6B675F", 1, ["#0E1014", "#14171D", "#1A1D23"], 4.5, ".hint, .toc i, year labels, placeholders"],
  ["#8A857B (after)", "#8A857B", 1, ["#0E1014", "#14171D", "#1A1D23"], 4.5, "same uses, nudged"],
  ["gold #F2B544", "#F2B544", 1, ["#0E1014", "#14171D", "#1A1D23"], 4.5, "accent text, links, kickers"],
  ["link hover #FFD27A", "#FFD27A", 1, ["#0E1014", "#14171D"], 4.5, "a:hover"],
  ["error #E08A7A", "#E08A7A", 1, ["#0E1014", "#14171D"], 4.5, ".err"],
  ["#14110A on gold", "#14110A", 1, ["#F2B544", "#FFC85C"], 4.5, ".cta, .solid (and hover)"],
  ["#0E1014 on cream", "#0E1014", 1, ["#EDE6D6"], 4.5, ".pill.on, .qchip.on, .tab.on"],
  ["ink on cream", "#14110A", 1, ["#EDE6D6"], 4.5, "offer cards, paper, mini note"],
  ["ink .72 on cream", "#14110A", 0.72, ["#EDE6D6"], 4.5, "offer body copy"],
  ["ink .7 on cream", "#14110A", 0.7, ["#EDE6D6"], 4.5, "'once, no subscription'"],
  ["ink .62 on cream (after)", "#14110A", 0.62, ["#EDE6D6"], 4.5, "mini note labels, /season paper foot, echo line"],
  ["ink .6 on cream", "#14110A", 0.6, ["#EDE6D6"], 4.5, "refund line, price footnote"],
  ["ink .55 on cream (before)", "#14110A", 0.55, ["#EDE6D6"], 4.5, "mini note foot, /season paper foot"],
  ["ink .5 on cream (before)", "#14110A", 0.5, ["#EDE6D6"], 4.5, "mini note 'Saturn Season'"],
  ["#B9861F on cream (before)", "#B9861F", 1, ["#EDE6D6"], 4.5, "/gift bullets (now aria-hidden #8A6A1E)"],
  ["#8A6A1E on cream", "#8A6A1E", 1, ["#EDE6D6"], 3, "tick icons, /gift bullets (decorative)"],
  ["#3A3D44 ages (inactive)", "#3A3D44", 1, ["#0E1014"], 3, "landing 58 / 87 (110-240px text)"],
  ["#6B6E75 ages hover", "#6B6E75", 1, ["#0E1014"], 3, "landing ages :hover"],
];
const out = ["| Text | Surface | Ratio | Needs | Result | Used for |", "|---|---|---|---|---|---|"];
for (const [label, fg, a, bgs, need, where] of rows) for (const bg of bgs) {
  const c = a < 1 ? over(fg, a, bg) : fg; const r = ratio(c, bg);
  out.push(`| ${label}${a < 1 ? ` (= ${toHex(c)})` : ""} | ${bg} | ${r.toFixed(2)} | ${need} | ${r >= need ? "pass" : "**fail**"} | ${where} |`);
}
// non-text: input borders (1.4.11)
const nt = [["input border rgba(237,230,214,.18)", "#EDE6D6", 0.18, "#14171D"], ["input border rgba(237,230,214,.2) on #0E1014", "#EDE6D6", 0.2, "#0E1014"], ["focus ring #F2B544", "#F2B544", 1, "#0E1014"], ["focus ring #F2B544", "#F2B544", 1, "#14171D"], ["focus ring #14110A on cream", "#14110A", 1, "#EDE6D6"]];
out.push("", "| Non-text (1.4.11) | Surface | Ratio | Needs | Result |", "|---|---|---|---|---|");
for (const [label, fg, a, bg] of nt) { const c = a < 1 ? over(fg, a, bg) : fg; const r = ratio(c, bg); out.push(`| ${label} | ${bg} | ${r.toFixed(2)} | 3 | ${r >= 3 ? "pass" : "**fail**"} |`); }
console.log(out.join("\n"));
