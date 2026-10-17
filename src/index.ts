import { Hono } from "hono";
import Stripe from "stripe";
import { geocode } from "./geo";
import { compute, cycle, reportInputs, fmtMonth, fmtDay, hitSentence, phaseSentence, houseLabel, type Computed } from "./compute";
import { askSystem, type SeasonInputs } from "./content/prompts";
import { stageAt } from "./astro/cycle";
import SIGN_PERIODS from "./content/sign-periods.json";
import { signPage, type SignPageData } from "./views/sign";
import { whenPage, comparePage, type Cohort } from "./views/guides";
import { SIGNS, type Sign } from "./astro/saturn";
import { writePreview, writeReport, writeSeason, datesAreGrounded, parseJsonReply, answerQuestion } from "./llm";
import { sendEmail, stopUrl, deliveryEmail, giftDeliveryEmail, seasonEmail, seasonCompleteEmail, stageReminderEmail, giftEmail, day3Email, day10Email } from "./email";
import { stopPage } from "./views/stop";
import { followupSchedule, followupDue, followupSkip, stageSeasonLine, type FollowupKind } from "./followups";
import { readingPage, type ReportJson } from "./views/reading";
import { shareCardSvg, ogSvg } from "./card";
import { svgToPng } from "./png";
import { saturnLongitude, signOf, degreeInSign, orb, isRetrograde, nextStation, type Phase } from "./astro/saturn";
import { smallChart, fmtMonYr, fmtMonYrL, untilText } from "./astro/cycle";
import { landingPage } from "./views/landing";
import { flowPage } from "./views/flow";
import { giftPage } from "./views/gift";
import { writingPage } from "./views/writing";
import { legalPage } from "./views/legal";
import { narrationText, CHAPTERS } from "./narration";
import { synthesize, ttsConfig, audioCacheKey, MAX_ADMIN_CHARS, isEleven, FALLBACK, availableModels } from "./tts";
import { voicePage } from "./views/voice";
import { resultPage } from "./views/result";
import { seasonManagePage, type SeasonManageData } from "./views/season";
import { seasonLandingPage } from "./views/season-landing";
import { seasonAvailable, nextNoteDate, nextNoteAfterLast, yearlyAllowed, unusedMonths, yearlyRefundCents, comingUpText, windowOpenSendOn, noteFacts, seasonFallbackBody, sampleNote, lastMondayLocal, type SeasonPlan } from "./season";
import { SIGN_NOTES } from "./content/notes";
import { localHour, localToUtc } from "./geo";
import { adminAuthorized, adminStats, adminExtras, adminDays } from "./admin";
import { adminPage } from "./views/admin";

export interface Env {
  DB: D1Database;
  CACHE: KVNamespace;
  SITE_URL: string;
  PRICE_FULL_CENTS: string; PRICE_NOTIME_CENTS: string; PRICE_SEASON_MONTHLY_CENTS: string; PRICE_SEASON_YEARLY_CENTS: string;
  CURRENCY: string;
  MODEL_REPORT: string; MODEL_PREVIEW: string;
  FROM_EMAIL: string; SUPPORT_EMAIL: string;
  STRIPE_SECRET_KEY: string; STRIPE_WEBHOOK_SECRET: string; ADMIN_KEY?: string; ANTHROPIC_API_KEY: string; RESEND_API_KEY: string;
  AI?: Ai; TTS_MODEL?: string; TTS_VOICE?: string; ELEVENLABS_API_KEY?: string; ADMIN_EMAIL?: string; POSTHOG_KEY?: string; POSTHOG_HOST?: string;
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => { await next(); if (c.res && c.req.method === "GET") c.res = withAnalytics(c.env, c.res, new URL(c.req.url).pathname); });

// ---------- helpers ----------
const id = (n = 12) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, n); };
const token = () => id(32);
const now = () => new Date().toISOString();
// Human admin routes use ADMIN_KEY (bearer, or ?key= on GET /admin only). Until ADMIN_KEY is set, the bearer routes fall back to the
// webhook secret so existing curl commands keep working; the browser page never accepts the webhook secret, so it can't land in history.
const adminOk = (env: Env, auth: string | undefined, key?: string) =>
  env.ADMIN_KEY ? adminAuthorized(env.ADMIN_KEY, auth, key) : key === undefined && adminAuthorized(env.STRIPE_WEBHOOK_SECRET, auth);
// Worker-to-itself calls (/internal/generate) stay on the webhook secret.
const internalOk = (env: Env, auth: string | undefined) => adminAuthorized(env.STRIPE_WEBHOOK_SECRET, auth);
const stripe = (env: Env) => new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const FUNNEL = new Set(["preview", "checkout", "paid", "generated", "gift_paid", "gift_redeemed", "season_start", "season_sent", "ask", "narrated", "refund", "story", "error"]);
async function log(env: Env, kind: string, ref?: string | null, detail?: unknown) {
  try { await env.DB.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(now(), kind, ref ?? null, detail ? JSON.stringify(detail).slice(0, 2000) : null).run(); } catch (e) { console.error("log", e); }
  if (env.POSTHOG_KEY && FUNNEL.has(kind)) {
    try {
      await fetch(`${env.POSTHOG_HOST || "https://us.i.posthog.com"}/capture/`, { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: env.POSTHOG_KEY, event: `server_${kind}`, distinct_id: ref || "anonymous", properties: { ...(detail && typeof detail === "object" ? detail as Record<string, unknown> : {}), $lib: "rite-worker" }, timestamp: now() }) });
    } catch { /* analytics never blocks */ }
  }
}

// Client-side PostHog: injected into every HTML page when POSTHOG_KEY is set. Autocapture and session recording off; the
// pages call window.rite.track(name, props) for the funnel events, and every page sends one pageview.
function withAnalytics(env: Env, res: Response, path: string): Response {
  if (!env.POSTHOG_KEY || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  if (path === "/admin" || path.startsWith("/admin/")) return res; // admin pages carry the secret in the URL
  if (path.startsWith("/stop/")) return res; // an unsubscribe page is no place for tracking
  // never tag the private pages with their tokens
  const page = path.startsWith("/r/") ? "/r/:tok" : path.startsWith("/p/") ? "/p/:id" : path.startsWith("/gift/") ? "/gift/:code" : path;
  const snippet = `<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload identify alias people.set people.set_once set_config startSessionRecording stopSessionRecording get_distinct_id".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(env.POSTHOG_KEY)},{api_host:${JSON.stringify(env.POSTHOG_HOST || "https://us.i.posthog.com")},autocapture:false,capture_pageview:false,disable_session_recording:true,persistence:"localStorage+cookie"});
posthog.capture("$pageview",{page:${JSON.stringify(page)}});
window.rite={track:function(n,p){try{posthog.capture(n,Object.assign({page:${JSON.stringify(page)}},p||{}))}catch(e){}}};</script>`;
  return new HTMLRewriter().on("head", { element(el) { el.append(snippet, { html: true }); } }).transform(res);
}

interface PreviewRow {
  id: string; birth_date: string; birth_time: string | null; place_label: string; lat: number; lon: number; tz: string;
  natal_lon: number; natal_sign: string; natal_degree: number; natal_house: number | null; return_number: number;
  window_start: string; window_end: string; peak_start: string; peak_end: string; hits: string; phase: string; preview_text: string | null; ref: string | null;
}
interface PurchaseRow { id: string; preview_id: string; email: string; first_name: string | null; tier: string; report_md: string | null; status: string; amount_cents: number; stripe_session_id: string | null; delivered_at: string | null }

/** Recompute from the stored birth data (cheap, and keeps "today"-dependent fields fresh). */
function recompute(p: PreviewRow, today = new Date()): Computed {
  return compute({ date: p.birth_date, time: p.birth_time, place: { label: p.place_label, lat: p.lat, lon: p.lon, tz: p.tz } }, today);
}

async function getPreview(env: Env, pid: string) {
  return env.DB.prepare("SELECT * FROM previews WHERE id = ?").bind(pid).first<PreviewRow>();
}
interface GiftRow { code: string; created_at: string; buyer_email: string; buyer_name: string | null; message: string | null; stripe_session_id: string | null; amount_cents: number; redeemed_purchase_id: string | null; redeemed_at: string | null }
async function getGift(env: Env, code: string) {
  return env.DB.prepare("SELECT * FROM gifts WHERE code = ?").bind(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).first<GiftRow>();
}
const giftCode = () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.getRandomValues(new Uint8Array(8)); return Array.from(b, (x) => A[x % A.length]).join(""); };

async function getPurchase(env: Env, tok: string) {
  return env.DB.prepare("SELECT * FROM purchases WHERE id = ?").bind(tok).first<PurchaseRow>();
}

// ---------- pages ----------
app.get("/", async (c) => {
  await log(c.env, "visit", c.req.query("r") ?? null);
  return c.html(landingPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? c.req.query("utm_source") ?? c.req.query("ref") ?? undefined, season: seasonTeaser(c.env) }));
});

/** The landing's Saturn Season teaser: prices from config, and Saturn's position this week (one table lookup). */
function seasonTeaser(env: Env) {
  const lon = saturnLongitude(new Date());
  return { monthly: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100), yearly: Math.round(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) / 100), saturnNow: `${Math.floor(degreeInSign(lon))}° ${signOf(lon)}` };
}

