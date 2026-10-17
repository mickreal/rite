// What makes a line tied to the calendar, shared by rolling-plan.ts (which avoids such material) and
// check-captions.ts (which fails a scheduled week whose captions have gone stale).
import { unspeak } from "../clips/spoken";

export const WRITTEN = "2026-10-17"; // the kit's and the launch plans' "now"
export const RELATIVE = /\b(today|tonight|right now|this (week|month|year)|next (week|month|year|spring|summer|autumn|fall|winter|april|may|june|july|august|september|october|november|december|january|february|march)|new year|weeks? (from now|away)|days? (from now|away)|\d+ weeks|four weeks|eighteen months|a year and a half|in about)\b/i;
const DAY = 86400000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const norm = (v: unknown) => unspeak((typeof v === "string" ? v : JSON.stringify(v)).replace(/\[pause \d+\]/g, " ")); // VO is spelled out; carousel list items can be objects

/** The first calendar-relative phrase ("today", "this year", …) in `texts`, or null. */
export function relative(texts: unknown[]): string | null {
  for (const v of texts) { if (!v) continue; const m = norm(v).match(RELATIVE); if (m) return `"${m[0]}"`; }
  return null;
}

/** A date in `texts` that was still ahead on WRITTEN and has passed (or is within `marginDays`, default 2) on `date`, or null.
 *  A date without a year is the next one on or after WRITTEN; a month on its own ("Dec 2026") once it has ended
 *  (`months: false` skips those: "passes in May and October 2026" is a fact, not a promise). */
export function passed(texts: unknown[], date: string, { marginDays = 2, months = true } = {}): string | null {
  for (const v of texts) {
    if (!v) continue;
    const t = norm(v);
    for (const m of t.matchAll(/\b(\d{1,2})(?: (?:–|-|to) \d{1,2})? (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:,? (\d{4}))?/g)) {
      let d = Date.UTC(m[3] ? +m[3] : +WRITTEN.slice(0, 4), MON[m[2].toLowerCase()], +m[1]);
      if (!m[3] && d < ms(WRITTEN)) d = Date.UTC(+WRITTEN.slice(0, 4) + 1, MON[m[2].toLowerCase()], +m[1]);
      if (d >= ms(WRITTEN) && d < ms(date) + marginDays * DAY) return `"${m[0]}" has passed`;
    }
    if (months) for (const m of t.matchAll(/(?<!\d )\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{4})\b/g)) {
      const end = Date.UTC(+m[2], MON[m[1].toLowerCase()] + 1, 1) - DAY;
      if (end >= ms(WRITTEN) && end < ms(date)) return `"${m[0]}" has passed`;
    }
  }
  return null;
}

/** Why `texts` can't go out on `date` (null when they can). */
export const stale = (texts: unknown[], date: string) => relative(texts) ?? passed(texts, date);
