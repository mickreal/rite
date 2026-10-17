// Build 3b: the inbox UI (threads, the thread page, Mick's replies, takeover, hand back, the session cookie, note dedupe).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import worker from "../src/index";
import { Harness } from "./helpers/worker";
import { addressOf } from "../src/mime";
import { makeSession, sessionValid, safeNext, SESSION_DAYS } from "../src/admin";
import { claimNotify, ensureThread } from "../src/support-store";
import { threadUrlKey, threadKeyFromUrl } from "../src/inbox-ui";

const CUSTOMER = "reader@example.com";
const KEY = "admin_key_for_tests_123";
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const anthropic = (text: string) => json({ id: "msg_test", type: "message", role: "assistant", content: [{ type: "text", text }] });
const cfAuth = (domain: string) =>
  `ARC-Authentication-Results: i=1; mx.cloudflare.net; dkim=pass header.d=${domain} header.s=s1 header.b=AbC; dmarc=pass header.from=${domain} policy.dmarc=none; spf=pass smtp.mailfrom=x@${domain}`;

let seq = 0;
function eml(o: { from?: string; subject?: string; body?: string; inReplyTo?: string; references?: string; headers?: string[] } = {}) {
  const from = o.from ?? `Sam Reader <${CUSTOMER}>`;
  const domain = addressOf(from)!.split("@")[1]!;
  const mid = `<ui${++seq}.${Date.now()}@${domain}>`;
  const head = [cfAuth(domain), `From: ${from}`, "To: hello@rite.test", `Subject: ${o.subject ?? "Help"}`, `Message-ID: ${mid}`,
    ...(o.inReplyTo ? [`In-Reply-To: ${o.inReplyTo}`] : []), ...(o.references ? [`References: ${o.references}`] : []), ...(o.headers ?? []), "MIME-Version: 1.0"];
  return { raw: [...head, "Content-Type: text/plain; charset=utf-8", "", o.body ?? "Hi, please help.", ""].join("\r\n"), mid };
}

let h: Harness;
let label: { class: string; confidence: number; season?: boolean };
let forwarded: string[];
let refunds: Record<string, string>[];

