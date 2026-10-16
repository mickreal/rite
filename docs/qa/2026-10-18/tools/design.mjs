// Render the design artboards (with the shim runtime) for comparison.
import { chromium } from "playwright";
const D = process.env.DESIGN_DIR; // a copy of docs/design/*.dc.html with support.js beside them
const OUT = process.argv[2];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const boards = [["Main", 1440, 900], ["Flow", 390, 844], ["Result", 1440, 900], ["Reading", 1440, 900]];
for (const [name, w, h] of boards) {
  for (const [vw, tag] of name === "Flow" ? [[390, "390"]] : [[1280, "1280"], [390, "390"]]) {
    const ctx = await b.newContext({ viewport: { width: vw, height: h }, reducedMotion: "reduce", deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
    await p.goto(`file://${D}/${name}.dc.html`); await p.waitForTimeout(1500);
    if (name === "Flow") {
      for (const st of [0, 1, 2, 3]) { await p.evaluate((s) => window.__dc.setState({ step: s, date: s ? "1997-08-14" : "", place: s > 1 ? "Melbourne" : "" }), st); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/design-flow-s${st}-390.png` }); }
      await p.evaluate(() => { const c = window.__dc; c.setState({ step: 4, calc: c.compute("1997-08-14", "06:40") }); }); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/design-flow-s4-390.png` });
      await p.evaluate(() => window.__dc.setState({ step: 5 })); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/design-flow-s5-390.png` });
    } else {
      await p.screenshot({ path: `${OUT}/design-${name.toLowerCase()}-${tag}.jpg`, fullPage: true, type: "jpeg", quality: 60 });
    }
    console.log(name, tag, errs.slice(0, 3));
    await ctx.close();
  }
}
await b.close();
