// Monday KPI email (docs/automation-builds.md build 6). buildKpiReport is a pure read of D1 (plus an optional visits
// lookup passed in), so the cron, GET /admin/kpi and the tests all get the same text. Times: Brisbane is UTC+10 all
// year (no DST), so day and month boundaries are fixed offsets from UTC.

const BRIS_MS = 10 * 3600000;
const DAY = 86400000;
const LIVE = "('paid','writing','generated')"; // same statuses /admin counts as sold (refunded and failed are excluded)

/** Plan revenue target per month, in thousands of USD ("Rite: path to $1M"). Months outside the table have no target. */
export const MONTH_TARGETS_USD_K: Readonly<Record<string, number>> = {
  "2026-11": 10, "2026-12": 45, "2027-01": 40, "2027-02": 45, "2027-03": 60, "2027-04": 70,
  "2027-05": 85, "2027-06": 100, "2027-07": 115, "2027-08": 130, "2027-09": 145, "2027-10": 160,
};

/** The decision calendar's gates (docs/growth-plan.md section 4), by Brisbane date. */
export const GATES = [
  { id: "A", name: "Gate A", by: "2026-11-30" },
  { id: "kill", name: "Kill line", by: "2027-01-31" },
  { id: "B", name: "Gate B", by: "2027-02-28" },
  { id: "C", name: "Gate C", by: "2027-06-30" },
] as const;
export type Gate = (typeof GATES)[number];

export interface VisitCounts { visitors: number; pageviews: number }
/** Visits between two UTC instants (ISO), or a throw when the source fails. */
export type VisitsFn = (fromIso: string, toIso: string) => Promise<VisitCounts>;
export interface KpiOpts { visits?: VisitsFn | null; siteUrl?: string }
export interface KpiReport { subject: string; headline: string; text: string }

// ---------- dates ----------
/** Brisbane calendar date (YYYY-MM-DD) of an instant. */
export const brisDate = (d: Date) => new Date(d.getTime() + BRIS_MS).toISOString().slice(0, 10);
/** The UTC instant of 00:00 Brisbane on a YYYY-MM-DD date. */
const brisMidnight = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`) - BRIS_MS;
/** True during 07:00–07:59 Brisbane on a Monday: when the cron sends the email. */
export function kpiSendHour(now: Date): boolean {
  const b = new Date(now.getTime() + BRIS_MS);
  return b.getUTCDay() === 1 && b.getUTCHours() === 7;
}
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (ymd: string) => `${parseInt(ymd.slice(8, 10), 10)} ${MON[parseInt(ymd.slice(5, 7), 10) - 1]} ${ymd.slice(0, 4)}`;
const short = (ymd: string) => nice(ymd).slice(0, -5);
const daysTo = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

/** First gate whose date is today or later (Brisbane), or null after the last. */
export function nextGate(today: string): Gate | null { return GATES.find((g) => g.by >= today) ?? null; }

/** The month's target pro-rated by elapsed time: target × (now − month start) ÷ month length, in cents. Null without a target. */
export function monthTarget(now: Date): { month: string; targetCents: number; proRatedCents: number; day: number; days: number; startIso: string } | null {
  const ymd = brisDate(now), month = ymd.slice(0, 7);
  const k = MONTH_TARGETS_USD_K[month];
  const y = parseInt(month.slice(0, 4), 10), m = parseInt(month.slice(5, 7), 10);
  const start = brisMidnight(`${month}-01`);
  const next = brisMidnight(new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10));
  const days = Math.round((next - start) / DAY);
  if (k === undefined) return null;
  const targetCents = k * 1000 * 100;
  return { month, targetCents, proRatedCents: Math.round(targetCents * (now.getTime() - start) / (next - start)), day: parseInt(ymd.slice(8, 10), 10), days, startIso: new Date(start).toISOString() };
}

// ---------- formatting ----------
const int = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const usd = (cents: number) => `$${int(cents / 100)}`;
const pct = (num: number, den: number) => (den > 0 ? num / den * 100 : null);
const pctS = (v: number | null) => (v === null ? "n/a" : `${v.toFixed(1)}%`);
function change(cur: number, prev: number): string {
  if (prev === 0) return cur === 0 ? "" : " (new)";
  const c = (cur - prev) / prev * 100;
  return ` (${c >= 0 ? "+" : ""}${Math.round(c)}%)`;
}

// ---------- queries ----------
interface Week {
  previews: number; paid: number; readingCents: number; zeroReadings: number; giftsBought: number; giftCents: number; giftsRedeemed: number;
  seasonStarts: number; seasonCancels: number; refunds: number; refundCents: number; seasonRefunds: number; seasonRefundCents: number;
  followupsSent: number; followupsSkipped: number; stops: number; errors: number; narrated: number; narrationFallbacks: number;
  support: number; supportAuto: number; supportToMick: number;
}
const n0 = (v: unknown) => Number(v ?? 0) || 0;

async function revenueBetween(db: D1Database, from: string, to: string) {
  const [r, g] = await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(amount_cents),0) c, COUNT(*) n FROM purchases WHERE status IN ${LIVE} AND amount_cents > 0 AND created_at >= ? AND created_at < ?`).bind(from, to).first<{ c: number; n: number }>(),
    db.prepare("SELECT COALESCE(SUM(amount_cents),0) c FROM gifts WHERE COALESCE(redeemed_at,'') != 'refunded' AND created_at >= ? AND created_at < ?").bind(from, to).first<{ c: number }>(),
  ]);
  return { readingCents: n0(r?.c), paid: n0(r?.n), giftCents: n0(g?.c), cents: n0(r?.c) + n0(g?.c) };
}

