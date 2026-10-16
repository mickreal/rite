import { Hono } from "hono";
import Stripe from "stripe";
import { geocode } from "./geo";
import { compute, cycle, reportInputs, fmtMonth, fmtDay, hitSentence, phaseSentence, houseLabel, type Computed } from "./compute";
import { askSystem } from "./content/prompts";
import { stageAt } from "./astro/cycle";
import SIGN_PERIODS from "./content/sign-periods.json";
import { signPage, type SignPageData } from "./views/sign";
import { SIGNS, type Sign } from "./astro/saturn";
import { writePreview, writeReport, writeSeason, datesAreGrounded, parseJsonReply, answerQuestion } from "./llm";
import { sendEmail, deliveryEmail, seasonEmail, seasonCompleteEmail } from "./email";
import { readingPage, type ReportJson } from "./views/reading";
import { shareCardSvg, ogSvg } from "./card";
import { saturnLongitude, signOf, degreeInSign, orb, isRetrograde, nextStation, type Phase } from "./astro/saturn";
import { smallChart, fmtMonYr, fmtMonYrL, untilText } from "./astro/cycle";
import { landingPage } from "./views/landing";
import { flowPage } from "./views/flow";
import { resultPage } from "./views/result";
import { SIGN_NOTES } from "./content/notes";
import { localHour } from "./geo";

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  SITE_URL: string;
  PRICE_FULL_CENTS: string; PRICE_NOTIME_CENTS: string; PRICE_SEASON_MONTHLY_CENTS: string; PRICE_SEASON_YEARLY_CENTS: string;
  CURRENCY: string;
  MODEL_REPORT: string; MODEL_PREVIEW: string;
  FROM_EMAIL: string; SUPPORT_EMAIL: string;
  STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string; ANTHROPIC_API_KEY: string; RESEND_API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// ---------- helpers ----------
const id = (n = 12) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, n); };
const token = () => id(32);
const now = () => new Date().toISOString();
const stripe = (env: Env) => new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
async function log(env: Env, kind: string, ref?: string | null, detail?: unknown) {
  try { await env.DB.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(now(), kind, ref ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null).run(); } catch (e) { console.error("log", e); }
}

interface PreviewRow {
  id: string; birth_date: string; birth_time: string | null; place_label: string; lat: number; lon: number; tz: string;
  natal_lon: number; natal_sign: string; natal_degree: number; natal_house: number | null; return_number: number;
  window_start: string; window_end: string; peak_start: string; peak_end: string; hits: string; phase: string; preview_text: string | null; ref: string | null;
}
interface PurchaseRow { id: string; preview_id: string; email: string; first_name: string | null; tier: string; report_md: string | null; status: string; amount_cents: number; stripe_session_id: string | null }

/** Recompute from the stored birth data (cheap, and keeps "today"-dependent fields fresh). */
function recompute(p: PreviewRow, today = new Date()): Computed {
  return compute({ date: p.birth_date, time: p.birth_time, place: { label: p.place_label, lat: p.lat, lon: p.lon, tz: p.tz } }, today);
}

async function getPreview(env: Env, pid: string) {
  return env.DB.prepare("SELECT * FROM previews WHERE id = ?").bind(pid).first<PreviewRow>();
}
async function getPurchase(env: Env, tok: string) {
  return env.DB.prepare("SELECT * FROM purchases WHERE id = ?").bind(tok).first<PurchaseRow>();
}

// ---------- pages ----------
app.get("/", async (c) => {
  await log(c.env, "visit", c.req.query("r") ?? null);
  return c.html(landingPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? undefined }));
});

