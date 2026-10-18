import { Hono, type Context } from "hono";
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
import { sendEmail, stopUrl, deliveryEmail, giftDeliveryEmail, seasonEmail, seasonCompleteEmail, stageReminderEmail, giftEmail, day3Email, day10Email, giftSeasonEmail } from "./email";
import { stopPage } from "./views/stop";
import { followupSchedule, followupDue, followupSkip, stageSeasonLine, type FollowupKind } from "./followups";
import { readingPage, type ReportJson } from "./views/reading";
import { shareCardSvg, ogSvg, giftCardSvg } from "./card";
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
import { seasonAvailable, nextNoteDate, nextNoteAfterLast, yearlyAllowed, unusedMonths, yearlyRefundCents, comingUpText, windowOpenSendOn, noteFacts, seasonFallbackBody, sampleNote, lastMondayLocal, localParts, type SeasonPlan } from "./season";
import { SIGN_NOTES } from "./content/notes";
import { localHour, localToUtc } from "./geo";
import { adminAuthorized, adminStats, adminExtras, adminDays, adminMoney, makeSession, sessionValid, cookieValue, sessionCookie, csrfToken, sameOrigin, safeNext, safeEqual, SESSION_COOKIE } from "./admin";
import { adminPage } from "./views/admin";
import { buildKpiReport, kpiSendHour, posthogVisits } from "./kpi";
import { runAdsController, sendCapiPurchase, adsMode } from "./ads";
import { handleSupportEmail, type InboxDeps } from "./inbox";
import { threadsPage, threadPage, loginPage } from "./views/inbox";
import { listThreads, loadThread, sendReply, changeThread, threadKeyFromUrl, tabOf, newNonce, THREAD_ACTIONS, type ThreadAction } from "./inbox-ui";
import { taxOn, sessionTax, localPrices, currencyOptions, priceKeySuffix, bumpCents, armFor, armCents, priceTestStop, priceTestWinner, perPreview, giftSeasonOn, giftEmailDates, TAX_CODE, GIFT_EMAIL_HOUR, dollars, type PriceProduct, type PriceTestState, type ArmStats } from "./commerce";

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
  POSTHOG_PERSONAL_API_KEY?: string; POSTHOG_PROJECT_ID?: string; // optional: visits in the Monday KPI email (HogQL query API)
  // builds 1 + 2 (docs/automation-builds.md); wrangler.toml has the defaults and what each does
  STRIPE_TAX?: string; LOCAL_PRICES?: string; PRICE_BUMP_CENTS?: string;
  PRICE_TEST?: string; PRICE_TEST_B_FULL_CENTS?: string; PRICE_TEST_B_NOTIME_CENTS?: string;
  GIFT_SEASON_START?: string; GIFT_SEASON_END?: string;
  // build 3, the support inbox (src/inbox.ts): master switch ("on" acts, anything else only drafts for Mick), daily refund caps,
  // and an optional R2 bucket for the D1 export taken before an automated data deletion (without it, deletions go to Mick)
  INBOX_AUTO?: string; INBOX_REFUNDS_PER_DAY?: string; INBOX_REFUND_CENTS_PER_DAY?: string; SUPPORT_EXPORTS?: R2Bucket;
  // build 10, ads (src/ads.ts): the controller's switch ("off" | "dry-run" | "on") and caps (whole USD), the attribution ref,
  // the Conversions API switch, and Meta ids. Tokens (META_CAPI_TOKEN, META_ADS_TOKEN, META_APP_SECRET) are secrets.
  ADS?: string; ADS_DAILY_CAP?: string; ADS_MONTHLY_CAP?: string; ADS_REF?: string;
  META_CAPI?: string; META_PIXEL_ID?: string; META_CAPI_TOKEN?: string; META_TEST_EVENT_CODE?: string;
  META_ADS_TOKEN?: string; META_APP_SECRET?: string; META_CAMPAIGN_ID?: string; META_ADSET_ID?: string; META_API_VERSION?: string;
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
  try { await env.DB.prepare("INSERT INTO events (at, kind, ref, detail) VALUES (?,?,?,?)").bind(now(), kind, ref ?? null, detail ? JSON.stringify(detail).slice(0, kind === "season_note" ? 16000 : 2000) : null).run(); } catch (e) { console.error("log", e); }
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
  price_arm?: string | null;
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
  return c.html(landingPage({ siteUrl: c.env.SITE_URL, ref: c.req.query("r") ?? c.req.query("utm_source") ?? c.req.query("ref") ?? undefined, season: seasonTeaser(c.env), prices: readingPrices(c.env, null), banner: giftSeasonOn(c.env) }));
});

