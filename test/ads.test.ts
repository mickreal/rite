// Build 10: the ads budget controller's rules (pure), the daily run against a mocked Marketing API (dry-run, on, caps,
// kill line, missing config, API errors), the Conversions API Purchase from the webhook, and the KPI email's ADS lines.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness, stripeEvent } from "./helpers/worker";
import { decide, allowedBudget, streak, runAdsController, hashEmail, RULES, type AdsInput, type DayRecord, type FetchFn } from "../src/ads";
import { buildKpiReport } from "../src/kpi";

// ---------- rules ----------
const TODAY = "2026-12-15";
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
/** $50 a day, day 15 of the campaign, $350 over 7 days; buyers decide the cost per buyer. Caps $200/day, $6,000/month. */
function input(o: Partial<AdsInput> = {}): AdsInput {
  return { today: TODAY, status: "ACTIVE", budgetCents: 5000, daysLive: 14, spend7: 35000, buyers7: 20, spendLife: 70000, buyersLife: 40,
    spendMonth: 70000, daysLeftInMonth: 17, dailyCapCents: 20000, monthlyCapCents: 600000, history: [], ...o };
}
/** Earlier days at a given 7-day cost per buyer ($350 spent), most recent first. */
const past = (cpbs: number[], action = "hold"): DayRecord[] => cpbs.map((c, k) => ({ date: day(k + 1), spend7: 35000, buyers7: Math.round(35000 / c), action }));
const buyersFor = (cpbCents: number) => Math.round(35000 / cpbCents);