beforeEach(() => {
  h = new Harness({ ADMIN_KEY: KEY, INBOX_AUTO: "on" } as never);
  vi.stubGlobal("fetch", h.fetch);
  const base = h.anthropic;
  label = { class: "other", confidence: 0.95 };
  h.anthropic = (c) => (String(c.json().system).includes("support inbox") ? anthropic(JSON.stringify(label)) : base(c));
  refunds = [];
  h.stripe = (c) => {
    if (new URL(c.url).pathname === "/v1/refunds") { refunds.push(Object.fromEntries(new URLSearchParams(c.body))); return json({ id: `re_${refunds.length}` }); }
    return json({ error: { message: `unexpected ${c.method} ${c.url}` } }, 500);
  };
  forwarded = [];
  h.seedPreview();
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

async function deliver(m: { raw: string }, envelope = CUSTOMER) {
  const msg = { from: envelope, to: "hello@rite.test", headers: new Headers(), raw: new Response(m.raw).body, rawSize: m.raw.length,
    forward: async (to: string) => { forwarded.push(to); return { messageId: "fwd" }; }, setReject() {}, reply: async () => ({ messageId: "r" }) };
  await worker.email!(msg as unknown as ForwardableEmailMessage, h.env, h.ctx());
  await h.settle();
}
const toCustomer = () => h.emails().filter((e) => e.to[0] === CUSTOMER);
const toMick = () => h.emails().filter((e) => e.to[0] === "admin@rite.test");
const resendTo = (to: string) => h.calls.filter((c) => c.url === "https://api.resend.com/emails" && c.json().to[0] === to);
const lastSupport = () => h.events("support_auto").at(-1)!.detail as Record<string, unknown>;
const thread = (key: string) => h.db.row("SELECT * FROM support_threads WHERE thread_key=?", key) as { status: string; owner: string } | null;
const tpath = (key: string) => `/admin/inbox/t/${threadUrlKey(key)}`;
const purchase = (days = 2) => {
  const id = h.seedPurchase({ pi: "pi_reading_1" });
  h.db.prepare("UPDATE purchases SET created_at=? WHERE id=?").bind(new Date(Date.now() - days * 86400000).toISOString(), id).runSync();
  return id;
};

/** A browser session: log in through /admin/login and keep the cookie. */
async function login() {
  const r = await h.request("/admin/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ key: KEY, next: "/admin/inbox" }) });
  expect(r.status).toBe(303);
  return r.headers.get("set-cookie")!.split(";")[0]!;
}
async function page(path: string, cookie: string) {
  const r = await h.request(path, { headers: { cookie } });
  return { status: r.status, text: await r.text(), r };
}
const field = (htmlText: string, name: string) => new RegExp(`name="${name}" value="([^"]*)"`).exec(htmlText)?.[1] ?? "";
async function post(path: string, cookie: string, form: Record<string, string>, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return h.request(path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie, ...headers }, body: new URLSearchParams(form) });
}
/** Opens the thread page and sends a reply through its form. */
async function reply(key: string, cookie: string, body: string) {
  const p = await page(tpath(key), cookie);
  return post(`${tpath(key)}/reply`, cookie, { csrf: field(p.text, "csrf"), nonce: field(p.text, "nonce"), body });
}

describe("threads", () => {
  it("groups messages by thread, newest activity first, with status, class and snippet; tabs filter", async () => {
    h.env.INBOX_AUTO = "off";
    label = { class: "other", confidence: 0.9 };
    const a = eml({ subject: "First thread", body: "Where do I find the dates?" });
    await deliver(a);
    const b = eml({ from: "Ali <ali@example.org>", subject: "Second thread", body: "Gift code question" });
    await deliver(b, "ali@example.org");
    await deliver(eml({ subject: "Re: First thread", body: "Also, one more thing\n\nOn Sun, Rite wrote:\n> old", inReplyTo: a.mid, references: a.mid }));
    expect(new Set(h.db.rows("SELECT thread_key FROM support_messages").map((r) => r.thread_key))).toEqual(new Set([a.mid, b.mid]));

    const cookie = await login();
    const list = await page("/admin/inbox", cookie);
    expect(list.status).toBe(200);
    // both need Mick (INBOX_AUTO off); the first thread has the newest message, so it's on top, showing its latest words
    const first = list.text.indexOf("First thread"), second = list.text.indexOf("Second thread");
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(second);
    expect(list.text).toContain("Also, one more thing");
    expect(list.text).not.toContain("&gt; old");
    expect(list.text).toContain("Needs me (2)");
    expect(list.text).toContain('<span class="st needs_mick">Needs me</span>');
    expect(list.text).toContain('<span class="st">other</span>');
    expect(list.text).toContain("2 in");

    const t = await page(tpath(a.mid), cookie);
    expect(t.text.indexOf("Where do I find the dates?")).toBeLessThan(t.text.indexOf("Also, one more thing"));
    expect(t.text).not.toContain("Gift code question");

    // close the first: it leaves Needs me and shows under Closed
    const csrf = field(t.text, "csrf");
    expect((await post(`${tpath(a.mid)}/state`, cookie, { csrf, do: "close" })).status).toBe(303);
    expect(thread(a.mid)!.status).toBe("closed");
    expect((await page("/admin/inbox", cookie)).text).not.toContain("First thread");
    expect((await page("/admin/inbox?tab=closed", cookie)).text).toContain("First thread");
    expect((await page("/admin/inbox?tab=all", cookie)).text).toContain("All (2)");
    await post(`${tpath(a.mid)}/state`, cookie, { csrf, do: "reopen" });
    expect(thread(a.mid)!.status).toBe("needs_mick");
  });

  it("an assistant reply is stored as an outbound row and shown in the thread; the thread is handled by the assistant", async () => {
    h.seedPurchase();
    label = { class: "how_it_works", confidence: 0.95 };
    const m = eml({ subject: "Is it real?" });
    await deliver(m);
    expect(toCustomer()).toHaveLength(1);
    const rows = h.db.rows("SELECT * FROM support_replies");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ author: "assistant", to_addr: CUSTOMER, subject: "Re: Is it real?", status: "sent", in_reply_to: m.mid, references_hdr: m.mid, resend_id: "email_test" });
    expect(String(rows[0]!.body_text)).toContain("Swiss Ephemeris");
    expect(thread(m.mid)!.status).toBe("assistant");
    const cookie = await login();
    const t = await page(tpath(m.mid), cookie);
    expect(t.text).toContain("<b>Assistant</b>");
    expect(t.text).toContain("Swiss Ephemeris");
    expect(t.text).toContain("Handled by assistant");
    // nothing to prefill: it's answered
    expect(/<textarea[^>]*>([\s\S]*?)<\/textarea>/.exec(t.text)![1]).toBe("");
  });
});

