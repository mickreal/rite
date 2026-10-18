// Build 7: birth-month search pages (/saturn-return/born/...). Every date on them must be the engine's, and every relative
// phrase must be true on the day the page is served.
import { describe, it, expect, vi, beforeAll } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() })); // the resvg wasm module does not load under node
import worker from "../src/index";
import { compute, fmtDay, fmtMonth } from "../src/compute";
import { allMonths, bornFacts, bornFactsCached, summarise, parseYm, BORN_FROM, BORN_TO, FACTS_VERSION, type MonthFacts } from "../src/born";
import { monthPage, monthMeta, monthFaq, yearPage, indexPage, previewHref } from "../src/views/born";
import SUMMARY from "../src/content/born-summary.json";

const BANNED = /\b(cosmic|universe|energies|energy|manifest|journey|vibration|align)\b/i;
const stmt = { bind: () => stmt, all: async () => ({ results: [] }), first: async () => null, run: async () => ({}) };
const env = { DB: { prepare: () => stmt }, SITE_URL: "https://rite.test" };
const get = (path: string) => worker.fetch(new Request(`https://rite.test${path}`), env as never, {} as ExecutionContext);
const text = (h: string) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/\s+/g, " ");
const ld = (h: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(h)![1]);
const meta = (h: string) => /<meta name="description" content="([^"]*)"/.exec(h)![1];
const title = (h: string) => /<title>([^<]*)<\/title>/.exec(h)![1];
const utcNoon = { label: "", lat: 0, lon: 0, tz: "UTC" };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayIso = (d: string, m: string, y: string) => `${y}-${String(MON.indexOf(m) + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
const monIso = (m: string, y: string) => `${y}-${String(MON.indexOf(m) + 1).padStart(2, "0")}`;
const DAY = String.raw`(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})`;
const MONTH = String.raw`(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})`;

/**
 * Relative wording must agree with `today`: everything described as ahead is on or after today, everything described as
 * behind is on or before it. Returns the violations (empty = fine).
 */
function staleWording(t: string, today: string): string[] {
  const bad: string[] = [];
  const ym = today.slice(0, 7);
  const check = (re: string, ok: (iso: string) => boolean, toIso: (m: RegExpExecArray) => string) => {
    const r = new RegExp(re, "g"); let m: RegExpExecArray | null;
    while ((m = r.exec(t))) { const iso = toIso(m); if (!ok(iso)) bad.push(m[0]); }
  };
  const day = (m: RegExpExecArray, i = 1) => dayIso(m[i], m[i + 1], m[i + 2]);
  // ahead
  check(String.raw`window opens ${MONTH}`, (iso) => iso >= ym, (m) => monIso(m[1], m[2]));
  check(String.raw`first exact pass (?:is|falls (?:on|between)) ${DAY}`, (iso) => iso >= today, day);
  check(String.raw`[Tt]he next is ${DAY}`, (iso) => iso > today, day);
  check(String.raw`${DAY}\s+ahead`, (iso) => iso > today, day);
  check(String.raw`closes ${MONTH}`, (iso) => iso >= ym, (m) => monIso(m[1], m[2]));
  // behind
  check(String.raw`${DAY}\s+passed`, (iso) => iso < today, day);
  check(String.raw`exact pass was ${DAY}`, (iso) => iso <= today, day);
  check(String.raw`last (?:was|fell (?:on|between)) ${DAY}`, (iso) => iso <= today, day);
  check(String.raw`window ran ${MONTH} to ${MONTH}`, (iso) => iso <= ym, (m) => monIso(m[3], m[4]));
  check(String.raw`(?:it )?opened ${MONTH}`, (iso) => iso <= ym, (m) => monIso(m[1], m[2]));
  // "in N months"/"in about N years" only ever looks forward; a negative or zero count would read "in 0 months"
  if (/\bin -?0 months?\b|\bin -\d/.test(t)) bad.push("non-positive countdown");
  return bad;
}

let FACTS: Map<string, MonthFacts>;
beforeAll(() => {
  FACTS = new Map(allMonths().map(({ year, month, ym }) => [ym, bornFacts(year, month)]));
}, 120_000);

describe("range and URL scheme", () => {
  it("covers every month 1940–2005: 792 pages", () => {
    expect(BORN_FROM).toBe(1940);
    expect(BORN_TO).toBe(2005);
    expect(allMonths()).toHaveLength(792);
    expect(FACTS.size).toBe(792);
  });
  it("parses only in-range YYYY-MM", () => {
    expect(parseYm("1997-03")).toEqual({ year: 1997, month: 3 });
    for (const bad of ["1939-12", "2006-01", "1997-13", "1997-00", "1997-3", "97-03", "1997-03-01", "abcd-ef"]) expect(parseYm(bad)).toBeNull();
  });
  it("answers 404 (noindex) outside the range and for malformed slugs", async () => {
    for (const p of ["1939-12", "2006-01", "1997-13", "1997-00", "1997-3", "1939", "2006", "nineteen", "1997-03-15"]) {
      const r = await get(`/saturn-return/born/${p}`);
      expect(r.status, p).toBe(404);
      expect(r.headers.get("x-robots-tag")).toBe("noindex");
    }
  });
});

describe("dates match the engine", () => {
  it("born-summary.json is exactly the engine's projection for all 792 months", () => {
    expect((SUMMARY as unknown[]).length).toBe(792);
    for (const s of SUMMARY as Array<{ ym: string }>) expect(summarise(FACTS.get(s.ym)!)).toEqual(s);
  });

  it("every sample day's current return equals compute() on a sample of 50 pages, and the page prints every pass", async () => {
    const all = [...FACTS.keys()];
    const pick = Array.from({ length: 50 }, (_, i) => all[Math.floor((i * 7919) % all.length)]); // spread across the range
    const today = new Date();
    for (const ym of pick) {
      const f = FACTS.get(ym)!;
      const h = await (await get(`/saturn-return/born/${ym}`)).text();
      for (const s of f.samples) {
        const c = compute({ date: s.date, time: null, place: utcNoon }, today);
        const mine = s.returns.find((r) => r.returnNumber === c.returnNumber)!;
        expect(mine, `${s.date} return ${c.returnNumber}`).toBeDefined();
        expect(c.sign).toBe(s.sign);
        expect(c.natalLon).toBeCloseTo(s.lon, 9);
        for (const k of ["windowStart", "windowEnd", "peakStart", "peakEnd", "hits"] as const) expect(mine[k], `${s.date} ${k}`).toEqual(c.window[k]);
        for (const hit of c.window.hits) expect(h, `${ym} ${hit}`).toContain(fmtDay(hit));
        expect(h).toContain(`Saturn at ${Math.floor(c.degree)}° ${c.sign}`);
      }
    }
  }, 60_000);

  it("the sign spans cover the month day by day, and split months name the change", () => {
    let splits = 0;
    for (const f of FACTS.values()) {
      const days = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
      expect(f.spans[0].from).toBe(`${f.ym}-01`);
      expect(f.spans[f.spans.length - 1].to).toBe(`${f.ym}-${days}`);
      for (const s of f.samples) {
        const sp = f.spans.find((x) => s.date >= x.from && s.date <= x.to)!;
        expect(sp.sign).toBe(s.sign);
      }
      if (f.spans.length > 1) splits++;
    }
    expect(splits).toBeGreaterThan(40); // Saturn changes sign ~2-3 times a year, sometimes back and forth
    const f = FACTS.get("1940-03")!;
    expect(f.spans.map((s) => s.sign)).toEqual(["Aries", "Taurus"]);
    const h = monthPage({ siteUrl: "https://rite.test", f, today: new Date("2026-10-18T12:00:00Z") }).toString();
    expect(text(h)).toContain(`Saturn changed sign during March 1940`);
    expect(text(h)).toContain(fmtDay(f.spans[1].from));
  });
});

describe("month page", () => {
  it("born March 1997: computed dates, canonical, meta, FAQ JSON-LD, links, no client JS", async () => {
    const r = await get("/saturn-return/born/1997-03");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("public, max-age=3600");
    const h = await r.text();
    expect(h).toContain('<link rel="canonical" href="https://rite.test/saturn-return/born/1997-03">');
    expect(title(h)).toBe("Born March 1997? Saturn return dates and exact passes · Rite");
    expect(meta(h).length).toBeLessThanOrEqual(155);
    expect(meta(h)).toContain("Aries");
    expect(h).not.toMatch(/name="robots" content="noindex/);
    // the page itself ships no script beyond JSON-LD (the analytics snippet is added by the middleware only with POSTHOG_KEY)
    expect(h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "")).not.toContain("<script");
    const j = ld(h);
    expect(j["@type"]).toBe("FAQPage");
    expect(j.mainEntity[0].name).toBe("When is my Saturn return if I was born in March 1997?");
    for (const q of j.mainEntity) { expect(h).toContain(q.name); expect(q.acceptedAnswer.text.length).toBeGreaterThan(40); }
    // the FAQ answers are on the page, word for word
    for (const q of j.mainEntity) expect(text(h)).toContain(q.acceptedAnswer.text);
    expect(h).toContain(`href="${previewHref("1997-03").replace("&", "&amp;")}"`);
    expect(previewHref("1997-03")).toBe("/start?d=1997-03-01&r=seo");
    for (const n of ["1997-02", "1997-04", "1996-03", "1998-03", "1997"]) expect(h).toContain(`href="/saturn-return/born/${n}"`);
    expect(h).toContain('href="/saturn-return/saturn-in/aries"');
    const t = text(h);
    expect(t).not.toMatch(BANNED);
    expect(t).not.toMatch(/birthday|turning 29|\b29th\b|\bwill (meet|lose)\b|expect a/i);
    expect(t).toContain("Saturn describes the work, not the outcome");
  });

  it("first and last months have no link outside the range", async () => {
    const a = await (await get("/saturn-return/born/1940-01")).text();
    expect(a).not.toContain('href="/saturn-return/born/1939-12"');
    expect(a).toContain('href="/saturn-return/born/1940-02"');
    const z = await (await get("/saturn-return/born/2005-12")).text();
    expect(z).not.toContain('href="/saturn-return/born/2006-01"');
    expect(z).toContain('href="/saturn-return/born/2005-11"');
  });

  it("titles and meta descriptions are unique across all 792 months", () => {
    const today = new Date();
    const titles = new Set<string>(), descs = new Set<string>();
    for (const f of FACTS.values()) {
      const m = monthMeta(f, today);
      expect(m.description.length, f.ym).toBeLessThanOrEqual(155);
      titles.add(m.title); descs.add(m.description);
    }
    expect(titles.size).toBe(792);
    expect(descs.size).toBe(792);
  });

  it("titles and descriptions use absolute dates only", () => {
    for (const f of FACTS.values()) {
      const m = monthMeta(f, new Date());
      expect(`${m.title} ${m.description}`).not.toMatch(/\b(now|today|ago|in \d|in about|upcoming|next year)\b/i);
    }
  });
});

describe("no stale relative wording", () => {
  const COHORTS = ["1940-03", "1944-06", "1966-12", "1968-05", "1975-01", "1985-07", "1996-04", "1997-03", "1998-11", "2001-08", "2005-12"];
  const DAYS = ["2026-10-18", "2026-11-20", "2027-01-01", "2027-06-15", "2028-05-01", "2030-07-01", "2034-03-01", "2045-01-01"];
  for (const d of DAYS) {
    it(`month, year and index pages read true on ${d}`, () => {
      const today = new Date(`${d}T12:00:00Z`);
      for (const ym of COHORTS) {
        const f = FACTS.get(ym)!;
        const t = text(monthPage({ siteUrl: "https://rite.test", f, today }).toString());
        expect(staleWording(t, d), `${ym} on ${d}`).toEqual([]);
        expect(t).toContain(`As of ${fmtDay(d)}`);
        // every pass in a day card is labelled against today
        for (const s of f.samples) for (const r of s.returns) for (const hit of r.hits) {
          const label = new RegExp(`${fmtDay(hit)}\\s+(passed|today|ahead)`).exec(t);
          if (label) expect(label[1], `${ym} ${hit} on ${d}`).toBe(hit < d ? "passed" : hit === d ? "today" : "ahead");
        }
        for (const [, a] of monthFaq(f, today)) expect(staleWording(a, d), `${ym} FAQ on ${d}`).toEqual([]);
      }
      const yr = text(yearPage({ siteUrl: "https://rite.test", year: 1997, months: (SUMMARY as never[]).filter((m: { ym: string }) => m.ym.startsWith("1997-")), today }).toString());
      expect(yr).not.toMatch(/Opens in -|Opens within a month.*Ran/);
      const idx = text(indexPage({ siteUrl: "https://rite.test", all: SUMMARY as never, today }).toString());
      expect(staleWording(idx, d), `index on ${d}`).toEqual([]);
    });
  }

  it("the checker itself catches a past date described as ahead", () => {
    expect(staleWording("the next is 1 Jan 2020, in 3 months.", "2026-10-18")).toHaveLength(1);
    expect(staleWording("window opens May 2025, in 2 months", "2026-10-18")).toHaveLength(1);
    expect(staleWording("9 Apr 2026 ahead", "2026-10-18")).toHaveLength(1);
    expect(staleWording("9 Apr 2026 passed", "2026-10-18")).toHaveLength(0);
  });
});

describe("year and index pages", () => {
  it("year page lists all twelve months with links, canonical and a unique title", async () => {
    const h = await (await get("/saturn-return/born/1997")).text();
    expect(h).toContain('<link rel="canonical" href="https://rite.test/saturn-return/born/1997">');
    expect(title(h)).toBe("Saturn return for people born in 1997, month by month · Rite");
    for (let m = 1; m <= 12; m++) expect(h).toContain(`href="/saturn-return/born/1997-${String(m).padStart(2, "0")}"`);
    expect(h).toContain('href="/saturn-return/born/1996"');
    expect(h).toContain('href="/saturn-return/born/1998"');
    expect(h).toContain('href="/start?r=seo"');
    expect(text(h)).not.toMatch(BANNED);
  });

  it("index lists who is in a window now (from the engine) and every year", async () => {
    const today = new Date("2026-10-18T12:00:00Z");
    const t = text(indexPage({ siteUrl: "https://rite.test", all: SUMMARY as never, today }).toString());
    // March 1997 is in its first return in Aries on 18 Oct 2026 (the acceptance case in astro.test.ts)
    const c = compute({ date: "1997-03-14", time: null, place: utcNoon }, today);
    expect(c.phase).not.toBe("not_yet");
    expect(t).toContain("First return · Saturn in Aries");
    expect(t).toContain(`Window ${fmtMonth(c.window.windowStart)} to ${fmtMonth(c.window.windowEnd)}`);
    expect(t).toContain("Second return · Saturn in Aries");
    const r = await get("/saturn-return/born");
    expect(r.status).toBe(200);
    const h = await r.text();
    expect(h).toContain('<link rel="canonical" href="https://rite.test/saturn-return/born">');
    for (let y = BORN_FROM; y <= BORN_TO; y++) expect(h).toContain(`href="/saturn-return/born/${y}"`);
  });
});

describe("sitemap and robots", () => {
  it("sitemap lists the index, 66 years and 792 months, plus the existing pages", async () => {
    const sm = await (await get("/sitemap.xml")).text();
    const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(new Set(locs).size).toBe(locs.length);
    expect(locs).toContain("https://rite.test/saturn-return/born");
    expect(locs.filter((l) => /\/saturn-return\/born\/\d{4}$/.test(l))).toHaveLength(66);
    expect(locs.filter((l) => /\/saturn-return\/born\/\d{4}-\d{2}$/.test(l))).toHaveLength(792);
    expect(locs).toContain("https://rite.test/saturn-return/born/1997-03");
    expect(locs).toContain("https://rite.test/saturn-return/saturn-in/aries");
    expect(locs.length).toBeLessThan(50_000);
  });
  it("robots.txt points at the sitemap and doesn't block the pages", async () => {
    const r = await (await get("/robots.txt")).text();
    expect(r).toContain("Sitemap: https://rite.test/sitemap.xml");
    expect(r).not.toMatch(/Disallow: \/saturn-return/);
  });
  it("sign pages link to the birth-year index", async () => {
    expect(await (await get("/saturn-return/saturn-in/leo")).text()).toContain('href="/saturn-return/born"');
  });
});

describe("cost and caching", () => {
  it("a month's facts compute well inside the Workers CPU budget", () => {
    const t0 = performance.now();
    for (const ym of ["1940-01", "1968-05", "1997-03", "2005-12"]) bornFacts(+ym.slice(0, 4), +ym.slice(5));
    expect((performance.now() - t0) / 4).toBeLessThan(50); // ~5 ms each locally; the paid plan allows 30 s, the free 10 ms is per request and the result is cached
  });
  it("bornFactsCached stores under a versioned key and reads it back", async () => {
    const store = new Map<string, string>(); let puts = 0;
    const kv = { get: async (k: string, t?: string) => { const v = store.get(k); return v === undefined ? null : t === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { puts++; store.set(k, v); } };
    const a = await bornFactsCached(kv as never, 1997, 3);
    expect([...store.keys()]).toEqual([`born:v${FACTS_VERSION}:1997-03`]);
    const b = await bornFactsCached(kv as never, 1997, 3);
    expect(puts).toBe(1);
    expect(b).toEqual(a);
    expect(a).toEqual(FACTS.get("1997-03"));
    // a stale version in the cache is ignored and replaced
    store.set(`born:v${FACTS_VERSION}:1997-04`, JSON.stringify({ ...FACTS.get("1997-04"), v: FACTS_VERSION - 1 }));
    const c = await bornFactsCached(kv as never, 1997, 4);
    expect(c.v).toBe(FACTS_VERSION);
    expect(puts).toBe(2);
  });
});