/** Live numbers for the landing widget: date (+ optional time), no place → noon UTC, sign-level only. */
app.get("/start", (c) => c.html(flowPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? c.req.query("utm_source") ?? undefined, form: { date: c.req.query("d") ?? undefined } })));
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
    angle: +wa.toFixed(2), pct: inside && (wa < 1 || wa > 359) ? 100 : Math.floor(wa / 360 * 100), inside, // at the return point itself, "100% of the way round" rather than 0% frac: +frac.toFixed(3),
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
  // the stretch happening now; otherwise whichever of the previous and next stretches is nearer in time
  // (a sign Saturn left last year should read "left", not "enters … in 26 years")
  const inside = groups.find((g) => now >= g[0].from && now <= g[g.length - 1].to);
  const nextG = groups.find((g) => g[0].from > now), prevG = [...groups].reverse().find((g) => g[g.length - 1].to < now);
  const nearer = !nextG ? prevG! : !prevG ? nextG : Date.parse(now) - Date.parse(prevG[prevG.length - 1].to) <= Date.parse(nextG[0].from) - Date.parse(now) ? prevG : nextG;
  const cur = inside ?? nearer;
  const idx = groups.indexOf(cur);
  const whole = (g: Array<{ from: string; to: string }>) => ({ from: g[0].from, to: g[g.length - 1].to });
  const y = (iso: string, dy: number) => `${parseInt(iso.slice(0, 4), 10) + dy}${iso.slice(4)}`;
  const start = cur[0].from;
  const pick = (lo: number, hi: number) => groups.filter((g) => g[0].from >= y(start, lo) && g[0].from <= y(start, hi)).flat();
  return { sign, current: cur, firstBorn: pick(-33, -26), secondBorn: pick(-63, -55), thirdBorn: pick(-92, -84), now, prev: groups[idx - 1] ? whole(groups[idx - 1]) : undefined, next: groups[idx + 1] ? whole(groups[idx + 1]) : undefined };
}
app.get("/saturn-return/saturn-in/:sign", async (c) => {
  const q = c.req.param("sign").toLowerCase();
  const sign = SIGNS.find((x) => x.toLowerCase() === q);
  if (!sign) return c.notFound();
  const d = signData(sign);
  return c.html(signPage({ siteUrl: c.env.SITE_URL, d }), 200, { "cache-control": "public, max-age=3600" });
});
app.get("/saturn-return", (c) => c.redirect("/", 301));
// Evergreen explainers (views/guides.ts). Cohorts from sign-periods.json, Saturn today from the table, examples from compute().
const cohortOf = (sign: Sign): Cohort => { const d = signData(sign); return { sign, current: d.current, firstBorn: d.firstBorn, secondBorn: d.secondBorn, thirdBorn: d.thirdBorn ?? [] }; };
const WHEN_EXAMPLES = ["1996-09-01", "1997-04-01"]; // one exact pass, three exact passes (both computed, noon UTC)
app.get("/saturn-return/when", async (c) => {
  await log(c.env, "visit", c.req.query("r") ?? "when");
  const t = new Date(), lon = saturnLongitude(t), sign = signOf(lon);
  const examples = WHEN_EXAMPLES.map((born) => { const x = compute({ date: born, time: null, place: { label: "", lat: 0, lon: 0, tz: "UTC" } }, t);
    return { born, sign: x.sign, degree: x.degree, windowStart: x.window.windowStart, windowEnd: x.window.windowEnd, hits: x.window.hits }; });
  return c.html(whenPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? c.req.query("utm_source") ?? "when", d: {
    now: t.toISOString().slice(0, 10), saturn: { sign, degree: degreeInSign(lon) }, cohort: cohortOf(sign), next: cohortOf(SIGNS[(SIGNS.indexOf(sign) + 1) % 12]), examples,
  } }), 200, { "cache-control": "public, max-age=3600" });
});
app.get("/saturn-return/first-vs-second", (c) => {
  const t = new Date(), lon = saturnLongitude(t), sign = signOf(lon), now = t.toISOString().slice(0, 10);
  // the sign Saturn is in, plus any sign it is between passes through (its stretch spans today)
  const others = SIGNS.filter((s) => s !== sign).map(cohortOf).filter((k) => now >= k.current[0].from && now <= k.current[k.current.length - 1].to);
  return c.html(comparePage({ siteUrl: c.env.SITE_URL, d: { now, saturn: { sign, degree: degreeInSign(lon) }, cohorts: [cohortOf(sign), ...others] } }), 200, { "cache-control": "public, max-age=3600" });
});
// Second-return landing: whoever is having their second return in the sign Saturn is in now (dates from sign-periods.json).
app.get("/second", async (c) => {
  await log(c.env, "visit", c.req.query("r") ?? "second");
  const sign = signOf(saturnLongitude(new Date()));
  const d = signData(sign);
  return c.html(landingPage({ siteUrl: c.env.SITE_URL, season: seasonTeaser(c.env), ref: c.req.query("r") ?? c.req.query("utm_source") ?? "second", variant: "second",
    second: { sign, born: d.secondBorn, until: d.current[d.current.length - 1].to } }), 200, { "cache-control": "public, max-age=3600" });
});
app.get("/privacy", (c) => c.html(legalPage({ siteUrl: c.env.SITE_URL, page: "privacy", supportEmail: c.env.SUPPORT_EMAIL })));
app.get("/terms", (c) => c.html(legalPage({ siteUrl: c.env.SITE_URL, page: "terms", supportEmail: c.env.SUPPORT_EMAIL })));
app.get("/refunds", (c) => c.html(legalPage({ siteUrl: c.env.SITE_URL, page: "refunds", supportEmail: c.env.SUPPORT_EMAIL })));
/** /season: what Saturn Season is, with a sample note computed this week for a real chart in the current Aries cohort. */
const SEASON_SAMPLE = { date: "1997-06-01", label: "1 Jun 1997, Melbourne", place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } };
app.get("/season", (c) => {
  const tz = SEASON_SAMPLE.place.tz;
  const day = lastMondayLocal(tz, new Date());
  const at = localToUtc(day, "07:00", tz);
  const comp = compute({ date: SEASON_SAMPLE.date, time: null, place: SEASON_SAMPLE.place }, at);
  const sn = sampleNote(comp, at);
  return c.html(seasonLandingPage({
    siteUrl: c.env.SITE_URL,
    monthlyPrice: Math.round(parseInt(c.env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100), yearlyPrice: Math.round(parseInt(c.env.PRICE_SEASON_YEARLY_CENTS, 10) / 100),
    sample: { bornLabel: SEASON_SAMPLE.label, noteDate: `Mon ${fmtDay(day)}`, windowEnd: fmtDay(comp.window.windowEnd), position: sn.position, body: sn.body,
      upcoming: sn.facts.upcoming.map((u) => ({ date: fmtDay(u.date), label: u.label })), reread: sn.facts.reread.name },
  }), 200, { "cache-control": "public, max-age=3600" });
});
app.get("/sitemap.xml", (c) => {
  const urls = ["/", "/second", "/season", "/gift", "/privacy", "/terms", "/refunds", "/saturn-return/when", "/saturn-return/first-vs-second", ...SIGNS.map((x) => `/saturn-return/saturn-in/${x.toLowerCase()}`)];
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
  const gift = String(form.gift ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || null;
  const back = (error: string) => c.html(landingPage({ siteUrl: c.env.SITE_URL, season: seasonTeaser(c.env), ref: ref ?? undefined, error, form: { date, place: placeQ, time: time ?? "" } }), 400);

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
    text = `Saturn in ${comp.sign}: ${SIGN_NOTES[comp.sign].hook} ${phaseSentence(comp)} The full report dates your exact passes and tells you what to build before each one.`;
  }

  await c.env.DB.prepare(`INSERT INTO previews (id, created_at, birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pid, now(), date, time, place.label, place.lat, place.lon, place.tz, comp.birthUtc, comp.natalLon, comp.sign, comp.degree, comp.house, comp.returnNumber,
      comp.window.windowStart, comp.window.windowEnd, comp.window.peakStart, comp.window.peakEnd, JSON.stringify(comp.window.hits), comp.phase, text, ref).run();
  await log(c.env, "preview", pid, { sign: comp.sign, phase: comp.phase, ref });

  return c.redirect(gift ? `/p/${pid}?gift=${gift}` : `/p/${pid}`);
});

app.get("/p/:id", async (c) => {
  const p = await getPreview(c.env, c.req.param("id"));
  if (!p) return c.redirect("/");
  const comp = recompute(p);
  const birthLabel = fmtDay(p.birth_date) + (p.birth_time ? `, ${p.birth_time}` : "");
  const gq = c.req.query("gift");
  const gift = gq ? await getGift(c.env, gq) : null;
  const giftState = gq ? (gift ? (gift.redeemed_at ? "used" : "ok") : "bad") : null;
  return c.html(resultPage({ siteUrl: c.env.SITE_URL, id: p.id, c: comp, text: p.preview_text ?? "", placeLabel: p.place_label, birthLabel, hasTime: !!p.birth_time, reminded: c.req.query("reminded") === "window" ? "window" : c.req.query("reminded") === "1", gift: giftState ? { code: gift?.code ?? gq!, state: giftState as "ok" | "used" | "bad", from: gift?.buyer_name ?? null, message: gift?.message ?? null } : null }));
});

// ---------- pass reminders (free): one email a week before each pass ----------
app.post("/remind", async (c) => {
  const form = await c.req.parseBody();
  const pid = String(form.preview ?? ""), email = String(form.email ?? "").trim().toLowerCase();
  const p = await getPreview(c.env, pid);
  if (!p || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.redirect(`/p/${pid}`);
  const today = now().slice(0, 10);
  if (String(form.kind ?? "") === "window_open") {
    // "Tell me when my window opens": one row keyed on the window-open date, sent 30 days before. The UNIQUE on
    // (preview, email, hit_date) makes a second submit a no-op; runReminders tells the two kinds apart by the date.
    const sendOn = windowOpenSendOn(p.window_start);
    if (sendOn >= today) await c.env.DB.prepare("INSERT OR IGNORE INTO reminders (preview_id, email, created_at, hit_date, send_on) VALUES (?,?,?,?,?)").bind(pid, email, now(), p.window_start, sendOn).run();
    await log(c.env, "remind", pid, { kind: "window_open" });
    return c.redirect(`/p/${pid}?reminded=window`);
  }
  const hits: string[] = JSON.parse(p.hits);
  for (const h of hits) {
    const sendOn = new Date(Date.parse(h) - 7 * 86400000).toISOString().slice(0, 10);
    if (sendOn < today) continue;
    await c.env.DB.prepare("INSERT OR IGNORE INTO reminders (preview_id, email, created_at, hit_date, send_on) VALUES (?,?,?,?,?)").bind(pid, email, now(), h, sendOn).run();
  }
  await log(c.env, "remind", pid, { kind: "pass" });
  return c.redirect(`/p/${pid}?reminded=1`);
});

// ---------- stop reminder and follow-up emails ----------
// `tok` is a purchase id (stage reminders, day-3 and day-10 follow-ups) or a preview id (free pass reminders). GET shows
// the button only, because mail scanners open links; POST stops (the page's form, and RFC 8058 one-click from mail apps).
// Season notes are separate (their own manage page). Skips are 'skipped:stop', so nothing ever retries them.
async function stopTarget(env: Env, tok: string): Promise<"reading" | "preview" | null> {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(tok)) return null;
  if (await env.DB.prepare("SELECT 1 FROM purchases WHERE id=?").bind(tok).first()) return "reading";
  if (await env.DB.prepare("SELECT 1 FROM previews WHERE id=?").bind(tok).first()) return "preview";
  return null;
}
async function stopSeasonUrl(env: Env, tok: string) {
  const sub = await env.DB.prepare("SELECT 1 FROM subscriptions WHERE purchase_id=? AND status IN ('active','past_due')").bind(tok).first();
  return sub ? `${env.SITE_URL}/season/manage/${tok}` : null;
}
app.get("/stop/:tok", async (c) => {
  const tok = c.req.param("tok"); const kind = await stopTarget(c.env, tok); if (!kind) return c.notFound();
  const seasonUrl = kind === "reading" ? await stopSeasonUrl(c.env, tok) : null;
  return c.html(stopPage({ siteUrl: c.env.SITE_URL, tok, kind, done: c.req.query("done") === "1", seasonUrl }), 200, { "cache-control": "no-store", "x-robots-tag": "noindex" });
});
app.post("/stop/:tok", async (c) => {
  const tok = c.req.param("tok"); const kind = await stopTarget(c.env, tok); if (!kind) return c.notFound();
  if (kind === "reading") await c.env.DB.batch([
    c.env.DB.prepare("UPDATE stage_reminders SET sent_at='skipped:stop' WHERE purchase_id=? AND sent_at IS NULL").bind(tok),
    c.env.DB.prepare("UPDATE followups SET sent_at='skipped:stop' WHERE purchase_id=? AND sent_at IS NULL").bind(tok),
  ]);
  else await c.env.DB.prepare("UPDATE reminders SET sent_at='skipped:stop' WHERE preview_id=? AND sent_at IS NULL").bind(tok).run();
  await log(c.env, "stopped", tok, { kind });
  const body = await c.req.text().catch(() => "");
  if (/List-Unsubscribe=One-Click/i.test(body)) return c.text("Stopped.", 200);
  return c.redirect(`/stop/${tok}?done=1`, 303);
});

// ---------- share cards ----------
// SVG (vector, original) and PNG (1080×1920, what "Make my card" downloads; rasterised by resvg and
// kept in KV for 30 days, so the dial angle can lag by up to a month, about a degree).
const cardSvg = (env: Env, p: PreviewRow) => { const comp = recompute(p); return shareCardSvg(comp, { site: env.SITE_URL.replace(/^https?:\/\//, ""), angle: cycle(comp).stage.wa }); };
async function cardPng(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, p: PreviewRow): Promise<ArrayBuffer> {
  const key = `card:png:${p.id}`;
  const hit = await env.CACHE.get(key, "arrayBuffer");
  if (hit) return hit;
  const out = await svgToPng(cardSvg(env, p));
  const png = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
  ctx.waitUntil(env.CACHE.put(key, png, { expirationTtl: 30 * 86400 }));
  return png;
}
app.get("/card/r/:tok{[^/]+\\.png}", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok").replace(/\.png$/, ""));
  const p = pu && await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  return c.body(await cardPng(c.env, c.executionCtx, p), 200, { "content-type": "image/png", "cache-control": "private, max-age=3600" });
});
app.get("/card/:id{[^/]+\\.png}", async (c) => {
  const p = await getPreview(c.env, c.req.param("id").replace(/\.png$/, ""));
  if (!p) return c.notFound();
  return c.body(await cardPng(c.env, c.executionCtx, p), 200, { "content-type": "image/png", "cache-control": "public, max-age=3600" });
});
app.get("/card/:id{[^/]+\\.svg}", async (c) => {
  const pid = c.req.param("id").replace(/\.svg$/, "");
  const p = await getPreview(c.env, pid);
  if (!p) return c.notFound();
  return c.body(cardSvg(c.env, p), 200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=3600" });
});
app.get("/card/r/:tok{[^/]+\\.svg}", async (c) => {
  const tok = c.req.param("tok").replace(/\.svg$/, "");
  const pu = await getPurchase(c.env, tok);
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  return c.body(cardSvg(c.env, p), 200, { "content-type": "image/svg+xml", "cache-control": "private, max-age=3600" });
});

// ---------- checkout ----------
app.post("/checkout", async (c) => {
  const form = await c.req.parseBody();
  if (String(form.gift ?? "") === "1") return giftCheckout(c.env, c.redirect.bind(c));
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
  await log(c.env, "checkout", p.id, { tier, amount, ref: p.ref, sign: p.natal_sign });
  return c.redirect(session.url!, 303);
});

async function giftCheckout(env: Env, redirect: (url: string, status: 302 | 303) => Response) {
  const amount = parseInt(env.PRICE_FULL_CENTS, 10);
  const session = await stripe(env).checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: env.CURRENCY, unit_amount: amount, product_data: { name: "Rite — Saturn Return reading, as a gift", description: "A code they redeem with their own birth details. Works with or without a birth time." } } }],
    custom_fields: [
      { key: "from_name", label: { type: "custom", custom: "Your name, as they'll see it" }, type: "text", optional: true },
      { key: "message", label: { type: "custom", custom: "A note for them (optional)" }, type: "text", optional: true },
    ],
    metadata: { gift: "1" },
    success_url: `${env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.SITE_URL}/gift`,
    allow_promotion_codes: true,
  });
  await log(env, "checkout", null, { gift: true, amount });
  return redirect(session.url!, 303);
}

app.get("/gift", (c) => c.html(giftPage({ siteUrl: c.env.SITE_URL, price: Math.round(parseInt(c.env.PRICE_FULL_CENTS, 10) / 100) })));
app.get("/gift/thanks/:code", async (c) => {
  const g = await getGift(c.env, c.req.param("code"));
  if (!g) return c.notFound();
  return c.html(giftPage({ siteUrl: c.env.SITE_URL, price: Math.round(parseInt(c.env.PRICE_FULL_CENTS, 10) / 100), bought: { code: g.code, email: g.buyer_email } }));
});
app.get("/gift/:code", async (c) => {
  const g = await getGift(c.env, c.req.param("code"));
  if (!g) return c.html(landingPage({ siteUrl: c.env.SITE_URL, season: seasonTeaser(c.env), error: "That gift code doesn't match anything. Check it and try again." }), 404);
  if (g.redeemed_at === "refunded" || (g.redeemed_at && !g.redeemed_purchase_id)) return c.html(landingPage({ siteUrl: c.env.SITE_URL, season: seasonTeaser(c.env), error: "That gift code was refunded, so it can't be redeemed." }), 410);
  if (g.redeemed_at) return c.redirect(`/r/${g.redeemed_purchase_id}`);
  return c.html(landingPage({ siteUrl: c.env.SITE_URL, season: seasonTeaser(c.env), gift: { code: g.code, from: g.buyer_name, message: g.message } }));
});
app.post("/redeem", async (c) => {
  const form = await c.req.parseBody();
  const p = await getPreview(c.env, String(form.preview ?? ""));
  const g = await getGift(c.env, String(form.gift ?? ""));
  if (!p || !g) return c.redirect("/");
  if (g.redeemed_at) return c.redirect(`/p/${p.id}?gift=${g.code}`);
  const email = String(form.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.redirect(`/p/${p.id}?gift=${g.code}&err=email`);
  const firstName = String(form.first_name ?? "").trim().slice(0, 40) || null;
  const tok = token();
  await c.env.DB.prepare(`INSERT INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, status) VALUES (?,?,?,?,?,?,?,?,?,'paid')`)
    .bind(tok, p.id, now(), email, firstName, null, null, 0, p.birth_time ? "full" : "notime").run();
  await c.env.DB.prepare("UPDATE gifts SET redeemed_purchase_id=?, redeemed_at=? WHERE code=? AND redeemed_at IS NULL").bind(tok, now(), g.code).run();
  await log(c.env, "gift_redeemed", tok, { code: g.code });
  kickGenerate(c.env, c.executionCtx, tok);
  return c.redirect(`/r/${tok}`);
});

app.post("/internal/generate/:tok", async (c) => {
  if (!internalOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  const tok = c.req.param("tok");
  // lock so refreshes don't start parallel LLM calls
  const lock = await c.env.DB.prepare("UPDATE purchases SET status='writing', delivered_at=? WHERE id=? AND (status='paid' OR status='failed' OR (status='writing' AND delivered_at < ?))").bind(now(), tok, new Date(Date.now() - 3 * 60000).toISOString()).run();
  if (!lock.meta.changes) return c.text("busy or done");
  await generateReport(c.env, tok);
  return c.text("ok");
});

app.post("/admin/season/:tok", async (c) => {
  // Force one Saturn Season note for a purchase, to the purchaser (or ?to=you@x) — doesn't touch last_sent_at when `to` is given.
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  const tok = c.req.param("tok");
  const r = await seasonRow(c.env, tok);
  if (!r) return c.json({ ok: false, error: "no such purchase" }, 404);
  const to = c.req.query("to") || undefined;
  const result = await sendSeasonNote(c.env, r, new Date(), to ?? r.email);
  return c.json({ ok: result === "sent" || result === "complete", result, to: to ?? r.email });
});

app.get("/admin/season/:tok/notes", async (c) => {
  // Every Season note built for a purchase, newest first, as plain text (kept whether or not the email was delivered).
  if (!c.env.ADMIN_KEY || !adminAuthorized(c.env.ADMIN_KEY, c.req.header("authorization"), c.req.query("key"))) return c.notFound();
  const rows = await c.env.DB.prepare("SELECT at, detail FROM events WHERE kind='season_note' AND ref=? ORDER BY id DESC LIMIT 20").bind(c.req.param("tok")).all<{ at: string; detail: string }>();
  const text = rows.results.map((r) => { const d = JSON.parse(r.detail) as { subject: string; text: string; delivered: boolean; forced: boolean };
    return `${r.at.slice(0, 16).replace("T", " ")} UTC · ${d.delivered ? "delivered" : "NOT delivered"}${d.forced ? " · forced" : ""}\nSubject: ${d.subject}\n\n${d.text}`; }).join("\n\n" + "—".repeat(40) + "\n\n");
  return c.text(text || "No Season notes for this purchase yet.", 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});

app.post("/admin/fulfil", async (c) => {
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  const { session_id } = await c.req.json<{ session_id: string }>();
  const session = await stripe(c.env).checkout.sessions.retrieve(session_id);
  if (session.payment_status !== "paid") return c.json({ ok: false, payment_status: session.payment_status });
  const tok = await fulfil(c.env, session);
  if (tok && session.metadata?.gift !== "1") kickGenerate(c.env, c.executionCtx, tok);
  return c.json({ ok: true, token: tok, gift: session.metadata?.gift === "1", url: `${c.env.SITE_URL}/${session.metadata?.gift === "1" ? "gift/thanks" : "r"}/${tok}` });
});

app.get("/thanks", async (c) => {
  const sid = c.req.query("session_id");
  if (!sid) return c.redirect("/");
  // The webhook usually lands first; poll briefly for the purchase (or gift) row.
  for (let i = 0; i < 6; i++) {
    const g = await c.env.DB.prepare("SELECT code FROM gifts WHERE stripe_session_id = ?").bind(sid).first<{ code: string }>();
    if (g) return c.redirect(`/gift/thanks/${g.code}`);
    const pu = await c.env.DB.prepare("SELECT id, status FROM purchases WHERE stripe_session_id = ?").bind(sid).first<{ id: string; status: string }>();
    if (pu) return c.redirect(`/r/${pu.id}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  // Fallback: fulfil directly from the session (idempotent on session id).
  const s = stripe(c.env);
  const session = await s.checkout.sessions.retrieve(sid);
  if (session.payment_status === "paid") {
    const tok = await fulfil(c.env, session);
    if (tok) { if (session.metadata?.gift !== "1") kickGenerate(c.env, c.executionCtx, tok); return c.redirect(session.metadata?.gift === "1" ? `/gift/thanks/${tok}` : `/r/${tok}`); }
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
  const r = parseReport(pu.report_md);
  if (!r) {
    const stale = pu.status === "writing" && Date.now() - Date.parse(pu.delivered_at ?? "0") > 3 * 60000; // delivered_at doubles as the writing lock timestamp
    if (pu.status === "paid" || stale || (pu.status === "failed" && c.req.query("retry") === "1")) kickGenerate(c.env, c.executionCtx, pu.id);
    const comp0 = recompute(p);
    const failed = pu.status === "failed" && c.req.query("retry") !== "1";
    return c.html(writingPage({ token: pu.id, c: comp0, state: failed ? "failed" : "writing", supportEmail: c.env.SUPPORT_EMAIL }), failed ? 500 : 200, { "cache-control": "no-store" });
  }
  const comp = recompute(p); const cy = cycle(comp);
  const askRows = await c.env.DB.prepare("SELECT q, a FROM asks WHERE purchase_id = ? ORDER BY id").bind(pu.id).all<{ q: string; a: string }>();
  const asks = askRows.results ?? [];
  const sub = await c.env.DB.prepare("SELECT status FROM subscriptions WHERE purchase_id = ? AND status IN ('active','past_due')").bind(pu.id).first<{ status: string }>(); // past_due still shows the manage link
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

// Share your story: opt-in, one per purchase per day, copied to the admin inbox. Quoting only with can_quote.
const STORY_MAX = 2000;
app.post("/r/:tok/story", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.json({ error: "Not found" }, 404);
  const body = await c.req.json<{ text?: string; can_quote?: boolean }>().catch(() => ({} as { text?: string; can_quote?: boolean }));
  const text = String(body.text ?? "").trim();
  if (!text) return c.json({ error: "Write something first." }, 400);
  if (text.length > STORY_MAX) return c.json({ error: `That's over ${STORY_MAX.toLocaleString("en")} characters. Trim it a little?` }, 400);
  const canQuote = body.can_quote === true ? 1 : 0;
  const day = now().slice(0, 10);
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM stories WHERE purchase_id = ? AND created_at >= ?").bind(pu.id, day).first<{ n: number }>();
  if ((recent?.n ?? 0) > 0) return c.json({ error: "We've already got one from you today. Send another tomorrow, or reply to any of our emails." }, 429);
  await c.env.DB.prepare("INSERT INTO stories (purchase_id, created_at, text, can_quote) VALUES (?,?,?,?)").bind(pu.id, now(), text, canQuote).run();
  await log(c.env, "story", pu.id, { can_quote: !!canQuote, len: text.length });
  c.executionCtx.waitUntil((async () => {
    const p = await getPreview(c.env, pu.preview_id);
    const ok = await sendEmail(c.env, c.env.ADMIN_EMAIL || c.env.SUPPORT_EMAIL, `Rite story${canQuote ? " (can quote)" : ""}: ${pu.first_name ?? "no name"}, Saturn in ${p?.natal_sign ?? "?"}`,
      `${text}\n\n---\nFirst name: ${pu.first_name ?? "(none)"}\nCan quote (first name only): ${canQuote ? "YES" : "no"}\nReader email: ${pu.email}\nSaturn in ${p?.natal_sign ?? "?"}, born ${p?.birth_date.slice(0, 4) ?? "?"}\nReading: ${c.env.SITE_URL}/r/${pu.id}`);
    if (!ok) await log(c.env, "error", pu.id, { where: "story-email" });
  })());
  return c.json({ ok: true });
});

app.get("/r/:tok/status", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.json({ error: "not found" }, 404);
  return c.json({ ready: !!parseReport(pu.report_md), failed: pu.status === "failed", status: pu.status }, 200, { "cache-control": "no-store" });
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

// Narration: one MP3 per chapter, generated on first play with Workers AI (TTS_MODEL / TTS_VOICE, defaults in src/tts.ts)
// and cached in KV. The script's pause markup is synthesised in chunks with real silence spliced between them.
app.get("/r/:tok/audio/:ch{[0-9]+\\.mp3}", async (c) => {
  const ch = parseInt(c.req.param("ch"), 10);
  if (!(ch >= 0 && ch < CHAPTERS)) return c.notFound();
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.notFound();
  const r = parseReport(pu.report_md);
  if (!r) return c.text("Reading not written yet", 409);
  if (!c.env.AI && !c.env.ELEVENLABS_API_KEY) return c.text("Narration isn't available on this deployment", 503);
  const cfg = ttsConfig(c.env);
  const key = audioCacheKey(pu.id, ch, cfg);
  const hit = await c.env.CACHE.get(key, "arrayBuffer");
  if (hit) return c.body(hit, 200, { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400", "x-cache": "hit" });
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  const comp = recompute(p); const cy = cycle(comp);
  const script = narrationText(ch, comp, cy, r, pu.first_name);
  let out; let used = cfg;
  try { out = await synthesize(c.env.AI, script, cfg, { elevenKey: c.env.ELEVENLABS_API_KEY, concurrency: isEleven(cfg.model) ? 2 : 3 }); }
  catch (e) {
    await log(c.env, "error", pu.id, { where: "tts", ch, model: cfg.model, e: String(e) });
    if (!isEleven(cfg.model) || !c.env.AI) return c.text("Narration failed just now; try again in a moment.", 502);
    // ElevenLabs is down or out of credit: play the Workers AI voice now, don't cache it, so the next play retries ElevenLabs
    try { used = FALLBACK; out = await synthesize(c.env.AI, script, FALLBACK); }
    catch (e2) { await log(c.env, "error", pu.id, { where: "tts-fallback", ch, e: String(e2) }); return c.text("Narration failed just now; try again in a moment.", 502); }
  }
  const buf = out.bytes.slice().buffer as ArrayBuffer;
  if (used === cfg) c.executionCtx.waitUntil(c.env.CACHE.put(key, buf, { expirationTtl: 86400 * 365 }));
  await log(c.env, "narrated", pu.id, { ch, chars: out.chars, chunks: out.chunks, spliced: out.spliced, model: used.model, voice: used.voice, fallback: used !== cfg });
  return c.body(buf, 200, { "content-type": "audio/mpeg", "cache-control": used === cfg ? "private, max-age=86400" : "no-store", "x-cache": "miss" });
});

app.get("/r/:tok/calendar.ics", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok"));
  if (!pu) return c.notFound();
  const p = await getPreview(c.env, pu.preview_id);
  if (!p) return c.notFound();
  const comp = recompute(p); const cy = cycle(comp); const w = comp.window;
  const only = c.req.query("only");
  c.executionCtx.waitUntil(log(c.env, "calendar", pu.id, only ? { only } : undefined)); // day-3 follow-up skips readers who already did this
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
  if (session.metadata?.gift === "1") return fulfilGift(env, session);
  const existing = await env.DB.prepare("SELECT id FROM purchases WHERE stripe_session_id = ?").bind(session.id).first<{ id: string }>();
  if (existing) return existing.id;
  const pid = session.metadata?.preview_id; const tier = session.metadata?.tier ?? "notime";
  if (!pid) return null;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const firstName = session.custom_fields?.find((f) => f.key === "first_name")?.text?.value?.trim() || null;
  const tok = token();
  await env.DB.prepare(`INSERT INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, status) VALUES (?,?,?,?,?,?,?,?,?,'paid')`)
    .bind(tok, pid, now(), email, firstName, session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, session.amount_total ?? 0, tier).run();
  const pv = await getPreview(env, pid);
  await log(env, "paid", tok, { pid, tier, amount: session.amount_total, ref: pv?.ref ?? null, sign: pv?.natal_sign ?? null, return_number: pv?.return_number ?? null });
  return tok; // the reading is written in its own invocation (kickGenerate / first view) to stay under the per-request CPU cap
}

/** Ask the worker to write a reading in a fresh invocation (own CPU budget). Fire-and-forget. */
function kickGenerate(env: Env, ctx: { waitUntil(p: Promise<unknown>): void }, tok: string) {
  ctx.waitUntil((async () => {
    // Preferred: a fresh invocation via the worker's own URL. Cloudflare refuses some self-calls (error 1042 on
    // workers.dev), so if that fails for any reason we write the reading inline instead of silently doing nothing.
    try {
      const res = await fetch(`${env.SITE_URL}/internal/generate/${tok}`, { method: "POST", headers: { authorization: `Bearer ${env.STRIPE_WEBHOOK_SECRET}` } });
      if (res.ok) return;
      await log(env, "error", tok, { where: "kick-generate", status: res.status, body: (await res.text()).slice(0, 200) });
    } catch (e) { await log(env, "error", tok, { where: "kick-generate", e: String(e) }); }
    const lock = await env.DB.prepare("UPDATE purchases SET status='writing', delivered_at=? WHERE id=? AND (status='paid' OR status='failed' OR (status='writing' AND delivered_at < ?))").bind(now(), tok, new Date(Date.now() - 3 * 60000).toISOString()).run();
    if (lock.meta.changes) await generateReport(env, tok);
  })());
}

/** Gift purchase: no birth details yet. Store a code, email it to the buyer. Returns the code. */
async function fulfilGift(env: Env, session: Stripe.Checkout.Session): Promise<string | null> {
  const existing = await env.DB.prepare("SELECT code FROM gifts WHERE stripe_session_id = ?").bind(session.id).first<{ code: string }>();
  if (existing) return existing.code;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const from = session.custom_fields?.find((f) => f.key === "from_name")?.text?.value?.trim() || null;
  const message = session.custom_fields?.find((f) => f.key === "message")?.text?.value?.trim() || null;
  const code = giftCode();
  await env.DB.prepare("INSERT INTO gifts (code, created_at, buyer_email, buyer_name, message, stripe_session_id, stripe_payment_intent, amount_cents) VALUES (?,?,?,?,?,?,?,?)")
    .bind(code, now(), email, from, message, session.id, typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null, session.amount_total ?? 0).run();
  await log(env, "gift_paid", code, { amount: session.amount_total });
  if (email) {
    const m = giftEmail({ code, link: `${env.SITE_URL}/gift/${code}`, from });
    const ok = await sendEmail(env, email, m.subject, m.text);
    await log(env, ok ? "emailed" : "error", code, ok ? { gift: true } : { where: "gift-email" });
  }
  return code;
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
  await scheduleStageReminders(env, tok, comp);
  await scheduleFollowups(env, tok, p.tz);

  if (pu.email) {
    const common = {
      firstName: pu.first_name, sign: comp.sign, housePhrase: comp.house ? `, in your ${houseLabel(comp)}` : "",
      windowStart: fmtMonth(comp.window.windowStart), windowEnd: fmtMonth(comp.window.windowEnd),
      hitSentence: hitSentence(comp), reportUrl: `${env.SITE_URL}/r/${tok}`,
    };
    const gift = await env.DB.prepare("SELECT buyer_name FROM gifts WHERE redeemed_purchase_id=?").bind(tok).first<{ buyer_name: string | null }>();
    const m = gift ? giftDeliveryEmail({ ...common, from: gift.buyer_name })
      : deliveryEmail({ ...common, upsellUrl: `${env.SITE_URL}/r/${tok}#season`, monthlyPrice: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100),
        yearlyPrice: yearlyAllowed(comp.window.windowEnd, new Date()) ? Math.round(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) / 100) : null });
    const ok = await sendEmail(env, pu.email, m.subject, m.text);
    if (ok) { await env.DB.prepare("UPDATE purchases SET delivered_at=? WHERE id=?").bind(now(), tok).run(); await log(env, "emailed", tok); }
  }
}

// ---------- Saturn Season subscription ----------
/**
 * The two recurring Prices for Saturn Season, created once in the Stripe account and cached in KV. Checkout used inline
 * price_data before, but a subscription item can't be switched to inline price_data later, so plan switches need real Price ids.
 * Found again by lookup_key if the KV entry is lost (e.g. a new namespace), so nothing is created twice.
 */
const SEASON_PRODUCT_NAME = "Rite — Saturn Season";
const SEASON_PRICES_KEY = "stripe:season:prices";
type SeasonPrices = { month: string; year: string };
async function ensureSeasonPrices(env: Env): Promise<SeasonPrices> {
  const cached = await env.CACHE.get<SeasonPrices>(SEASON_PRICES_KEY, "json");
  if (cached?.month && cached?.year) return cached;
  const s = stripe(env);
  const want: Record<SeasonPlan, number> = { month: parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10), year: parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) };
  const live = (env.STRIPE_SECRET_KEY || "").startsWith("sk_live_") ? "live" : "test";
  const keyFor = (plan: SeasonPlan) => `rite_season_${plan}_${want[plan]}_${env.CURRENCY}_${live}`;
  const out: Partial<SeasonPrices> = {};
  const found = await s.prices.list({ lookup_keys: [keyFor("month"), keyFor("year")], active: true, limit: 2 });
  for (const p of found.data) { if (p.lookup_key === keyFor("month")) out.month = p.id; if (p.lookup_key === keyFor("year")) out.year = p.id; }
  if (!out.month || !out.year) {
    const productId = found.data[0] ? (typeof found.data[0].product === "string" ? found.data[0].product : found.data[0].product.id)
      : (await s.products.create({ name: SEASON_PRODUCT_NAME, description: "A note every Monday until your Saturn return window closes. Stops itself then." })).id;
    for (const plan of ["month", "year"] as SeasonPlan[]) {
      if (out[plan]) continue;
      const p = await s.prices.create({ product: productId, currency: env.CURRENCY, unit_amount: want[plan], recurring: { interval: plan }, lookup_key: keyFor(plan), nickname: `Saturn Season ${plan}ly` });
      out[plan] = p.id;
    }
  }
  const prices = out as SeasonPrices;
  await env.CACHE.put(SEASON_PRICES_KEY, JSON.stringify(prices));
  return prices;
}

app.post("/season/:tok", async (c) => {
  const pu = await getPurchase(c.env, c.req.param("tok")); if (!pu) return c.notFound();
  const s = stripe(c.env);
  const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
  let plan: SeasonPlan = String(form.plan ?? "") === "year" ? "year" : "month";
  const pv = await getPreview(c.env, pu.preview_id); if (!pv) return c.notFound();
  const w = recompute(pv).window;
  if (!seasonAvailable(w.windowStart, w.windowEnd)) return c.redirect(`/r/${pu.id}#season`, 303); // nothing to send yet / window closed
  if (plan === "year" && !yearlyAllowed(w.windowEnd)) plan = "month";
  const prices = await ensureSeasonPrices(c.env);
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer_email: pu.email || undefined,
    line_items: [{ quantity: 1, price: prices[plan] }],
    allow_promotion_codes: true,
    metadata: { purchase_id: pu.id, plan },
    subscription_data: { metadata: { purchase_id: pu.id, plan } },
    success_url: `${c.env.SITE_URL}/season/manage/${pu.id}?ok=started`,
    cancel_url: `${c.env.SITE_URL}/r/${pu.id}`,
  });
  return c.redirect(session.url!, 303);
});