/** The reading prices (cents) a preview's arm sees; null (no preview yet, e.g. the landing) is arm A, the configured price. */
const readingPrices = (env: Env, arm: string | null | undefined) => ({ full: armCents(env, arm, "full"), notime: armCents(env, arm, "notime") });

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
  const arm = await priceArm(c.env, pid);
  let text = "";
  try {
    text = await writePreview(c.env, reportInputs(comp, null));
  } catch (e) {
    await log(c.env, "error", pid, { where: "preview-llm", e: String(e) });
    text = `Saturn in ${comp.sign}: ${SIGN_NOTES[comp.sign].hook} ${phaseSentence(comp)} The full report dates your exact passes and tells you what to build before each one.`;
  }

  await c.env.DB.prepare(`INSERT INTO previews (id, created_at, birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref, price_arm)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(pid, now(), date, time, place.label, place.lat, place.lon, place.tz, comp.birthUtc, comp.natalLon, comp.sign, comp.degree, comp.house, comp.returnNumber,
      comp.window.windowStart, comp.window.windowEnd, comp.window.peakStart, comp.window.peakEnd, JSON.stringify(comp.window.hits), comp.phase, text, ref, arm).run();
  await log(c.env, "preview", pid, { sign: comp.sign, phase: comp.phase, ref, ...(arm ? { arm } : {}) });

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
  return c.html(resultPage({ siteUrl: c.env.SITE_URL, id: p.id, c: comp, text: p.preview_text ?? "", placeLabel: p.place_label, birthLabel, hasTime: !!p.birth_time, reminded: c.req.query("reminded") === "window" ? "window" : c.req.query("reminded") === "1", gift: giftState ? { code: gift?.code ?? gq!, state: giftState as "ok" | "used" | "bad", from: gift?.buyer_name ?? null, message: gift?.message ?? null } : null,
    prices: readingPrices(c.env, p.price_arm), banner: giftSeasonOn(c.env) && giftState !== "ok" }));

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
/** What POST /stop/:tok does for a purchase (stage reminders and follow-ups) or a preview (free pass reminders). */
async function stopReading(env: Env, tok: string, via?: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE stage_reminders SET sent_at='skipped:stop' WHERE purchase_id=? AND sent_at IS NULL").bind(tok),
    env.DB.prepare("UPDATE followups SET sent_at='skipped:stop' WHERE purchase_id=? AND sent_at IS NULL").bind(tok),
  ]);
  await log(env, "stopped", tok, via ? { kind: "reading", via } : { kind: "reading" });
}
async function stopPreview(env: Env, pid: string, via?: string) {
  await env.DB.prepare("UPDATE reminders SET sent_at='skipped:stop' WHERE preview_id=? AND sent_at IS NULL").bind(pid).run();
  await log(env, "stopped", pid, via ? { kind: "preview", via } : { kind: "preview" });
}
app.post("/stop/:tok", async (c) => {
  const tok = c.req.param("tok"); const kind = await stopTarget(c.env, tok); if (!kind) return c.notFound();
  if (kind === "reading") await stopReading(c.env, tok); else await stopPreview(c.env, tok);
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
  // The price this preview was shown: its price-test arm, stored at preview time, whatever PRICE_TEST says now.
  const arm = p.price_arm === "A" || p.price_arm === "B" ? p.price_arm : null;
  const amount = armCents(c.env, arm, tier);
  const s = stripe(c.env);
  const line = await readingLine(c.env, {
    product: arm === "B" ? (tier === "full" ? "full_b" : "notime_b") : tier, cents: amount,
    name: `Rite — Your Saturn Return (${tier === "full" ? "with birth time" : "no birth time"})`, description: `Saturn in ${p.natal_sign} · ${fmtMonth(p.window_start)} – ${fmtMonth(p.window_end)}`,
  });
  // Order bump: "Add a reading for someone else" as a Checkout optional item (needs a real Price). If the Price can't be
  // made (Stripe down, bad config), the reading still sells without it.
  let bumpPrice: string | null = null;
  const bump = bumpCents(c.env);
  if (bump) {
    try { bumpPrice = await ensurePrice(c.env, { product: "bump", cents: bump, name: BUMP_NAME, description: BUMP_DESCRIPTION }); }
    catch (e) { await log(c.env, "error", p.id, { where: "bump-price", e: String(e) }); }
  }
  const session = await s.checkout.sessions.create({
    mode: "payment",
    line_items: [line],
    ...(bumpPrice ? { optional_items: [{ price: bumpPrice, quantity: 1 }] } : {}),
    ...sessionTax(c.env),
    custom_fields: [{ key: "first_name", label: { type: "custom", custom: "First name (for the report)" }, type: "text", optional: true }],
    metadata: { preview_id: p.id, tier, ...(arm ? { arm } : {}), ...(bumpPrice ? { bump_price: bumpPrice } : {}) },
    success_url: `${c.env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${c.env.SITE_URL}/p/${p.id}`,
    allow_promotion_codes: true,
  });
  await log(c.env, "checkout", p.id, { tier, amount, ref: p.ref, sign: p.natal_sign, ...(arm ? { arm } : {}), bump: !!bumpPrice, tax: taxOn(c.env) });
  return c.redirect(session.url!, 303);
});

const BUMP_NAME = "Rite — A reading for someone else (gift code)";
const BUMP_DESCRIPTION = "A gift code for a second reading. They open it with their own birth details; with or without a birth time. One use, no expiry.";

/**
 * One reading or gift line item. Without LOCAL_PRICES it is inline price_data, as before (plus tax_behavior and the tax
 * code when STRIPE_TAX is on). With LOCAL_PRICES it is a real Price carrying currency_options, because Checkout's
 * price_data can't: then the product description is the generic one, not the per-preview line.
 */
async function readingLine(env: Env, o: { product: PriceProduct; cents: number; name: string; description: string }): Promise<Stripe.Checkout.SessionCreateParams.LineItem> {
  if (localPrices(env, env.CURRENCY)) return { quantity: 1, price: await ensurePrice(env, { product: o.product, cents: o.cents, name: o.name, description: o.product === "gift" ? o.description : undefined }) };
  const tax = taxOn(env);
  return { quantity: 1, price_data: { currency: env.CURRENCY, unit_amount: o.cents, ...(tax ? { tax_behavior: "inclusive" as const } : {}),
    product_data: { name: o.name, description: o.description, ...(tax ? { tax_code: TAX_CODE } : {}) } } };
}

const liveMode = (env: Env) => ((env.STRIPE_SECRET_KEY || "").startsWith("sk_live_") ? "live" : "test");

/**
 * A one-time Stripe Price (reading, gift, order bump), created once and cached in KV, found again by lookup_key if the cache is lost.
 * The lookup key carries the amount, currency, mode and the tax / local-price variant (commerce.ts priceKeySuffix), so a
 * config change makes a new Price and never edits one (Stripe can't change tax_behavior on an existing Price).
 */
async function ensurePrice(env: Env, o: { product: PriceProduct; cents: number; name: string; description?: string; tax?: boolean }): Promise<string> {
  const tax = o.tax ?? taxOn(env);
  const opts = currencyOptions(localPrices(env, env.CURRENCY), o.product, tax);
  const key = `rite_${o.product}_${o.cents}_${env.CURRENCY}_${liveMode(env)}${priceKeySuffix(tax, opts)}`;
  const kv = `stripe:price:${key}`;
  const cached = await env.CACHE.get(kv);
  if (cached) return cached;
  const s = stripe(env);
  const found = await s.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  let priceId = found.data[0]?.id;
  if (!priceId) {
    const product = await s.products.create({ name: o.name, ...(o.description ? { description: o.description } : {}), ...(tax ? { tax_code: TAX_CODE } : {}) });
    priceId = (await s.prices.create({ product: product.id, currency: env.CURRENCY, unit_amount: o.cents, lookup_key: key, nickname: o.name,
      ...(tax ? { tax_behavior: "inclusive" as const } : {}), ...(opts ? { currency_options: opts } : {}) })).id;
    await log(env, "stripe_price", key, { price: priceId });
  }
  await env.CACHE.put(kv, priceId);
  return priceId;
}

async function giftCheckout(env: Env, redirect: (url: string, status: 302 | 303) => Response) {
  const amount = parseInt(env.PRICE_FULL_CENTS, 10);
  const session = await stripe(env).checkout.sessions.create({
    mode: "payment",
    line_items: [await readingLine(env, { product: "gift", cents: amount, name: "Rite — Saturn Return reading, as a gift", description: "A code they redeem with their own birth details. Works with or without a birth time." })],
    ...sessionTax(env),
    custom_fields: [
      { key: "from_name", label: { type: "custom", custom: "Your name, as they'll see it" }, type: "text", optional: true },
      { key: "message", label: { type: "custom", custom: "A note for them (optional)" }, type: "text", optional: true },
    ],
    metadata: { gift: "1" },
    success_url: `${env.SITE_URL}/thanks?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.SITE_URL}/gift`,
    allow_promotion_codes: true,
  });
  await log(env, "checkout", null, { gift: true, amount, tax: taxOn(env) });
  return redirect(session.url!, 303);
}

app.get("/gift", (c) => c.html(giftPage({ siteUrl: c.env.SITE_URL, price: Math.round(parseInt(c.env.PRICE_FULL_CENTS, 10) / 100) })));
// Gift card PNG (1080×1350) for a code: printable or sendable. Rendered like the share card (src/png.ts) and kept in KV for
// 30 days; the code is the secret, as it is for /gift/:code. A refunded code gets no card.
app.get("/gift/card/:code{[^/]+\\.png}", async (c) => {
  const g = await getGift(c.env, c.req.param("code").replace(/\.png$/, ""));
  if (!g) return c.notFound();
  if (g.redeemed_at === "refunded" || (g.redeemed_at && !g.redeemed_purchase_id)) return c.text("That gift code was refunded.", 410);
  const key = `gift:png:${g.code}`;
  let png = await c.env.CACHE.get(key, "arrayBuffer");
  if (!png) {
    const out = await svgToPng(giftCardSvg({ code: g.code, from: g.buyer_name, site: c.env.SITE_URL.replace(/^https?:\/\//, "") }));
    png = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
    c.executionCtx.waitUntil(c.env.CACHE.put(key, png, { expirationTtl: 30 * 86400 }));
  }
  return c.body(png, 200, { "content-type": "image/png", "cache-control": "private, max-age=3600", "x-robots-tag": "noindex", "content-disposition": `inline; filename="rite-gift-${g.code}.png"` });
});
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
  const text = rows.results.map((r) => { let d: { subject: string; text: string; delivered: boolean; forced: boolean };
    try { d = JSON.parse(r.detail); } catch { return `${r.at} (unreadable row)`; }
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
    // purchase first: a reading bought with the order bump has a gift row on the same session too, and belongs on /r/
    const pu = await c.env.DB.prepare("SELECT id, status FROM purchases WHERE stripe_session_id = ?").bind(sid).first<{ id: string; status: string }>();
    if (pu) return c.redirect(`/r/${pu.id}`);
    const g = await c.env.DB.prepare("SELECT code FROM gifts WHERE stripe_session_id = ?").bind(sid).first<{ code: string }>();
    if (g) return c.redirect(`/gift/thanks/${g.code}`);

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
  const bg = await bumpGiftOf(c.env, pu);
  return c.html(readingPage({ subscribed: !!sub, siteUrl: c.env.SITE_URL, token: pu.id, c: comp, cy, r, firstName: pu.first_name, birthLabel: birthLabelOf(p), placeLabel: p.place_label, askLeft: Math.max(0, ASK_CAP - asks.length), asks,
    bumpGift: bg ? { code: bg.code, used: !!bg.redeemed_purchase_id } : null, banner: giftSeasonOn(c.env) }));
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

/** Stripe Tax collected on a session (tax-inclusive, so it is part of amount_total); null when tax wasn't calculated. */
/** Tax on a Season invoice: the sum of total_taxes (inclusive or exclusive, both are inside amount_paid); 0 without Stripe Tax. */
const invoiceTaxCents = (inv: Stripe.Invoice) => (inv.total_taxes ?? []).reduce((s, t) => s + (Number(t?.amount) || 0), 0);
const taxCents = (session: Stripe.Checkout.Session) => (typeof session.total_details?.amount_tax === "number" && (session.automatic_tax?.enabled || session.total_details.amount_tax > 0) ? session.total_details.amount_tax : null);
const paymentIntentOf = (session: Stripe.Checkout.Session) => (typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null);

/**
 * Meta Conversions API Purchase (build 10) for a new paid session, only when META_CAPI is on. Called once, by whichever
 * fulfil inserted the row; event_id is the session id, so a duplicate would be dropped by Meta anyway. Never throws.
 */
async function capiPurchase(env: Env, session: Stripe.Checkout.Session, email: string, ref: string, contentName: string) {
  if (env.META_CAPI !== "on") return;
  await sendCapiPurchase(env, { eventId: session.id, email, valueCents: session.amount_total ?? 0, currency: session.currency || env.CURRENCY, contentName, at: new Date() }, ref);
}

async function fulfil(env: Env, session: Stripe.Checkout.Session): Promise<string | null> {
  if (session.metadata?.gift === "1") return fulfilGift(env, session);
  const existing = await env.DB.prepare("SELECT id FROM purchases WHERE stripe_session_id = ?").bind(session.id).first<{ id: string }>();
  if (existing) { await fulfilBump(env, session, existing.id); return existing.id; } // a retry also finishes a bump gift that failed the first time
  const pid = session.metadata?.preview_id; const tier = session.metadata?.tier ?? "notime";
  if (!pid) return null;
  const email = session.customer_details?.email ?? session.customer_email ?? "";
  const firstName = session.custom_fields?.find((f) => f.key === "first_name")?.text?.value?.trim() || null;
  const tok = token();
  const tax = taxCents(session);
  // amount_cents is everything paid on the session (a bumped reading includes the bump; tax-inclusive, so it includes tax_cents)
  await env.DB.prepare(`INSERT INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, status, tax_cents) VALUES (?,?,?,?,?,?,?,?,?,'paid',?)`)
    .bind(tok, pid, now(), email, firstName, session.id, paymentIntentOf(session), session.amount_total ?? 0, tier, tax).run();
  const pv = await getPreview(env, pid);
  await log(env, "paid", tok, { pid, tier, amount: session.amount_total, ref: pv?.ref ?? null, sign: pv?.natal_sign ?? null, return_number: pv?.return_number ?? null,
    ...(tax != null ? { tax } : {}), ...(session.metadata?.arm ? { arm: session.metadata.arm } : {}) });
  await fulfilBump(env, session, tok);
  await capiPurchase(env, session, email, tok, `reading-${tier}`);
  return tok; // the reading is written in its own invocation (kickGenerate / first view) to stay under the per-request CPU cap
}

/**
 * Order bump: if the session's optional item ("a reading for someone else") was bought, store a gift code for it on the
 * same session and payment intent, so a refund of the payment voids it like any gift (charge.refunded). Idempotent on the
 * session id; never throws (an error is logged and the next retry of fulfil, e.g. Stripe's redelivery or /thanks, tries again).
 * No separate email: the code goes in the reading's delivery email and on the reading page.
 */
async function fulfilBump(env: Env, session: Stripe.Checkout.Session, tok: string): Promise<string | null> {
  const bumpPrice = session.metadata?.bump_price;
  if (!bumpPrice) return null;
  try {
    const had = await env.DB.prepare("SELECT code FROM gifts WHERE stripe_session_id = ?").bind(session.id).first<{ code: string }>();
    if (had) return had.code;
    const items = await stripe(env).checkout.sessions.listLineItems(session.id, { limit: 10 });
    const li = items.data.find((x) => x.price?.id === bumpPrice);
    if (!li) return null; // offered, not taken
    const firstName = session.custom_fields?.find((f) => f.key === "first_name")?.text?.value?.trim() || null;
    const code = giftCode();
    const ins = await env.DB.prepare("INSERT OR IGNORE INTO gifts (code, created_at, buyer_email, buyer_name, message, stripe_session_id, stripe_payment_intent, amount_cents) VALUES (?,?,?,?,?,?,?,?)")
      .bind(code, now(), session.customer_details?.email ?? session.customer_email ?? "", firstName, null, session.id, paymentIntentOf(session), li.amount_total ?? 0).run();
    if (!ins.meta.changes) return (await env.DB.prepare("SELECT code FROM gifts WHERE stripe_session_id = ?").bind(session.id).first<{ code: string }>())?.code ?? null; // a parallel fulfil won
    await log(env, "gift_paid", code, { amount: li.amount_total, bump: true, purchase: tok });
    return code;
  } catch (e) {
    await log(env, "error", tok, { where: "bump-gift", e: String(e) });
    return null;
  }
}

/** The order-bump gift bought with a reading (same Checkout Session), unless it was refunded. */
async function bumpGiftOf(env: Env, pu: Pick<PurchaseRow, "stripe_session_id">) {
  if (!pu.stripe_session_id) return null;
  return env.DB.prepare("SELECT code, redeemed_purchase_id FROM gifts WHERE stripe_session_id = ? AND (redeemed_at IS NULL OR redeemed_purchase_id IS NOT NULL)").bind(pu.stripe_session_id).first<{ code: string; redeemed_purchase_id: string | null }>();
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
  const tax = taxCents(session);
  await env.DB.prepare("INSERT INTO gifts (code, created_at, buyer_email, buyer_name, message, stripe_session_id, stripe_payment_intent, amount_cents, tax_cents) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(code, now(), email, from, message, session.id, paymentIntentOf(session), session.amount_total ?? 0, tax).run();
  await log(env, "gift_paid", code, { amount: session.amount_total, ...(tax != null ? { tax } : {}) });
  await capiPurchase(env, session, email, code, "gift");
  if (email) {
    const m = giftEmail({ code, link: `${env.SITE_URL}/gift/${code}`, from, cardUrl: `${env.SITE_URL}/gift/card/${code}.png` });
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
    const bump = gift ? null : await bumpGiftOf(env, pu);
    const m = gift ? giftDeliveryEmail({ ...common, from: gift.buyer_name })
      : deliveryEmail({ ...common, upsellUrl: `${env.SITE_URL}/r/${tok}#season`, monthlyPrice: Math.round(parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10) / 100),
        yearlyPrice: yearlyAllowed(comp.window.windowEnd, new Date()) ? Math.round(parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) / 100) : null,
        gift: bump ? { code: bump.code, link: `${env.SITE_URL}/gift/${bump.code}`, cardUrl: `${env.SITE_URL}/gift/card/${bump.code}.png` } : undefined });

    const ok = await sendEmail(env, pu.email, m.subject, m.text);
    if (ok) { await env.DB.prepare("UPDATE purchases SET delivered_at=? WHERE id=?").bind(now(), tok).run(); await log(env, "emailed", tok); }
  }
}

