import { describe, it, expect, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() })); // the resvg wasm module does not load under node
import worker from "../src/index";
import { adminAuthorized, adminDays, safeEqual, type AdminStats, type AdminExtras } from "../src/admin";
import { adminPage } from "../src/views/admin";

const SECRET = "whsec_test_admin_secret_123";

/** Just enough D1 for the admin queries: every statement returns empty rows (or one zeroed row for .first()). */
function stubDb(seen: string[] = []) {
  const stmt = (sql: string) => ({
    bind: () => stmt(sql),
    all: async () => { seen.push(sql); return { results: [] }; },
    first: async () => { seen.push(sql); return sql.includes("pending") ? { pending: 0, due: 0 } : null; },
    run: async () => ({}),
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}
const env = (db = stubDb()) => ({ DB: db, STRIPE_WEBHOOK_SECRET: "whsec_not_the_admin_key_000", ADMIN_KEY: SECRET, CURRENCY: "usd", SITE_URL: "https://rite.test" });
const get = (path: string, headers: Record<string, string> = {}, db?: D1Database) =>
  worker.fetch(new Request(`https://rite.test${path}`, { headers }), env(db) as never, {} as ExecutionContext);

describe("admin auth", () => {
  it("compares in constant time and accepts header or key", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(adminAuthorized(SECRET, `Bearer ${SECRET}`)).toBe(true);
    expect(adminAuthorized(SECRET, undefined, SECRET)).toBe(true);
    expect(adminAuthorized(SECRET, "Bearer nope", "nope")).toBe(false);
    expect(adminAuthorized("short", "Bearer short", "short")).toBe(false); // secrets of 10 chars or fewer never pass
    expect(adminAuthorized(undefined, "Bearer ", "")).toBe(false);
  });
  it("?days= is 7, 30 or 90", () => {
    expect([adminDays("7"), adminDays("90"), adminDays("30"), adminDays("12"), adminDays(undefined), adminDays("x")]).toEqual([7, 90, 30, 30, 30, 30]);
  });
});

describe("GET /admin", () => {
  it("404s without the key, with a wrong key, and with a wrong bearer", async () => {
    for (const r of [await get("/admin"), await get("/admin?key=wrong"), await get("/admin", { authorization: "Bearer wrong" })]) {
      expect(r.status).toBe(404);
      expect(await r.text()).not.toContain("Admin");
    }
  });
  it("200s with ?key= or the bearer header, with no-store / noindex / no-referrer", async () => {
    const seen: string[] = [];
    const r = await get(`/admin?key=${SECRET}&days=7`, {}, stubDb(seen));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    const h = await r.text();
    expect(h).toContain("<h1>Admin</h1>");
    expect(h).toContain(`href="/admin?days=30&amp;key=${SECRET}"`);
    expect(h).toMatch(/class="on"[^>]*>7 days/);
    expect(seen.some((s) => s.includes("FROM stories"))).toBe(true);
    expect((await get("/admin", { authorization: `Bearer ${SECRET}` })).status).toBe(200);
  });
  it("is never tagged with the PostHog snippet", async () => {
    // withAnalytics would reach HTMLRewriter (absent under node) if /admin weren't excluded
    const r = await worker.fetch(new Request(`https://rite.test/admin?key=${SECRET}`), { ...env(), POSTHOG_KEY: "phc_test" } as never, {} as ExecutionContext);
    expect(r.status).toBe(200);
    expect(await r.text()).not.toContain("posthog");
  });
  it("/admin/stats is unchanged: 401 without bearer, JSON shape with it", async () => {
    expect((await get("/admin/stats")).status).toBe(401);
    expect((await get(`/admin/stats?key=${SECRET}`)).status).toBe(401); // ?key= is for the HTML page only
    const j = await (await get("/admin/stats?days=7", { authorization: `Bearer ${SECRET}` })).json() as Record<string, unknown>;
    expect(Object.keys(j)).toEqual(["days", "funnel", "revenue", "gifts", "subscriptions", "by_ref", "by_sign", "daily", "events"]);
    expect(j.days).toBe(7);
  });
});

describe("adminPage rendering", () => {
  const stats: AdminStats = {
    days: 30,
    funnel: { previews: 10, checkouts: 4, paid: 2, generated: 2, preview_to_checkout: 40, checkout_to_paid: 50 },
    revenue: { cents: 5800, n: 2, free_or_gift: 0 }, gifts: { sold: 1, redeemed: 0 },
    subscriptions: [{ status: "active", n: 1 }],
    by_ref: [{ ref: "<b>tiktok</b>", previews: 6, purchases: 1, cents: 2900 }],
    by_sign: [{ sign: "Pisces", rn: 1, previews: 5, purchases: 1 }],
    daily: [{ day: "2026-10-17", previews: 3, checkouts: 1, paid: 1 }],
    events: [{ kind: "preview", n: 10 }],
  };
  const extras: AdminExtras = {
    errors: [{ at: "2026-10-17T03:04:05.000Z", ref: "abc", detail: '{"where":"x","e":"<img src=x onerror=alert(1)>"}' }],
    stories: [
      { created_at: "2026-10-17T01:00:00.000Z", purchase_id: "tok123456789", first_name: "<script>alert('n')</script>", sign: "Pisces", text: "It's <b>hard</b> & </p><script>alert(1)</script>", can_quote: 1 },
      { created_at: "2026-10-16T01:00:00.000Z", purchase_id: "tok987654321", first_name: null, sign: null, text: "quiet", can_quote: 0 },
    ],
    followups: { pending: 3, due: 1 }, reminders: { pending: 5, due: 0 }, stage_reminders: { pending: 2, due: 2 },
  };
  it("escapes stories, names, refs and error details", async () => {
    const h = String(await adminPage({ stats, extras, currency: "usd" }));
    expect(h).not.toContain("<script>alert");
    expect(h).not.toContain("<img src=x");
    expect(h).not.toContain("<b>hard</b>");
    expect(h).not.toContain("<b>tiktok</b>");
    expect(h).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(h).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(h).toContain("&lt;b&gt;tiktok&lt;/b&gt;");
    expect(h).toContain("It&#39;s &lt;b&gt;hard&lt;/b&gt; &amp;");
  });
  it("shows the numbers, can_quote and queue counts", async () => {
    const h = String(await adminPage({ stats, extras, currency: "usd" }));
    expect(h).toContain("$58.00");
    expect(h).toContain("checkouts · 40% of previews");
    expect(h).toContain("can quote");
    expect(h).toContain("private");
    expect(h).toContain("tok123…");
    expect(h).not.toContain("tok123456789"); // the reading token is never printed whole
    expect(h).toMatch(/Stage reminders<\/td><td class="n">2<\/td><td class="n">2</);
    expect(h).toContain('href="/admin?days=90"'); // no key when signed in by header
  });
});

describe("ADMIN_KEY separation", () => {
  const WH = "whsec_not_the_admin_key_000";
  const run = (path: string, e: Record<string, unknown>, headers: Record<string, string> = {}) =>
    worker.fetch(new Request(`https://rite.test${path}`, { headers }), { ...env(), ...e } as never, {} as ExecutionContext);
  it("GET /admin never accepts the webhook secret", async () => {
    expect((await run(`/admin?key=${WH}`, {})).status).toBe(404);
    expect((await run("/admin", {}, { authorization: `Bearer ${WH}` })).status).toBe(404);
    expect((await run(`/admin?key=${WH}`, { ADMIN_KEY: undefined })).status).toBe(404); // no ADMIN_KEY set: page is off
  });
  it("/admin/stats uses ADMIN_KEY when set, and falls back to the webhook secret only when it isn't", async () => {
    expect((await run("/admin/stats", {}, { authorization: `Bearer ${WH}` })).status).toBe(401);
    expect((await run("/admin/stats", {}, { authorization: `Bearer ${SECRET}` })).status).toBe(200);
    expect((await run("/admin/stats", { ADMIN_KEY: undefined }, { authorization: `Bearer ${WH}` })).status).toBe(200);
  });
});
