// Test harness for the Worker: a real-SQL D1 fake (node:sqlite running schema.sql), a KV fake, an AI stub, a fetch
// recorder that keeps every outbound call in-process, and Stripe webhook signing. Nothing here touches the network.
// @ts-expect-error: no @types/node in this Workers project; vitest runs in Node (node:sqlite ships with Node >= 22.13)
import { DatabaseSync } from "node:sqlite";
// @ts-expect-error: as above
import { readFileSync, readdirSync } from "node:fs";
import worker, { type Env } from "../../src/index";
import { compute } from "../../src/compute";

// ---------- D1 ----------
type Row = Record<string, unknown>;
type SqliteDb = { exec(sql: string): void; prepare(sql: string): { all(...p: unknown[]): Row[]; get(...p: unknown[]): Row | undefined; run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint } } };

const plain = (r: Row | undefined): Row | null => (r ? { ...r } : null);

class FakeStatement {
  constructor(private db: SqliteDb, readonly sql: string, private params: unknown[] = []) {}
  bind(...params: unknown[]) {
    // D1 rejects undefined; mirror that so a missing value fails here as it would in production
    params.forEach((p, i) => { if (p === undefined) throw new Error(`D1_TYPE_ERROR: undefined bound at ?${i + 1} in: ${this.sql}`); });
    return new FakeStatement(this.db, this.sql, params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p)));
  }
  async first<T = Row>(col?: string): Promise<T | null> {
    const r = plain(this.db.prepare(this.sql).get(...this.params));
    if (!r) return null;
    return (col ? r[col] : r) as T;
  }
  async all<T = Row>() {
    return { results: this.db.prepare(this.sql).all(...this.params).map((r) => ({ ...r })) as T[], success: true, meta: {} };
  }
  async run() { return this.runSync(); }
  runSync() {
    const r = this.db.prepare(this.sql).run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() { return this.db.prepare(this.sql).all(...this.params).map((r) => Object.values(r)); }
}

