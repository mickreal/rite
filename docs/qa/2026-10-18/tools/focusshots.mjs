// Keyboard-focus samples: tab to a given element and screenshot the area around it.
import { chromium } from "playwright";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const cases = [
  ["/", "button#go", "landing-cta"], ["/", "a.cta.dark", "landing-cream-cta"], ["/", ".faqb", "landing-faq"],
  ["/r/qatokreading00000000000a", "#scrub", "reading-scrubber"], ["/r/qatokreading00000000000a", "#playBtn", "reading-play"], ["/r/qatokreading00000000000a", ".qchip:nth-child(2)", "reading-chip"],
  ["/p/qaprev000001", "#em", "result-email"], ["/p/qaprev000001", ".cream a.cta, .cream button", "result-cream"],
];
for (const [path, sel, name] of cases) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
  await p.route(/posthog/, (r) => r.abort());
  await p.goto("http://127.0.0.1:8787" + path); await p.waitForTimeout(800);
  // reach the element by keyboard so :focus-visible applies
  let ok = false;
  for (let i = 0; i < 120; i++) { await p.keyboard.press("Tab"); if (await p.evaluate((s) => document.activeElement && document.activeElement.matches(s), sel)) { ok = true; break; } }
  if (!ok) { console.log(name, "not reached"); continue; }
  if (name === "reading-scrubber") { await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(600); console.log("scrub valuetext:", await p.getAttribute("#scrub", "aria-valuetext"), "| label:", await p.textContent("#dateLabel")); }
  const box = await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.screenshot({ path: `${OUT}/focus-${name}.png`, clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 30), width: Math.min(1280 - Math.max(0, box.x - 40), box.w + 80), height: box.h + 60 } });
  console.log(name, "ok");
}
await b.close();