describe("decide: the rules", () => {
  it("under $16 per buyer: raise 20%", () => {
    const d = decide(input({ buyers7: buyersFor(1250) })); // $12.50
    expect(d).toMatchObject({ action: "raise", from: 5000, to: 6000, email: false });
    expect(d.reason).toContain("$12.50 per buyer over 7 days (28 buyers), under $16: 20% up");
  });

  it("$16–20: hold", () => {
    for (const c of [1700, 1750, 1900]) expect(decide(input({ buyers7: buyersFor(c) })).action).toBe("hold");
    expect(decide(input({ buyers7: buyersFor(1750) })).reason).toContain("($16–$20 holds)");
  });

  it("over $20 for 3 days: cut 30%; 2 days is still a hold", () => {
    const b = buyersFor(2500);
    expect(decide(input({ buyers7: b, history: past([2500]) })).action).toBe("hold");
    expect(decide(input({ buyers7: b, history: past([2500]) })).reason).toContain("over $20 for 2 of 3 days");
    const d = decide(input({ buyers7: b, history: past([2500, 2400]) }));
    expect(d).toMatchObject({ action: "cut", from: 5000, to: 3500 });
    expect(d.reason).toContain("over $20 for 3 days");
  });

  it("a gap or a day under the line breaks the streak", () => {
    const b = buyersFor(2500);
    expect(decide(input({ buyers7: b, history: [past([2500])[0]!, { ...past([2500, 2500])[1]!, date: day(3) }] })).action).toBe("hold"); // no run 2 days ago
    expect(decide(input({ buyers7: b, history: past([2500, 1800]) })).action).toBe("hold");
  });

  it("over $30 for 2 days: pause and email Mick", () => {
    const b = buyersFor(3500);
    expect(decide(input({ buyers7: b })).action).not.toBe("pause");
    const d = decide(input({ buyers7: b, history: past([3200]) }));
    expect(d).toMatchObject({ action: "pause", to: 0, email: true });
    expect(d.reason).toContain("over $30 for 2 days");
  });

  it("no buyers at all counts as over every line", () => {
    expect(decide(input({ buyers7: 0, buyersLife: 10, history: past([Infinity]) }))).toMatchObject({ action: "pause" });
    expect(streak(input({ buyers7: 0 }), RULES.cutAboveCents)).toBe(1);
    expect(decide(input({ spend7: 0, buyers7: 0 })).action).toBe("hold"); // no spend, nothing to judge
  });

  it("a raise needs at least 3 buyers in the 7 days", () => {
    const d = decide(input({ spend7: 2000, buyers7: 2 }));
    expect(d.action).toBe("hold");
    expect(d.reason).toContain("only 2 buyers in 7 days (raises need 3)");
  });

  it("waits 3 days after a raise or cut, and a change resets the streak", () => {
    const cheap = buyersFor(1000);
    expect(decide(input({ buyers7: cheap, history: past([1000], "raise") })).reason).toContain("1 day since the last change (waits 3)");
    expect(decide(input({ buyers7: cheap, history: [{ date: day(2), spend7: 35000, buyers7: cheap, action: "raise" }] })).action).toBe("hold");
    expect(decide(input({ buyers7: cheap, history: [{ date: day(3), spend7: 35000, buyers7: cheap, action: "raise" }] })).action).toBe("raise");
    // three days over $20, but the middle one was a cut: only the days after it count
    const b = buyersFor(2500);
    expect(decide(input({ buyers7: b, history: [...past([2500]), { date: day(2), spend7: 35000, buyers7: b, action: "cut" }, ...past([2500, 2500, 2500]).slice(2)] })).action).toBe("hold");
  });

  it("first 7 days: holds at the starting budget whatever the numbers, except the kill line", () => {
    for (const c of [1000, 2500, 3500]) {
      const d = decide(input({ daysLive: 3, buyers7: buyersFor(c), spendLife: 20000, buyersLife: 10, history: past([c, c, c]) }));
      expect(d.action).toBe("hold");
      expect(d.reason).toContain("start: day 4 of 7");
    }
  });

  it("kill line: over $40 per buyer after $300 spent pauses, even in the first 7 days", () => {
    const d = decide(input({ daysLive: 6, spendLife: 30000, buyersLife: 7 })); // $42.86
    expect(d).toMatchObject({ action: "pause", email: true });
    expect(d.reason).toContain("kill line: $300 spent since start for 7 ?r=meta buyers ($42.86 each");
    expect(decide(input({ daysLive: 6, spendLife: 29900, buyersLife: 1 })).action).toBe("hold"); // not yet $300
    expect(decide(input({ daysLive: 6, spendLife: 30000, buyersLife: 8 })).action).toBe("hold"); // $37.50
    expect(decide(input({ daysLive: 6, spendLife: 30000, buyersLife: 0 })).action).toBe("pause");
  });

  it("caps: never above the daily cap or the month's remaining rate", () => {
    const cheap = buyersFor(1000);
    expect(decide(input({ budgetCents: 18000, buyers7: cheap }))).toMatchObject({ action: "raise", to: 20000 }); // 216 → held to 200
    expect(decide(input({ budgetCents: 18000, buyers7: cheap })).reason).toContain("held to the cap $200");
    expect(decide(input({ budgetCents: 20000, buyers7: cheap }))).toMatchObject({ action: "hold" });
    expect(decide(input({ budgetCents: 20000, buyers7: cheap })).reason).toContain("at the cap ($200 a day)");
    // $5,000 spent, $1,000 left over 17 days → $58 a day at most
    expect(allowedBudget(input({ spendMonth: 500000 }))).toBe(5800);
    expect(decide(input({ budgetCents: 5000, buyers7: cheap, spendMonth: 500000 }))).toMatchObject({ action: "raise", to: 5800 });
    // Mick raised it by hand past the cap: cut back, even during the start week and the cooldown
    expect(decide(input({ budgetCents: 30000, daysLive: 2 }))).toMatchObject({ action: "cut", to: 20000 });
    expect(decide(input({ budgetCents: 30000, history: past([1700], "raise") }))).toMatchObject({ action: "cut", to: 20000 });
  });

  it("monthly cap reached, or under $5 a day left: pause", () => {
    expect(decide(input({ spendMonth: 600000 }))).toMatchObject({ action: "pause", email: true });
    expect(decide(input({ spendMonth: 600000 })).reason).toContain("monthly cap reached: $6000 of $6000");
    expect(decide(input({ spendMonth: 595000, daysLeftInMonth: 17 }))).toMatchObject({ action: "pause" });
  });

  it("does nothing to a campaign that isn't active (never resumes)", () => {
    expect(decide(input({ status: "PAUSED", spendLife: 90000, buyersLife: 0 }))).toMatchObject({ action: "none" });
  });
});

// ---------- the daily run ----------
const NOW = new Date("2026-12-14T20:10:00Z"); // 06:10 Brisbane, 15 Dec
const TOKEN = "EAAtest_system_user_token_secret";
const CAMPAIGN = "120210000000000001";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