interface SubRow { id: string; purchase_id: string; status: string; plan: string | null; last_sent_at: string | null }
async function seasonManage(env: Env, tok: string, flash?: string) {
  const pu = await getPurchase(env, tok); if (!pu) return null;
  const p = await getPreview(env, pu.preview_id); if (!p) return null;
  const sub = await env.DB.prepare("SELECT id, purchase_id, status, plan, last_sent_at FROM subscriptions WHERE purchase_id = ? ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'past_due' THEN 1 ELSE 2 END, created_at DESC LIMIT 1").bind(pu.id).first<SubRow>();
  const comp = recompute(p);
  const today = new Date();
  const status = (sub?.status ?? "none") as SeasonManageData["status"];
  const nn = nextNoteAfterLast(p.tz, today, sub && (sub.status === "active" || sub.status === "past_due") ? sub.last_sent_at : null);
  const d: SeasonManageData = {
    token: pu.id, status: (["active", "past_due", "canceled", "complete"] as string[]).includes(status) ? status : "none",
    plan: sub?.plan === "year" ? "year" : sub?.plan === "month" ? "month" : null,
    nextNote: new Intl.DateTimeFormat("en-GB", { timeZone: p.tz, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(nn),
    tz: p.tz, windowEnd: fmtDay(comp.window.windowEnd), yearlyAllowed: yearlyAllowed(comp.window.windowEnd, today),
    monthlyPrice: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100), yearlyPrice: Math.round(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) / 100),
    flash: flash === "switched" || flash === "canceled" || flash === "error" || flash === "started" ? flash : null,
  };
  return { d, sub };
}