describe("Mick's reply", () => {
  it("prefills the draft, sends from hello@ threaded to the latest customer message, stores it and takes the thread over", async () => {
    h.env.INBOX_AUTO = "off";
    label = { class: "other", confidence: 0.9 };
    const a = eml({ subject: "Question", body: "First" });
    await deliver(a);
    const b = eml({ subject: "Re: Question", body: "Second", inReplyTo: a.mid, references: a.mid });
    await deliver(b);
    const cookie = await login();
    const t = await page(tpath(a.mid), cookie);
    expect(t.text).toContain("Thanks for writing. {answer}"); // the holding draft, prefilled
    expect(t.text).toContain("Prefilled with the assistant's draft");

    // a {…} part left in: refused, nothing sent, the text kept
    const left = await post(`${tpath(a.mid)}/reply`, cookie, { csrf: field(t.text, "csrf"), nonce: field(t.text, "nonce"), body: "Hi Sam,\n\nThanks for writing. {answer}" });
    expect(left.status).toBe(400);
    expect(await left.text()).toContain("still has a {…} part");
    expect(resendTo(CUSTOMER)).toHaveLength(0);

    h.clearCalls();
    const r = await reply(a.mid, cookie, "Hi Sam,\n\nHere's the answer.\n\nMick, Rite");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`${tpath(a.mid)}?f=sent`);
    const calls = resendTo(CUSTOMER);
    expect(calls).toHaveLength(1);
    const sent = calls[0]!.json();
    expect(sent.from).toBe("Rite <hello@rite.test>");
    expect(sent.subject).toBe("Re: Question");
    expect(sent.text).toBe("Hi Sam,\n\nHere's the answer.\n\nMick, Rite");
    expect(sent.headers).toEqual({ "In-Reply-To": b.mid, References: `${a.mid} ${b.mid}` });
    expect(h.db.rows("SELECT author, status, to_addr, in_reply_to FROM support_replies")).toEqual([{ author: "mick", status: "sent", to_addr: CUSTOMER, in_reply_to: b.mid }]);
    expect(thread(a.mid)).toMatchObject({ status: "mick_replied", owner: "mick" });
    const after = await page(`${tpath(a.mid)}?f=sent`, cookie);
    expect(after.text).toContain("<b>You</b>");
    expect(after.text).toContain("Here&#39;s the answer.");
    expect(after.text).toContain("Mick replied");
    expect(h.events("support_reply")).toHaveLength(1);

    // the customer's answer to Mick's reply lands in the same thread, through References
    await deliver(eml({ subject: "Re: Question", body: "Thanks!", inReplyTo: "<resend-generated@rite.test>", references: `${a.mid} ${b.mid} <resend-generated@rite.test>` }));
    expect(new Set(h.db.rows("SELECT thread_key FROM support_messages").map((x) => x.thread_key))).toEqual(new Set([a.mid]));
  });

  it("the nonce stops a resubmitted form from sending twice", async () => {
    h.env.INBOX_AUTO = "off";
    const a = eml();
    await deliver(a);
    const cookie = await login();
    const t = await page(tpath(a.mid), cookie);
    const form = { csrf: field(t.text, "csrf"), nonce: field(t.text, "nonce"), body: "Sorted. Mick, Rite" };
    expect((await post(`${tpath(a.mid)}/reply`, cookie, form)).headers.get("location")).toContain("f=sent");
    const again = await post(`${tpath(a.mid)}/reply`, cookie, form);
    expect(again.status).toBe(303);
    expect(again.headers.get("location")).toContain("f=dup");
    expect(resendTo(CUSTOMER)).toHaveLength(1);
    expect(h.db.rows("SELECT 1 FROM support_replies WHERE author='mick'")).toHaveLength(1);
    // a fresh page has a fresh nonce
    const t2 = await page(tpath(a.mid), cookie);
    expect(field(t2.text, "nonce")).not.toBe(form.nonce);
  });

  it("a failed send is kept as not sent, shows the error with the text, and doesn't take the thread over", async () => {
    h.env.INBOX_AUTO = "off";
    const a = eml();
    await deliver(a);
    const cookie = await login();
    h.resend = () => json({ message: "domain not verified" }, 403);
    const r = await reply(a.mid, cookie, "Will this go?");
    expect(r.status).toBe(400);
    const text = await r.text();
    expect(text).toContain("Resend didn&#39;t accept it");
    expect(text).toContain(">Will this go?</textarea>");
    expect(h.db.rows("SELECT status FROM support_replies")).toEqual([{ status: "failed" }]);
    expect(thread(a.mid)).toMatchObject({ status: "needs_mick", owner: "assistant" });
  });
});