// ---------- Saturn Season subscription ----------
/**
 * The two recurring Prices for Saturn Season, created once in the Stripe account and cached in KV. Checkout used inline
 * price_data before, but a subscription item can't be switched to inline price_data later, so plan switches need real Price ids.
 * Found again by lookup_key if the KV entry is lost (e.g. a new namespace), so nothing is created twice.
 *
 * Two families. With STRIPE_TAX off and no LOCAL_PRICES: the original Prices (lookup keys and KV key unchanged). Otherwise
 * the "v2" family: tax_behavior "inclusive" (Stripe can't change it on an existing Price, so these are new Prices under new
 * lookup keys, `_v2`), plus currency_options from LOCAL_PRICES (`_l<hash>`). Subscriptions already on the original Prices
 * stay there; a plan switch keeps a subscription in the family it is in (`tax` from its current Price).
 */
const SEASON_PRODUCT_NAME = "Rite — Saturn Season";
const SEASON_PRICES_KEY = "stripe:season:prices";
type SeasonPrices = { month: string; year: string };
async function ensureSeasonPrices(env: Env, tax = taxOn(env)): Promise<SeasonPrices> {
  const lp = localPrices(env, env.CURRENCY);
  const opts: Record<SeasonPlan, ReturnType<typeof currencyOptions>> = { month: currencyOptions(lp, "season_month", tax), year: currencyOptions(lp, "season_year", tax) };
  const want: Record<SeasonPlan, number> = { month: parseInt(env.PRICE_SEASON_MONTHLY_CENTS, 10), year: parseInt(env.PRICE_SEASON_YEARLY_CENTS, 10) };
  const keyFor = (plan: SeasonPlan) => `rite_season_${plan}_${want[plan]}_${env.CURRENCY}_${liveMode(env)}${priceKeySuffix(tax, opts[plan])}`;
  const variant = priceKeySuffix(tax, opts.month) + (opts.year ? priceKeySuffix(false, opts.year) : "");
  const kvKey = variant ? `${SEASON_PRICES_KEY}:${variant}` : SEASON_PRICES_KEY;
  const cached = await env.CACHE.get<SeasonPrices>(kvKey, "json");
  if (cached?.month && cached?.year) return cached;
  const s = stripe(env);
  const out: Partial<SeasonPrices> = {};
  const found = await s.prices.list({ lookup_keys: [keyFor("month"), keyFor("year")], active: true, limit: 2 });
  for (const p of found.data) { if (p.lookup_key === keyFor("month")) out.month = p.id; if (p.lookup_key === keyFor("year")) out.year = p.id; }
  if (!out.month || !out.year) {
    const productId = found.data[0] ? (typeof found.data[0].product === "string" ? found.data[0].product : found.data[0].product.id)
      : (await s.products.create({ name: SEASON_PRODUCT_NAME, description: "A note every Monday until your Saturn return window closes. Stops itself then.", ...(tax ? { tax_code: TAX_CODE } : {}) })).id;
    for (const plan of ["month", "year"] as SeasonPlan[]) {
      if (out[plan]) continue;
      const o = opts[plan];
      const p = await s.prices.create({ product: productId, currency: env.CURRENCY, unit_amount: want[plan], recurring: { interval: plan }, lookup_key: keyFor(plan), nickname: `Saturn Season ${plan}ly`,
        ...(tax ? { tax_behavior: "inclusive" as const } : {}), ...(o ? { currency_options: o } : {}) });
      out[plan] = p.id;
    }
  }
  const prices = out as SeasonPrices;
  await env.CACHE.put(kvKey, JSON.stringify(prices));
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
    ...sessionTax(c.env),
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
    const current = await s.subscriptions.retrieve(m.sub.id);
    const item = current.items.data[0];
    if (!item) throw new Error("subscription has no items");
    // Stay in the subscription's own Price family: one started before Stripe Tax (tax_behavior unspecified) switches between
    // the original Prices, one started with tax on switches between the inclusive v2 Prices, whatever STRIPE_TAX says now.
    const prices = await ensureSeasonPrices(c.env, item.price?.tax_behavior === "inclusive");
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
        // Season revenue for the KPI email (build 6): every paid Season invoice, first payment and renewals, once per invoice id
        if (inv.id && (inv.amount_paid ?? 0) > 0) {
          const meta = inv.parent?.subscription_details?.metadata as Record<string, string> | null | undefined;
          const paidAt = inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000).toISOString() : now();
          // a failure here (e.g. migration 008 not applied yet) is logged and never blocks the past_due → active step below
          try {
            await c.env.DB.prepare("INSERT OR IGNORE INTO season_invoices (invoice_id, subscription_id, purchase_id, paid_at, amount_cents, tax_cents, currency, billing_reason) VALUES (?,?,?,?,?,?,?,?)")
              .bind(inv.id, subId, meta?.purchase_id ?? null, paidAt, inv.amount_paid, invoiceTaxCents(inv), inv.currency ?? null, inv.billing_reason ?? null).run();
          } catch (e) { await log(c.env, "error", subId, { where: "season-invoice", invoice: inv.id, e: String(e) }); }
        }
        const r = await c.env.DB.prepare("UPDATE subscriptions SET status='active' WHERE id=? AND status='past_due'").bind(subId).run();
        if (r.meta.changes) await log(c.env, "season_resumed", subId, { invoice: inv.id });
      }
    }
  } else if (event.type === "charge.refunded") {
    const ch = event.data.object as Stripe.Charge;
    const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
    if (pi) {
      // Readings and gifts are only ever refunded in full; a partial refund on one is logged and changes nothing. A reading
      // bought with the order bump is one payment: a full refund refunds the reading and voids its unredeemed gift code; a
      // partial refund (e.g. just the bump's amount) changes neither, so the code stays live until it is voided by hand
      // (README "Order bump"). A redeemed bump code keeps its reading, as for any gift.
      const pu = await c.env.DB.prepare("SELECT id FROM purchases WHERE stripe_payment_intent=?").bind(pi).first<{ id: string }>();
      const gi = await c.env.DB.prepare("SELECT code FROM gifts WHERE stripe_payment_intent=?").bind(pi).first<{ code: string }>();
      if (pu || gi) {
        if (ch.refunded) {
          const rp = await c.env.DB.prepare("UPDATE purchases SET status='refunded' WHERE stripe_payment_intent=? AND status != 'refunded'").bind(pi).run();
          // a refunded, unredeemed gift code stops working (same marker as /admin/refund); a redeemed one keeps its reading
          const rg = await c.env.DB.prepare("UPDATE gifts SET redeemed_at='refunded' WHERE stripe_payment_intent=? AND redeemed_at IS NULL").bind(pi).run();
          // refunds made in the Stripe dashboard get an events row too (the KPI email counts them); POST /admin/refund has
          // already logged and updated its own, so its echo changes no row and logs nothing
          if (rp.meta.changes || rg.meta.changes) await log(c.env, "refund", pu?.id ?? gi?.code ?? null, { via: "stripe", gift: !pu, amount: ch.amount_refunded });
        } else await log(c.env, "partial_refund_ignored", pu?.id ?? gi?.code ?? null, { pi, amount_refunded: ch.amount_refunded });
      } else {
        // Not a reading or gift: maybe a Saturn Season invoice. Any refund on one stops the subscription (no more charges or
        // notes). Our own unused-months refund lands here too, after the row is already canceled/complete, and is a no-op.
        try {
          const ips = await stripe(c.env).invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, expand: ["data.invoice"], limit: 1 });
          const inv = ips.data[0]?.invoice;
          const invId = typeof inv === "string" ? inv : inv?.id;
          // the KPI email's Season revenue nets out refunds (amount_refunded is cumulative on the charge, so MAX is idempotent)
          if (invId) await c.env.DB.prepare("UPDATE season_invoices SET refunded_cents = MAX(refunded_cents, ?) WHERE invoice_id=?").bind(ch.amount_refunded ?? 0, invId).run();
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
    const { canceled, cents } = await cancelSeason(c.env, sub, "admin");
    if (!canceled) return c.json({ refunded: false, season: true, canceled: false, error: "stripe cancel failed (see /admin errors)" }, 502);
    return c.json({ refunded: cents > 0, season: true, canceled: true, cents });
  }
  const pu = await c.env.DB.prepare("SELECT id, stripe_payment_intent FROM purchases WHERE email=? AND status IN ('paid','writing','generated','failed') ORDER BY created_at DESC LIMIT 1").bind(email).first<{ id: string; stripe_payment_intent: string }>();
  if (!pu?.stripe_payment_intent) {
    // maybe a gift buyer
    const g = await c.env.DB.prepare("SELECT code, stripe_payment_intent FROM gifts WHERE buyer_email=? AND redeemed_at IS NULL AND stripe_payment_intent IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(email).first<{ code: string; stripe_payment_intent: string }>();
    if (!g) return c.json({ refunded: false });
    await refundGift(c.env, g);
    return c.json({ refunded: true, gift: true });
  }
  await refundPurchase(c.env, pu);
  return c.json({ refunded: true });
});