app.get("/season/manage/:tok", async (c) => {
  const m = await seasonManage(c.env, c.req.param("tok"), c.req.query("ok")); if (!m) return c.notFound();
  const refund = parseInt(c.req.query("refund") ?? "", 10);
  if (m.d.flash === "canceled" && refund > 0 && refund <= parseInt(c.env.PRICE_SEASON_YEARLY_CENTS, 10)) m.d.refundCents = refund;
  return c.html(seasonManagePage({ siteUrl: c.env.SITE_URL, d: m.d, supportEmail: c.env.SUPPORT_EMAIL }), 200, { "cache-control": "no-store" });
});

app.post("/season/plan/:tok", async (c) => {
  const tok = c.req.param("tok");
  const m = await seasonManage(c.env, tok); if (!m) return c.notFound();
  const form = await c.req.parseBody().catch(() => ({} as Record<string, unknown>));
  const plan: SeasonPlan = String(form.plan ?? "") === "year" ? "year" : "month";
  if (!m.sub || m.d.status !== "active") return c.redirect(`/season/manage/${tok}`);
  if (plan === m.d.plan) return c.redirect(`/season/manage/${tok}`);
  if (plan === "year" && !m.d.yearlyAllowed) return c.redirect(`/season/manage/${tok}`);
  try {
    const s = stripe(c.env);
    const prices = await ensureSeasonPrices(c.env);
    const current = await s.subscriptions.retrieve(m.sub.id);
    const item = current.items.data[0];
    if (!item) throw new Error("subscription has no items");
    await s.subscriptions.update(m.sub.id, { items: [{ id: item.id, price: prices[plan] }], proration_behavior: "create_prorations", metadata: { purchase_id: tok, plan } });
    await c.env.DB.prepare("UPDATE subscriptions SET plan=? WHERE id=?").bind(plan, m.sub.id).run();
    await log(c.env, "season_plan", tok, { from: m.d.plan, to: plan });
    return c.redirect(`/season/manage/${tok}?ok=switched`);
  } catch (e) {
    await log(c.env, "error", tok, { where: "season-plan", e: String(e) });
    return c.redirect(`/season/manage/${tok}?ok=error`);
  }
});