interface MetaCall { method: string; path: string; params: URLSearchParams }
function metaMock(o: { status?: string; budget?: number; start?: string; spend7?: number; life?: number; month?: number; fail?: string } = {}) {
  const calls: MetaCall[] = [];
  const f: FetchFn = async (url, init) => {
    const u = new URL(url);
    const method = init?.method ?? "GET";
    const params = method === "GET" ? u.searchParams : new URLSearchParams(String(init?.body ?? ""));
    const path = u.pathname.replace(/^\/v[\d.]+\//, "");
    calls.push({ method, path, params });
    if (o.fail && path.includes(o.fail)) return json({ error: { message: "Invalid OAuth access token", code: 190 } }, 400);
    if (method === "POST") return json({ success: true });
    if (path === CAMPAIGN) return json({ id: CAMPAIGN, status: o.status ?? "ACTIVE", daily_budget: String(o.budget ?? 5000), start_time: o.start ?? "2026-12-01T09:00:00+1000" });
    if (path === `${CAMPAIGN}/insights`) {
      const v = params.get("date_preset") === "maximum" ? o.life ?? 70000 : params.get("date_preset") === "this_month" ? o.month ?? 70000 : o.spend7 ?? 35000;
      return json({ data: v ? [{ spend: (v / 100).toFixed(2), date_start: "x", date_stop: "y" }] : [] });
    }
    return json({ error: { message: `unexpected ${method} ${url}` } }, 500);
  };
  return { f, calls, posts: () => calls.filter((c) => c.method === "POST") };
}

let h: Harness;
const mails: Array<{ subject: string; text: string }> = [];
const notify = async (subject: string, text: string) => { mails.push({ subject, text }); return true; };
const ENV_ON = { ADS: "on", META_ADS_TOKEN: TOKEN, META_CAMPAIGN_ID: CAMPAIGN, ADS_DAILY_CAP: "200", ADS_MONTHLY_CAP: "6000" };
function setEnv(o: Record<string, string | undefined>) { Object.assign(h.env, o); }
let seq = 0;
/** n sold readings from previews that came in on ?r=<ref>, at `at`. */
function buyers(n: number, at: string, ref = "meta", cents = 2900) {
  for (let k = 0; k < n; k++) {
    const id = `b${seq++}`;
    h.seedPreview({ id, ref });
    h.db.prepare("INSERT INTO purchases (id, preview_id, created_at, email, amount_cents, tier, status) VALUES (?,?,?,?,?,?,?)").bind(`tok_${id}`, id, at, `${id}@x.test`, cents, "full", "generated").runSync();
  }
}
const decisions = () => h.events("ads_decision").map((e) => e.detail);

beforeEach(() => { h = new Harness(); vi.stubGlobal("fetch", h.fetch); mails.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("runAdsController", () => {
  it("ADS=off (the default): nothing read, nothing logged", async () => {
    const m = metaMock();
    expect(await runAdsController(h.env, { now: NOW, f: m.f, notify, force: true })).toEqual({ ran: false, reason: "ADS=off" });
    setEnv({ ...ENV_ON, ADS: "anything-else" });
    expect((await runAdsController(h.env, { now: NOW, f: m.f, notify, force: true })).ran).toBe(false);
    expect(m.calls).toHaveLength(0);
    expect(h.events()).toHaveLength(0);
  });

  it("missing tokens or caps: does nothing at Meta and reports what is missing", async () => {
    setEnv({ ADS: "dry-run" });
    const m = metaMock();
    const r = await runAdsController(h.env, { now: NOW, f: m.f, notify });
    expect(r.decision?.action).toBe("none");
    expect(m.calls).toHaveLength(0);
    expect(decisions()).toEqual([{ date: "2026-12-15", mode: "dry-run", action: "none", applied: false, reason: "missing config: META_ADS_TOKEN, META_CAMPAIGN_ID, ADS_DAILY_CAP, ADS_MONTHLY_CAP; nothing read or changed" }]);
  });

  it("runs at 06:00 Brisbane only, once a day", async () => {
    setEnv({ ...ENV_ON, ADS: "dry-run" });
    const m = metaMock();
    expect((await runAdsController(h.env, { now: new Date("2026-12-14T21:10:00Z"), f: m.f, notify })).reason).toBe("not 06:00 Brisbane");
    expect((await runAdsController(h.env, { now: NOW, f: m.f, notify })).ran).toBe(true);
    expect((await runAdsController(h.env, { now: new Date(NOW.getTime() + 600000), f: m.f, notify })).reason).toBe("already ran today");
    expect(decisions()).toHaveLength(1);
  });

  it("reads spend for the 7 full Brisbane days and counts only Rite's own ?r=meta buyers in them", async () => {
    setEnv({ ...ENV_ON, ADS: "dry-run" });
    buyers(25, "2026-12-10T00:00:00.000Z");                 // in the window: $350 / 25 = $14
    buyers(3, "2026-12-14T15:00:00.000Z");                  // today (Brisbane 15 Dec, 01:00): not in the 7 days
    buyers(4, "2026-12-10T00:00:00.000Z", "meta-gift");     // a meta-* ref counts too
    buyers(9, "2026-12-10T00:00:00.000Z", "tiktok");        // other sources don't
    const m = metaMock();
    await runAdsController(h.env, { now: NOW, f: m.f, notify });
    const ins = m.calls.filter((c) => c.path === `${CAMPAIGN}/insights`);
    expect(ins.map((c) => c.params.get("time_range") ?? c.params.get("date_preset"))).toEqual(['{"since":"2026-12-08","until":"2026-12-14"}', "maximum", "this_month"]);
    expect(decisions()[0]).toMatchObject({ spend7: 35000, buyers7: 29, buyers_life: 32, cpb7: 1207, action: "raise", from: 5000, to: 6000, day: 15 });
  });

  it("dry-run: decides and logs, changes nothing at Meta", async () => {
    setEnv({ ...ENV_ON, ADS: "dry-run" });
    buyers(25, "2026-12-10T00:00:00.000Z");
    const m = metaMock();
    const r = await runAdsController(h.env, { now: NOW, f: m.f, notify });
    expect(r).toMatchObject({ ran: true, applied: false, decision: { action: "raise", to: 6000 } });
    expect(m.posts()).toHaveLength(0);
    expect(decisions()[0]).toMatchObject({ mode: "dry-run", action: "raise", applied: false });
    expect(mails).toHaveLength(0); // raises and cuts are in the KPI email; only pauses email
  });

  it("on: applies a raise as daily_budget in cents", async () => {
    setEnv(ENV_ON);
    buyers(25, "2026-12-10T00:00:00.000Z");
    const m = metaMock();
    expect((await runAdsController(h.env, { now: NOW, f: m.f, notify })).applied).toBe(true);
    expect(m.posts().map((c) => [c.path, c.params.get("daily_budget"), c.params.get("access_token")])).toEqual([[CAMPAIGN, "6000", TOKEN]]);
    expect(decisions()[0]).toMatchObject({ mode: "on", action: "raise", applied: true });
  });

  it("on: the kill line pauses the campaign and emails Mick", async () => {
    setEnv(ENV_ON);
    buyers(5, "2026-12-03T00:00:00.000Z"); // 5 buyers since the start for $320
    const m = metaMock({ start: "2026-12-01T09:00:00+1000", life: 32000, spend7: 32000, month: 32000 });
    await runAdsController(h.env, { now: new Date("2026-12-06T20:10:00Z"), f: m.f, notify }); // day 7 of the start week
    expect(m.posts().map((c) => [c.path, c.params.get("status")])).toEqual([[CAMPAIGN, "PAUSED"]]);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toBe("Rite ads: paused (kill line)");
    expect(mails[0]!.text).toContain("$320 spent since start for 5 ?r=meta buyers ($64 each, line is $40 after $300)");
    expect(mails[0]!.text).toContain("never un-pauses");
  });

  it("dry-run: a pause is only reported, by email marked [dry run]", async () => {
    setEnv({ ...ENV_ON, ADS: "dry-run" });
    const m = metaMock({ life: 40000 });
    await runAdsController(h.env, { now: NOW, f: m.f, notify });
    expect(m.posts()).toHaveLength(0);
    expect(mails[0]!.subject).toBe("[dry run] Rite ads: would pause (kill line)");
  });

  it("uses yesterday's run for the 2-day pause rule", async () => {
    setEnv(ENV_ON);
    buyers(10, "2026-12-10T00:00:00.000Z"); // $35 per buyer
    const m = metaMock({ life: 200000 });
    h.db.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind("2026-12-13T20:10:00.000Z", "ads_decision", CAMPAIGN,
      JSON.stringify({ date: "2026-12-14", mode: "on", action: "hold", spend7: 33000, buyers7: 10 })).runSync();
    buyers(60, "2026-12-02T00:00:00.000Z"); // earlier in the campaign: lifetime cost per buyer well under the kill line
    await runAdsController(h.env, { now: NOW, f: m.f, notify });
    expect(decisions()[1]).toMatchObject({ action: "pause", applied: true });
    expect(decisions()[1]!.reason).toContain("over $30 for 2 days");
  });

  it("Meta API error: no change, an ads_decision saying why, an error for the digest, and no token in either", async () => {
    setEnv(ENV_ON);
    const m = metaMock({ fail: "insights" });
    const r = await runAdsController(h.env, { now: NOW, f: m.f, notify });
    expect(r.decision?.action).toBe("none");
    expect(m.posts()).toHaveLength(0);
    expect(decisions()[0]!.reason).toMatch(/^Meta API error, nothing changed: Meta GET 120210000000000001\/insights 400: 190 Invalid OAuth access token/);
    expect(h.events("error")[0]!.detail.where).toBe("ads");
    expect(JSON.stringify(h.events())).not.toContain(TOKEN);
  });

  it("a refused change is logged as not applied, and Mick hears about it", async () => {
    setEnv(ENV_ON);
    buyers(25, "2026-12-10T00:00:00.000Z");
    const m = metaMock();
    const f: FetchFn = async (u, i) => (i?.method === "POST" ? json({ error: { message: "Budget too low", code: 100 } }, 400) : m.f(u, i));
    const r = await runAdsController(h.env, { now: NOW, f, notify });
    expect(r.applied).toBe(false);
    expect(decisions()[0]).toMatchObject({ action: "raise", applied: false });
    expect(decisions()[0]!.apply_error).toContain("Budget too low");
    expect(mails[0]!.subject).toContain("Meta refused the change");
  });

  it("budget on the ad set: META_ADSET_ID is the object read and changed; appsecret_proof when META_APP_SECRET is set", async () => {
    setEnv({ ...ENV_ON, META_ADSET_ID: "238400000000000002", META_APP_SECRET: "app_secret_test" });
    const calls: string[] = [];
    const f: FetchFn = async (u, i) => {
      const url = new URL(u); calls.push(`${i?.method ?? "GET"} ${url.pathname}`);
      const p = i?.method === "POST" ? new URLSearchParams(String(i.body)) : url.searchParams;
      expect(p.get("appsecret_proof")).toMatch(/^[0-9a-f]{64}$/);
      if (url.pathname.endsWith("/insights")) return json({ data: [{ spend: "350.00" }] });
      return json({ id: "238400000000000002", status: "ACTIVE", daily_budget: "5000", start_time: "2026-12-01T09:00:00+1000" });
    };
    await runAdsController(h.env, { now: NOW, f, notify });
    expect(calls[0]).toBe("GET /v24.0/238400000000000002");
  });

  it("a campaign with a lifetime budget is an error, not a guess", async () => {
    setEnv(ENV_ON);
    const f: FetchFn = async (u) => (new URL(u).pathname.endsWith("/insights") ? json({ data: [] }) : json({ id: CAMPAIGN, status: "ACTIVE", lifetime_budget: "100000", start_time: "2026-12-01T09:00:00+1000" }));
    await runAdsController(h.env, { now: NOW, f, notify });
    expect(decisions()[0]!.reason).toContain("has no daily_budget");
  });
});

// ---------- Conversions API ----------
describe("Conversions API: Purchase from the webhook", () => {
  const PIXEL = "1234567890";
  let meta: Array<{ url: string; body: any }>;
  let metaStatus = 200;
  beforeEach(() => {
    meta = []; metaStatus = 200;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("https://graph.facebook.com/")) { meta.push({ url, body: JSON.parse(String(init?.body)) }); return json(metaStatus === 200 ? { events_received: 1 } : { error: { message: "bad" } }, metaStatus); }
      return h.fetch(input, init);
    });
    h.seedPreview();
  });

  it("META_CAPI on: one Purchase, hashed email, session id as event_id, order value", async () => {
    setEnv({ META_CAPI: "on", META_PIXEL_ID: PIXEL, META_CAPI_TOKEN: "capi_token_test" });
    const ev = stripeEvent("checkout.session.completed.payment");
    await h.webhook(ev);
    await h.webhook(ev); // redelivery: fulfil finds the row, nothing sent again
    expect(meta).toHaveLength(1);
    expect(meta[0]!.url).toBe(`https://graph.facebook.com/v24.0/${PIXEL}/events`);
    const s = ev.data.object;
    const e = meta[0]!.body.data[0];
    expect(e).toMatchObject({ event_name: "Purchase", event_id: s.id, action_source: "website", custom_data: { currency: "USD", value: s.amount_total / 100 } });
    expect(e.user_data).toEqual({ em: [await hashEmail(s.customer_details.email)] });
    expect(e.user_data.em[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(e)).not.toContain(s.customer_details.email);
    expect(meta[0]!.body.access_token).toBe("capi_token_test");
    expect(h.events("meta_capi")).toHaveLength(1);
  });

  it("hashes the email as Meta asks: trimmed and lower-cased first", async () => {
    expect(await hashEmail("  Reader@Example.COM ")).toBe(await hashEmail("reader@example.com"));
    expect(await hashEmail("reader@example.com")).toBe("d108b279434fe1d54ac0f1da633564604b26c2e0e221d108b0fbadb87aba02c0"); // sha256, hex
  });

  it("off by default, and on without a pixel id: nothing sent (an error row says why), the purchase still goes through", async () => {
    await h.webhook(stripeEvent("checkout.session.completed.payment"));
    expect(meta).toHaveLength(0);
    expect(h.db.rows("SELECT id FROM purchases")).toHaveLength(1);
    setEnv({ META_CAPI: "on", META_CAPI_TOKEN: "capi_token_test" });
    await h.webhook(stripeEvent("checkout.session.completed.payment", { id: "cs_test_second" }));
    expect(meta).toHaveLength(0);
    expect(h.events("error").map((e) => e.detail.where)).toContain("meta-capi");
    expect(h.db.rows("SELECT id FROM purchases")).toHaveLength(2);
  });

  it("a Meta failure is logged and never blocks the reading", async () => {
    setEnv({ META_CAPI: "on", META_PIXEL_ID: PIXEL, META_CAPI_TOKEN: "capi_token_test" });
    metaStatus = 500;
    const res = await h.webhook(stripeEvent("checkout.session.completed.payment"));
    expect(res.status).toBe(200);
    expect(h.db.rows("SELECT id FROM purchases")).toHaveLength(1);
    expect(h.events("error").find((e) => e.detail.where === "meta-capi")?.detail.status).toBe(500);
  });
});

// ---------- KPI ----------
describe("KPI email: ads lines", () => {
  const MON = new Date("2026-12-20T21:30:00Z"); // Monday 21 Dec 07:30 Brisbane
  const row = (at: string, d: Record<string, unknown>) => h.db.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(at, "ads_decision", CAMPAIGN, JSON.stringify(d)).runSync();

  it("lists each decision of the week and the latest numbers", async () => {
    row("2026-12-15T20:10:00.000Z", { date: "2026-12-16", mode: "dry-run", action: "raise", from: 5000, to: 6000, applied: false, reason: "$12 per buyer", status: "ACTIVE", spend7: 35000, buyers7: 29, cpb7: 1207, spend_month: 70000 });
    row("2026-12-20T20:10:00.000Z", { date: "2026-12-21", mode: "dry-run", action: "hold", from: 5000, to: 5000, applied: false, reason: "1 day since the last change", status: "ACTIVE", spend7: 35000, buyers7: 20, cpb7: 1750, spend_month: 100000 });
    const { text } = await buildKpiReport(h.env.DB, MON, { adsMode: "dry-run" });
    expect(text).toContain("ADS (Meta, ADS=dry-run)");
    expect(text).toContain("  Last run 21 Dec: $350 spent in 7 days, 20 ?r=meta buyers, cost per buyer $18 · $1,000 this month · ACTIVE at $50 a day");
    expect(text).toContain("  16 Dec: raise $50 → $60 (dry run, not applied) · $12 per buyer");
    expect(text).toContain("  21 Dec: hold · 1 day since the last change");
  });

  it("no section while ads are off and the controller never ran; a note when it should have", async () => {
    expect((await buildKpiReport(h.env.DB, MON, { adsMode: "off" })).text).not.toContain("ADS (Meta");
    expect((await buildKpiReport(h.env.DB, MON, { adsMode: "on" })).text).toContain("No controller run in the last 7 days.");
  });

  it("Gate B reads the controller's cost per buyer", async () => {
    row("2027-02-14T20:10:00.000Z", { date: "2027-02-15", mode: "on", action: "hold", from: 20000, to: 20000, applied: false, reason: "x", status: "ACTIVE", spend7: 140000, buyers7: 80, cpb7: 1750, spend_month: 280000 });
    const { text } = await buildKpiReport(h.env.DB, new Date("2027-02-14T21:00:00Z"), { adsMode: "on" });
    expect(text).toContain("Gate B (28 Feb 2027, 13 days): ads cost per buyer under $20 · $18 over 7 days at $200 a day (target: $200 a day)");
  });
});
