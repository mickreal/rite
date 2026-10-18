// b12-admin: the admin shell (nav on every page), consistent auth (login redirects, ?key= refused on pages, bearer on
// APIs), next-param validation, TOTP (RFC 6238 vectors, accept / reject / replay), sessions (14 days, version, sign out
// everywhere), rate limiting and the admin_login events.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness } from "./helpers/worker";
import { base32Decode, base32Encode, hotp, totpCode, verifyTotp, totpSecretOk, otpauthUri } from "../src/totp";
import { makeSession, readSession, safeNext, SESSION_DAYS, LOGIN_FAILS_PER_IP, LOGIN_FAILS_GLOBAL } from "../src/admin";
import { threadUrlKey } from "../src/inbox-ui";
// @ts-expect-error: a plain .mjs script (npm run admin:totp), no types
import * as script from "../scripts/admin-totp.mjs";

const KEY = "admin_key_for_auth_tests_42";
// RFC 6238 appendix B's SHA-1 seed, "12345678901234567890", in base32: public test data, not a secret
const RFC = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const FORM = { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" };

let h: Harness;
const at = (iso: string | number) => vi.setSystemTime(new Date(iso));
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); at("2026-10-18T10:00:05Z"); h = new Harness({ ADMIN_KEY: KEY } as never); });
afterEach(() => { vi.useRealTimers(); });

const loginPost = (form: Record<string, string>, ip = "203.0.113.7") => h.request("/admin/login", { method: "POST", headers: { ...FORM, "cf-connecting-ip": ip }, body: new URLSearchParams(form) });
const cookieOf = (r: Response) => r.headers.get("set-cookie")!.split(";")[0]!;
const get = (path: string, cookie = "", headers: Record<string, string> = {}) => h.request(path, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
const field = (html: string, name: string) => new RegExp(`name="${name}" value="([^"]*)"`).exec(html)?.[1] ?? "";
async function signIn(next = "/admin") {
  const r = await loginPost({ key: KEY, next });
  expect(r.status).toBe(303);
  return cookieOf(r);
}
/** Key then code, with TOTP on. */
async function signInWithCode(next = "/admin", ip?: string) {
  const step1 = await loginPost({ key: KEY, next }, ip);
  const page = await step1.text();
  const r = await loginPost({ pending: field(page, "pending"), next, code: await totpCode(RFC, Date.now()) }, ip);
  return r;
}

describe("TOTP (RFC 6238, SHA-1, 30 s)", () => {
  it("matches the RFC's test vectors", async () => {
    const key = base32Decode(RFC)!;
    expect(new TextDecoder().decode(key)).toBe("12345678901234567890");
    const vectors: Array<[number, string]> = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [t, want] of vectors) {
      expect(await hotp(key, Math.floor(t / 30), 8)).toBe(want);
      expect(await totpCode(RFC, t * 1000)).toBe(want.slice(-6)); // the 6-digit code is the low 6 digits
    }
  });
  it("base32 round-trips; secrets under 80 bits or not base32 are refused", () => {
    const b = Uint8Array.from({ length: 20 }, (_, i) => i * 13);
    expect(base32Decode(base32Encode(b))).toEqual(b);
    expect(base32Decode("gezd gnbv-gy3t")).toEqual(base32Decode("GEZDGNBVGY3T"));
    expect(totpSecretOk(RFC)).toBe(true);
    for (const bad of ["", "GEZDGNBV", "not base32!", "1111111111111111", undefined]) expect(totpSecretOk(bad)).toBe(false);
    expect(otpauthUri(RFC)).toBe(`otpauth://totp/Rite:rite-admin?secret=${RFC}&issuer=Rite&algorithm=SHA1&digits=6&period=30`);
  });
  it("accepts the previous, current and next step only, and returns which one matched", async () => {
    const t = 1111111111 * 1000, step = Math.floor(1111111111 / 30);
    expect(await verifyTotp(RFC, "050471", t)).toBe(step);
    expect(await verifyTotp(RFC, "050471", t + 30000)).toBe(step); // one step late
    expect(await verifyTotp(RFC, "050471", t - 30000)).toBe(step); // one step early
    expect(await verifyTotp(RFC, "050471", t + 60000)).toBeNull(); // two steps: too far
    expect(await verifyTotp(RFC, "050 471", t)).toBe(step); // spaces ignored
    for (const bad of ["050472", "05047", "0504711", "abcdef", ""]) expect(await verifyTotp(RFC, bad, t)).toBeNull();
  });
  it("npm run admin:totp makes the same codes, a 160-bit secret and the same URI", async () => {
    for (const t of [59, 1111111111, 2000000000]) expect(await script.totp(RFC, t * 1000)).toBe(await totpCode(RFC, t * 1000));
    expect(script.otpauth(RFC)).toBe(otpauthUri(RFC));
    expect(script.base32Decode(script.base32Encode(new Uint8Array(20).fill(7)))).toEqual(new Uint8Array(20).fill(7));
  });
});