app.post("/season/cancel/:tok", async (c) => {
  const tok = c.req.param("tok");
  const sub = await c.env.DB.prepare("SELECT id, plan FROM subscriptions WHERE purchase_id = ? AND status IN ('active','past_due')").bind(tok).first<{ id: string; plan: string | null }>();
  if (!sub) return c.redirect(`/season/manage/${tok}`);
  // Stopping ends it now (no further charges, no further notes); a yearly plan gets its unused full months back.
  const { canceled, cents } = await closeSeasonSubscription(c.env, { sub_id: sub.id, plan: sub.plan, purchase_id: tok }, new Date());
  if (!canceled) return c.redirect(`/season/manage/${tok}?ok=error`); // logged inside; nothing changed
  await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(sub.id).run();
  await log(c.env, "season_cancel", tok, { refunded_cents: cents });
  return c.redirect(`/season/manage/${tok}?ok=canceled${cents ? `&refund=${cents}` : ""}`);
});

// Old stop link (in notes already sent): the manage page now does this with a confirmation.
app.get("/season/stop/:tok", (c) => c.redirect(`/season/manage/${c.req.param("tok")}`, 301));

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
      const tok = await fulfil(c.env, session);
      if (tok && session.metadata?.gift !== "1") kickGenerate(c.env, c.executionCtx, tok);
    } else if (session.mode === "subscription" && session.metadata?.purchase_id && session.subscription) {
      const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
      const purchaseId = session.metadata.purchase_id;
      const plan = session.metadata.plan === "year" ? "year" : "month";
      // OR IGNORE, not OR REPLACE: a redelivered event must not reset last_sent_at (a second welcome note) or revive a cancelled row
      const ins = await c.env.DB.prepare("INSERT OR IGNORE INTO subscriptions (id, purchase_id, created_at, status, plan) VALUES (?,?,?,'active',?)").bind(subId, purchaseId, now(), plan).run();
      if (!ins.meta.changes) return c.text("ok");
      await log(c.env, "season_start", purchaseId, { plan });
      // Welcome note: the first Saturn Season note goes out now, not next Monday. sendSeasonNote sets last_sent_at, so the
      // Monday cron skips this subscriber for the next six days.
      c.executionCtx.waitUntil((async () => {
        try {
          const r = await seasonRow(c.env, purchaseId);
          if (r) { const res = await sendSeasonNote(c.env, r, new Date()); await log(c.env, "season_welcome", purchaseId, { result: res }); }
        } catch (e) { await log(c.env, "error", purchaseId, { where: "season-welcome", e: String(e) }); }
      })());
    }
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=? AND status IN ('active','past_due')").bind(sub.id).run(); // 'complete' stays 'complete' when our own cancel echoes back
  } else if (event.type === "invoice.payment_failed" || event.type === "invoice.paid" || event.type === "invoice.payment_succeeded") {
    // Pause the notes while a renewal is unpaid; resume when Stripe's retry (or a card update) goes through.
    const inv = event.data.object as Stripe.Invoice;
    const sd = inv.parent?.subscription_details?.subscription;
    const subId = typeof sd === "string" ? sd : sd?.id;
    if (subId) {
      if (event.type === "invoice.payment_failed") {
        const r = await c.env.DB.prepare("UPDATE subscriptions SET status='past_due' WHERE id=? AND status='active'").bind(subId).run();
        if (r.meta.changes) await log(c.env, "season_past_due", subId, { invoice: inv.id, attempt: inv.attempt_count });
      } else {
        const r = await c.env.DB.prepare("UPDATE subscriptions SET status='active' WHERE id=? AND status='past_due'").bind(subId).run();
        if (r.meta.changes) await log(c.env, "season_resumed", subId, { invoice: inv.id });
      }
    }
  } else if (event.type === "charge.refunded") {
    const ch = event.data.object as Stripe.Charge;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi) {
      // Readings and gifts are only ever refunded in full; a partial refund on one is logged and changes nothing.
      const pu = await c.env.DB.prepare("SELECT id FROM purchases WHERE stripe_payment_intent=?").bind(pi).first<{ id: string }>();
      const gi = await c.env.DB.prepare("SELECT code FROM gifts WHERE stripe_payment_intent=?").bind(pi).first<{ code: string }>();
      if (pu || gi) {
        if (ch.refunded) {
          await c.env.DB.prepare("UPDATE purchases SET status='refunded' WHERE stripe_payment_intent=?").bind(pi).run();
          // a refunded, unredeemed gift code stops working (same marker as /admin/refund); a redeemed one keeps its reading
          await c.env.DB.prepare("UPDATE gifts SET redeemed_at='refunded' WHERE stripe_payment_intent=? AND redeemed_at IS NULL").bind(pi).run();
        } else await log(c.env, "partial_refund_ignored", pu?.id ?? gi?.code ?? null, { pi, amount_refunded: ch.amount_refunded });
      } else {
        // Not a reading or gift: maybe a Saturn Season invoice. Any refund on one stops the subscription (no more charges or
        // notes). Our own unused-months refund lands here too, after the row is already canceled/complete, and is a no-op.
        try {
          const ips = await stripe(c.env).invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, expand: ["data.invoice"], limit: 1 });
          const inv = ips.data[0]?.invoice;
          const subRef = inv && typeof inv !== "string" && "parent" in inv ? inv.parent?.subscription_details?.subscription : undefined;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          const row = subId ? await c.env.DB.prepare("SELECT purchase_id FROM subscriptions WHERE id=? AND status IN ('active','past_due')").bind(subId).first<{ purchase_id: string }>() : null;
          if (subId && row) {
            // our own unused-months refund can arrive here before the row is updated; the sub is already canceled then
            try { const live = await stripe(c.env).subscriptions.retrieve(subId); if (live.status !== "canceled") await stripe(c.env).subscriptions.cancel(subId); }
            catch (e) { await log(c.env, "error", row.purchase_id, { where: "season-refund-cancel", e: String(e) }); }
            await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(subId).run();
            await log(c.env, "season_cancel", row.purchase_id, { via: "refund", amount_refunded: ch.amount_refunded });
          }
        } catch (e) { await log(c.env, "error", null, { where: "charge-refunded-season", pi, e: String(e) }); }
      }
    }
  }
  return c.text("ok");
});