async function week(db: D1Database, from: string, to: string): Promise<Week> {
  const b = (sql: string) => db.prepare(sql).bind(from, to);
  const E = "at >= ? AND at < ?";
  const [pv, rev, zero, gb, gr, kinds, refunds, sref, narr, sup] = await Promise.all([
    b("SELECT COUNT(*) n FROM previews WHERE created_at >= ? AND created_at < ?").first<{ n: number }>(),
    revenueBetween(db, from, to),
    b(`SELECT COUNT(*) n FROM purchases WHERE status IN ${LIVE} AND amount_cents = 0 AND created_at >= ? AND created_at < ?`).first<{ n: number }>(),
    b("SELECT COUNT(*) n FROM gifts WHERE created_at >= ? AND created_at < ?").first<{ n: number }>(),
    b("SELECT COUNT(*) n FROM gifts WHERE redeemed_purchase_id IS NOT NULL AND redeemed_at >= ? AND redeemed_at < ?").first<{ n: number }>(),
    b(`SELECT kind, COUNT(*) n, COUNT(DISTINCT ref) refs FROM events WHERE ${E} AND kind IN ('season_start','season_cancel','followup_sent','followup_skipped','stopped','error') GROUP BY kind`).all<{ kind: string; n: number; refs: number }>(),
    // A refund can be logged twice (POST /admin/refund, then Stripe's charge.refunded echo): count each purchase or gift once.
    b(`SELECT COUNT(*) n, COALESCE(SUM(COALESCE(p.amount_cents, g.amount_cents, 0)),0) c FROM (SELECT DISTINCT ref FROM events WHERE kind='refund' AND ${E} AND ref IS NOT NULL) r LEFT JOIN purchases p ON p.id = r.ref LEFT JOIN gifts g ON g.code = r.ref`).first<{ n: number; c: number }>(),
    b(`SELECT COUNT(*) n, COALESCE(SUM(json_extract(detail,'$.amount')),0) c FROM events WHERE kind='season_refund' AND ${E} AND json_valid(detail) AND json_extract(detail,'$.amount') > 0`).first<{ n: number; c: number }>(),
    b(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN json_valid(detail) AND json_extract(detail,'$.fallback') = 1 THEN 1 ELSE 0 END),0) f FROM events WHERE kind='narrated' AND ${E}`).first<{ n: number; f: number }>(),
    // support inbox (build 3): one support_auto row per email; to_mick = forwarded, action 'ignore' = an auto-reply or bounce
    b(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN json_extract(detail,'$.to_mick') = 1 THEN 1 ELSE 0 END),0) f, COALESCE(SUM(CASE WHEN json_extract(detail,'$.action') = 'ignore' THEN 1 ELSE 0 END),0) i FROM events WHERE kind='support_auto' AND ${E} AND json_valid(detail)`).first<{ n: number; f: number; i: number }>(),
  ]);
  const k = Object.fromEntries(kinds.results.map((r) => [r.kind, r]));
  return {
    previews: n0(pv?.n), paid: rev.paid, readingCents: rev.readingCents, zeroReadings: n0(zero?.n), giftsBought: n0(gb?.n), giftCents: rev.giftCents, giftsRedeemed: n0(gr?.n),
    seasonStarts: n0(k.season_start?.refs), seasonCancels: n0(k.season_cancel?.refs), refunds: n0(refunds?.n), refundCents: n0(refunds?.c),
    seasonRefunds: n0(sref?.n), seasonRefundCents: n0(sref?.c), followupsSent: n0(k.followup_sent?.n), followupsSkipped: n0(k.followup_skipped?.n),
    stops: n0(k.stopped?.n), errors: n0(k.error?.n), narrated: n0(narr?.n), narrationFallbacks: n0(narr?.f),
    support: n0(sup?.n), supportAuto: n0(sup?.n) - n0(sup?.f) - n0(sup?.i), supportToMick: n0(sup?.f),
  };
}