/** Live numbers for the landing widget: date (+ optional time), no place → noon UTC, sign-level only. */
app.get("/start", (c) => c.html(flowPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? undefined, form: { date: c.req.query("d") ?? undefined } })));
app.get("/api/calc", async (c) => {
  const date = c.req.query("date") ?? "", time = c.req.query("time") || null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "date" }, 400);
  const key = `calc:${date}:${time ?? ""}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await c.env.CACHE.get(key);
  if (cached) return c.body(cached, 200, { "content-type": "application/json", "cache-control": "public, max-age=3600" });
  let comp: Computed;
  try { comp = compute({ date, time: time && /^\d{2}:\d{2}$/.test(time) ? time : null, place: { label: "", lat: 0, lon: 0, tz: "UTC" } }); }
  catch { return c.json({ error: "range" }, 422); }
  const w = comp.window, now = Date.now(), open = Date.parse(w.windowStart), close = Date.parse(w.windowEnd);
  const frac = Math.max(0, Math.min(1, (now - open) / (close - open)));
  const inside = now >= open && now <= close;
  const wa = (((saturnLongitude(new Date()) - comp.natalLon) % 360) + 360) % 360;
  const out = {
    sign: comp.sign, degree: Math.floor(comp.degree), returnNumber: comp.returnNumber,
    angle: +wa.toFixed(2), pct: Math.round(wa / 360 * 100), inside, frac: +frac.toFixed(3),
    windowOpen: fmtMonYr(open), windowOpenLong: fmtMonYrL(open), windowClose: fmtMonYr(close),
    opensIn: inside ? "You are here" : now < open ? "Opens " + untilText(new Date(), open) : "Closed",
    ticks: w.hits.map((h) => +((Date.parse(h) - open) / (close - open) * 100).toFixed(1)),
    hits: w.hits.map((h) => fmtMonYrL(Date.parse(h))),
    chart: smallChart(comp.natalLon, w),
  };
  const body = JSON.stringify(out);
  c.executionCtx.waitUntil(c.env.CACHE.put(key, body, { expirationTtl: 86400 }));
  return c.body(body, 200, { "content-type": "application/json", "cache-control": "public, max-age=3600" });
});

app.get("/og.svg", (c) => c.body(ogSvg(), 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" }));
// ---------- public sign pages (SEO) ----------
function signData(sign: Sign): SignPageData {
  const periods = (SIGN_PERIODS as Record<string, Array<{ from: string; to: string }>>)[sign]; // precomputed: scripts/gen-sign-periods.ts
  // group dips with their main stretch (gap under 18 months)
  const groups: Array<Array<{ from: string; to: string }>> = [];
  for (const p of periods) { const g = groups[groups.length - 1]; if (g && Date.parse(p.from) - Date.parse(g[g.length - 1].to) < 548 * 86400000) g.push(p); else groups.push([p]); }
  const now = new Date().toISOString().slice(0, 10);
  let cur = groups.find((g) => now >= g[0].from && now <= g[g.length - 1].to) ?? groups.find((g) => g[0].from > now) ?? groups[groups.length - 1];
  const y = (iso: string, dy: number) => `${parseInt(iso.slice(0, 4), 10) + dy}${iso.slice(4)}`;
  const start = cur[0].from;
  const pick = (lo: number, hi: number) => groups.filter((g) => g[0].from >= y(start, lo) && g[0].from <= y(start, hi)).flat();
  return { sign, current: cur, firstBorn: pick(-33, -26), secondBorn: pick(-63, -55), now };
}
app.get("/saturn-return/saturn-in/:sign", async (c) => {
  const q = c.req.param("sign").toLowerCase();
  const sign = SIGNS.find((x) => x.toLowerCase() === q);
  if (!sign) return c.notFound();
  const d = signData(sign);
  return c.html(signPage({ siteUrl: c.env.SITE_URL, d }), 200, { "cache-control": "public, max-age=3600" });
});
app.get("/saturn-return", (c) => c.redirect("/", 301));
app.get("/sitemap.xml", (c) => {
  const urls = ["/", ...SIGNS.map((x) => `/saturn-return/saturn-in/${x.toLowerCase()}`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${c.env.SITE_URL}${u}</loc></url>`).join("")}</urlset>`, 200, { "content-type": "application/xml" });
});
app.get("/robots.txt", (c) => c.text(`User-agent: *\nAllow: /\nDisallow: /p/\nDisallow: /r/\nDisallow: /admin/\nSitemap: ${c.env.SITE_URL}/sitemap.xml\n`));

app.get("/favicon.svg", (c) => c.body(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" fill="none"><rect width="44" height="44" fill="#111418"/><g stroke="#d4b66a" stroke-width="2" fill="none"><circle cx="22" cy="22" r="7.5" fill="#d4b66a"/><ellipse cx="22" cy="22" rx="19" ry="7.8" transform="rotate(-28 22 22)"/></g></svg>`, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=604800" }));