// ---------- refund (used by the support inbox automation; protect with the webhook secret as a bearer) ----------
app.post("/admin/refund", async (c) => {
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  const { email, season } = await c.req.json<{ email: string; season?: boolean }>();
  if (season) {
    // Stop Saturn Season now and refund the unused full months of a yearly plan (monthly: stops, nothing to refund).
    const sub = await c.env.DB.prepare("SELECT s.id, s.plan, s.purchase_id FROM subscriptions s JOIN purchases p ON p.id = s.purchase_id WHERE p.email=? AND s.status IN ('active','past_due') ORDER BY s.created_at DESC LIMIT 1").bind(email).first<{ id: string; plan: string | null; purchase_id: string }>();
    if (!sub) return c.json({ refunded: false, season: true });
    const { canceled, cents } = await closeSeasonSubscription(c.env, { sub_id: sub.id, plan: sub.plan, purchase_id: sub.purchase_id }, new Date());
    if (!canceled) return c.json({ refunded: false, season: true, canceled: false, error: "stripe cancel failed (see /admin errors)" }, 502);
    await c.env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(sub.id).run();
    await log(c.env, "season_cancel", sub.purchase_id, { via: "admin", refunded_cents: cents });
    return c.json({ refunded: cents > 0, season: true, canceled: true, cents });
  }
  const pu = await c.env.DB.prepare("SELECT id, stripe_payment_intent FROM purchases WHERE email=? AND status IN ('paid','writing','generated','failed') ORDER BY created_at DESC LIMIT 1").bind(email).first<{ id: string; stripe_payment_intent: string }>();
  if (!pu?.stripe_payment_intent) {
    // maybe a gift buyer
    const g = await c.env.DB.prepare("SELECT code, stripe_payment_intent FROM gifts WHERE buyer_email=? AND redeemed_at IS NULL AND stripe_payment_intent IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(email).first<{ code: string; stripe_payment_intent: string }>();
    if (!g) return c.json({ refunded: false });
    await stripe(c.env).refunds.create({ payment_intent: g.stripe_payment_intent });
    await c.env.DB.prepare("UPDATE gifts SET redeemed_at='refunded' WHERE code=?").bind(g.code).run();
    await log(c.env, "refund", g.code, { gift: true });
    return c.json({ refunded: true, gift: true });
  }
  await stripe(c.env).refunds.create({ payment_intent: pu.stripe_payment_intent });
  await c.env.DB.prepare("UPDATE purchases SET status='refunded' WHERE id=?").bind(pu.id).run();
  await log(c.env, "refund", pu.id);
  return c.json({ refunded: true });
});

// ---------- health + stats ----------
app.get("/health", (c) => c.json({ ok: true, saturn: saturnLongitude(new Date()), at: now() }));
app.get("/admin/stats", async (c) => {
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  const days = Math.min(90, Math.max(1, parseInt(c.req.query("days") ?? "30", 10)));
  return c.json(await adminStats(c.env.DB, days));
});
// HTML view of /admin/stats + recent errors, stories and email queues. Bearer header or ?key= (same secret); 404 otherwise.
app.get("/admin", async (c) => {
  if (!c.env.ADMIN_KEY || !adminAuthorized(c.env.ADMIN_KEY, c.req.header("authorization"), c.req.query("key"))) return c.notFound(); // ADMIN_KEY only
  const [stats, extras] = await Promise.all([adminStats(c.env.DB, adminDays(c.req.query("days"))), adminExtras(c.env.DB)]);
  return c.html(adminPage({ stats, extras, currency: c.env.CURRENCY, key: c.req.query("key"), generatedAt: now() }), 200,
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});

// Voice audition (GET /admin/voice) and the TTS endpoint behind it, which is also the content engine's VO endpoint
// (POST /admin/tts). ADMIN_KEY only (bearer or ?key=), plain 404 otherwise, like GET /admin. Same pipeline as the reading.
const ADMIN_HDRS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
const adminKeyOk = (env: Env, auth: string | undefined, key: string | undefined) => !!env.ADMIN_KEY && adminAuthorized(env.ADMIN_KEY, auth, key);
app.get("/admin/voice", (c) => {
  if (!adminKeyOk(c.env, c.req.header("authorization"), c.req.query("key"))) return c.notFound();
  return c.html(voicePage({ key: c.req.query("key"), current: ttsConfig(c.env), ai: !!c.env.AI, models: availableModels(c.env) }), 200, ADMIN_HDRS);
});
app.post("/admin/tts", async (c) => {
  if (!adminKeyOk(c.env, c.req.header("authorization"), c.req.query("key"))) return c.notFound();
  const b = await c.req.json<{ text?: unknown; model?: unknown; voice?: unknown }>().catch(() => null);
  const text = typeof b?.text === "string" ? b.text.trim() : "";
  if (!text) return c.json({ error: "text is required" }, 400, ADMIN_HDRS);
  if (text.length > MAX_ADMIN_CHARS) return c.json({ error: `text is over ${MAX_ADMIN_CHARS} characters` }, 413, ADMIN_HDRS);
  const cfg = ttsConfig(c.env, { model: b?.model, voice: b?.voice });
  if (!isEleven(cfg.model) && !c.env.AI) return c.json({ error: "no AI binding on this deployment (deploy, or wrangler dev --remote)" }, 503, ADMIN_HDRS);
  try {
    const out = await synthesize(c.env.AI, text, cfg, { elevenKey: c.env.ELEVENLABS_API_KEY, concurrency: isEleven(cfg.model) ? 2 : 3 });
    return c.body(out.bytes.slice().buffer as ArrayBuffer, 200, { ...ADMIN_HDRS, "content-type": "audio/mpeg", "x-tts-model": cfg.model, "x-tts-voice": cfg.voice,
      "x-tts-chunks": String(out.chunks), "x-tts-spliced": String(out.spliced), "x-tts-duration-ms": String(out.durationMs) });
  } catch (e) { return c.json({ error: String(e) }, 502, ADMIN_HDRS); }
});

// ---------- cron: Saturn Season ----------
type SeasonRow = PreviewRow & { sub_id: string; purchase_id: string; last_sent_at: string | null; plan: string | null; email: string; first_name: string | null };

/** The row sendSeasonNote needs for one purchase, joined with its active subscription if any. */
async function seasonRow(env: Env, tok: string) {
  return env.DB.prepare(`SELECT COALESCE(s.id, 'none') sub_id, p.id purchase_id, s.last_sent_at, s.plan, p.email, p.first_name, pv.* FROM purchases p JOIN previews pv ON pv.id = p.preview_id LEFT JOIN subscriptions s ON s.purchase_id = p.id AND s.status='active' WHERE p.id = ?`).bind(tok).first<SeasonRow>();
}

async function runSeason(env: Env) {
  const subs = await env.DB.prepare(`SELECT s.id sub_id, s.purchase_id, s.last_sent_at, s.plan, p.email, p.first_name, pv.* FROM subscriptions s JOIN purchases p ON p.id = s.purchase_id JOIN previews pv ON pv.id = p.preview_id WHERE s.status='active'`).all<SeasonRow>();
  const today = new Date();
  for (const r of subs.results) {
    // Send Mondays at 07:00 local, once.
    const localDow = new Intl.DateTimeFormat("en-US", { timeZone: r.tz, weekday: "short" }).format(today);
    if (localDow !== "Mon" || localHour(r.tz, today) !== 7) continue;
    if (r.last_sent_at && today.getTime() - Date.parse(r.last_sent_at) < 6 * 86400000) continue;
    await sendSeasonNote(env, r, today);
  }
}

/** One weekly Saturn Season note (or the season-complete email + Stripe cancel once the window has closed). */
async function sendSeasonNote(env: Env, r: SeasonRow, today = new Date(), to?: string): Promise<string> {
  const comp = recompute(r, today);
  const o = comp.todayOrb;
  const dest = to ?? r.email;
  if (comp.phase === "complete") { // Saturn has left the natal sign: the window everyone was shown is closed
    const ahead = cycle(comp, today).ahead[0];
    const m = seasonCompleteEmail({ firstName: r.first_name, readingUrl: `${env.SITE_URL}/r/${r.purchase_id}`, nextAge: ahead?.ageApprox ?? null });
    await sendEmail(env, dest, m.subject, m.text);
    if (!to) {
      await closeSeasonSubscription(env, r, today);
      await env.DB.prepare("UPDATE subscriptions SET status='complete', last_sent_at=? WHERE id=?").bind(now(), r.sub_id).run();
      await log(env, "season_complete", r.purchase_id);
    }
    return "complete";
  }
  // Everything dated is decided by code (noteFacts), not by the model: the 30-day list, the chapter link, and the list of
  // dates the model is allowed to repeat. If the model invents a date twice, the note goes out with the code-only parts.
  const f = noteFacts(comp, today);
  const st = comp.nextStation;
  const todayIso = today.toISOString().slice(0, 10);
  const inputs: SeasonInputs = {
    sign: comp.sign, house: comp.house, orb: f.orb, direction: o < 0 ? "applying" : "separating", retrograde: comp.retrograde,
    next_hit: f.nextHit ? fmtDay(f.nextHit) : null, next_station: st ? `${fmtDay(st.date)} (${st.to})` : null, phase: comp.phase, season_phase: f.phase,
    coming_up: f.upcoming.map((u) => ({ date: fmtDay(u.date), what: u.label })), reread_chapter: f.reread.name, today: fmtDay(todayIso),
  };
  const allowed = f.allowed;
  let body = "";
  for (let attempt = 0; attempt < 2 && !body; attempt++) {
    try {
      const out = (await writeSeason(env, inputs)).trim();
      if (datesAreGrounded(out, allowed)) body = out;
      else await log(env, "error", r.purchase_id, { where: "season-dates-ungrounded", attempt });
    } catch (e) { await log(env, "error", r.purchase_id, { where: "season-llm", e: String(e), attempt }); }
  }
  if (!body) body = seasonFallbackBody(f.phase, comp.sign); // never send nothing
  const m = seasonEmail({
    firstName: r.first_name, transitDeg: f.transitDeg, transitSign: f.transitSign,
    orb: f.orbText, dir: f.dir, motionSentence: f.motion, body,
    comingUp: comingUpText(f.upcoming), rereadName: f.reread.name, rereadUrl: `${env.SITE_URL}/r/${r.purchase_id}${f.reread.hash}`,
    manageUrl: `${env.SITE_URL}/season/manage/${r.purchase_id}`, welcome: !r.last_sent_at && !to,
  });
  const ok = await sendEmail(env, dest, m.subject, m.text);
  // Keep every note's text, delivered or not: support can see what someone was sent, and Season can be dogfooded before
  // email delivers (GET /admin/season/:tok/notes).
  await log(env, "season_note", r.purchase_id, { subject: m.subject, text: m.text, delivered: ok, forced: !!to });
  if (ok && !to) {
    await env.DB.prepare("UPDATE subscriptions SET last_sent_at=? WHERE id=?").bind(now(), r.sub_id).run();
    await log(env, "season_sent", r.purchase_id);
  }
  return ok ? "sent" : "email-failed";
}

/**
 * End a Season subscription now: cancel it in Stripe and, on a yearly plan, refund the full months that were paid for but
 * won't be used. Used when the window closes (cron), when the subscriber stops it, and for an admin refund. Returns the cents
 * refunded. Every Stripe call is caught and logged; callers (the cron especially) must never throw.
 */
async function closeSeasonSubscription(env: Env, r: Pick<SeasonRow, "sub_id" | "plan" | "purchase_id">, today: Date): Promise<{ canceled: boolean; cents: number }> {
  if (r.sub_id === "none") return { canceled: false, cents: 0 };
  let canceled = false;
  const s = stripe(env);
  let periodEnd: number | null = null;
  try {
    const sub = await s.subscriptions.retrieve(r.sub_id);
    periodEnd = sub.items.data[0]?.current_period_end ?? null; // API 2025-03+: the period lives on the item
  } catch (e) { await log(env, "error", r.purchase_id, { where: "season-close-retrieve", e: String(e) }); }
  try { await s.subscriptions.cancel(r.sub_id); canceled = true; }
  catch (e) { await log(env, "error", r.purchase_id, { where: "season-close-cancel", e: String(e) }); }
  if (r.plan !== "year") return { canceled, cents: 0 };
  try {
    const unused = periodEnd ? unusedMonths(today, new Date(periodEnd * 1000)) : 0;
    let cents = yearlyRefundCents(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10), unused);
    if (cents <= 0) { await log(env, "season_refund", r.purchase_id, { amount: 0, unused, reason: "no unused months" }); return { canceled, cents: 0 }; }
    const inv = await s.invoices.list({ subscription: r.sub_id, status: "paid", limit: 1, expand: ["data.payments"] });
    const invoice = inv.data[0];
    const pay = invoice?.payments?.data.find((x) => x.payment?.payment_intent);
    const pi = pay ? (typeof pay.payment.payment_intent === "string" ? pay.payment.payment_intent : pay.payment.payment_intent?.id) : undefined;
    if (!invoice || !pi) { await log(env, "error", r.purchase_id, { where: "season-refund", e: "no paid invoice / payment intent", unused, cents }); return { canceled, cents: 0 }; }
    cents = Math.min(cents, invoice.amount_paid); // a promo code may have made the year cheaper than list
    if (cents <= 0) { await log(env, "season_refund", r.purchase_id, { amount: 0, unused, reason: "nothing paid" }); return { canceled, cents: 0 }; }
    const rf = await s.refunds.create({ payment_intent: pi, amount: cents });
    await log(env, "season_refund", r.purchase_id, { amount: cents, unused, refund: rf.id, invoice: invoice.id });
    return { canceled, cents };
  } catch (e) { await log(env, "error", r.purchase_id, { where: "season-refund", e: String(e) }); }
  return { canceled, cents: 0 };
}

/** Daily digest of errors to the admin inbox (08:00 Brisbane), only when there is something to say. */
async function runCleanup(env: Env) {
  if (localHour("Australia/Brisbane", new Date()) !== 4) return;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const r = await env.DB.prepare("DELETE FROM previews WHERE created_at < ? AND id NOT IN (SELECT preview_id FROM purchases) AND id NOT IN (SELECT preview_id FROM reminders)").bind(cutoff).run();
  if (r.meta.changes) await log(env, "cleanup", null, { previews: r.meta.changes });
}

async function runErrorDigest(env: Env) {
  const today = new Date();
  if (localHour("Australia/Brisbane", today) !== 8) return;
  const since = new Date(today.getTime() - 24 * 3600000).toISOString();
  const rows = await env.DB.prepare("SELECT at, ref, detail FROM events WHERE kind='error' AND at > ? ORDER BY at DESC LIMIT 50").bind(since).all<{ at: string; ref: string | null; detail: string | null }>();
  const counts = await env.DB.prepare("SELECT kind, COUNT(*) n FROM events WHERE at > ? GROUP BY kind ORDER BY n DESC").bind(since).all<{ kind: string; n: number }>();
  if (!rows.results.length) return;
  const text = `Rite, last 24h\n\n${counts.results.map((c) => `${c.kind}: ${c.n}`).join("\n")}\n\nErrors (${rows.results.length}):\n${rows.results.map((r) => `${r.at.slice(0, 16)}  ${r.ref ?? "-"}  ${(r.detail ?? "").slice(0, 220)}`).join("\n")}\n\n${env.SITE_URL}/admin/stats`;
  await sendEmail(env, env.ADMIN_EMAIL || env.SUPPORT_EMAIL, `Rite: ${rows.results.length} error${rows.results.length === 1 ? "" : "s"} in the last 24h`, text);
}

/** One email a week before each stage opens (contact, integration, window close, then the squares/opposition ahead). Idempotent. */
async function scheduleStageReminders(env: Env, tok: string, comp: Computed) {
  const today = now().slice(0, 10);
  const cy = cycle(comp);
  const stmts = cy.stageEvents.filter((e) => e.date > today).map((e) => {
    const sendOn = new Date(Date.parse(e.date) - 7 * 86400000).toISOString().slice(0, 10);
    return env.DB.prepare("INSERT OR IGNORE INTO stage_reminders (purchase_id, stage_key, label, on_date, send_on) VALUES (?,?,?,?,?)").bind(tok, e.key, e.label, e.date, sendOn);
  });
  if (stmts.length) await env.DB.batch(stmts);
}

/** Day-3 and day-10 follow-ups (docs/emails.md §2, §3), one row each, keyed on the reader's local date. Idempotent. */
async function scheduleFollowups(env: Env, tok: string, tz: string) {
  const stmts = followupSchedule(tz, new Date()).map((f) => env.DB.prepare("INSERT OR IGNORE INTO followups (purchase_id, kind, send_on) VALUES (?,?,?)").bind(tok, f.kind, f.sendOn));
  await env.DB.batch(stmts);
}

/**
 * Sends due follow-ups. Each row is claimed (sent_at set) before the email goes out, so overlapping runs can't double-send;
 * a failed send releases the claim for the next hour. Skips are recorded as sent_at = 'skipped:<reason>', so they never retry.
 */
async function runFollowups(env: Env) {
  const nowD = new Date();
  const horizon = new Date(nowD.getTime() + 86400000).toISOString().slice(0, 10); // send_on is a local date; zones run up to a day ahead of UTC
  type Row = PreviewRow & { purchase_id: string; kind: FollowupKind; send_on: string; email: string; first_name: string | null; pstatus: string; subscribed: number; calendar: number };
  const due = await env.DB.prepare(`SELECT pv.*, f.purchase_id, f.kind, f.send_on, p.email, p.first_name, p.status AS pstatus,
      EXISTS (SELECT 1 FROM subscriptions s WHERE s.purchase_id = f.purchase_id AND s.status IN ('active','past_due')) AS subscribed,
      EXISTS (SELECT 1 FROM events e WHERE e.kind = 'calendar' AND e.ref = f.purchase_id) AS calendar
    FROM followups f JOIN purchases p ON p.id = f.purchase_id JOIN previews pv ON pv.id = p.preview_id
    WHERE f.sent_at IS NULL AND f.send_on <= ? LIMIT 200`).bind(horizon).all<Row>();
  for (const r of due.results) {
    try {
      const when = followupDue(r.send_on, r.tz, nowD);
      if (when === "wait") continue;
      const mark = (v: string | null, cond = "sent_at IS NULL") => env.DB.prepare(`UPDATE followups SET sent_at=? WHERE purchase_id=? AND kind=? AND ${cond}`).bind(v, r.purchase_id, r.kind).run();
      if (when === "expired") { await mark("expired"); continue; }
      const comp = recompute(r, nowD);
      const skip = followupSkip({ kind: r.kind, today: nowD.toISOString().slice(0, 10), email: r.email, purchaseStatus: r.pstatus, windowEnd: comp.window.windowEnd, subscribed: !!r.subscribed, calendarAdded: !!r.calendar });
      if (skip) { await mark(`skipped:${skip}`); await log(env, "followup_skipped", r.purchase_id, { kind: r.kind, reason: skip }); continue; }
      const claimed = now();
      if (!(await mark(claimed)).meta.changes) continue; // another run got it
      const readingUrl = `${env.SITE_URL}/r/${r.purchase_id}`;
      let m: { subject: string; text: string };
      const stop = stopUrl(env.SITE_URL, r.purchase_id);
      if (r.kind === "day3") m = day3Email({ firstName: r.first_name, readingUrl, stopUrl: stop });
      else {
        // The note they'd have got this Monday (07:00 local), built by code only: no model call in a nudge.
        const monday = localToUtc(lastMondayLocal(r.tz, nowD), "07:00", r.tz);
        const sn = sampleNote(recompute(r, monday), monday);
        m = day10Email({ firstName: r.first_name, windowEnd: fmtDay(comp.window.windowEnd), position: sn.position, body: sn.body, comingUp: sn.comingUp, seasonUrl: `${readingUrl}#season`,
          monthlyPrice: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100), yearlyPrice: yearlyAllowed(comp.window.windowEnd, nowD) ? Math.round(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) / 100) : null, stopUrl: stop });
      }
      const ok = await sendEmail(env, r.email, m.subject, m.text, undefined, { unsubscribe: stop });
      if (ok) await log(env, "followup_sent", r.purchase_id, { kind: r.kind });
      else await env.DB.prepare("UPDATE followups SET sent_at=NULL WHERE purchase_id=? AND kind=? AND sent_at=?").bind(r.purchase_id, r.kind, claimed).run(); // retry next hour
    } catch (e) { await log(env, "error", r.purchase_id, { where: "followup", kind: r.kind, e: String(e) }); }
  }
}