/** The refund behind POST /admin/refund (and the support inbox): full refund in Stripe, purchase refunded, its bump code voided. */
async function refundPurchase(env: Env, pu: { id: string; stripe_payment_intent: string }) {
  await stripe(env).refunds.create({ payment_intent: pu.stripe_payment_intent });
  await env.DB.prepare("UPDATE purchases SET status='refunded' WHERE id=?").bind(pu.id).run();
  // the order-bump gift on the same payment is refunded with it (unless already redeemed); charge.refunded does the same
  await env.DB.prepare("UPDATE gifts SET redeemed_at='refunded' WHERE stripe_payment_intent=? AND redeemed_at IS NULL").bind(pu.stripe_payment_intent).run();
  await log(env, "refund", pu.id);
}
async function refundGift(env: Env, g: { code: string; stripe_payment_intent: string }) {
  await stripe(env).refunds.create({ payment_intent: g.stripe_payment_intent });
  await env.DB.prepare("UPDATE gifts SET redeemed_at='refunded' WHERE code=?").bind(g.code).run();
  await log(env, "refund", g.code, { gift: true });
}
/** Stop Saturn Season now (closeSeasonSubscription: cancel, and refund unused full months of a yearly plan), as /admin/refund {season}. */
async function cancelSeason(env: Env, sub: { id: string; plan: string | null; purchase_id: string }, via: string) {
  const r = await closeSeasonSubscription(env, { sub_id: sub.id, plan: sub.plan, purchase_id: sub.purchase_id }, new Date());
  if (!r.canceled) return r;
  await env.DB.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").bind(sub.id).run();
  await log(env, "season_cancel", sub.purchase_id, { via, refunded_cents: r.cents });
  return r;
}

