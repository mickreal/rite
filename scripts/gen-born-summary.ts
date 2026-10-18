// Regenerates src/content/born-summary.json: the compact projection of bornFacts() (src/born.ts) for every birth month
// 1940–2005, read by the /saturn-return/born year and index pages so they never scan 792 months per request.
// Run with: npx tsx scripts/gen-born-summary.ts   (the ephemeris doesn't change; rerun only if src/born.ts's maths does)
// test/born.test.ts recomputes every month from the engine and fails if this file has drifted.
import { writeFileSync } from "node:fs";
import { allMonths, bornFacts, summarise } from "../src/born";
const out = allMonths().map(({ year, month }) => summarise(bornFacts(year, month)));
writeFileSync(new URL("../src/content/born-summary.json", import.meta.url), JSON.stringify(out) + "\n");
console.log("wrote", out.length, "months");