async function runStageReminders(env: Env) {
  const today = now().slice(0, 10);
  const due = await env.DB.prepare(`SELECT r.id, r.purchase_id, r.stage_key, r.label, r.on_date, p.email, p.first_name, pv.window_end,
      EXISTS (SELECT 1 FROM subscriptions s WHERE s.purchase_id = r.purchase_id AND s.status IN ('active','past_due')) AS subscribed
    FROM stage_reminders r JOIN purchases p ON p.id = r.purchase_id JOIN previews pv ON pv.id = p.preview_id
    WHERE r.sent_at IS NULL AND r.send_on <= ? AND r.on_date >= ? AND p.status != 'refunded'`).bind(today, today).all<{ id: number; purchase_id: string; stage_key: string; label: string; on_date: string; email: string; first_name: string | null; window_end: string; subscribed: number }>();
  for (const r of due.results) {
    if (!r.email) continue;
    const subscribed = !!r.subscribed;
    const m = stageReminderEmail({ firstName: r.first_name, label: r.label, onDate: fmtDay(r.on_date), readingUrl: `${env.SITE_URL}/r/${r.purchase_id}`, stageKey: r.stage_key,
      subscribed, seasonUrl: stageSeasonLine(subscribed, r.window_end, r.on_date) ? `${env.SITE_URL}/r/${r.purchase_id}#season` : null, monthlyPrice: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100), stopUrl: stopUrl(env.SITE_URL, r.purchase_id) });
    const ok = await sendEmail(env, r.email, m.subject, m.text, undefined, { unsubscribe: stopUrl(env.SITE_URL, r.purchase_id) });
    if (ok) { await env.DB.prepare("UPDATE stage_reminders SET sent_at=? WHERE id=?").bind(now(), r.id).run(); await log(env, "stage_reminder", r.purchase_id, { stage: r.stage_key }); }
  }
  // anything whose date has passed unsent (e.g. a cron outage) is marked so it never fires late
  await env.DB.prepare("UPDATE stage_reminders SET sent_at='skipped' WHERE sent_at IS NULL AND on_date < ?").bind(today).run();
}

