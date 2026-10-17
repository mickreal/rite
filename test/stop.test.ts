import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
vi.mock("../src/png", () => ({ svgToPng: async () => new Uint8Array() }));
import { Harness } from "./helpers/worker";

const TOK = "tok_test_purchase_000000000000001", PV = "pv_test_0001";
let h: Harness;
beforeEach(() => { h = new Harness(); vi.stubGlobal("fetch", h.fetch); h.seedPreview(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const seedEmailsOwed = () => {
  h.seedPurchase();
  h.db.prepare("INSERT INTO stage_reminders (purchase_id, stage_key, label, on_date, send_on) VALUES (?,?,?,?,?)").bind(TOK, "close", "Saturn leaves Aries", "2099-04-12", "2099-04-05").runSync();
  h.db.prepare("INSERT INTO stage_reminders (purchase_id, stage_key, label, on_date, send_on, sent_at) VALUES (?,?,?,?,?,?)").bind(TOK, "contact", "Contact", "2026-04-23", "2026-04-16", "2026-04-16T00:00:00Z").runSync();
  h.db.prepare("INSERT INTO followups (purchase_id, kind, send_on) VALUES (?,?,?)").bind(TOK, "day10", "2099-01-01").runSync();
  h.db.prepare("INSERT INTO reminders (preview_id, email, created_at, hit_date, send_on) VALUES (?,?,?,?,?)").bind(PV, "free@example.com", new Date().toISOString(), "2099-05-13", "2099-05-06").runSync();
};

describe("stop links", () => {
  it("a GET only shows the button: mail scanners open links, so nothing is stopped", async () => {
    seedEmailsOwed();
    const r = await h.request(`/stop/${TOK}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toContain(`action="/stop/${TOK}"`);
    expect(h.db.row("SELECT COUNT(*) n FROM stage_reminders WHERE sent_at IS NULL")!.n).toBe(1);
  });

  it("POST on a reading stops its stage reminders and follow-ups, and leaves sent rows alone", async () => {
    seedEmailsOwed();
    const r = await h.request(`/stop/${TOK}`, { method: "POST" });
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/stop/${TOK}?done=1`);
    expect(h.db.rows("SELECT stage_key, sent_at FROM stage_reminders ORDER BY stage_key")).toEqual([
      { stage_key: "close", sent_at: "skipped:stop" }, { stage_key: "contact", sent_at: "2026-04-16T00:00:00Z" }]);
    expect(h.db.row("SELECT sent_at FROM followups")!.sent_at).toBe("skipped:stop");
    expect(h.db.row("SELECT sent_at FROM reminders")!.sent_at).toBeNull(); // the free preview's reminders are separate
    expect(h.events("stopped")).toEqual([{ kind: "stopped", ref: TOK, detail: { kind: "reading" } }]);
  });

  it("POST on a preview stops its pass reminders; RFC 8058 one-click gets a plain 200", async () => {
    seedEmailsOwed();
    const r = await h.request(`/stop/${PV}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    expect(r.status).toBe(200);
    expect(h.db.row("SELECT sent_at FROM reminders")!.sent_at).toBe("skipped:stop");
    expect(h.db.row("SELECT COUNT(*) n FROM stage_reminders WHERE sent_at IS NULL")!.n).toBe(1);
  });

  it("an unknown token is a 404 and changes nothing", async () => {
    expect((await h.request("/stop/nope_not_a_token", { method: "POST" })).status).toBe(404);
    expect((await h.request("/stop/../admin")).status).toBe(404);
  });

  it("a stopped follow-up is never sent, and sent ones carry the link and List-Unsubscribe headers", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T00:30:00Z")); // 11:30 Melbourne
    h.seedPurchase();
    h.db.prepare("INSERT INTO followups (purchase_id, kind, send_on) VALUES (?,?,?)").bind(TOK, "day3", "2026-10-20").runSync();
    await h.scheduled();
    const sent = h.calls.filter((c) => c.url === "https://api.resend.com/emails").map((c) => c.json() as { text: string; headers?: Record<string, string> });
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toContain(`/stop/${TOK}`);
    expect(sent[0].headers).toEqual({ "List-Unsubscribe": `<https://rite.test/stop/${TOK}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });

    h.clearCalls();
    h.db.prepare("INSERT INTO followups (purchase_id, kind, send_on) VALUES (?,?,?)").bind(TOK, "day10", "2026-10-20").runSync();
    await h.request(`/stop/${TOK}`, { method: "POST" });
    await h.scheduled();
    expect(h.emails()).toHaveLength(0);
  });
});
