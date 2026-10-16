// Precomputes Saturn's tropical longitude at 00:00 UTC every day 1920–2080 (astronomy-engine), stored as
// base64 Int32 (degrees × 1e5). Runtime lookups interpolate between days: Saturn moves ≤0.13°/day and
// almost linearly, so the error is < 0.0005°. Run once: npx tsx scripts/gen-saturn-table.ts
import { writeFileSync } from "node:fs";
import { saturnLongitudeExact } from "../src/astro/saturn";
const START = Date.UTC(1920, 0, 1), END = Date.UTC(2081, 0, 1), DAY = 86400000;
const n = Math.round((END - START) / DAY);
const arr = new Int32Array(n);
for (let i = 0; i < n; i++) arr[i] = Math.round(saturnLongitudeExact(new Date(START + i * DAY)) * 1e5);
const b64 = Buffer.from(arr.buffer).toString("base64");
writeFileSync(new URL("../src/content/saturn-daily.json", import.meta.url), JSON.stringify({ start: START, days: n, b64 }));
console.log("wrote", n, "days,", Math.round(b64.length / 1024), "KB");