// ---------- the report ----------
interface Visits { cur: VisitCounts | null; prev: VisitCounts | null; state: "ok" | "missing" | "failed" }

async function getVisits(fn: VisitsFn | null | undefined, ranges: Array<[string, string]>): Promise<{ state: Visits["state"]; out: Array<VisitCounts | null> }> {
  if (!fn) return { state: "missing", out: ranges.map(() => null) };
  try { return { state: "ok", out: await Promise.all(ranges.map(([f, t]) => fn(f, t))) }; }
  catch { return { state: "failed", out: ranges.map(() => null) }; }
}

/**
 * The KPI report for the 7 full Brisbane days before `now` against the 7 before those. Revenue is readings + gifts as D1
 * stores them (status now, so refunded sales are out); Season revenue isn't stored, so Season is counts only.
 */
export async function buildKpiReport(db: D1Database, now: Date, opts: KpiOpts = {}): Promise<KpiReport> {
  const today = brisDate(now);
  const end = brisMidnight(today);
  const iso = (t: number) => new Date(t).toISOString();
  const [curFrom, curTo, prevFrom] = [iso(end - 7 * DAY), iso(end), iso(end - 14 * DAY)];
  const gate = nextGate(today);
  const killRange: [string, string] = [iso(end - 28 * DAY), curTo];

  const ranges: Array<[string, string]> = [[curFrom, curTo], [prevFrom, curFrom]];
  if (gate?.id === "kill") ranges.push(killRange);
  const [cur, prev, visitsRes, refPv, refPaid, subs, mt, best] = await Promise.all([
    week(db, curFrom, curTo), week(db, prevFrom, curFrom), getVisits(opts.visits, ranges),
    db.prepare("SELECT COALESCE(ref,'(none)') ref, COUNT(*) n FROM previews WHERE created_at >= ? AND created_at < ? GROUP BY 1 ORDER BY n DESC, ref LIMIT 5").bind(curFrom, curTo).all<{ ref: string; n: number }>(),
    db.prepare(`SELECT COALESCE(pv.ref,'(none)') ref, COUNT(*) n, SUM(pu.amount_cents) c FROM purchases pu JOIN previews pv ON pv.id = pu.preview_id WHERE pu.status IN ${LIVE} AND pu.amount_cents > 0 AND pu.created_at >= ? AND pu.created_at < ? GROUP BY 1 ORDER BY n DESC, c DESC, ref LIMIT 5`).bind(curFrom, curTo).all<{ ref: string; n: number; c: number }>(),
    db.prepare("SELECT status, COUNT(*) n FROM subscriptions GROUP BY status").all<{ status: string; n: number }>(),
    (async () => { const t = monthTarget(now); return t ? { t, rev: await revenueBetween(db, t.startIso, iso(now.getTime())) } : null; })(),
    db.prepare(`SELECT m, SUM(c) c FROM (
        SELECT substr(datetime(created_at,'+10 hours'),1,7) m, amount_cents c FROM purchases WHERE status IN ${LIVE} AND amount_cents > 0
        UNION ALL SELECT substr(datetime(created_at,'+10 hours'),1,7) m, amount_cents c FROM gifts WHERE COALESCE(redeemed_at,'') != 'refunded'
      ) GROUP BY m ORDER BY c DESC LIMIT 1`).first<{ m: string; c: number }>(),
  ]);
  const visits: Visits = { state: visitsRes.state, cur: visitsRes.out[0] ?? null, prev: visitsRes.out[1] ?? null };
  const curRev = cur.readingCents + cur.giftCents, prevRev = prev.readingCents + prev.giftCents;
  const pvPaid = [pct(cur.paid, cur.previews), pct(prev.paid, prev.previews)];
  const vPaid = [visits.cur ? pct(cur.paid, visits.cur.visitors) : null, visits.prev ? pct(prev.paid, visits.prev.visitors) : null];
  const sub = Object.fromEntries(subs.results.map((r) => [r.status, n0(r.n)]));

  // ---- gate line ----
  let gateLine = "Gates: all dates passed (last was Gate C, 30 Jun 2027).";
  let gateFailing = false;
  if (gate) {
    const left = daysTo(today, gate.by);
    const when = `${nice(gate.by)}, ${left === 0 ? "today" : `${left} day${left === 1 ? "" : "s"}`}`;
    if (gate.id === "A") {
      const v = vPaid[0];
      const okV = v !== null && v >= 2, okP = cur.previews >= 1500;
      gateFailing = !(okV && okP);
      gateLine = `${gate.name} (by ${when}): visit→paid ${v === null ? "n/a" : pctS(v)} of 2.0% · previews/week ${int(cur.previews)} of 1,500 · ${okV && okP ? "met" : v === null ? "not measurable without visits" : "not met"}`;
    } else if (gate.id === "kill") {
      const kv = visitsRes.out[2] ?? null;
      const paid28 = kv ? (await revenueBetween(db, killRange[0], killRange[1])).paid : 0;
      const v = kv ? pct(paid28, kv.visitors) : null;
      gateFailing = v === null || v < 1.5;
      gateLine = `${gate.name} (${when}): visit→paid over 4 weeks ${v === null ? "n/a" : pctS(v)}, line is 1.5% · ${v === null ? "not measurable without visits" : v < 1.5 ? "BELOW: rework the offer before more spend" : "above"}`;
    } else if (gate.id === "B") {
      gateFailing = false;
      gateLine = `${gate.name} (${when}): ads cost per buyer under $20 · ads not running`;
    } else {
      const mtd = mt?.rev.cents ?? 0;
      gateFailing = mtd < 100000 * 100 && left <= 21;
      gateLine = `${gate.name} (${when}): a $100,000 month · this month ${usd(mtd)} so far · best month ${best ? `${usd(n0(best.c))} (${best.m})` : "none yet"}`;
    }
  }

  // ---- headline ----
  type Cand = { label: string; cur: number; prev: number; base: number; fmt: (x: number) => string; badUp?: boolean };
  const cands: Cand[] = [
    { label: "Previews", cur: cur.previews, prev: prev.previews, base: prev.previews, fmt: int },
    { label: "Paid readings", cur: cur.paid, prev: prev.paid, base: prev.paid, fmt: int },
    { label: "Revenue", cur: curRev, prev: prevRev, base: prev.paid, fmt: usd },
    { label: "Errors", cur: cur.errors, prev: prev.errors, base: Math.max(cur.errors, prev.errors), fmt: int, badUp: true },
  ];
  if (pvPaid[0] !== null && pvPaid[1] !== null) cands.push({ label: "Preview→paid", cur: pvPaid[0], prev: pvPaid[1], base: prev.previews >= 20 ? 5 : 0, fmt: pctS });
  if (visits.cur && visits.prev) cands.push({ label: "Visits", cur: visits.cur.visitors, prev: visits.prev.visitors, base: visits.prev.visitors >= 50 ? 5 : 0, fmt: int });
  if (vPaid[0] !== null && vPaid[1] !== null) cands.push({ label: "Visit→paid", cur: vPaid[0], prev: vPaid[1], base: visits.prev!.visitors >= 50 ? 5 : 0, fmt: pctS });
  const drops = cands
    .filter((c) => c.base >= 5 && (c.badUp ? c.cur > c.prev : c.cur < c.prev) && c.prev > 0)
    .map((c) => ({ c, worse: Math.abs(c.cur - c.prev) / c.prev }))
    .filter((d) => d.worse >= 0.1)
    .sort((a, b) => b.worse - a.worse);
  const gateSoon = !!gate && daysTo(today, gate.by) <= 21 && gateFailing;
  let headline: string;
  if (gateSoon) headline = `Look at: ${gateLine}`;
  else if (drops.length) {
    const { c, worse } = drops[0]!;
    headline = `Look at: ${c.label} ${c.badUp ? "up" : "down"} ${Math.round(worse * 100)}% (${c.fmt(c.cur)} vs ${c.fmt(c.prev)})`;
  } else if (cur.previews === 0 && prev.previews === 0) headline = "No previews in either week yet: look at traffic first.";
  else headline = `Nothing fell 10% or more week on week. ${gate ? gateLine : ""}`.trim();

  // ---- body ----
  const L: string[] = [];
  const range = (f: string, t: string) => `${short(brisDate(new Date(f)))}–${short(brisDate(new Date(Date.parse(t) - 1)))}`;
  L.push(headline, "", `Rite, ${range(curFrom, curTo)} vs ${range(prevFrom, curFrom)} (full days, Brisbane)`, "");
  L.push("FUNNEL");
  if (visits.state === "ok" && visits.cur && visits.prev) L.push(`  Visitors: ${int(visits.cur.visitors)} vs ${int(visits.prev.visitors)}${change(visits.cur.visitors, visits.prev.visitors)} · pageviews ${int(visits.cur.pageviews)} vs ${int(visits.prev.pageviews)}`);
  else if (visits.state === "failed") L.push("  Visits: PostHog query failed this time (key, project id or host); visit→paid left out.");
  else L.push("  Visits: add POSTHOG_PERSONAL_API_KEY (and POSTHOG_PROJECT_ID) to see visits and visit→paid.");
  L.push(`  Previews: ${int(cur.previews)} vs ${int(prev.previews)}${change(cur.previews, prev.previews)}`);
  L.push(`  Paid readings: ${int(cur.paid)} vs ${int(prev.paid)}${change(cur.paid, prev.paid)} · plus ${cur.zeroReadings} $0 reading${cur.zeroReadings === 1 ? "" : "s"} (gift codes), not in revenue`);
  L.push(`  Preview→paid: ${pctS(pvPaid[0] ?? null)} vs ${pctS(pvPaid[1] ?? null)}`);
  if (visits.state === "ok") L.push(`  Visit→paid: ${pctS(vPaid[0] ?? null)} vs ${pctS(vPaid[1] ?? null)} (paid ÷ unique visitors)`);
  L.push("", "MONEY");
  L.push(`  Revenue: ${usd(curRev)} vs ${usd(prevRev)}${change(curRev, prevRev)} · readings ${usd(cur.readingCents)}, gifts ${usd(cur.giftCents)}`);
  L.push(`  Refunds: ${cur.refunds} (${usd(cur.refundCents)}) vs ${prev.refunds} (${usd(prev.refundCents)})${cur.seasonRefunds ? ` · Season refunds ${cur.seasonRefunds} (${usd(cur.seasonRefundCents)})` : ""}`);
  L.push(`  Season: ${n0(sub.active)} active${sub.past_due ? ` (+${sub.past_due} past due)` : ""}, ${cur.seasonStarts} started, ${cur.seasonCancels} cancelled (prev week ${prev.seasonStarts} started, ${prev.seasonCancels} cancelled). Season revenue isn't stored in D1; see Stripe.`);
  L.push(`  Gifts: ${cur.giftsBought} bought, ${cur.giftsRedeemed} redeemed (prev ${prev.giftsBought}, ${prev.giftsRedeemed})`);
  if (mt) {
    const p = mt.t.proRatedCents ? Math.round(mt.rev.cents / mt.t.proRatedCents * 100) : 0;
    L.push(`  Month to date (${mt.t.month}, day ${mt.t.day} of ${mt.t.days}): ${usd(mt.rev.cents)} vs ${usd(mt.t.proRatedCents)} pro-rated, ${p}% (month target ${usd(mt.t.targetCents)})`);
  } else L.push(`  Month to date (${today.slice(0, 7)}): no plan target this month (targets run 2026-11 to 2027-10).`);
  L.push("", "NEXT GATE", `  ${gateLine}`);
  L.push("", "OPERATIONS");
  L.push(`  Follow-ups: ${cur.followupsSent} sent, ${cur.followupsSkipped} skipped · stops: ${cur.stops}`);
  L.push(`  Narration: ${cur.narrated} narrated, ${cur.narrationFallbacks} on the fallback voice`);
  if (cur.support || prev.support) L.push(`  Support inbox: ${cur.support} emails (${(cur.support / 7).toFixed(1)} a day), ${cur.supportAuto} handled automatically, ${cur.supportToMick} to you (prev week ${prev.support}, ${prev.supportAuto}, ${prev.supportToMick})`);
  const errs = await db.prepare("SELECT COALESCE(CASE WHEN json_valid(detail) THEN json_extract(detail,'$.where') END,'(no where)') w, COUNT(*) n FROM events WHERE kind='error' AND at >= ? AND at < ? GROUP BY 1 ORDER BY n DESC, w LIMIT 5").bind(curFrom, curTo).all<{ w: string; n: number }>();
  L.push(`  Errors: ${cur.errors} vs ${prev.errors}${errs.results.length ? ` · ${errs.results.map((r) => `${r.w} ${r.n}`).join(", ")}` : ""}`);
  L.push("", "BY SOURCE (ref, last 7 days)");
  L.push(`  Previews: ${refPv.results.length ? refPv.results.map((r) => `${r.ref} ${int(r.n)}`).join(", ") : "none"}`);
  L.push(`  Paid: ${refPaid.results.length ? refPaid.results.map((r) => `${r.ref} ${int(r.n)} (${usd(n0(r.c))})`).join(", ") : "none"}`);
  if (opts.siteUrl) L.push("", `${opts.siteUrl}/admin?days=7`);

  const subject = `Rite week to ${short(brisDate(new Date(end - 1)))}: ${headline.replace(/^Look at: /, "")}`.slice(0, 140);
  return { subject, headline, text: L.join("\n") + "\n" };
}