// ---------- support inbox (build 3, src/inbox.ts) ----------
const inboxDeps: InboxDeps = { log, refundPurchase, refundGift, cancelSeason, stopReading, stopPreview, kickGenerate };

// ---------- admin session + the inbox UI (build 3b, src/inbox-ui.ts, src/views/inbox.ts) ----------
// Browser admin pages accept ADMIN_KEY as a bearer, as ?key=, or a signed session cookie from /admin/login (HttpOnly,
// Secure, SameSite=Strict, Path=/admin, 30 days, HMAC'd with ADMIN_KEY). Inbox POSTs also need the per-session CSRF token
// and, when the browser sends one, a same-origin Sec-Fetch-Site / Origin. Bearer POSTs (curl) skip both: no ambient credential.
type AdminCtx = { env: Env; req: { header(n: string): string | undefined; query(n: string): string | undefined } };
async function adminSession(c: AdminCtx): Promise<{ ok: boolean; sid: string; key: string | null; bearer: boolean; cookie: boolean }> {
  const no = { ok: false, sid: "", key: null, bearer: false, cookie: false };
  const secret = c.env.ADMIN_KEY;
  if (!secret) return no;
  const auth = c.req.header("authorization");
  if (auth && adminAuthorized(secret, auth)) return { ok: true, sid: "bearer", key: null, bearer: true, cookie: false };
  const key = c.req.query("key");
  if (key !== undefined && adminAuthorized(secret, undefined, key)) return { ok: true, sid: "key", key, bearer: false, cookie: false };
  const ck = cookieValue(c.req.header("cookie"), SESSION_COOKIE);
  if (ck && await sessionValid(secret, ck)) return { ok: true, sid: ck, key: null, bearer: false, cookie: true };
  return no;
}
const INBOX_HDRS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "same-origin", "X-Frame-Options": "DENY" };
const inboxAuto = (env: Env) => (env.INBOX_AUTO ?? "off").trim().toLowerCase() === "on";
const toLogin = (c: { env: Env; req: { url: string; method: string } }) => {
  if (!c.env.ADMIN_KEY) return null;
  const u = new URL(c.req.url);
  u.searchParams.delete("key"); // a wrong key never ends up in the next URL
  const next = safeNext(c.req.method === "GET" ? u.pathname + u.search : u.pathname.replace(/\/(reply|state)$/, ""));
  return new Response(null, { status: 303, headers: { Location: `/admin/login?next=${encodeURIComponent(next)}`, ...INBOX_HDRS } });
};
/** A browser POST to an inbox route: same origin (when the browser says) and the session's CSRF token. */
async function postOk(c: { env: Env; req: { raw: Request } }, s: { sid: string; bearer: boolean }, csrf: unknown): Promise<boolean> {
  if (s.bearer) return true;
  if (!sameOrigin(c.req.raw)) return false;
  return typeof csrf === "string" && safeEqual(csrf, await csrfToken(c.env.ADMIN_KEY!, s.sid));
}
const formStr = (v: unknown) => (typeof v === "string" ? v : "");
const back = (path: string, key: string | null, q = "") => new Response(null, { status: 303, headers: { Location: `${path}${q ? `?${q}` : ""}${key ? `${q ? "&" : "?"}key=${encodeURIComponent(key)}` : ""}`, ...INBOX_HDRS } });

