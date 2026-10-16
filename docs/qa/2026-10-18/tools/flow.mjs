// /start: every step + summary at 390 and 1280, and a keyboard-only pass. POST /preview is intercepted (it would call
// the geocoder and the LLM) and answered with a redirect to a seeded preview.
import { chromium } from "playwright";
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const log = [];
for (const vw of [390, 1280]) {
  const ctx = await b.newContext({ viewport: { width: vw, height: vw === 390 ? 844 : 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.route(/posthog/, (r) => r.abort());
  await p.route("**/preview", (r) => r.request().method() === "POST" ? r.fulfill({ status: 302, headers: { location: "/p/qaprev000001" } }) : r.continue());
  const shot = (n) => p.screenshot({ path: `${OUT}/start-${n}-${vw}.${vw === 390 ? "png" : "jpg"}`, ...(vw === 390 ? {} : { type: "jpeg", quality: 60 }) });
  await p.goto("http://127.0.0.1:8787/start"); await p.waitForTimeout(3800); await shot("0-intro");
  await p.click("#s0 [data-go='1']"); await p.waitForTimeout(800); await shot("1-date");
  await p.click("#s1 [data-go='2']"); await p.waitForTimeout(500); await shot("1-date-error");
  await p.fill("#fd", "1997-08-14"); await p.click("#s1 [data-go='2']"); await p.waitForTimeout(800); await shot("2-place");
  await p.click("#s2 [data-go='3']"); await p.waitForTimeout(500); await shot("2-place-error");
  await p.fill("#fp", "Melbourne"); await p.click("#s2 [data-go='3']"); await p.waitForTimeout(800); await p.fill("#ft", "06:40"); await shot("3-time");
  await p.click("#s3 button[type=submit]"); await p.waitForTimeout(2000); await shot("4-building");
  await p.waitForTimeout(4000); await shot("5-summary");
  const sum = await p.evaluate(() => ({ sign: document.querySelector("#r_sign").textContent, pct: document.querySelector("#r_pct").textContent, next: document.querySelector("#r_next").textContent, open: document.querySelector("#r_open").textContent, close: document.querySelector("#r_close").textContent, hits: document.querySelector("#r_hits").textContent, chips: document.querySelector("#r_chips").textContent, cta: document.querySelector("#r_cta").getAttribute("href"), share: document.querySelector("#r_share").getAttribute("href"), ovf: document.documentElement.scrollWidth - document.documentElement.clientWidth }));
  log.push({ vw, errs, sum });
  await ctx.close();
}
// keyboard-only path at 390
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.route(/posthog/, (r) => r.abort());
  await p.route("**/preview", (r) => r.request().method() === "POST" ? r.fulfill({ status: 302, headers: { location: "/p/qaprev000001" } }) : r.continue());
  await p.goto("http://127.0.0.1:8787/start"); await p.waitForTimeout(1500);
  const act = () => p.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""} «${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)}» ring=${getComputedStyle(e).outlineStyle}/${getComputedStyle(e).boxShadow !== "none"}` : "none"; });
  const steps = [];
  await p.keyboard.press("Tab"); steps.push("Tab -> " + await act());
  await p.keyboard.press("Enter"); await p.waitForTimeout(600); steps.push("Enter -> " + await act());
  await p.keyboard.type("08141997"); await p.keyboard.press("Enter"); await p.waitForTimeout(600); steps.push("type date, Enter -> " + await act() + " value=" + await p.inputValue("#fd"));
  await p.keyboard.type("Melbourne"); await p.keyboard.press("Enter"); await p.waitForTimeout(600); steps.push("type place, Enter -> " + await act());
  await p.keyboard.press("Shift+Tab"); steps.push("Shift+Tab -> " + await act());
  await p.keyboard.press("Tab"); await p.keyboard.press("Tab"); steps.push("Tab Tab -> " + await act());
  await p.keyboard.press("Tab"); steps.push("Tab -> " + await act());
  await p.keyboard.press("Tab"); steps.push("Tab -> " + await act());
  await p.keyboard.press("Tab"); steps.push("Tab -> " + await act());
  await p.keyboard.press("Tab"); steps.push("Tab -> " + await act());
  // submit from the time field
  await p.focus("#ft"); await p.keyboard.press("Enter"); await p.waitForTimeout(6500); steps.push("Enter in time -> " + await act() + " visible step=" + await p.evaluate(() => document.querySelector(".step.on")?.id));
  for (let i = 0; i < 6; i++) { await p.keyboard.press("Tab"); steps.push("Tab -> " + await act()); }
  log.push({ keyboard: steps });
  await ctx.close();
}
console.log(JSON.stringify(log, null, 1));
await b.close();
