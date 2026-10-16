// Saturn Season: the pure date/plan logic behind the subscription. No Stripe, no D1 here, so it's all unit-testable.
import { localToUtc } from "./geo";
import { fmtDay, type Computed, type Cycle } from "./compute";
import type { Phase } from "./astro/saturn";

export type SeasonPlan = "month" | "year";
export const NOTE_HOUR = 7; // notes go out Mondays at 07:00 in the subscriber's own timezone (see runSeason)
export const YEARLY_MIN_MONTHS = 9;  // yearly is only offered when at least this much window remains
export const WINDOW_OPEN_NOTIFY_MONTHS = 12; // "tell me when my window opens" shows when the window is further out than this
export const WINDOW_OPEN_LEAD_DAYS = 30;     // and the email goes out this many days before it opens

const DAY = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Local calendar date and weekday (0 = Sun) for an instant in `tz`. */
function localParts(tz: string, at: Date): { date: string; dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
  return { date: `${g("year")}-${g("month")}-${g("day")}`, dow, hour: parseInt(g("hour"), 10) };
}

/** The next instant the Monday-07:00 cron would send a note for a subscriber in `tz`, strictly after `from`. */
export function nextNoteDate(tz: string, from = new Date()): Date {
  const { date, dow, hour } = localParts(tz, from);
  let daysAhead = (1 - dow + 7) % 7;                 // days until the next Monday (0 if today is Monday)
  if (daysAhead === 0 && hour >= NOTE_HOUR) daysAhead = 7; // today's slot has passed
  const target = new Date(Date.parse(date + "T00:00:00Z") + daysAhead * DAY);
  return localToUtc(ymd(target), `${String(NOTE_HOUR).padStart(2, "0")}:00`, tz);
}

/** Full calendar months between `today` and the paid period's end. Partial months don't count. Capped to 0..12. */
export function unusedMonths(today: Date, periodEnd: Date): number {
  if (periodEnd.getTime() <= today.getTime()) return 0;
  let n = 0;
  const t = new Date(today.getTime());
  for (;;) {
    const next = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), t.getUTCHours(), t.getUTCMinutes()));
    if (next.getTime() > periodEnd.getTime()) break;
    n++; t.setTime(next.getTime());
    if (n >= 12) break;
  }
  return n;
}

/** Refund for a yearly plan that closed early: the unused twelfths of the yearly price, rounded to the cent. */
export function yearlyRefundCents(yearlyCents: number, unused: number): number {
  const u = Math.max(0, Math.min(12, Math.floor(unused)));
  return Math.round(yearlyCents * u / 12);
}

/** Add calendar months to a date (UTC), clamping the day to the month's length. */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + months, day = d.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), d.getUTCHours(), d.getUTCMinutes()));
}

/** Yearly is only worth offering when the window still has at least nine months to run. */
export function yearlyAllowed(windowEnd: string, today = new Date()): boolean {
  return Date.parse(windowEnd) >= addMonths(today, YEARLY_MIN_MONTHS).getTime();
}

/** Show the "tell me when my window opens" capture instead of pass reminders: not in the window yet and more than a year out. */
export function windowOpenNotify(phase: Phase, windowStart: string, today = new Date()): boolean {
  return phase === "not_yet" && Date.parse(windowStart) > addMonths(today, WINDOW_OPEN_NOTIFY_MONTHS).getTime();
}

/** The day the window-open reminder should go out. */
export function windowOpenSendOn(windowStart: string): string {
  return ymd(new Date(Date.parse(windowStart) - WINDOW_OPEN_LEAD_DAYS * DAY));
}

export type SeasonPhase = "approach" | "contact" | "integration" | "complete";

/** Which third of the return the subscriber is in today, from the computed phase and the hit dates. */
export function seasonPhase(c: Computed, today = new Date()): SeasonPhase {
  if (c.phase === "complete") return "complete";
  const d = ymd(today); const hits = c.window.hits;
  if (d < hits[0]) return "approach";
  if (d <= hits[hits.length - 1]) return "contact";
  return "integration";
}

/** The chapter of the reading to point this week's note at. */
export function rereadChapter(phase: SeasonPhase): { hash: string; name: string } {
  switch (phase) {
    case "approach": return { hash: "#c7", name: "Workbook" };
    case "contact": return { hash: "#c3", name: "The pass and the turn" };
    default: return { hash: "#c5", name: "Month by month" };
  }
}

export interface Upcoming { date: string; label: string }

/** Every dated thing inside the next `days` days: stage openings, exact passes, the next station. Deduped, in date order. */
export function upcomingDates(c: Computed, cy: Cycle, today = new Date(), days = 30): Upcoming[] {
  const from = ymd(today), to = ymd(new Date(today.getTime() + days * DAY));
  const seen = new Set<string>(); const out: Upcoming[] = [];
  const add = (date: string, label: string) => { if (date >= from && date <= to && !seen.has(date)) { seen.add(date); out.push({ date, label }); } }; // one line per day; stage labels win
  for (const e of cy.stageEvents) add(e.date, e.label);
  c.window.hits.forEach((h, i) => add(h, c.window.hits.length === 1 ? "Exact pass" : `Exact pass ${i + 1} of ${c.window.hits.length}`));
  if (c.nextStation) add(c.nextStation.date, `Saturn stations ${c.nextStation.to}`);
  if (cy.turn) add(cy.turn.date, `Closest turn (${cy.turn.orb}° off)`);
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
}

/** The "Coming up" block of the note, written by code so no date can drift. */
export function comingUpText(items: Upcoming[]): string {
  if (!items.length) return "Coming up in the next 30 days: nothing dated. Steady transit.";
  return `Coming up in the next 30 days:\n${items.map((u) => `- ${fmtDay(u.date)}: ${u.label}`).join("\n")}`;
}