app.post("/preview", async (c) => {
  const form = await c.req.parseBody();
  const date = String(form.date ?? "").trim();
  const placeQ = String(form.place ?? "").trim();
  const time = String(form.time ?? "").trim() || null;
  const ref = String(form.ref ?? "").trim() || null;
  const back = (error: string) => c.html(landingPage({ siteUrl: c.env.SITE_URL, ref: ref ?? undefined, error, form: { date, place: placeQ, time: time ?? "" } }), 400);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return back("Enter your birth date.");
  if (!placeQ) return back("Enter the city you were born in.");
  if (time && !/^\d{2}:\d{2}$/.test(time)) return back("Birth time should look like 14:30.");

  const place = await geocode(placeQ, c.env.CACHE);
  if (!place) return back(`Couldn't find "${placeQ}". Try "City, Country".`);

  let comp: Computed;
  try { comp = compute({ date, time, place }); } catch (e) {
    await log(c.env, "error", null, { where: "compute", e: String(e) });
    return back("Couldn't compute a return for that date. If you're under 26 or over 90, your next return isn't in range yet.");
  }

  const pid = id(12);
  let text = "";
  try {
    text = await writePreview(c.env, reportInputs(comp, null));
  } catch (e) {
    await log(c.env, "error", pid, { where: "preview-llm", e: String(e) });
    text = `Saturn in ${comp.sign}: ${SIGN_NOTES[comp.sign].hook} ${phaseSentence(comp)} The full report dates your exact hits and tells you what to build before each one.`;
  }

  await c.env.DB.prepare(`INSERT INTO previews (id, created_at, birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pid, now(), date, time, place.label, place.lat, place.lon, place.tz, comp.birthUtc, comp.natalLon, comp.sign, comp.degree, comp.house, comp.returnNumber,
      comp.window.windowStart, comp.window.windowEnd, comp.window.peakStart, comp.window.peakEnd, JSON.stringify(comp.window.hits), comp.phase, text, ref).run();
  await log(c.env, "preview", pid, { sign: comp.sign, phase: comp.phase, ref });

  return c.redirect(`/p/${pid}`);
});

app.get("/p/:id", async (c) => {
  const p = await getPreview(c.env, c.req.param("id"));
  if (!p) return c.redirect("/");
  const comp = recompute(p);
  const birthLabel = fmtDay(p.birth_date) + (p.birth_time ? `, ${p.birth_time}` : "");
  return c.html(resultPage({ siteUrl: c.env.SITE_URL, id: p.id, c: comp, text: p.preview_text ?? "", placeLabel: p.place_label, birthLabel, hasTime: !!p.birth_time, reminded: c.req.query("reminded") === "1" }));
});

// ---------- pass reminders (free): one email a week before each pass ----------
app.post("/remind", async (c) => {
  const form = await c.req.parseBody();
  const pid = String(form.preview ?? ""), email = String(form.email ?? "").trim().toLowerCase();
  const p = await getPreview(c.env, pid);
  if (!p || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.redirect(`/p/${pid}`);
  const hits: string[] = JSON.parse(p.hits);
  const today = now().slice(0, 10);
  for (const h of hits) {
    const sendOn = new Date(Date.parse(h) - 7 * 86400000).toISOString().slice(0, 10);
    if (sendOn < today) continue;
    await c.env.DB.prepare("INSERT OR IGNORE INTO reminders (preview_id, email, created_at, hit_date, send_on) VALUES (?,?,?,?,?)").bind(pid, email, now(), h, sendOn).run();
  }
  await log(c.env, "remind", pid);
  return c.redirect(`/p/${pid}?reminded=1`);
});

// ---------- share cards ----------
app.get("/card/:id{.+\\.svg}", async (c) => {
  const pid = c.req.param("id").replace(/\.svg$/, "");
  const p = await getPreview(c.env, pid);
  if (!p) return c.notFound();
  const comp = recompute(p);
  const svg = shareCardSvg(comp, { site: c.env.SITE_URL.replace(/^https?:\/\//, ""), angle: cycle(comp).stage.wa });
  return c.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" });
});
app.get("/card/r/:tok{.+\\.svg}", async (c) => {
  const tok = c.req.param("tok").replace(/\.svg$/, "");
  const pu = await getPurchase(c.env, tok);
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  const comp = recompute(p);
  const svg = shareCardSvg(comp, { site: c.env.SITE_URL.replace(/^https?:\/\//, ""), angle: cycle(comp).stage.wa });
  return c.body(svg, 200, { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" });
});

// ---------- checkout ----------
app.post("/checkout", async (c) => {
  const form = await c.req.parseBody();
  const p = await getPreview(c.env, String(form.preview ?? ""));
  if (!p) return c.redirect("/");
  const tier = p.birth_time ? "full" : "notime";
  const amount = parseInt(tier === "full" ? c.env.PRICE_FULL_CENTS : c.env.PRICE_NOTIME_CENTS, 10);
  const s = stripe(c.env);
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: c.env.CURRENCY, unit_amount: amount, product_data: { name: `Rite — Your Saturn Return (${tier === "full" ? "with birth time" : "no birth time"})`, description: `Saturn in ${p.natal_sign} · ${fmtMonth(p.window_start)} – ${fmtMonth(p.window_end)}` } } }],
    custom_fields: [{ key: "first_name", label: { type: "custom", custom: "First name (for the report)" }, type: "text", optional: true }],
    metadata: { preview_id: p.id, tier },
    success_url: `${c.env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.env.SITE_URL}/p/${p.id}`,
    allow_promotion_codes: true,
  });
  await log(c.env, "checkout", p.id, { tier, amount });
  return c.redirect(session.url!, 303);
});

app.get("/thanks", async (c) => {
  const sid = c.req.query("session_id");
  if (!sid) return c.redirect("/");
  // The webhook usually lands first; poll briefly for the purchase row.
  for (let i = 0; i < 20; i++) {
    const pu = await c.env.DB.prepare("SELECT id, status FROM purchases WHERE stripe_session_id = ?").bind(sid).first<{ id: string; status: string }>();
    if (pu) return c.redirect(`/r/${pu.id}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Fallback: fulfil directly from the session (idempotent on session id).
  const s = stripe(c.env);
  const session = await s.checkout.sessions.retrieve(sid);
  if (session.payment_status === "paid") {
    const tok = await fulfil(c.env, session);
    if (tok) return c.redirect(`/r/${tok}`);
  }
  return c.html(`<p style="font-family:serif;padding:40px">Payment received — your report is being generated. Refresh in a moment, or check your email.</p>`);
});

// ---------- reading ----------
function parseReport(md: string | null): ReportJson | null {
  if (!md) return null;
  try { return parseJsonReply<ReportJson>(md); } catch { return null; }
}
const birthLabelOf = (p: PreviewRow) => `${fmtDay(p.birth_date)}${p.birth_time ? ` at ${p.birth_time}` : ""}`;

app.get("/r/:tok", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  let r = parseReport(pu.report_md);
  if (!r) {
    if (pu.status === "paid" || pu.status === "generated") { await generateReport(c.env, pu.id); const again = await getPurchase(c.env, pu.id); r = parseReport(again?.report_md ?? null); }
    if (!r) return c.html(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="6"><title>Writing your reading</title><body style="background:#0E1014;color:#EDE6D6;font-family:sans-serif;padding:48px"><p>Writing your reading. This page refreshes itself; it usually takes under a minute.</p></body>`);
  }
  const comp = recompute(p); const cy = cycle(comp);
  const askRows = await c.env.DB.prepare("SELECT q, a FROM asks WHERE purchase_id = ? ORDER BY id").bind(pu.id).all<{ q: string; a: string }>();
  const asks = askRows.results ?? [];
  const sub = await c.env.DB.prepare("SELECT status FROM subscriptions WHERE purchase_id = ? AND status = 'active'").bind(pu.id).first<{ status: string }>();
  return c.html(readingPage({ subscribed: !!sub, siteUrl: c.env.SITE_URL, token: pu.id, c: comp, cy, r, firstName: pu.first_name, birthLabel: birthLabelOf(p), placeLabel: p.place_label, askLeft: Math.max(0, ASK_CAP - asks.length), asks }));
});

const ASK_CAP = 5;
app.post("/r/:tok/ask", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<{ q?: string }>().catch(() => ({} as { q?: string }));
  const q = (body.q ?? "").trim().slice(0, 300);
  if (!q) return c.json({ error: "Ask something first.", left: ASK_CAP }, 400);
  const used = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM asks WHERE purchase_id = ?").bind(pu.id).first<{ n: number }>())?.n ?? 0;
  if (used >= ASK_CAP) return c.json({ error: "You've used all five questions.", left: 0 }, 429);
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.json({ error: "Not found" }, 404);
  const inputs = reportInputs(recompute(p), pu.first_name);
  try {
    const a = (await answerQuestion(c.env, askSystem(), JSON.stringify({ inputs, question: q }))).trim();
    await c.env.DB.prepare("INSERT INTO asks (purchase_id, created_at, q, a) VALUES (?,?,?,?)").bind(pu.id, now(), q, a).run();
    await log(c.env, "ask", pu.id, { q });
    return c.json({ a, left: ASK_CAP - used - 1 });
  } catch (e) {
    await log(c.env, "error", pu.id, { where: "ask", e: String(e) });
    return c.json({ error: "Couldn't answer just now. Try again in a moment.", left: ASK_CAP - used }, 502);
  }
});

app.get("/r/:tok/stage", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  const tq = c.req.query("t") ?? "today";
  const today = new Date();
  const t = tq === "today" ? today : new Date(tq + "T12:00:00Z");
  if (isNaN(t.getTime())) return c.json({ error: "bad date" }, 400);
  const comp = recompute(p, t); // window relevant at that instant
  const s = stageAt(new Date(comp.birthUtc), comp.natalLon, comp.window, t);
  const w = comp.window; const d = t.toISOString().slice(0, 10);
  let next = "";
  if (d < w.windowStart) next = `Your window opens ${fmtMonth(w.windowStart)}, ${untilText(t, Date.parse(w.windowStart))}.`;
  else if (d <= w.windowEnd) { const nh = w.hits.find((h) => h > d); next = nh ? `Next exact pass ${fmtDay(nh)}.` : `Saturn leaves ${comp.sign} ${fmtMonth(w.windowEnd)}.`; }
  else { const cy = cycle(comp, t); const n = cy.ahead.find((a) => a.from > d); next = n ? `${n.name} around age ${n.ageApprox}, ${untilText(t, Date.parse(n.from))}.` : "Your next return."; }
  const isToday = tq === "today" || d === today.toISOString().slice(0, 10);
  const slider = (t.getUTCFullYear() - 2025) * 12 + t.getUTCMonth();
  return c.json({ ...s, isToday, when: fmtMonYr(t.getTime()), next, slider: slider >= 0 && slider <= 431 ? slider : null });
});

app.get("/r/:tok/calendar.ics", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  const comp = recompute(p); const cy = cycle(comp); const w = comp.window;
  const only = c.req.query("only");
  const r = parseReport(pu.report_md);
  const ev: Array<{ date: string; title: string; desc: string }> = [];
  w.hits.forEach((h, i) => ev.push({ date: h, title: w.hits.length === 1 ? "Saturn return: exact pass" : `Saturn return: pass ${i + 1} of ${w.hits.length}`, desc: r?.passes[i]?.day ?? `Saturn crosses your natal degree (${Math.floor(comp.degree)}° ${comp.sign}).` }));
  if (cy.turn) ev.push({ date: cy.turn.date, title: "Saturn return: closest turn", desc: r?.turn?.day ?? `Saturn stations ${cy.turn.orb}° from your natal degree without crossing.` });
  ev.push({ date: w.windowStart, title: `Saturn enters ${comp.sign}: your window opens`, desc: "The start of your Saturn return window." });
  ev.push({ date: w.windowEnd, title: `Saturn leaves ${comp.sign}: your window closes`, desc: "The end of your Saturn return window." });
  const list = (only ? ev.filter((e) => e.date === only) : ev).sort((a, b) => a.date.localeCompare(b.date));
  const esc = (x: string) => x.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const stamp = now().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Rite//Saturn Return//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of list) {
    const d = e.date.replace(/-/g, ""); const end = new Date(Date.parse(e.date) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    lines.push("BEGIN:VEVENT", `UID:${pu.id}-${d}@rite`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.desc)}\\n\\nYour reading: ${c.env.SITE_URL}/r/${pu.id}`, `URL:${c.env.SITE_URL}/r/${pu.id}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return c.body(lines.join("\r\n") + "\r\n", 200, { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="rite-saturn-return${only ? "-" + only : ""}.ics"` });
});