export class FakeD1 {
  readonly db: SqliteDb;
  constructor(schema = true) {
    this.db = new DatabaseSync(":memory:") as SqliteDb;
    if (schema) this.db.exec(readFileSync("schema.sql", "utf8"));
  }
  prepare(sql: string) { return new FakeStatement(this.db, sql); }
  async batch(stmts: FakeStatement[]) {
    this.db.exec("BEGIN");
    try { const out = stmts.map((s) => s.runSync()); this.db.exec("COMMIT"); return out; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  async exec(sql: string) { this.db.exec(sql); return { count: 0, duration: 0 }; }
  /** Synchronous helpers for assertions. */
  rows(sql: string, ...p: unknown[]): Row[] { return this.db.prepare(sql).all(...p).map((r) => ({ ...r })); }
  row(sql: string, ...p: unknown[]): Row | null { return plain(this.db.prepare(sql).get(...p)); }
}

/** Every file in migrations/, in name order. */
export const migrationFiles = (): string[] => (readdirSync("migrations") as string[]).filter((f) => f.endsWith(".sql")).sort().map((f) => `migrations/${f}`);

// ---------- KV ----------
export class FakeKV {
  readonly store = new Map<string, string>();
  async get(key: string, type?: string | { type?: string }) {
    const v = this.store.get(key);
    if (v === undefined) return null;
    const t = typeof type === "string" ? type : type?.type;
    if (t === "json") return JSON.parse(v);
    if (t === "arrayBuffer") return new TextEncoder().encode(v).buffer;
    return v;
  }
  async put(key: string, value: string | ArrayBuffer) { this.store.set(key, typeof value === "string" ? value : new TextDecoder().decode(value)); }
  async delete(key: string) { this.store.delete(key); }
  async list() { return { keys: [...this.store.keys()].map((name) => ({ name })), list_complete: true, cursor: "" }; }
}

// ---------- outbound fetch ----------
export interface Call { url: string; method: string; headers: Record<string, string>; body: string; json: () => any }
type Responder = (call: Call) => Response | Promise<Response>;

export const SITE_URL = "https://rite.test";
export const WHSEC = "whsec_test_0123456789abcdefghijklmnop";

/** A valid reading reply: every key generateReport requires, and no dates, so the grounding check passes. */
export const REPORT_REPLY = {
  cover_line: "A test cover line.", saturn_p1: "p1", saturn_p2: "p2", house_h3: "h3", house_p: "hp",
  chips_warm: ["warm"], chips_cool: ["cool"], phase_approach: "a", phase_contact: "c", phase_integration: "i",
  passes: [{ name: "The pass", body: "b", before: "before", day: "day", after: "after" }], turn: null,
  areas: [{ h3: "Work", p: "p" }], history_q: ["q"], workbook_approach: ["w"], workbook_contact: ["w"], workbook_integration: ["w"], carry: "carry",
};
export const SEASON_REPLY = "A test Season paragraph with no dates in it.";

const anthropic = (text: string) => new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", content: [{ type: "text", text }] }), { status: 200, headers: { "content-type": "application/json" } });

export class Harness {
  readonly db = new FakeD1();
  readonly kv = new FakeKV();
  readonly calls: Call[] = [];
  readonly aiCalls: unknown[] = [];
  readonly env: Env;
  private pending: Promise<unknown>[] = [];
  /** Per-host overrides; Stripe defaults to a 500 so an unexpected Stripe call shows up as a failure. */
  stripe: Responder = (c) => new Response(JSON.stringify({ error: { type: "api_error", message: `unexpected Stripe call ${c.method} ${c.url}` } }), { status: 500, headers: { "content-type": "application/json" } });
  resend: Responder = () => new Response(JSON.stringify({ id: "email_test" }), { status: 200, headers: { "content-type": "application/json" } });
  anthropic: Responder = (c) => anthropic(c.json().max_tokens === 6000 ? JSON.stringify(REPORT_REPLY) : SEASON_REPLY);

  constructor(over: Partial<Env> = {}) {
    this.env = {
      DB: this.db as unknown as D1Database, CACHE: this.kv as unknown as KVNamespace, SITE_URL,
      PRICE_FULL_CENTS: "2900", PRICE_NOTIME_CENTS: "1900", PRICE_SEASON_MONTHLY_CENTS: "700", PRICE_SEASON_YEARLY_CENTS: "5900", CURRENCY: "usd",
      MODEL_REPORT: "test-report-model", MODEL_PREVIEW: "test-preview-model", FROM_EMAIL: "Rite <hello@rite.test>", SUPPORT_EMAIL: "hello@rite.test",
      STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: WHSEC, ANTHROPIC_API_KEY: "sk-ant-test", RESEND_API_KEY: "re_test",
      AI: { run: async (...a: unknown[]) => { this.aiCalls.push(a); return new Uint8Array([0]); } } as unknown as Ai,
      ADMIN_EMAIL: "admin@rite.test", POSTHOG_KEY: "phc_test", POSTHOG_HOST: "https://posthog.test",
      ...over,
    };
  }

  /** Install as globalThis.fetch. Self-calls to SITE_URL are dispatched into the Worker as a fresh invocation. */
  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = new Request(input as RequestInfo, init);
    const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.clone().text();
    const headers: Record<string, string> = {}; req.headers.forEach((v, k) => { headers[k] = v; });
    const call: Call = { url: req.url, method: req.method, headers, body, json: () => JSON.parse(body) };
    this.calls.push(call);
    const host = new URL(req.url).host;
    if (req.url.startsWith(SITE_URL)) return worker.fetch(req, this.env, this.ctx());
    if (host === "api.stripe.com") return this.stripe(call);
    if (host === "api.resend.com") return this.resend(call);
    if (host === "api.anthropic.com") return this.anthropic(call);
    if (host === "posthog.test") return new Response("{}", { status: 200 });
    throw new Error(`unexpected outbound fetch: ${req.method} ${req.url}`);
  };

  ctx(): ExecutionContext {
    return { waitUntil: (p: Promise<unknown>) => { this.pending.push(p); }, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  }

  /** Wait for every waitUntil, including ones queued by the work they started. */
  async settle() {
    while (this.pending.length) { const p = this.pending.splice(0); await Promise.all(p); }
  }

  async request(path: string, init?: RequestInit) {
    const res = await worker.fetch(new Request(SITE_URL + path, init), this.env, this.ctx());
    await this.settle();
    return res;
  }

  /** POST a Stripe event to /webhook/stripe with a real signature (or a wrong one), then settle background work. */
  async webhook(event: unknown, opts: { secret?: string; header?: string; t?: number } = {}) {
    const payload = JSON.stringify(event);
    const header = opts.header ?? await signStripe(payload, opts.secret ?? WHSEC, opts.t);
    return this.request("/webhook/stripe", { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  }

  async scheduled() {
    worker.scheduled({ cron: "0 * * * *", scheduledTime: Date.now(), type: "scheduled" } as unknown as ScheduledEvent, this.env, this.ctx());
    await this.settle();
  }

  // ---------- views on the recorded calls ----------
  emails() { return this.calls.filter((c) => c.url === "https://api.resend.com/emails").map((c) => c.json() as { from: string; to: string[]; subject: string; text: string }); }
  llm() { return this.calls.filter((c) => c.url === "https://api.anthropic.com/v1/messages").map((c) => c.json() as { model: string; max_tokens: number }); }
  stripeCalls() { return this.calls.filter((c) => new URL(c.url).host === "api.stripe.com"); }
  posthog() { return this.calls.filter((c) => new URL(c.url).host === "posthog.test").map((c) => (c.json() as { event: string }).event); }
  selfCalls() { return this.calls.filter((c) => c.url.startsWith(SITE_URL)); }
  events(kind?: string) {
    return (kind ? this.db.rows("SELECT kind, ref, detail FROM events WHERE kind = ? ORDER BY id", kind) : this.db.rows("SELECT kind, ref, detail FROM events ORDER BY id"))
      .map((r) => ({ kind: r.kind as string, ref: r.ref as string | null, detail: r.detail ? JSON.parse(r.detail as string) : null }));
  }
  clearCalls() { this.calls.length = 0; }

  // ---------- seed data ----------
  /** A preview row as POST /preview would write it. Default: 1 Jun 1997 12:00 Melbourne (Saturn in Aries, window open in 2026). */
  seedPreview(o: { id?: string; date?: string; time?: string | null; ref?: string | null } = {}) {
    const id = o.id ?? "pv_test_0001";
    const place = { label: "Melbourne, Australia", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" };
    const date = o.date ?? "1997-06-01", time = o.time === undefined ? "12:00" : o.time;
    const c = compute({ date, time, place });
    this.db.prepare(`INSERT INTO previews (id, created_at, birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, new Date().toISOString(), date, time, place.label, place.lat, place.lon, place.tz, c.birthUtc, c.natalLon, c.sign, c.degree, c.house, c.returnNumber,
      c.window.windowStart, c.window.windowEnd, c.window.peakStart, c.window.peakEnd, JSON.stringify(c.window.hits), c.phase, "preview text", o.ref ?? null).runSync();
    return { id, comp: c };
  }

  /** A purchase whose reading is already written (status generated), so Season tests don't depend on report generation. */
  seedPurchase(o: { id?: string; previewId?: string; email?: string; firstName?: string | null; pi?: string | null; status?: string } = {}) {
    const id = o.id ?? "tok_test_purchase_000000000000001";
    this.db.prepare(`INSERT INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, report_md, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, o.previewId ?? "pv_test_0001", new Date().toISOString(), o.email ?? "reader@example.com", o.firstName === undefined ? "Sam" : o.firstName, `cs_seed_${id}`, o.pi ?? null, 2900, "full", JSON.stringify(REPORT_REPLY), o.status ?? "generated").runSync();
    return id;
  }

  seedSubscription(o: { id: string; purchaseId: string; status?: string; plan?: string | null; lastSentAt?: string | null }) {
    this.db.prepare("INSERT INTO subscriptions (id, purchase_id, created_at, status, plan, last_sent_at) VALUES (?,?,?,?,?,?)")
      .bind(o.id, o.purchaseId, new Date().toISOString(), o.status ?? "active", o.plan ?? "month", o.lastSentAt ?? null).runSync();
  }
}

// ---------- Stripe signing ----------
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** The `stripe-signature` header Stripe sends: t=<unix>,v1=HMAC-SHA256(secret, `${t}.${payload}`). */
export async function signStripe(payload: string, secret = WHSEC, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${hex(sig)}`;
}

// ---------- fixtures ----------
type Json = Record<string, any>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
function merge(a: Json, b: Json): Json {
  const out: Json = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v;
  return out;
}

/** Load test/fixtures/stripe/<name>.json (a trimmed real Stripe event) and deep-merge overrides into data.object. */
export function stripeEvent(name: string, object: Json = {}, top: Json = {}): Json {
  const base = JSON.parse(readFileSync(`test/fixtures/stripe/${name}.json`, "utf8")) as Json;
  const ev = merge(base, top);
  ev.data = { ...ev.data, object: merge(ev.data.object, object) };
  ev.created = Math.floor(Date.now() / 1000);
  return ev;
}