/**
 * Visits from PostHog's query API (HogQL), when both POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are set; null
 * otherwise. `host` is POSTHOG_HOST: the ingest host (us.i.posthog.com) maps to the app host (us.posthog.com).
 */
export function posthogVisits(cfg: { key?: string; project?: string; host?: string }, f: (u: string, i: RequestInit) => Promise<Response> = (u, i) => fetch(u, i)): VisitsFn | null {
  if (!cfg.key || !cfg.project) return null;
  const host = (cfg.host || "https://us.i.posthog.com").replace(/\/$/, "").replace(".i.posthog.com", ".posthog.com");
  const ts = (x: string) => x.slice(0, 19).replace("T", " "); // HogQL: 'YYYY-MM-DD HH:MM:SS', read as UTC below
  return async (from, to) => {
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(from) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(to)) throw new Error("bad range");
    const query = `SELECT count(), count(DISTINCT distinct_id) FROM events WHERE event = '$pageview' AND timestamp >= toDateTime('${ts(from)}', 'UTC') AND timestamp < toDateTime('${ts(to)}', 'UTC')`;
    const res = await f(`${host}/api/projects/${encodeURIComponent(cfg.project!)}/query/`, {
      method: "POST", headers: { authorization: `Bearer ${cfg.key}`, "content-type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    if (!res.ok) throw new Error(`posthog ${res.status}`);
    const j = await res.json() as { results?: unknown[][] };
    const row = j.results?.[0];
    if (!row || row.length < 2) throw new Error("posthog: no results");
    return { pageviews: Number(row[0]) || 0, visitors: Number(row[1]) || 0 };
  };
}