app.get("/admin/login", async (c) => {
  if (!c.env.ADMIN_KEY) return c.notFound();
  const next = safeNext(c.req.query("next"));
  if (await sessionValid(c.env.ADMIN_KEY, cookieValue(c.req.header("cookie"), SESSION_COOKIE))) return c.redirect(next, 303);
  return c.html(loginPage({ next }), 200, INBOX_HDRS);
});
// At most 10 wrong keys an hour per IP (KV), then 429 until the hour is up.
app.post("/admin/login", async (c) => {
  if (!c.env.ADMIN_KEY) return c.notFound();
  if (!sameOrigin(c.req.raw)) return c.text("cross-site request refused", 403);
  const f = await c.req.parseBody();
  const next = safeNext(formStr(f.next));
  const tkey = `adminlogin:${c.req.header("cf-connecting-ip") ?? "unknown"}`;
  const fails = parseInt((await c.env.CACHE.get(tkey)) ?? "0", 10) || 0;
  if (fails >= 10) return c.html(loginPage({ next, error: "Too many wrong keys. Try again in an hour." }), 429, INBOX_HDRS);
  if (!adminAuthorized(c.env.ADMIN_KEY, undefined, formStr(f.key))) {
    await c.env.CACHE.put(tkey, String(fails + 1), { expirationTtl: 3600 });
    return c.html(loginPage({ next, error: "That's not the key." }), 401, INBOX_HDRS);
  }
  return new Response(null, { status: 303, headers: { Location: next, "Set-Cookie": sessionCookie(await makeSession(c.env.ADMIN_KEY)), ...INBOX_HDRS } });
});
app.post("/admin/logout", async (c) => {
  const s = await adminSession(c);
  if (!s.ok) return toLogin(c) ?? c.notFound();
  if (!(await postOk(c, s, (await c.req.parseBody()).csrf))) return c.text("cross-site request refused", 403);
  return new Response(null, { status: 303, headers: { Location: "/admin/login", "Set-Cookie": sessionCookie("", 0), ...INBOX_HDRS } });
});

