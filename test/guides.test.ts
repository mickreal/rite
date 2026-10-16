import { describe, it, expect, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() })); // the resvg wasm module does not load under node
import worker from "../src/index";
import { compute, fmtDay, fmtMonth } from "../src/compute";
import { natalSaturn, scanReturn, saturnLongitude, signOf, SIGNS } from "../src/astro/saturn";
import { RETURN_AGES, WINDOW_YEARS } from "../src/content/return-ages";
import SIGN_PERIODS from "../src/content/sign-periods.json";

const BANNED = /\b(cosmic|universe|energies|energy|manifest|journey|vibration|align)\b/i;
const stmt = { bind: () => stmt, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) };
const env = { DB: { prepare: () => stmt }, SITE_URL: "https://rite.test" };
const get = (path: string) => worker.fetch(new Request(`https://rite.test${path}`), env as never, {} as ExecutionContext);

/** Visible text only (no tags, scripts or styles), so the voice check doesn't trip on CSS like align-items. */
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
const ld = (h: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1]);
const meta = (h: string) => /<meta name="description" content="([^"]*)"/.exec(h)![1];

/** The end of Saturn's current stretch through the sign it is in today, straight from sign-periods.json. */
function stretchEnd(): string {
  const sign = signOf(saturnLongitude(new Date())), today = new Date().toISOString().slice(0, 10);
  const ps = (SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>)[sign];
  let i = ps.findIndex((p) => today >= p.from && today <= p.to);
  while (ps[i + 1] && Date.parse(ps[i + 1].from) - Date.parse(ps[i].to) < 548 * 86400000) i++; // last pass back, if any
  return ps[i].to;
}

function common(h: string, path: string) {
  expect(h).toContain(`<link rel="canonical" href="https://rite.test${path}">`);
  expect(h).toContain('<meta property="og:image" content="https://rite.test/og.png">');
  expect(meta(h).length).toBeLessThan(155);
  const j = ld(h);
  expect(j["@type"]).toBe("FAQPage");
  expect(j.mainEntity.length).toBeGreaterThanOrEqual(4);
  expect(j.mainEntity.length).toBeLessThanOrEqual(6);
  for (const q of j.mainEntity) expect(q.acceptedAnswer.text.length).toBeGreaterThan(20);
  const t = text(h);
  expect(t).not.toMatch(BANNED);
  expect(t).not.toMatch(/birthday|turning 29|\b29th\b|\bwill (meet|lose)\b|expect a/i);
  expect(t).toContain(fmtMonth(stretchEnd()));
  expect(h).toContain('href="/saturn-return/saturn-in/aries"');
}

describe("/saturn-return/when", () => {
  it("renders with computed dates, a /preview form and FAQ JSON-LD", async () => {
    const r = await get("/saturn-return/when");
    expect(r.status).toBe(200);
    const h = await r.text();
    common(h, "/saturn-return/when");
    // the mini-calculator posts to /preview with the landing's field names
    expect(h).toMatch(/<form id="start"[^>]*method="post" action="\/preview"/);
    for (const n of ["date", "time", "place", "ref"]) expect(h).toContain(`name="${n}"`);
    expect(h).toContain('name="ref" value="when"');
    // worked examples come from compute()
    const ex = compute({ date: "1997-04-01", time: null, place: { label: "", lat: 0, lon: 0, tz: "UTC" } });
    expect(ex.window.hits).toHaveLength(3);
    for (const hit of ex.window.hits) expect(h).toContain(fmtDay(hit));
    expect(h).toContain('href="/saturn-return/first-vs-second"');
  });
});

describe("/saturn-return/first-vs-second", () => {
  it("renders cohorts for all three returns and FAQ JSON-LD", async () => {
    const r = await get("/saturn-return/first-vs-second");
    expect(r.status).toBe(200);
    const h = await r.text();
    common(h, "/saturn-return/first-vs-second");
    expect(h).toContain("First return, Saturn in");
    expect(h).toContain("Third return, Saturn in");
    expect(h).toContain('href="/saturn-return/when"');
  });
});

describe("internal links and sitemap", () => {
  it("lists both pages in the sitemap and links them from a sign page and the landing", async () => {
    const sm = await (await get("/sitemap.xml")).text();
    expect(sm).toContain("https://rite.test/saturn-return/when<");
    expect(sm).toContain("https://rite.test/saturn-return/first-vs-second<");
    const sp = await (await get("/saturn-return/saturn-in/leo")).text();
    expect(sp).toContain('href="/saturn-return/when"');
    expect(sp).toContain('href="/saturn-return/first-vs-second"');
    const { landingPage } = await import("../src/views/landing");
    const lp = String(await landingPage({ siteUrl: "x" }));
    expect(lp).toContain('href="/saturn-return/when"');
    expect(lp).toContain('href="/saturn-return/first-vs-second"');
  });
});

describe("return ages", () => {
  it("every computed return falls inside RETURN_AGES and WINDOW_YEARS", () => {
    const Y = 365.25 * 86400000;
    for (const n of [1, 2, 3] as const) {
      const hi = n === 1 ? 2045 : n === 2 ? 2015 : 1985;
      let count = 0;
      for (let t = Date.UTC(1930, 0, 5); t < Date.UTC(hi, 0, 1); t += 53 * 86400000) {
        const b = new Date(t + 43200000);
        const w = scanReturn(b, natalSaturn(b).lon, n);
        const age = (iso: string) => (Date.parse(iso) - b.getTime()) / Y;
        const A = RETURN_AGES[n];
        expect(age(w.hits[0])).toBeGreaterThanOrEqual(A.pass[0]);
        expect(age(w.hits[w.hits.length - 1])).toBeLessThanOrEqual(A.pass[1]);
        expect(age(w.windowStart)).toBeGreaterThanOrEqual(A.window[0]);
        expect(age(w.windowEnd)).toBeLessThanOrEqual(A.window[1]);
        const len = (Date.parse(w.windowEnd) - Date.parse(w.windowStart)) / Y;
        expect(len).toBeGreaterThanOrEqual(WINDOW_YEARS[0]);
        expect(len).toBeLessThanOrEqual(WINDOW_YEARS[1]);
        count++;
      }
      expect(count).toBeGreaterThan(300);
    }
    expect(SIGNS).toHaveLength(12);
  });
});
