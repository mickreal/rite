// Day-3 and day-10 follow-up emails to reading owners: when they're due and when to skip them. Pure (no D1, no email),
// so the scheduling rules are unit-tested; runFollowups in index.ts does the I/O.
import { localParts } from "./season";

export type FollowupKind = "day3" | "day10";
export const FOLLOWUP_DAYS: Record<FollowupKind, number> = { day3: 3, day10: 10 };
export const FOLLOWUP_SEND_HOUR = 9;          // not before 09:00 in the reader's birthplace zone (the zone we have)
export const FOLLOWUP_EXPIRE_DAYS = 7;        // a follow-up that couldn't go out within a week of its day is dropped, not sent late
export const DAY10_MIN_WINDOW_DAYS = 60;      // no Season pitch when the window closes within this many days
export const STAGE_SEASON_MIN_DAYS = 30;      // stage reminders only mention Season when this much window is left after the stage

const DAY = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => ymd(new Date(Date.parse(iso + "T00:00:00Z") + n * DAY));

/** The two rows to store when a reading is written: local calendar date of `generatedAt` in `tz`, plus 3 and 10 days. */
export function followupSchedule(tz: string, generatedAt = new Date()): Array<{ kind: FollowupKind; sendOn: string }> {
  const { date } = localParts(tz, generatedAt);
  return (Object.keys(FOLLOWUP_DAYS) as FollowupKind[]).map((kind) => ({ kind, sendOn: addDays(date, FOLLOWUP_DAYS[kind]) }));
}

/** Whether a row is due now: from 09:00 local on its day; "expired" once it's more than a week late. */
export function followupDue(sendOn: string, tz: string, now = new Date()): "wait" | "send" | "expired" {
  const { date, hour } = localParts(tz, now);
  if (date < sendOn) return "wait";
  if (date > addDays(sendOn, FOLLOWUP_EXPIRE_DAYS)) return "expired";
  if (date === sendOn && hour < FOLLOWUP_SEND_HOUR) return "wait";
  return "send";
}

export interface FollowupState {
  kind: FollowupKind;
  today: string;            // YYYY-MM-DD
  email: string | null;
  purchaseStatus: string;   // paid | writing | generated | failed | refunded
  windowEnd: string;        // YYYY-MM-DD, the window this reading is about
  subscribed: boolean;      // an active or past_due Saturn Season subscription
  calendarAdded: boolean;   // the reader already downloaded a calendar file
}

/** Why this follow-up shouldn't go out, or null to send it. */
export function followupSkip(s: FollowupState): string | null {
  if (!s.email) return "no_email";
  if (s.purchaseStatus === "refunded") return "refunded";
  if (s.purchaseStatus !== "generated") return "not_generated";
  if (s.kind === "day3") {
    if (s.today > s.windowEnd) return "window_closed";
    if (s.calendarAdded) return "calendar_added";
    return null;
  }
  if (s.subscribed) return "subscribed";
  if (s.windowEnd < addDays(s.today, DAY10_MIN_WINDOW_DAYS)) return "window_closing";
  return null;
}

/** Stage reminders close with a Saturn Season line only for non-subscribers with real window left after the stage. */
export function stageSeasonLine(subscribed: boolean, windowEnd: string, onDate: string): boolean {
  return !subscribed && windowEnd >= addDays(onDate, STAGE_SEASON_MIN_DAYS);
}