// Threads, newest activity first: Needs me (default), All, Closed.
app.get("/admin/inbox", async (c) => {
  const s = await adminSession(c);
  if (!s.ok) return toLogin(c) ?? c.notFound();
  const tab = tabOf(c.req.query("tab"));
  const r = await listThreads(c.env.DB, tab);
  return c.html(threadsPage({ ...r, tab, auto: inboxAuto(c.env), key: s.key, csrf: await csrfToken(c.env.ADMIN_KEY!, s.sid), session: s.cookie, generatedAt: now() }), 200, INBOX_HDRS);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renderThread(c: Context<{ Bindings: Env }, any>, k: string, s: { sid: string; key: string | null }, flash?: { ok?: string; error?: string }, text?: string, status: 200 | 400 = 200) {
  const t = await loadThread(c.env, k);
  if (!t) return null;
  return c.html(threadPage({ t, key: s.key, csrf: await csrfToken(c.env.ADMIN_KEY!, s.sid), nonce: newNonce(), auto: inboxAuto(c.env), flash, text }), status, INBOX_HDRS);
}
const FLASH: Record<string, { ok?: string; error?: string }> = {
  sent: { ok: "Sent. The thread is yours now; the assistant won't act on it." }, dup: { ok: "Already sent: that form was submitted before, so nothing was sent twice." },
  close: { ok: "Closed." }, reopen: { ok: "Reopened: it's in Needs me." }, take: { ok: "It's yours: the assistant won't act on new messages here." },
  handback: { ok: "Handed back: the assistant can act on new messages here again (inside INBOX_AUTO and its guards)." },
  migrate: { error: "That needs migration 007: run npm run db:migrate:b3b." },
};

app.get("/admin/inbox/t/:id", async (c) => {
  const s = await adminSession(c);
  if (!s.ok) return toLogin(c) ?? c.notFound();
  const k = threadKeyFromUrl(c.req.param("id"));
  if (!k) return c.notFound();
  return (await renderThread(c, k, s, FLASH[c.req.query("f") ?? ""])) ?? c.notFound();
});

// Send Mick's reply (src/inbox-ui.ts sendReply). The form's nonce makes a resubmit a no-op; success redirects (POST/redirect/GET).
app.post("/admin/inbox/t/:id/reply", async (c) => {
  const s = await adminSession(c);
  if (!s.ok) return toLogin(c) ?? c.notFound();
  const k = threadKeyFromUrl(c.req.param("id"));
  if (!k) return c.notFound();
  const f = await c.req.parseBody();
  if (!(await postOk(c, s, f.csrf))) return c.text("cross-site request refused", 403);
  const path = `/admin/inbox/t/${c.req.param("id")}`;
  let r;
  try { r = await sendReply(c.env, k, formStr(f.body), formStr(f.nonce), (kind, ref, detail) => log(c.env, kind, ref, detail)); }
  catch (e) {
    await log(c.env, "error", null, { where: "inbox-reply", e: String(e).slice(0, 300) });
    r = { ok: false as const, error: /no such table/i.test(String(e)) ? FLASH.migrate!.error! : "Something went wrong; nothing was sent. The error is on /admin." };
  }
  if (r.ok) return back(path, s.key, "f=sent");
  if (r.duplicate) return back(path, s.key, "f=dup");
  return (await renderThread(c, k, s, { error: r.error }, formStr(f.body), 400)) ?? c.notFound();
});

// Close, Reopen, "I've got this" (take), "Hand back to assistant" (handback).
app.post("/admin/inbox/t/:id/state", async (c) => {
  const s = await adminSession(c);
  if (!s.ok) return toLogin(c) ?? c.notFound();
  const k = threadKeyFromUrl(c.req.param("id"));
  if (!k) return c.notFound();
  const f = await c.req.parseBody();
  if (!(await postOk(c, s, f.csrf))) return c.text("cross-site request refused", 403);
  const a = formStr(f.do) as ThreadAction;
  if (!THREAD_ACTIONS.includes(a)) return c.text("unknown action", 400);
  if (!(await c.env.DB.prepare("SELECT 1 FROM support_messages WHERE thread_key=? LIMIT 1").bind(k).first())) return c.notFound();
  const ok = await changeThread(c.env.DB, k, a);
  if (ok) await log(c.env, "support_thread", null, { thread: k.slice(0, 120), do: a });
  return back(`/admin/inbox/t/${c.req.param("id")}`, s.key, `f=${ok ? a : "migrate"}`);
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
  if (!(await adminSession(c)).ok) return c.notFound(); // ADMIN_KEY only (bearer, ?key= or the /admin/login cookie)
  const [stats, extras, money] = await Promise.all([adminStats(c.env.DB, adminDays(c.req.query("days"))), adminExtras(c.env.DB), adminMoney(c.env.DB)]);
  return c.html(adminPage({ stats, extras, money, currency: c.env.CURRENCY, key: c.req.query("key"), generatedAt: now() }), 200,
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});

// Monday KPI email as text, any time (ADMIN_KEY only, like GET /admin), and a forced send (bearer, like the other POSTs).
app.get("/admin/kpi", async (c) => {
  if (!(await adminSession(c)).ok) return c.notFound();
  const r = await buildKpiReport(c.env.DB, new Date(), kpiOpts(c.env));
  return c.text(r.text, 200, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" });
});
// Run the ads controller now (bearer), outside 06:00, still once per Brisbane day and still under ADS (off does nothing).
app.post("/admin/ads/run", async (c) => {
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  return c.json(await runAds(c.env, new Date(), true));
});
app.post("/admin/kpi/send", async (c) => {
  if (!adminOk(c.env, c.req.header("authorization"))) return c.text("no", 401);
  return c.json(await runKpiEmail(c.env, new Date(), true));
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

// ---------- price test ----------
/**
 * The arm for a new preview while PRICE_TEST is "on" and the test hasn't finished: "A" or "B" by a hash of the preview id
 * (commerce.ts armFor). null (arm A's price, nothing stored) when the test is off or done. Stops the test when it reaches
 * 14 days or 600 previews per arm, logging price_test_done once with the winner by revenue per preview.
 */
async function priceArm(env: Env, pid: string): Promise<"A" | "B" | null> {
  if (env.PRICE_TEST !== "on") return null;
  try {
    if (await priceTestDone(env)) return null;
    const st = await priceTestState(env);
    const why = priceTestStop(st);
    if (why) { await finishPriceTest(env, st, why); return null; }
    return armFor(pid);
  } catch (e) { await log(env, "error", pid, { where: "price-test", e: String(e) }); return null; } // a broken test never blocks a preview
}
const priceTestDone = async (env: Env) => !!(await env.DB.prepare("SELECT 1 FROM events WHERE kind='price_test_done' LIMIT 1").first());

/** Previews, paid purchases and revenue net of tax (cents) per arm, and when the first arm was assigned. */
async function priceTestState(env: Env): Promise<PriceTestState> {
  const rows = await env.DB.prepare(`SELECT pv.price_arm arm, MIN(pv.created_at) first, COUNT(DISTINCT pv.id) previews, COUNT(DISTINCT pu.id) purchases, COALESCE(SUM(pu.amount_cents - COALESCE(pu.tax_cents,0)),0) cents
    FROM previews pv LEFT JOIN purchases pu ON pu.preview_id = pv.id AND pu.status IN ('paid','writing','generated') WHERE pv.price_arm IN ('A','B') GROUP BY pv.price_arm`).all<{ arm: string; first: string; previews: number; purchases: number; cents: number }>();
  const zero: ArmStats = { previews: 0, purchases: 0, cents: 0 };
  const st: PriceTestState = { first: null, A: { ...zero }, B: { ...zero } };
  for (const r of rows.results ?? []) {
    if (r.arm !== "A" && r.arm !== "B") continue;
    st[r.arm] = { previews: r.previews, purchases: r.purchases, cents: r.cents };
    if (!st.first || r.first < st.first) st.first = r.first;
  }
  return st;
}

async function finishPriceTest(env: Env, st: PriceTestState, reason: "days" | "previews") {
  if (await priceTestDone(env)) return;
  const arm = (a: ArmStats) => ({ ...a, rate: a.previews ? +(a.purchases / a.previews * 100).toFixed(2) : 0, per_preview: perPreview(a) });
  await log(env, "price_test_done", priceTestWinner(st), { winner: priceTestWinner(st), reason, started: st.first, A: arm(st.A), B: arm(st.B),
    prices: { A: readingPrices(env, "A"), B: readingPrices(env, "B") } });
}

/** Hourly: end the test on its 14th day even if no preview comes in to trigger it. */
async function runPriceTest(env: Env) {
  if (env.PRICE_TEST !== "on") return;
  try {
    if (await priceTestDone(env)) return;
    const st = await priceTestState(env);
    const why = priceTestStop(st);
    if (why) await finishPriceTest(env, st, why);
  } catch (e) { await log(env, "error", null, { where: "price-test-cron", e: String(e) }); }
}

// ---------- gift season email ----------
/**
 * 1 and 15 Dec (commerce.ts giftEmailDates), from 09:00 in each buyer's birthplace zone: one email per address per date to
 * past buyers (a paid reading, amount > 0). Skips anyone with a refund, anyone who pressed stop on any of their readings or
 * previews (followups / stage_reminders 'skipped:stop', or a `stopped` event), and gift recipients (they didn't buy).
 * Each send is claimed in campaign_sends first, so overlapping runs can't double-send; a failed send drops its claim.
 */
async function runGiftSeason(env: Env, at = new Date()) {
  const dates = giftEmailDates(env);
  if (!dates.length) return;
  const utcDay = at.toISOString().slice(0, 10);
  // zones run up to a day either side of UTC; nothing to do unless an email day is within a day of today
  if (!dates.some((d) => Math.abs(Date.parse(d) - Date.parse(utcDay)) <= 86400000)) return;
  type Row = { email: string; purchase_id: string; first_name: string | null; tz: string };
  const rows = await env.DB.prepare(`SELECT p.email, p.id purchase_id, p.first_name, pv.tz FROM purchases p JOIN previews pv ON pv.id = p.preview_id
    WHERE p.amount_cents > 0 AND p.email != '' AND p.status IN ('paid','writing','generated','failed')
      AND p.created_at = (SELECT MAX(p2.created_at) FROM purchases p2 WHERE p2.email = p.email AND p2.amount_cents > 0)
      AND NOT EXISTS (SELECT 1 FROM purchases r WHERE r.email = p.email AND r.status = 'refunded')
      AND NOT EXISTS (SELECT 1 FROM purchases x WHERE x.email = p.email AND (
        EXISTS (SELECT 1 FROM followups f WHERE f.purchase_id = x.id AND f.sent_at = 'skipped:stop')
        OR EXISTS (SELECT 1 FROM stage_reminders s WHERE s.purchase_id = x.id AND s.sent_at = 'skipped:stop')
        OR EXISTS (SELECT 1 FROM events e WHERE e.kind = 'stopped' AND (e.ref = x.id OR e.ref = x.preview_id))))
    ORDER BY p.created_at DESC, p.id DESC LIMIT 2000`).all<Row>(); // ties on created_at: the first row per address claims it
  const giftUrl = `${env.SITE_URL}/gift?r=gift-email`;
  for (const r of rows.results ?? []) {
    const { date, hour } = localParts(r.tz, at);
    const i = dates.indexOf(date);
    if (i < 0 || hour < GIFT_EMAIL_HOUR) continue;
    const campaign = `gift-${date}`;
    try {
      const claimed = now();
      const ins = await env.DB.prepare("INSERT OR IGNORE INTO campaign_sends (campaign, email, purchase_id, sent_at) VALUES (?,?,?,?)").bind(campaign, r.email, r.purchase_id, claimed).run();
      if (!ins.meta.changes) continue; // already sent (or being sent) to this address for this date
      const stop = stopUrl(env.SITE_URL, r.purchase_id);
      const m = giftSeasonEmail({ firstName: r.first_name, giftUrl, price: dollars(parseInt(env.PRICE_FULL_CENTS, 10)), stopUrl: stop, second: i > 0 });
      const ok = await sendEmail(env, r.email, m.subject, m.text, undefined, { unsubscribe: stop });
      if (ok) await log(env, "gift_season_sent", r.purchase_id, { campaign });
      else await env.DB.prepare("DELETE FROM campaign_sends WHERE campaign=? AND email=? AND sent_at=?").bind(campaign, r.email, claimed).run(); // retry next hour
    } catch (e) { await log(env, "error", r.purchase_id, { where: "gift-season", e: String(e) }); }
  }
}

/** Daily digest of errors to the admin inbox (08:00 Brisbane), only when there is something to say. */
async function runCleanup(env: Env) {
  if (localHour("Australia/Brisbane", new Date()) !== 4) return;
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
  const r = await env.DB.prepare("DELETE FROM previews WHERE created_at < ? AND id NOT IN (SELECT preview_id FROM purchases) AND id NOT IN (SELECT preview_id FROM reminders)").bind(cutoff).run();
  if (r.meta.changes) await log(env, "cleanup", null, { previews: r.meta.changes });
}

const kpiOpts = (env: Env) => ({ siteUrl: env.SITE_URL, adsMode: adsMode(env.ADS), visits: posthogVisits({ key: env.POSTHOG_PERSONAL_API_KEY, project: env.POSTHOG_PROJECT_ID, host: env.POSTHOG_HOST }) });

/** Monday KPI email (build 6): Mondays 07:00–07:59 Brisbane, once a week (a non-forced `kpi_sent` row in the last 6 days skips it). */
async function runKpiEmail(env: Env, nowD = new Date(), force = false): Promise<{ sent: boolean; reason?: string; headline?: string }> {
  if (!force) {
    if (!kpiSendHour(nowD)) return { sent: false, reason: "not Monday 07:00 Brisbane" };
    const since = new Date(nowD.getTime() - 6 * 86400000).toISOString();
    const done = await env.DB.prepare("SELECT 1 FROM events WHERE kind='kpi_sent' AND at > ? AND NOT (json_valid(detail) AND COALESCE(json_extract(detail,'$.forced'),0) = 1) LIMIT 1").bind(since).first();
    if (done) return { sent: false, reason: "already sent this week" };
  }
  try {
    const r = await buildKpiReport(env.DB, nowD, kpiOpts(env));
    const ok = await sendEmail(env, env.ADMIN_EMAIL || env.SUPPORT_EMAIL, r.subject, r.text);
    if (!ok) { await log(env, "error", null, { where: "kpi-email", e: "send failed" }); return { sent: false, reason: "send failed", headline: r.headline }; }
    await log(env, "kpi_sent", null, { forced: force, headline: r.headline.slice(0, 200) });
    return { sent: true, headline: r.headline };
  } catch (e) { await log(env, "error", null, { where: "kpi-email", e: String(e) }); return { sent: false, reason: "error" }; }
}

/** Ads budget controller (build 10): 06:00 Brisbane, once a day, only when ADS is "dry-run" or "on". Never throws. */
async function runAds(env: Env, nowD = new Date(), force = false) {
  try {
    return await runAdsController(env, { now: nowD, force, notify: (subject, text) => sendEmail(env, env.ADMIN_EMAIL || env.SUPPORT_EMAIL, subject, text) });
  } catch (e) { await log(env, "error", null, { where: "ads", e: String(e) }); return { ran: false, reason: "error" }; }
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
  /** Cloudflare Email Routing → hello@ (launch checklist B4). Never rejects: anything not handled goes to ADMIN_EMAIL. */
  email: async (message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) => {
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    await handleSupportEmail(env, { raw, envelopeFrom: message.from, forward: (to, headers) => message.forward(to, headers) }, ctx, inboxDeps);
  },
  scheduled: (_ev: ScheduledEvent, env: Env, ctx: ExecutionContext) => { ctx.waitUntil(Promise.all([runSeason(env), runReminders(env), runStageReminders(env), runFollowups(env), runErrorDigest(env), runKpiEmail(env), runCleanup(env), runPriceTest(env), runGiftSeason(env), runAds(env)])); },
};
