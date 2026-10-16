// Regenerates src/content/sign-periods.json: every stretch Saturn spends in each sign, 1930–2075.
// Run with: npx tsx scripts/gen-sign-periods.ts   (the ephemeris doesn't change; this is a one-off)
import { writeFileSync } from "node:fs";
import { signPeriods } from "../src/astro/cycle";
import { SIGNS } from "../src/astro/saturn";
const out: Record<string, Array<{ from: string; to: string }>> = {};
for (const s of SIGNS) out[s] = signPeriods(s, 1930, 2075);
writeFileSync(new URL("../src/content/sign-periods.json", import.meta.url), JSON.stringify(out) + "\n");
console.log("wrote", Object.keys(out).length, "signs");