describe("pages without a session, and ?key=", () => {
  const PAGES = ["/admin", "/admin?days=7", "/admin/inbox", "/admin/inbox?tab=all", "/admin/creators", "/admin/kpi", "/admin/kpi.txt", "/admin/voice", "/admin/season/tok_x/notes"];
  it("every admin page redirects to /admin/login?next=<itself>, noindex, no 404", async () => {
    for (const p of PAGES) {
      const r = await get(p);
      expect(r.status, p).toBe(303);
      expect(r.headers.get("location")).toBe(`/admin/login?next=${encodeURIComponent(p)}`);
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
  });
  it("?key= is refused on every page, even the right key, and the login page explains why", async () => {
    for (const p of PAGES) {
      const u = new URL(p, "https://x"); u.searchParams.set("key", KEY);
      const r = await get(u.pathname + u.search);
      expect(r.status, p).toBe(303);
      expect(r.headers.get("location")).toBe(`/admin/login?next=${encodeURIComponent(p)}&why=key`);
      expect(r.headers.get("location")).not.toContain(KEY);
    }
    const login = await (await get("/admin/login?next=%2Fadmin&why=key")).text();
    expect(login).toContain("Keys in links end up in browser history");
    // and on the login page itself it's dropped from the address bar
    const l = await get(`/admin/login?key=${KEY}`);
    expect(l.status).toBe(303);
    expect(l.headers.get("location")).toBe("/admin/login?next=%2Fadmin&why=key");
  });
  it("bearer APIs are unchanged: /admin/stats and the POSTs take the bearer and never ?key=", async () => {
    const bearer = { authorization: `Bearer ${KEY}` };
    expect((await get("/admin/stats")).status).toBe(401);
    expect((await get(`/admin/stats?key=${KEY}`)).status).toBe(401);
    expect((await get("/admin/stats?days=7", "", bearer)).status).toBe(200);
    expect((await h.request(`/admin/kpi/send?key=${KEY}`, { method: "POST" })).status).toBe(401);
    expect((await h.request(`/admin/refund?key=${KEY}`, { method: "POST", body: "{}" })).status).toBe(401);
    expect((await h.request(`/admin/tts?key=${KEY}`, { method: "POST", body: JSON.stringify({ text: "Hi." }) })).status).toBe(404);
    // a bearer still opens the pages (scripts), with no cookie involved
    expect((await get("/admin", "", bearer)).status).toBe(200);
    expect((await get("/admin/kpi.txt", "", bearer)).status).toBe(200);
  });
  it("without ADMIN_KEY everything admin is a 404", async () => {
    h.env.ADMIN_KEY = undefined;
    for (const p of ["/admin", "/admin/kpi", "/admin/login", "/admin/voice"]) expect((await get(p)).status).toBe(404);
  });
});

describe("the login page and next", () => {
  it("is a Rite-styled card with a password field, show/hide, autofocus and a username for password managers", async () => {
    const html = await (await get("/admin/login")).text();
    expect(html).toContain('class="ah-tag">Admin');
    expect(html).toMatch(/<input id="key" name="key" type="password" autocomplete="current-password" required autofocus/);
    expect(html).toMatch(/name="username" value="rite-admin" autocomplete="username"/);
    expect(html).toContain('class="pw-toggle" aria-controls="key" aria-pressed="false"');
    expect(html).toContain("<label for=\"key\">Admin key</label>");
    expect(html).not.toContain('aria-label="Admin sections"'); // no section nav before signing in
  });
  it("a wrong key gets a clear error, no cookie, and the key isn't echoed back", async () => {
    const r = await loginPost({ key: "wrong-key-typed-here", next: "/admin/inbox" });
    expect(r.status).toBe(401);
    expect(r.headers.get("set-cookie")).toBeNull();
    const html = await r.text();
    expect(html).toContain("That key didn&#39;t match");
    expect(html).not.toContain("wrong-key-typed-here");
    expect(field(html, "next")).toBe("/admin/inbox");
  });
  it("lands on /admin by default, or on a valid next; never off-site", async () => {
    expect((await loginPost({ key: KEY })).headers.get("location")).toBe("/admin");
    expect((await loginPost({ key: KEY, next: "/admin/creators" })).headers.get("location")).toBe("/admin/creators");
    expect((await loginPost({ key: KEY, next: "/admin/inbox?tab=all" })).headers.get("location")).toBe("/admin/inbox?tab=all");
    for (const bad of ["https://evil.test/admin", "//evil.test", "/\\evil.test", "/admin/../x", "/admin/%2F%2Fevil.test", "/admin/logout", "javascript:alert(1)"]) {
      expect((await loginPost({ key: KEY, next: bad })).headers.get("location"), bad).toBe("/admin");
    }
    // GET with a bad next renders a form whose next is safe
    expect(field(await (await get("/admin/login?next=https%3A%2F%2Fevil.test")).text(), "next")).toBe("/admin");
    expect(safeNext("/admin?days=7&key=abc")).toBe("/admin?days=7");
  });
  it("refuses a cross-site login POST", async () => {
    const r = await h.request("/admin/login", { method: "POST", headers: { ...FORM, "sec-fetch-site": "cross-site" }, body: new URLSearchParams({ key: KEY }) });
    expect(r.status).toBe(403);
  });
});

describe("two-factor on (ADMIN_TOTP_SECRET)", () => {
  beforeEach(() => { h.env.ADMIN_TOTP_SECRET = RFC; });
  it("the key alone doesn't sign in: it asks for the code; the right code does, with mfa in the cookie", async () => {
    const step1 = await loginPost({ key: KEY, next: "/admin/inbox" });
    expect(step1.status).toBe(200);
    expect(step1.headers.get("set-cookie")).toBeNull();
    const page = await step1.text();
    expect(page).toContain('autocomplete="one-time-code"');
    expect(page).toContain('inputmode="numeric"');
    expect(page).not.toContain(KEY);
    const pending = field(page, "pending");
    expect(pending).toMatch(/^p1\./);
    const r = await loginPost({ pending, next: "/admin/inbox", code: await totpCode(RFC, Date.now()) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe("/admin/inbox");
    expect(cookieOf(r)).toMatch(/^rite_admin=v2\.\d+\.0\.1\./);
    expect((await get("/admin/inbox", cookieOf(r))).status).toBe(200);
  });
  it("rejects a wrong code, a replayed code, an older code after a newer one, and a stale pending step", async () => {
    const page = await (await loginPost({ key: KEY })).text();
    const pending = field(page, "pending");
    const bad = await loginPost({ pending, code: "000000" === (await totpCode(RFC, Date.now())) ? "111111" : "000000" });
    expect(bad.status).toBe(401);
    expect(await bad.text()).toContain("That code didn&#39;t match");
    const code = await totpCode(RFC, Date.now());
    expect((await loginPost({ pending, code })).status).toBe(303);
    const replay = await loginPost({ pending, code });
    expect(replay.status).toBe(401);
    expect(await replay.text()).toContain("already been used");
    // 30 s later the new code works, and then the previous step's code (still inside the ±1 window) doesn't
    at(Date.now() + 30000);
    expect((await loginPost({ pending, code: await totpCode(RFC, Date.now()) })).status).toBe(303);
    expect((await loginPost({ pending, code })).status).toBe(401);
    // the key step expires after 5 minutes
    at(Date.now() + 6 * 60000);
    const stale = await loginPost({ pending, code: await totpCode(RFC, Date.now()) });
    expect(stale.status).toBe(401);
    expect(await stale.text()).toContain("longer than 5 minutes");
    // a forged pending token never works
    expect((await loginPost({ pending: "p1.9999999999.abcdefghij.forgedforgedforgedforged", code: await totpCode(RFC, Date.now() + 30000) })).status).toBe(401);
  });
  it("a cookie made without the code (before two-factor was turned on) stops working", async () => {
    h.env.ADMIN_TOTP_SECRET = undefined;
    const old = await signIn();
    expect((await get("/admin", old)).status).toBe(200);
    h.env.ADMIN_TOTP_SECRET = RFC;
    expect((await get("/admin", old)).status).toBe(303);
  });
  it("an invalid secret refuses sign-in rather than skipping the code", async () => {
    h.env.ADMIN_TOTP_SECRET = "not base32!";
    const r = await loginPost({ key: KEY });
    expect(r.status).toBe(503);
    expect(r.headers.get("set-cookie")).toBeNull();
  });
  it("replay protection falls back to KV before migration 011", async () => {
    h.db.db.exec("DROP TABLE admin_state");
    const page = await (await loginPost({ key: KEY })).text();
    const code = await totpCode(RFC, Date.now());
    expect((await loginPost({ pending: field(page, "pending"), code })).status).toBe(303);
    expect((await loginPost({ pending: field(page, "pending"), code })).status).toBe(401);
  });
  it("the dashboard shows two-factor on and no warning banner", async () => {
    const r = await signInWithCode();
    const html = await (await get("/admin", cookieOf(r))).text();
    expect(html).not.toContain("Two-factor is off.");
    expect(html).toMatch(/Two-factor is <b class="ok">on<\/b>/);
    expect(html).toContain("with code");
  });
});

describe("two-factor off", () => {
  it("the key signs in as before, and the dashboard warns", async () => {
    const html = await (await get("/admin", await signIn())).text();
    expect(html).toContain("<b>Two-factor is off.</b>");
    expect(html).toContain("npm run admin:totp");
  });
});

describe("sessions", () => {
  it("last 14 days (HttpOnly, Secure, SameSite=Strict, Path=/admin), then send you to the login page", async () => {
    const r = await loginPost({ key: KEY });
    expect(r.headers.get("set-cookie")).toMatch(/; Path=\/admin; Max-Age=1209600; HttpOnly; Secure; SameSite=Strict$/);
    const cookie = cookieOf(r);
    at(Date.now() + (SESSION_DAYS * 86400 - 60) * 1000);
    expect((await get("/admin", cookie)).status).toBe(200);
    at(Date.now() + 120 * 1000);
    expect((await get("/admin", cookie)).status).toBe(303);
  });
  it("a tampered or other-key cookie, or one with a changed version, doesn't work", async () => {
    const cookie = await signIn();
    const v = cookie.split("=")[1]!;
    expect(await readSession(KEY, v)).not.toBeNull();
    expect(await readSession(KEY, v.replace(".0.0.", ".1.0."))).toBeNull(); // version or mfa edited: signature fails
    expect(await readSession(KEY, v.replace(".0.0.", ".0.1."))).toBeNull();
    expect(await readSession(KEY, v, Date.now(), { version: "other" })).toBeNull();
    expect(await readSession(KEY, await makeSession(KEY, Date.now(), { mfa: false }), Date.now(), { mfaRequired: true })).toBeNull();
    expect((await get("/admin", `rite_admin=${await makeSession("another_admin_key_123")}`)).status).toBe(303);
  });
  it("Sign out clears this browser's cookie; Sign out everywhere invalidates every cookie", async () => {
    const a = await signIn(), b = await signIn();
    const dash = await (await get("/admin", a)).text();
    const csrf = field(dash, "csrf");
    expect(dash).toContain("Sign out everywhere");
    // plain sign out: cookie cleared, back to login
    const out = await h.request("/admin/logout", { method: "POST", headers: { ...FORM, cookie: b }, body: new URLSearchParams({ csrf: field(await (await get("/admin", b)).text(), "csrf") }) });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe("/admin/login?bye=out");
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    // a CSRF token from another session is refused
    expect((await h.request("/admin/logout", { method: "POST", headers: { ...FORM, cookie: a }, body: new URLSearchParams({ csrf: "nope", everywhere: "1" }) })).status).toBe(403);
    expect((await get("/admin", a)).status).toBe(200);
    const all = await h.request("/admin/logout", { method: "POST", headers: { ...FORM, cookie: a }, body: new URLSearchParams({ csrf, everywhere: "1" }) });
    expect(all.headers.get("location")).toBe("/admin/login?bye=all");
    for (const c of [a, b]) expect((await get("/admin", c)).status).toBe(303);
    expect(h.events("admin_signout_all")).toHaveLength(1);
    expect(await (await get("/admin/login?bye=all")).text()).toContain("Signed out on every device");
    // a new sign-in works with the new version; the bearer was never affected
    expect((await get("/admin", await signIn())).status).toBe(200);
    expect((await get("/admin/stats", "", { authorization: `Bearer ${KEY}` })).status).toBe(200);
  });
  it("sign out everywhere works from KV before migration 011", async () => {
    h.db.db.exec("DROP TABLE admin_state");
    const a = await signIn();
    const csrf = field(await (await get("/admin", a)).text(), "csrf");
    await h.request("/admin/logout", { method: "POST", headers: { ...FORM, cookie: a }, body: new URLSearchParams({ csrf, everywhere: "1" }) });
    expect((await get("/admin", a)).status).toBe(303);
    expect((await get("/admin", await signIn())).status).toBe(200);
  });
});

describe("rate limiting", () => {
  it("10 wrong keys an hour per IP, then 429 with the retry time, even for the right key; other IPs carry on", async () => {
    for (let i = 0; i < LOGIN_FAILS_PER_IP; i++) expect((await loginPost({ key: `wrong${i}` })).status).toBe(401);
    const r = await loginPost({ key: KEY });
    expect(r.status).toBe(429);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(3500);
    const html = await r.text();
    expect(html).toContain("Too many wrong attempts from your network. Try again in 60 minutes (at 11:00 UTC).");
    expect((await loginPost({ key: KEY }, "198.51.100.9")).status).toBe(303);
    at(Date.now() + 3601 * 1000);
    expect((await loginPost({ key: KEY })).status).toBe(303);
  });
  it("wrong codes count too", async () => {
    h.env.ADMIN_TOTP_SECRET = RFC;
    const pending = field(await (await loginPost({ key: KEY })).text(), "pending");
    const right = await totpCode(RFC, Date.now());
    const wrong = right === "123456" ? "654321" : "123456";
    for (let i = 0; i < LOGIN_FAILS_PER_IP; i++) expect((await loginPost({ pending, code: wrong })).status).toBe(401);
    expect((await loginPost({ pending, code: right })).status).toBe(429);
  });
  it("50 failures an hour across all IPs pause sign-in for everyone", async () => {
    for (let i = 0; i < LOGIN_FAILS_GLOBAL; i++) await loginPost({ key: "wrong" }, `192.0.2.${i}`);
    const r = await loginPost({ key: KEY }, "198.51.100.200");
    expect(r.status).toBe(429);
    expect(await r.text()).toContain("sign-in is paused for everyone");
  });
  it("logs admin_login and admin_login_failed without the key or code, and the dashboard shows the last 5", async () => {
    await loginPost({ key: "a-wrong-key-123" });
    for (let i = 0; i < 6; i++) await signIn();
    const failed = h.events("admin_login_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]!.detail).toMatchObject({ ip: "203.0.113.7", reason: "key" });
    const ok = h.events("admin_login");
    expect(ok).toHaveLength(6);
    expect(ok[0]!.detail).toMatchObject({ ip: "203.0.113.7", mfa: false });
    expect(JSON.stringify(h.db.rows("SELECT detail FROM events"))).not.toContain(KEY);
    expect(JSON.stringify(h.db.rows("SELECT detail FROM events"))).not.toContain("a-wrong-key-123");
    const html = await (await get("/admin", await signIn())).text();
    expect(html.match(/<li><span>2026-10-18 10:00 UTC<\/span>/g)).toHaveLength(5);
    expect(html).toMatch(/Failed attempts in the last 24 h: <b class="warn">1<\/b>/);
  });
});

describe("the admin shell", () => {
  async function seedThread() {
    h.db.prepare("INSERT INTO support_messages (id, received_at, from_addr, subject, body_text, thread_key, status) VALUES ('sm_1', ?, 'reader@example.com', 'Help', 'Hi', '<t1@example.com>', 'forwarded')").bind(new Date().toISOString()).runSync();
    h.db.prepare("INSERT INTO support_threads (thread_key, status, owner, updated_at) VALUES ('<t1@example.com>', 'needs_mick', 'assistant', ?)").bind(new Date().toISOString()).runSync();
    return `/admin/inbox/t/${threadUrlKey("<t1@example.com>")}`;
  }
  it("every admin page has the nav, the current section highlighted, the Needs me count and Sign out", async () => {
    const thread = await seedThread();
    const cookie = await signIn();
    const pages: Array<[string, string]> = [["/admin", "Dashboard"], ["/admin/inbox", "Inbox"], [thread, "Inbox"], ["/admin/creators", "Creators"], ["/admin/kpi", "KPI"], ["/admin/voice", "Voice"]];
    for (const [p, on] of pages) {
      const r = await get(p, cookie);
      expect(r.status, p).toBe(200);
      const html = await r.text();
      expect(html, p).toContain('<nav class="ah-nav" aria-label="Admin sections">');
      for (const href of ["/admin", "/admin/inbox", "/admin/creators", "/admin/kpi", "/admin/voice"]) expect(html, `${p} → ${href}`).toContain(`<a href="${href}"`);
      expect(html, p).toMatch(new RegExp(`class="on" aria-current="page">${on}`));
      const nav = /<nav class="ah-nav"[\s\S]*?<\/nav>/.exec(html)![0];
      expect(nav.match(/aria-current="page"/g)?.length, p).toBe(1);
      expect(html, p).toContain('<span class="badge" aria-label="1 need you">1</span>');
      expect(html, p).toMatch(/<form method="post" action="\/admin\/logout"><input type="hidden" name="csrf" value="[^"]{20,}"><button class="out" type="submit">Sign out<\/button><\/form>/);
      expect(html, p).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html, p).not.toContain("key=");
      expect(r.headers.get("x-robots-tag"), p).toContain("noindex");
    }
  });
  it("the voice page plays with its session: cookie + CSRF header, same origin; nothing without them", async () => {
    const cookie = await signIn();
    const html = await (await get("/admin/voice", cookie)).text();
    const csrf = /CSRF="([^"]+)"/.exec(html)![1]!;
    const tts = (headers: Record<string, string>) => h.request("/admin/tts", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ text: "Hi.", model: "@cf/deepgram/aura-2-en", voice: "orion" }) });
    expect((await tts({ cookie, "sec-fetch-site": "same-origin" })).status).toBe(404);
    expect((await tts({ cookie, "sec-fetch-site": "cross-site", "x-rite-csrf": csrf })).status).toBe(404);
    expect((await tts({ cookie, "sec-fetch-site": "same-origin", "x-rite-csrf": csrf })).status).not.toBe(404);
  });
});