describe("takeover", () => {
  it("after Mick replies, the assistant never acts on the thread again, even with INBOX_AUTO on; new messages need Mick", async () => {
    purchase(2);
    label = { class: "other", confidence: 0.95 };
    const a = eml({ subject: "Hmm" });
    await deliver(a);
    const cookie = await login();
    await reply(a.mid, cookie, "Tell me more. Mick, Rite");
    expect(thread(a.mid)!.owner).toBe("mick");

    h.clearCalls(); forwarded = [];
    label = { class: "refund", confidence: 0.99 }; // inside policy: would refund automatically on a fresh thread
    await deliver(eml({ subject: "Re: Hmm", body: "Actually, refund me please", inReplyTo: a.mid, references: a.mid }));
    expect(refunds).toEqual([]);
    expect(toCustomer()).toHaveLength(0);
    expect(lastSupport()).toMatchObject({ class: "refund", action: "forward", outcome: "taken_over" });
    expect(thread(a.mid)!.status).toBe("needs_mick");
    expect(toMick()).toHaveLength(1);
    expect(toMick()[0]!.text).toContain("you've taken this thread over");
    expect(forwarded).toEqual(["admin@rite.test"]);
  });

  it("\"I've got this\" takes it over without replying; \"Hand back to assistant\" lets it act again", async () => {
    h.seedPurchase();
    label = { class: "other", confidence: 0.95 };
    const a = eml({ subject: "Odd one" });
    await deliver(a);
    const cookie = await login();
    const t = await page(tpath(a.mid), cookie);
    expect(t.text).toContain("I&#39;ve got this");
    await post(`${tpath(a.mid)}/state`, cookie, { csrf: field(t.text, "csrf"), do: "take" });
    expect(thread(a.mid)!.owner).toBe("mick");
    expect((await page(tpath(a.mid), cookie)).text).toContain("Hand back to assistant");

    label = { class: "how_it_works", confidence: 0.95 };
    await deliver(eml({ subject: "Re: Odd one", body: "How is it calculated?", inReplyTo: a.mid, references: a.mid }));
    expect(toCustomer()).toHaveLength(0);
    expect(lastSupport()).toMatchObject({ outcome: "taken_over" });

    // another thread, taken and handed straight back: its next message is the assistant's again
    // (a third message from them in one thread always goes to Mick, so this uses a fresh thread)
    label = { class: "other", confidence: 0.95 };
    const b = eml({ subject: "Other one" });
    await deliver(b);
    await post(`${tpath(b.mid)}/state`, cookie, { csrf: field(t.text, "csrf"), do: "take" });
    await post(`${tpath(b.mid)}/state`, cookie, { csrf: field(t.text, "csrf"), do: "handback" });
    expect(thread(b.mid)!.owner).toBe("assistant");
    label = { class: "how_it_works", confidence: 0.95 };
    await deliver(eml({ subject: "Re: Other one", body: "How is it calculated?", inReplyTo: b.mid, references: b.mid }));
    expect(toCustomer()).toHaveLength(1);
    expect(toCustomer()[0]!.text).toContain("Swiss Ephemeris");
    expect(lastSupport()).toMatchObject({ action: "macro7", outcome: "sent" });
    expect(thread(b.mid)!.status).toBe("assistant");
  });
});