async function fulfil(env: Env, session: Stripe.Checkout.Session): Promise<string | null> {
  const existing = await env.DB.prepare("SELECT id FROM purchases WHERE stripe_session_id = ?").bind(session.id).first<{ id: string }>();
  if (existing) return existing.id;
  const pid = session.metadata?.preview_id; const tier = session.metadata?.tier ?? "notime";
  if (!pid) return null;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const firstName = session.custom_fields?.find((f) => f.key === "first_name")?.text?.value?.trim() || null;
  const tok = token();
  await env.DB.prepare(`INSERT INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, status) VALUES (?,?,?,?,?,?,?,?,?,'paid')`)
    .bind(tok, pid, now(), email, firstName, session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, session.amount_total ?? 0, tier).run();
  await log(env, "paid", tok, { pid, tier, amount: session.amount_total });
  await generateReport(env, tok);
  return tok;
}

async function generateReport(env: Env, tok: string) {
  const pu = await getPurchase(env, tok); if (!pu) return;
  const p = await getPreview(env, pu.preview_id); if (!p) return;
  const comp = recompute(p);
  const inputs = reportInputs(comp, pu.first_name);
  const allowed = [...inputs.exact_hits, inputs.today, ...(inputs.turn ? [inputs.turn.date] : [])];
  let md = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await writeReport(env, inputs);
      const r = parseJsonReply<ReportJson>(raw);
      const need: Array<keyof ReportJson> = ["cover_line", "saturn_p1", "saturn_p2", "house_h3", "house_p", "chips_warm", "chips_cool", "phase_approach", "phase_contact", "phase_integration", "passes", "areas", "history_q", "workbook_approach", "workbook_contact", "workbook_integration", "carry"];
      const missing = need.filter((k) => r[k] == null);
      if (missing.length) { await log(env, "error", tok, { where: "report-missing-keys", missing, attempt }); continue; }
      if (!Array.isArray(r.passes) || r.passes.length < 1) { await log(env, "error", tok, { where: "report-no-passes", attempt }); continue; }
      if (!datesAreGrounded(JSON.stringify(r), allowed)) { await log(env, "error", tok, { where: "report-dates-ungrounded", attempt }); continue; }
      md = JSON.stringify(r); break;
    } catch (e) { await log(env, "error", tok, { where: "report-llm", e: String(e), attempt }); }
  }
  if (!md) { await env.DB.prepare("UPDATE purchases SET status='failed' WHERE id=?").bind(tok).run(); return; }
  await env.DB.prepare("UPDATE purchases SET report_md=?, report_json=?, status='generated' WHERE id=?").bind(md, JSON.stringify(inputs), tok).run();
  await log(env, "generated", tok);

  if (pu.email) {
    const m = deliveryEmail({
      firstName: pu.first_name, sign: comp.sign, housePhrase: comp.house ? `, ${houseLabel(comp)}` : "",
      windowStart: fmtMonth(comp.window.windowStart), windowEnd: fmtMonth(comp.window.windowEnd),
      hitSentence: hitSentence(comp), reportUrl: `${env.SITE_URL}/r/${tok}`, upsellUrl: `${env.SITE_URL}/r/${tok}#season`,
    });
    const ok = await sendEmail(env, pu.email, m.subject, m.text);
    if (ok) { await env.DB.prepare("UPDATE purchases SET delivered_at=? WHERE id=?").bind(now(), tok).run(); await log(env, "emailed", tok); }
  }
}