async function runReminders(env: Env) {
  const today = now().slice(0, 10);
  const due = await env.DB.prepare("SELECT r.id, r.email, r.hit_date, r.preview_id, p.natal_sign, p.window_start, p.window_end FROM reminders r JOIN previews p ON p.id = r.preview_id WHERE r.sent_at IS NULL AND r.send_on <= ?").bind(today).all<{ id: number; email: string; hit_date: string; preview_id: string; natal_sign: string; window_start: string; window_end: string }>();
  for (const r of due.results) {
    if (r.hit_date === r.window_start) { // "tell me when my window opens" (stored on the window-open date, sent 30 days before)
      const ok = await sendEmail(env, r.email, `Your Saturn return window opens on ${fmtDay(r.window_start)}`,
`Hi,

Your Saturn return window opens on ${fmtDay(r.window_start)}: Saturn enters ${r.natal_sign}, the sign it held when you were born, and stays until ${fmtMonth(r.window_end)}. The pressure usually starts before anything is exact, so a month out is the time to decide what this return is going to test.

Your preview, with the full window and the pass dates: ${env.SITE_URL}/p/${r.preview_id}
The full reading dates every pass and tells you what to build before each one: ${env.SITE_URL}/p/${r.preview_id}#reading

— Rite

You asked for this one email. Stop reminders for this preview: ${stopUrl(env.SITE_URL, r.preview_id)}`, undefined, { unsubscribe: stopUrl(env.SITE_URL, r.preview_id) });
      if (ok) await env.DB.prepare("UPDATE reminders SET sent_at=? WHERE id=?").bind(now(), r.id).run();
      continue;
    }
    const ok = await sendEmail(env, r.email, `Your Saturn pass is a week away: ${fmtDay(r.hit_date)}`,
`Hi,

A week from now, on ${fmtDay(r.hit_date)}, Saturn crosses the degree it held when you were born. Saturn in ${r.natal_sign}.

This is the part people mean when they say Saturn return. The work is deciding, not waiting to see.

Your preview, with the full window: ${env.SITE_URL}/p/${r.preview_id}
The full reading dates every pass and tells you what to build before each one: ${env.SITE_URL}/p/${r.preview_id}#reading

— Rite

You asked for one email a week before each pass. Stop them: ${stopUrl(env.SITE_URL, r.preview_id)}`, undefined, { unsubscribe: stopUrl(env.SITE_URL, r.preview_id) });
    if (ok) await env.DB.prepare("UPDATE reminders SET sent_at=? WHERE id=?").bind(now(), r.id).run();
  }
}

export default {
  fetch: app.fetch,
  scheduled: (_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(Promise.all([runSeason(env), runReminders(env), runStageReminders(env), runFollowups(env), runErrorDigest(env), runCleanup(env)])); },
};