describe("notes to Mick", () => {
  it("are short, link to the thread page, and go once per new customer message", async () => {
    h.env.INBOX_AUTO = "off";
    const a = eml({ subject: "Help", body: "x".repeat(2000) });
    await deliver(a);
    expect(toMick()).toHaveLength(1);
    const note = toMick()[0]!.text;
    expect(note).toContain(`Open the thread and reply: https://rite.test${tpath(a.mid)}`);
    expect(note.length).toBeLessThan(1200);
    expect(note).not.toContain("CUSTOMER\n");
    // an auto-reply in the thread: no note; the same message twice: one note; a new message: one more
    await deliver(eml({ subject: "Re: Help", inReplyTo: a.mid, headers: ["Auto-Submitted: auto-replied"] }));
    const b = eml({ subject: "Re: Help", body: "again", inReplyTo: a.mid, references: a.mid });
    await deliver(b);
    await deliver(b);
    expect(toMick()).toHaveLength(2);
    expect(forwarded).toHaveLength(2);
  });

  it("claimNotify allows one note per (thread, message)", async () => {
    const db = h.env.DB;
    await ensureThread(db, "<t@x>");
    expect(await claimNotify(db, "<t@x>", "sm_1")).toBe(true);
    expect(await claimNotify(db, "<t@x>", "sm_1")).toBe(false);
    expect(await claimNotify(db, "<t@x>", "sm_2")).toBe(true);
    expect(await claimNotify(db, "<other@x>", "sm_2")).toBe(true);
  });
});