// ---------- Saturn Season subscription ----------
app.post("/season/:tok", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok")); if (!pu) return c.notFound();
  const s = stripe(c.env);
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer_email: pu.email || undefined,
    line_items: [{ quantity: 1, price_data: { currency: c.env.CURRENCY, unit_amount: parseInt(c.env.PRICE_SEASON_MONTHLY_CENTS, 10), recurring: { interval: "month" }, product_data: { name: "Rite — Saturn Season (weekly)" } } }],
    metadata: { purchase_id: pu.id },
    success_url: `${c.env.SITE_URL}/r/${pu.id}`,
    cancel_url: `${c.env.SITE_URL}/r/${pu.id}`,
  });
  return c.redirect(session.url!, 303);
});

app.get("/season/stop/:tok", async (c) => {
  const sub = await c.env.DB.prepare("SELECT id FROM subscriptions WHERE purchase_id = ? AND status='active'").bind(c.req.param("tok")).first<{ id: string }>();
  if (sub) {
    try { await stripe(c.env).subscriptions.cancel(sub.id); } catch (e) { console.error(e); }
    await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(sub.id).run();
  }
  return c.redirect(`/r/${c.req.param("tok")}`);
});

// ---------- Stripe webhook ----------
app.post("/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature") ?? "";
  const body = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe(c.env).webhooks.constructEventAsync(body, sig, c.env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) { return c.text(`bad signature: ${String(e)}`, 400); }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "payment" && session.payment_status === "paid") {
      c.executionCtx.waitUntil(fulfil(c.env, session));
    } else if (session.mode === "subscription" && session.metadata?.purchase_id && session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      await c.env.DB.prepare("INSERT OR REPLACE INTO subscriptions (id, purchase_id, created_at, status) VALUES (?,?,?,'active')").bind(subId, session.metadata.purchase_id, now()).run();
      await log(c.env, "season_start", session.metadata.purchase_id);
    }
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(sub.id).run();
  } else if (event.type === "charge.refunded") {
    const ch = event.data.object as Stripe.Charge;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi) await c.env.DB.prepare("UPDATE purchases SET status='refunded' WHERE stripe_payment_intent=?").bind(pi).run();
  }
  return c.text("ok");
});

