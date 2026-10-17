// Monday KPI email (build 6): numbers for a fixture week, the Monday-07:00 and once-a-week guards, gate choice by date,
// month-target pro-rating, and the PostHog paths. Real SQL via the Harness; nothing leaves the process.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness } from "./helpers/worker";
import { buildKpiReport, kpiSendHour, monthTarget, nextGate, posthogVisits, type VisitsFn } from "../src/kpi";

const KEY = "admin_key_for_tests_123";
// Monday 16 Nov 2026, 07:30 Brisbane (UTC+10). Last week = 9–15 Nov (Brisbane), previous = 2–8 Nov.
const MON = new Date("2026-11-15T21:30:00Z");
const CUR = "2026-11-10T00:00:00.000Z", PREV = "2026-11-03T00:00:00.000Z";

let h: Harness;
beforeEach(() => { h = new Harness({ ADMIN_KEY: KEY } as never); vi.stubGlobal("fetch", h.fetch); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const db = () => h.env.DB;
function pv(id: string, at: string, ref: string | null = null) {
  h.seedPreview({ id, ref });
  h.db.prepare("UPDATE previews SET created_at=? WHERE id=?").bind(at, id).runSync();
}
function pu(id: string, preview: string, at: string, cents: number, status = "generated") {
  h.db.prepare("INSERT INTO purchases (id, preview_id, created_at, email, amount_cents, tier, status) VALUES (?,?,?,?,?,?,?)").bind(id, preview, at, `${id}@x.test`, cents, "full", status).runSync();
}
function gift(code: string, at: string, cents: number, redeemedAt: string | null = null, redeemedBy: string | null = null) {
  h.db.prepare("INSERT INTO gifts (code, created_at, buyer_email, amount_cents, redeemed_at, redeemed_purchase_id) VALUES (?,?,?,?,?,?)").bind(code, at, "g@x.test", cents, redeemedAt, redeemedBy).runSync();
}
function ev(kind: string, at: string, ref: string | null = null, detail: unknown = null) {
  h.db.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(at, kind, ref, detail === null ? null : typeof detail === "string" ? detail : JSON.stringify(detail)).runSync();
}

function seedWeek() {
  pv("t1", CUR, "tiktok"); pv("t2", CUR, "tiktok"); pv("t3", CUR, "tiktok"); pv("r1", CUR, "reddit"); pv("r2", CUR, "reddit"); pv("n1", CUR);
  pv("o1", PREV, "ig"); pv("o2", PREV); pv("o3", PREV); pv("o4", PREV);
  pv("old", "2026-10-20T00:00:00.000Z"); // outside both weeks
  pu("p1", "t1", CUR, 2900); pu("p2", "r1", CUR, 1900, "paid"); pu("p3", "t2", CUR, 2900, "refunded"); pu("p4", "n1", CUR, 0); pu("p5", "t3", CUR, 2900, "failed");
  pu("p6", "o1", PREV, 2900);
  gift("G1", CUR, 2900, CUR, "p4"); gift("G2", CUR, 2900, "refunded");
  ev("refund", CUR, "p3"); ev("refund", CUR, "p3", { via: "stripe" }); // /admin/refund then the webhook echo: one refund
  ev("season_start", CUR, "sa"); ev("season_start", CUR, "sb");
  ev("season_cancel", CUR, "sa", { via: "admin" }); ev("season_cancel", CUR, "sa", { via: "refund" });
  ev("season_refund", CUR, "sa", { amount: 4900 }); ev("season_refund", CUR, "sb", { amount: 0 });
  ev("followup_sent", CUR); ev("followup_sent", CUR); ev("followup_sent", CUR); ev("followup_skipped", CUR); ev("stopped", CUR); ev("stopped", CUR);
  ev("error", CUR, null, { where: "followup" }); ev("error", CUR, null, { where: "followup" }); ev("error", CUR, null, { where: "email" }); ev("error", CUR, null, '{"where":"trunc');
  ev("error", PREV, null, { where: "email" });
  ev("narrated", CUR, "p1", { fallback: true }); ev("narrated", CUR, "p1", { fallback: false }); ev("narrated", CUR, "p2", { fallback: false });
  h.seedSubscription({ id: "s1", purchaseId: "p1" }); h.seedSubscription({ id: "s2", purchaseId: "p2" });
  h.seedSubscription({ id: "s3", purchaseId: "p6", status: "past_due" }); h.seedSubscription({ id: "s4", purchaseId: "p6", status: "canceled" });
}

describe("buildKpiReport: a fixture week", () => {
  it("counts every line from D1", async () => {
    seedWeek();
    const r = await buildKpiReport(db(), MON, { siteUrl: "https://rite.test" });
    const t = r.text;
    expect(t).toContain("Rite, 9 Nov–15 Nov vs 2 Nov–8 Nov (full days, Brisbane)");
    expect(t).toContain("Previews: 6 vs 4 (+50%)");
    expect(t).toContain("Paid readings: 2 vs 1 (+100%) · plus 1 $0 reading (gift codes), not in revenue");
    expect(t).toContain("Preview→paid: 33.3% vs 25.0%");
    expect(t).toContain("Revenue: $77 vs $29 (+166%) · readings $48, gifts $29"); // refunded p3, failed p5, refunded G2, $0 p4 all out
    expect(t).toContain("Refunds: 1 ($29) vs 0 ($0) · Season refunds 1 ($49)");
    expect(t).toContain("Season: 2 active (+1 past due), 2 started, 1 cancelled (prev week 0 started, 0 cancelled). Season revenue isn't stored in D1");
    expect(t).toContain("Gifts: 2 bought, 1 redeemed (prev 0, 0)");
    // November: $77 this week + $29 the week before; pro-rated over 15 days 7.5 h of 30
    expect(t).toContain("Month to date (2026-11, day 16 of 30): $106 vs $5,104 pro-rated, 2% (month target $10,000)");
    expect(t).toContain("Follow-ups: 3 sent, 1 skipped · stops: 2");
    expect(t).toContain("Narration: 3 narrated, 1 on the fallback voice");
    expect(t).toContain("Errors: 4 vs 1 · followup 2, (no where) 1, email 1");
    expect(t).toContain("Previews: tiktok 3, reddit 2, (none) 1");
    expect(t).toContain("Paid: tiktok 1 ($29), reddit 1 ($19)");
    expect(t).toContain("https://rite.test/admin?days=7");
    // Gate A is 14 days out and can't be judged without visits: that is the headline
    expect(r.headline).toBe("Look at: Gate A (by 30 Nov 2026, 14 days): visit→paid n/a of 2.0% · previews/week 6 of 1,500 · not measurable without visits");
    expect(t.split("\n")[0]).toBe(r.headline);
    expect(r.subject.startsWith("Rite week to 15 Nov: Gate A")).toBe(true);
  });

  it("without the PostHog vars, says how to add visits once and leaves visit→paid out", async () => {
    seedWeek();
    const { text } = await buildKpiReport(db(), MON);
    expect(text.match(/add POSTHOG_PERSONAL_API_KEY/g)).toHaveLength(1);
    expect(text).not.toContain("Visit→paid:");
    expect(text).not.toContain("Visitors:");
  });

  it("with visits, shows visitors and visit→paid, and judges Gate A", async () => {
    seedWeek();
    const seen: string[][] = [];
    const visits: VisitsFn = async (f, t) => { seen.push([f, t]); return f.startsWith("2026-11-08") ? { visitors: 100, pageviews: 300 } : { visitors: 80, pageviews: 200 }; };
    const { text } = await buildKpiReport(db(), MON, { visits });
    expect(seen).toEqual([["2026-11-08T14:00:00.000Z", "2026-11-15T14:00:00.000Z"], ["2026-11-01T14:00:00.000Z", "2026-11-08T14:00:00.000Z"]]);
    expect(text).toContain("Visitors: 100 vs 80 (+25%) · pageviews 300 vs 200");
    expect(text).toContain("Visit→paid: 2.0% vs 1.3% (paid ÷ unique visitors)");
    expect(text).toContain("Gate A (by 30 Nov 2026, 14 days): visit→paid 2.0% of 2.0% · previews/week 6 of 1,500 · not met");
    expect(text).not.toContain("POSTHOG_PERSONAL_API_KEY");
  });

  it("a failing PostHog query is reported, not thrown", async () => {
    const { text } = await buildKpiReport(db(), MON, { visits: async () => { throw new Error("401"); } });
    expect(text).toContain("Visits: PostHog query failed");
  });

  it("headline names the largest drop when no gate is close", async () => {
    const at = (d: string) => `${d}T00:00:00.000Z`;
    for (let i = 0; i < 20; i++) pv(`a${i}`, at("2026-12-02"));
    for (let i = 0; i < 10; i++) pv(`b${i}`, at("2026-12-09"));
    for (let i = 0; i < 6; i++) pu(`pa${i}`, `a${i}`, at("2026-12-02"), 2900);
    for (let i = 0; i < 5; i++) pu(`pb${i}`, `b${i}`, at("2026-12-09"), 2900);
    // Mon 14 Dec 2026: the kill line (31 Jan) is 48 days away
    const r = await buildKpiReport(db(), new Date("2026-12-13T21:10:00Z"));
    expect(r.headline).toBe("Look at: Previews down 50% (10 vs 20)");
    expect(r.text).toContain("Kill line (31 Jan 2027, 48 days): visit→paid over 4 weeks n/a, line is 1.5%");
  });

  it("an empty database still renders", async () => {
    const r = await buildKpiReport(db(), MON);
    expect(r.headline).toContain("Gate A");
    expect(r.text).toContain("Previews: 0 vs 0");
    expect(r.text).toContain("Preview→paid: n/a vs n/a");
  });
});

describe("gates and targets", () => {
  it("picks the next gate by Brisbane date", () => {
    expect(nextGate("2026-10-17")!.id).toBe("A");
    expect(nextGate("2026-11-30")!.id).toBe("A");
    expect(nextGate("2026-12-01")!.id).toBe("kill");
    expect(nextGate("2027-01-31")!.id).toBe("kill");
    expect(nextGate("2027-02-01")!.id).toBe("B");
    expect(nextGate("2027-03-01")!.id).toBe("C");
    expect(nextGate("2027-07-01")).toBeNull();
  });

  it("shows the chosen gate in the report", async () => {
    expect((await buildKpiReport(db(), new Date("2027-02-14T21:00:00Z"))).text).toContain("Gate B (28 Feb 2027, 13 days): ads cost per buyer under $20 · ads not running");
    pv("xp", "2027-03-02T00:00:00.000Z"); pu("x", "xp", "2027-03-02T00:00:00.000Z", 2900);
    expect((await buildKpiReport(db(), new Date("2027-03-14T21:00:00Z"))).text).toContain("Gate C (30 Jun 2027, 107 days): a $100,000 month · this month $29 so far · best month $29 (2027-03)");
    expect((await buildKpiReport(db(), new Date("2027-07-04T21:00:00Z"))).text).toContain("Gates: all dates passed");
  });

  it("kill line uses 4 weeks of visits when PostHog is set", async () => {
    const seen: string[][] = [];
    const visits: VisitsFn = async (f, t) => { seen.push([f, t]); return { visitors: 1000, pageviews: 2000 }; };
    for (let i = 0; i < 12; i++) { pv(`k${i}`, "2026-12-20T00:00:00.000Z"); pu(`kp${i}`, `k${i}`, "2026-12-20T00:00:00.000Z", 2900); }
    const { text } = await buildKpiReport(db(), new Date("2027-01-03T21:00:00Z"), { visits });
    expect(seen[2]).toEqual(["2026-12-06T14:00:00.000Z", "2027-01-03T14:00:00.000Z"]);
    expect(text).toContain("visit→paid over 4 weeks 1.2%, line is 1.5% · BELOW");
  });

  it("pro-rates the month's target by elapsed time, Brisbane months", () => {
    // 00:00 Brisbane on 16 Nov = half of November gone
    expect(monthTarget(new Date("2026-11-15T14:00:00Z"))).toMatchObject({ month: "2026-11", targetCents: 1_000_000, proRatedCents: 500_000, day: 16, days: 30 });
    // 1 Dec 00:00 Brisbane is still 30 Nov in UTC; December's $45k, 0 elapsed
    expect(monthTarget(new Date("2026-11-30T14:00:00Z"))).toMatchObject({ month: "2026-12", proRatedCents: 0, startIso: "2026-11-30T14:00:00.000Z" });
    // February 2027 has 28 days; 7 days in = a quarter of $45k
    expect(monthTarget(new Date("2027-02-07T14:00:00Z"))).toMatchObject({ month: "2027-02", days: 28, proRatedCents: 1_125_000 });
    expect(monthTarget(new Date("2026-10-20T00:00:00Z"))).toBeNull(); // before the plan's first month
  });

  it("only Monday 07:00–07:59 Brisbane is send time", () => {
    expect(kpiSendHour(new Date("2026-11-15T21:00:00Z"))).toBe(true);  // Mon 07:00
    expect(kpiSendHour(new Date("2026-11-15T21:59:59Z"))).toBe(true);  // Mon 07:59
    expect(kpiSendHour(new Date("2026-11-15T22:00:00Z"))).toBe(false); // Mon 08:00
    expect(kpiSendHour(new Date("2026-11-15T20:59:00Z"))).toBe(false); // Mon 06:59
    expect(kpiSendHour(new Date("2026-11-16T21:30:00Z"))).toBe(false); // Tue 07:30
  });
});

describe("the cron and the admin routes", () => {
  const at = (iso: string) => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(iso)); };
  const kpiMails = () => h.emails().filter((e) => e.subject.startsWith("Rite week to"));

  it("sends once on Monday 07:00 Brisbane, not other hours or days, and once a week", async () => {
    at("2026-11-15T21:05:00Z"); await h.scheduled();
    expect(kpiMails()).toHaveLength(1);
    expect(kpiMails()[0]!.to).toEqual(["admin@rite.test"]);
    expect(h.events("kpi_sent")).toHaveLength(1);
    at("2026-11-15T21:50:00Z"); await h.scheduled(); // same hour, a retried cron
    at("2026-11-15T22:05:00Z"); await h.scheduled(); // 08:00
    at("2026-11-16T21:05:00Z"); await h.scheduled(); // Tuesday 07:00
    expect(kpiMails()).toHaveLength(1);
    at("2026-11-22T21:05:00Z"); await h.scheduled(); // next Monday
    expect(kpiMails()).toHaveLength(2);
  });

  it("a forced send doesn't use up Monday's", async () => {
    at("2026-11-14T03:00:00Z");
    const res = await h.request("/admin/kpi/send", { method: "POST", headers: { authorization: `Bearer ${KEY}` } });
    expect(await res.json()).toMatchObject({ sent: true });
    expect(h.events("kpi_sent")[0]!.detail).toMatchObject({ forced: true });
    at("2026-11-15T21:05:00Z"); await h.scheduled();
    expect(kpiMails()).toHaveLength(2);
    expect((await h.request("/admin/kpi/send", { method: "POST" })).status).toBe(401);
  });

  it("GET /admin/kpi returns the same text with ADMIN_KEY, 404 otherwise", async () => {
    seedWeek();
    at("2026-11-15T21:30:00Z");
    expect((await h.request("/admin/kpi")).status).toBe(404);
    expect((await h.request("/admin/kpi?key=wrong_key_wrong_key")).status).toBe(404);
    const res = await h.request(`/admin/kpi?key=${KEY}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text).toBe((await buildKpiReport(db(), new Date(), { siteUrl: h.env.SITE_URL })).text);
    expect(text).not.toContain(KEY);
  });
});

describe("posthogVisits", () => {
  it("is off without both vars", () => {
    expect(posthogVisits({ key: "phx_k" })).toBeNull();
    expect(posthogVisits({ project: "1" })).toBeNull();
  });

  it("asks the HogQL query API for pageviews and unique visitors in the window", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fn = posthogVisits({ key: "phx_secret", project: "12345", host: "https://us.i.posthog.com" }, async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ results: [[420, 150]] }), { status: 200 });
    })!;
    expect(await fn("2026-11-08T14:00:00.000Z", "2026-11-15T14:00:00.000Z")).toEqual({ pageviews: 420, visitors: 150 });
    expect(calls[0]!.url).toBe("https://us.posthog.com/api/projects/12345/query/");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer phx_secret");
    const q = JSON.parse(calls[0]!.init.body as string).query;
    expect(q.kind).toBe("HogQLQuery");
    expect(q.query).toContain("event = '$pageview'");
    expect(q.query).toContain("timestamp >= toDateTime('2026-11-08 14:00:00', 'UTC') AND timestamp < toDateTime('2026-11-15 14:00:00', 'UTC')");
  });

  it("throws on an HTTP error so the report says the query failed", async () => {
    const fn = posthogVisits({ key: "k", project: "1" }, async () => new Response("no", { status: 403 }))!;
    await expect(fn("2026-11-08T14:00:00.000Z", "2026-11-15T14:00:00.000Z")).rejects.toThrow("posthog 403");
  });
});