describe("auth", () => {
  it("no cookie goes to the login page; the login sets a signed HttpOnly Secure SameSite=Strict cookie that works for 30 days", async () => {
    await deliver(eml());
    const key = String(h.db.row("SELECT thread_key FROM support_messages")!.thread_key);
    for (const p of ["/admin/inbox", tpath(key)]) {
      const r = await h.request(p);
      expect(r.status).toBe(303);
      expect(r.headers.get("location")).toBe(`/admin/login?next=${encodeURIComponent(p)}`);
    }
    expect((await h.request("/admin/login")).status).toBe(200);
    const bad = await h.request("/admin/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ key: "wrong", next: "/admin/inbox" }) });
    expect(bad.status).toBe(401);
    expect(bad.headers.get("set-cookie")).toBeNull();

    const r = await h.request("/admin/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ key: KEY, next: tpath(key) }) });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(tpath(key));
    const sc = r.headers.get("set-cookie")!;
    expect(sc).toMatch(/^rite_admin=v1\.\d+\.[A-Za-z0-9_-]+; Path=\/admin; Max-Age=2592000; HttpOnly; Secure; SameSite=Strict$/);
    const cookie = sc.split(";")[0]!;
    expect((await page(tpath(key), cookie)).status).toBe(200);
    expect((await page("/admin", cookie)).status).toBe(200);
    // the key in the URL still works; a tampered cookie doesn't; nor does one signed with another key
    expect((await h.request(`/admin/inbox?key=${KEY}`)).status).toBe(200);
    expect((await page("/admin/inbox", cookie.slice(0, -2) + "xx")).status).toBe(303);
    expect((await page("/admin/inbox", `rite_admin=${await makeSession("some_other_key_entirely")}`)).status).toBe(303);
    // expiry
    const v = cookie.split("=")[1]!;
    expect(await sessionValid(KEY, v)).toBe(true);
    expect(await sessionValid(KEY, v, Date.now() + (SESSION_DAYS * 86400 + 60) * 1000)).toBe(false);
    // without ADMIN_KEY there's nothing: 404
    h.env.ADMIN_KEY = undefined;
    expect((await h.request("/admin/inbox")).status).toBe(404);
    expect((await h.request("/admin/login")).status).toBe(404);
  });

  it("POSTs need the session's CSRF token and a same-origin request", async () => {
    h.env.INBOX_AUTO = "off";
    const a = eml();
    await deliver(a);
    const cookie = await login();
    const t = await page(tpath(a.mid), cookie);
    const form = { csrf: field(t.text, "csrf"), nonce: field(t.text, "nonce"), body: "Hi" };
    expect((await post(`${tpath(a.mid)}/reply`, cookie, { ...form, csrf: "nope" })).status).toBe(403);
    expect((await post(`${tpath(a.mid)}/reply`, cookie, form, { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post(`${tpath(a.mid)}/reply`, cookie, form, { origin: "https://evil.test" })).status).toBe(403);
    expect((await post(`${tpath(a.mid)}/state`, cookie, { csrf: "nope", do: "close" })).status).toBe(403);
    // another session's token doesn't work in this one
    const other = `rite_admin=${await makeSession(KEY, Date.now() - 1000)}`;
    expect((await post(`${tpath(a.mid)}/reply`, other, form)).status).toBe(403);
    expect(resendTo(CUSTOMER)).toHaveLength(0);
    expect((await post(`${tpath(a.mid)}/reply`, cookie, form, { origin: "https://rite.test" })).status).toBe(303);
    expect(resendTo(CUSTOMER)).toHaveLength(1);
    // no session at all: to the login page, nothing done
    expect((await post(`${tpath(a.mid)}/state`, "", { csrf: form.csrf, do: "close" })).status).toBe(303);
    expect(thread(a.mid)!.status).toBe("mick_replied");
  });

  it("login only redirects inside /admin, and thread ids round-trip", () => {
    expect(safeNext("/admin/inbox/t/abc")).toBe("/admin/inbox/t/abc");
    expect(safeNext("/admin")).toBe("/admin");
    for (const bad of ["https://evil.test", "//evil.test", "/admin\\@evil", "/adminx", "/admin/login", "", "/elsewhere"]) expect(safeNext(bad)).toBe("/admin/inbox");
    for (const k of ["<a/b+c@x.y>", "sm_abc", "<ünï@x>"]) expect(threadKeyFromUrl(threadUrlKey(k))).toBe(k);
    expect(threadKeyFromUrl("not base64!")).toBeNull();
  });
});

describe("before migration 007", () => {
  it("the email handler works as in build 3, and the pages are read-only", async () => {
    h.db.db.exec("DROP TABLE support_threads; DROP TABLE support_replies;");
    h.seedPurchase();
    label = { class: "how_it_works", confidence: 0.95 };
    await deliver(eml());
    expect(toCustomer()).toHaveLength(1);
    h.env.INBOX_AUTO = "off";
    await deliver(eml({ subject: "Another" }));
    expect(toMick()).toHaveLength(1);
    const list = await h.request(`/admin/inbox?key=${KEY}&tab=all`);
    const text = await list.text();
    expect(text).toContain("npm run db:migrate:b3b");
    expect(text).toContain("Handled by assistant");
    const k = /href="(\/admin\/inbox\/t\/[^"?]+)/.exec(text)![1]!;
    const t = await h.request(`${k}?key=${KEY}`);
    expect(t.status).toBe(200);
    expect(await t.text()).toContain("Read-only");
  });
});