// ---------- refund (used by the support inbox automation; protect with the webhook secret as a bearer) ----------
app.post("/admin/refund", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${c.env.STRIPE_WEBHOOK_SECRET}`) return c.text("no", 401);
  const { email } = await c.req.json<{ email: string }>();
  const pu = await c.env.DB.prepare("SELECT id, stripe_payment_intent FROM purchases WHERE email=? AND status IN ('paid','generated') ORDER BY created_at DESC LIMIT 1").bind(email).first<{ id: string; stripe_payment_intent: string }>();
  if (!pu?.stripe_payment_intent) return c.json({ refunded: false });
  await stripe(c.env).refunds.create({ payment_intent: pu.stripe_payment_intent });
  await c.env.DB.prepare("UPDATE purchases SET status='refunded' WHERE id=?").bind(pu.id).run();
  await log(c.env, "refund", pu.id);
  return c.json({ refunded: true });
});

// ---------- health + stats ----------
app.get("/health", (c) => c.json({ ok: true, saturn: saturnLongitude(new Date()), at: now() }));
app.get("/admin/stats", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${c.env.STRIPE_WEBHOOK_SECRET}`) return c.text("no", 401);
  const rows = await c.env.DB.prepare("SELECT kind, COUNT(*) n FROM events GROUP BY kind").all();
  const rev = await c.env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) cents, COUNT(*) n FROM purchases WHERE status IN ('paid','generated')").first();
  return c.json({ events: rows.results, revenue: rev });
});

// ---------- cron: Saturn Season ----------
async function runSeason(env: Env) {
  const subs = await env.DB.prepare(`SELECT s.id sub_id, s.purchase_id, s.last_sent_at, p.email, p.first_name, pv.* FROM subscriptions s JOIN purchases p ON p.id = s.purchase_id JOIN previews pv ON pv.id = p.preview_id WHERE s.status='active'`).all<PreviewRow & { sub_id: string; purchase_id: string; last_sent_at: string | null; email: string; first_name: string | null }>();
  const today = new Date();
  for (const r of subs.results) {
    // Send Mondays at 07:00 local, once.
    const localDow = new Intl.DateTimeFormat("en-US", { timeZone: r.tz, weekday: "short" }).format(today);
    if (localDow !== "Mon" || localHour(r.tz, today) !== 7) continue;
    if (r.last_sent_at && today.getTime() - Date.parse(r.last_sent_at) < 6 * 86400000) continue;

    const comp = recompute(r, today);
    const o = comp.todayOrb;
    if (comp.phase === "complete") { // Saturn has left the natal sign: the window everyone was shown is closed
      const m = seasonCompleteEmail({ firstName: r.first_name });
      await sendEmail(env, r.email, m.subject, m.text);
      try { await stripe(env).subscriptions.cancel(r.sub_id); } catch (e) { console.error(e); }
      await env.DB.prepare("UPDATE subscriptions SET status='complete', last_sent_at=? WHERE id=?").bind(now(), r.sub_id).run();
      await log(env, "season_complete", r.purchase_id);
      continue;
    }
    const tl = saturnLongitude(today);
    const st = comp.nextStation;
    const nextHit = comp.window.hits.find((h) => h >= today.toISOString().slice(0, 10));
    const motion = comp.retrograde
      ? `It's retrograde${st ? ` until ${fmtDay(st.date)}` : ""}${comp.window.hits.length === 3 ? ", so this is a second pass" : ""}.`
      : `It's direct${nextHit ? ` and closing in; your exact hit is ${fmtDay(nextHit)}` : ""}.`;
    let body = "";
    try {
      body = await writeSeason(env, { sign: comp.sign, house: comp.house, orb: Math.round(Math.abs(o) * 10) / 10, direction: o < 0 ? "applying" : "separating", retrograde: comp.retrograde, next_hit: nextHit ? fmtDay(nextHit) : null, next_station: st ? `${fmtDay(st.date)} (${st.to})` : null, phase: comp.phase });
    } catch (e) { await log(env, "error", r.purchase_id, { where: "season-llm", e: String(e) }); continue; }
    const m = seasonEmail({
      firstName: r.first_name, transitDeg: `${Math.floor(degreeInSign(tl))}°`, transitSign: signOf(tl),
      orb: `${Math.round(Math.abs(o) * 10) / 10}°`, dir: o < 0 ? "from" : "past", motionSentence: motion, body,
      manageUrl: `${env.SITE_URL}/season/stop/${r.purchase_id}`,
    });
    if (await sendEmail(env, r.email, m.subject, m.text)) {
      await env.DB.prepare("UPDATE subscriptions SET last_sent_at=? WHERE id=?").bind(now(), r.sub_id).run();
      await log(env, "season_sent", r.purchase_id);
    }
  }
}

async function runReminders(env: Env) {
  const today = now().slice(0, 10);
  const due = await env.DB.prepare("SELECT r.id, r.email, r.hit_date, r.preview_id, p.natal_sign FROM reminders r JOIN previews p ON p.id = r.preview_id WHERE r.sent_at IS NULL AND r.send_on <= ?").bind(today).all<{ id: number; email: string; hit_date: string; preview_id: string; natal_sign: string }>();
  for (const r of due.results) {
    const ok = await sendEmail(env, r.email, `Your Saturn pass is a week away — ${fmtDay(r.hit_date)}`,
`Hi,

A week from now, on ${fmtDay(r.hit_date)}, Saturn crosses the degree it held when you were born. Saturn in ${r.natal_sign}.

This is the part people mean when they say Saturn return. Nothing has to happen on the day — but whatever you have been circling tends to ask for a decision around it.

Your preview, with the full window: ${env.SITE_URL}/p/${r.preview_id}
The full reading dates every pass and tells you what to build before each one: ${env.SITE_URL}/p/${r.preview_id}#reading

— Rite

You asked for this one email. There is nothing to unsubscribe from.`);
    if (ok) await env.DB.prepare("UPDATE reminders SET sent_at=? WHERE id=?").bind(now(), r.id).run();
  }
}

export default {
  fetch: app.fetch,
  scheduled: (_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(Promise.all([runSeason(env), runReminders(env)])); },
};
