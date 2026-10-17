import { describe, it, expect } from "vitest";
import { followupSchedule, followupDue, followupSkip, stageSeasonLine, type FollowupState } from "../src/followups";
import { lastMondayLocal, sampleNote, noteFacts, positionLine } from "../src/season";
import { compute } from "../src/compute";
import { day3Email, day10Email, stageReminderEmail } from "../src/email";
import { localToUtc } from "../src/geo";

describe("follow-up schedule", () => {
  it("stores day 3 and day 10 on the reader's local calendar", () => {
    // 17 Oct 2026 22:00Z is already 18 Oct in Melbourne (UTC+11)
    expect(followupSchedule("Australia/Melbourne", new Date("2026-10-17T22:00:00Z"))).toEqual([
      { kind: "day3", sendOn: "2026-10-21" }, { kind: "day10", sendOn: "2026-10-28" },
    ]);
    // …and still 17 Oct in Los Angeles
    expect(followupSchedule("America/Los_Angeles", new Date("2026-10-17T22:00:00Z"))).toEqual([
      { kind: "day3", sendOn: "2026-10-20" }, { kind: "day10", sendOn: "2026-10-27" },
    ]);
    // month/year rollover
    expect(followupSchedule("UTC", new Date("2026-12-28T12:00:00Z")).map((f) => f.sendOn)).toEqual(["2026-12-31", "2027-01-07"]);
  });
});

describe("follow-up due", () => {
  const tz = "Australia/Brisbane"; // UTC+10, no DST
  it("waits until 09:00 local on the day", () => {
    expect(followupDue("2026-10-21", tz, new Date("2026-10-20T12:00:00Z"))).toBe("wait");   // 20 Oct 22:00 local
    expect(followupDue("2026-10-21", tz, new Date("2026-10-20T22:00:00Z"))).toBe("wait");   // 21 Oct 08:00 local
    expect(followupDue("2026-10-21", tz, new Date("2026-10-20T23:00:00Z"))).toBe("send");   // 21 Oct 09:00 local
    expect(followupDue("2026-10-21", tz, new Date("2026-10-22T01:00:00Z"))).toBe("send");   // a day late, early morning: still send
  });
  it("expires a week after its day rather than sending late", () => {
    expect(followupDue("2026-10-21", tz, new Date("2026-10-28T03:00:00Z"))).toBe("send");    // 28 Oct local, the 7th day
    expect(followupDue("2026-10-21", tz, new Date("2026-10-29T03:00:00Z"))).toBe("expired"); // 29 Oct local
  });
});

describe("follow-up skip rules", () => {
  const base: FollowupState = { kind: "day3", today: "2026-10-21", email: "a@b.co", purchaseStatus: "generated", windowEnd: "2028-04-12", subscribed: false, calendarAdded: false };
  it("day 3 sends by default", () => expect(followupSkip(base)).toBeNull());
  it("day 3 skips refunded, closed windows, readers who added the dates, and rows with no email", () => {
    expect(followupSkip({ ...base, purchaseStatus: "refunded" })).toBe("refunded");
    expect(followupSkip({ ...base, windowEnd: "2026-10-20" })).toBe("window_closed");
    expect(followupSkip({ ...base, windowEnd: "2026-10-21" })).toBeNull(); // closes today: still open
    expect(followupSkip({ ...base, calendarAdded: true })).toBe("calendar_added");
    expect(followupSkip({ ...base, email: "" })).toBe("no_email");
    expect(followupSkip({ ...base, purchaseStatus: "failed" })).toBe("not_generated");
  });
  it("day 3 doesn't care about Season", () => expect(followupSkip({ ...base, subscribed: true })).toBeNull());
  const d10: FollowupState = { ...base, kind: "day10", today: "2026-10-28" };
  it("day 10 sends to non-subscribers with time left", () => expect(followupSkip(d10)).toBeNull());
  it("day 10 skips subscribers (active or past_due), refunds, and windows closing within 60 days", () => {
    expect(followupSkip({ ...d10, subscribed: true })).toBe("subscribed");
    expect(followupSkip({ ...d10, purchaseStatus: "refunded" })).toBe("refunded");
    expect(followupSkip({ ...d10, windowEnd: "2026-12-26" })).toBe("window_closing"); // 59 days
    expect(followupSkip({ ...d10, windowEnd: "2026-12-27" })).toBeNull();             // exactly 60
    expect(followupSkip({ ...d10, windowEnd: "2026-01-01" })).toBe("window_closing"); // already closed
    expect(followupSkip({ ...d10, calendarAdded: true })).toBeNull();
  });
});

describe("Season line in stage reminders", () => {
  it("only for non-subscribers with at least 30 days of window after the stage", () => {
    expect(stageSeasonLine(false, "2028-04-12", "2027-04-28")).toBe(true);
    expect(stageSeasonLine(true, "2028-04-12", "2027-04-28")).toBe(false);
    expect(stageSeasonLine(false, "2028-04-12", "2028-04-12")).toBe(false); // the window-close reminder itself
    expect(stageSeasonLine(false, "2028-04-12", "2031-01-01")).toBe(false); // squares after the window
  });
  it("the email adds one closing line with the link, and only when asked", () => {
    const base = { firstName: "Sam", label: "Contact opens", onDate: "28 Apr 2027", readingUrl: "https://rite.test/r/t", stageKey: "contact", stopUrl: "https://rite.test/stop/t" };
    const off = stageReminderEmail({ ...base, subscribed: true, seasonUrl: "https://rite.test/r/t#season", monthlyPrice: 7 });
    expect(off.text).not.toContain("Saturn Season");
    const on = stageReminderEmail({ ...base, subscribed: false, seasonUrl: "https://rite.test/r/t#season", monthlyPrice: 7 });
    expect(on.text).toContain("Saturn Season is a short note each Monday until your window closes, $7 a month, and it stops itself: https://rite.test/r/t#season");
    expect(stageReminderEmail(base).text).not.toContain("Saturn Season");
    expect(stageReminderEmail(base).text).toContain("Stop these: https://rite.test/stop/t");
  });
});

describe("day-3 and day-10 emails", () => {
  it("day 3 links chapter three and the workbook", () => {
    const m = day3Email({ firstName: null, readingUrl: "https://rite.test/r/t", stopUrl: "https://rite.test/stop/t" });
    expect(m.text).toContain("https://rite.test/stop/t");
    expect(m.subject).toBe("Did you put the dates in your calendar?");
    expect(m.text).toMatch(/^Hi,/);
    expect(m.text).toContain("https://rite.test/r/t#c3");
    expect(m.text).toContain("https://rite.test/r/t#c7");
  });
  it("day 10 quotes a live, code-built note for the reader's chart", () => {
    const tz = "Australia/Melbourne";
    const place = { label: "Melbourne", lat: -37.81, lon: 144.96, tz };
    // Wed 28 Oct 2026 → the note "you'd have got this Monday" is Mon 26 Oct, 07:00 Melbourne
    const nowD = new Date("2026-10-28T00:00:00Z");
    expect(lastMondayLocal(tz, nowD)).toBe("2026-10-26");
    const monday = localToUtc(lastMondayLocal(tz, nowD), "07:00", tz);
    const c = compute({ date: "1997-06-01", time: null, place }, monday);
    const sn = sampleNote(c, monday);
    expect(sn.position).toMatch(/^Saturn is at \d+° Aries, \d+(\.\d)?° from your natal degree\. It's retrograde until \d+ Dec 2026/);
    expect(sn.body).toContain("One thing this week:");
    const m = day10Email({ firstName: "Sam", windowEnd: "12 Apr 2028", position: sn.position, body: sn.body, comingUp: sn.comingUp, seasonUrl: "https://rite.test/r/t#season", monthlyPrice: 7, yearlyPrice: 59, stopUrl: "https://rite.test/stop/t" });
    expect(m.text).toContain("stop these here: https://rite.test/stop/t");
    expect(m.subject).toBe("What a Monday note looks like");
    expect(m.text).toContain("until your window closes on 12 Apr 2028");
    expect(m.text).toContain(`> ${sn.position}`);
    expect(m.text).toContain("> One thing this week:");
    expect(m.text).toContain("> Coming up in the next 30 days:");
    expect(m.text).toContain("$7 a month or $59 a year");
    expect(m.text).not.toMatch(/\{|undefined|NaN/);
    expect(day10Email({ firstName: null, windowEnd: "x", position: "p", body: "b", comingUp: "c", seasonUrl: "u", monthlyPrice: 7, yearlyPrice: null, stopUrl: "s" }).text).not.toContain("a year");
  });
  it("Monday rolls back across the week in the reader's zone, Monday itself included", () => {
    expect(lastMondayLocal("Australia/Brisbane", new Date("2026-10-18T21:00:00Z"))).toBe("2026-10-19"); // Mon 07:00 local
    expect(lastMondayLocal("Australia/Brisbane", new Date("2026-10-18T13:00:00Z"))).toBe("2026-10-12"); // Sun 23:00 local
    expect(lastMondayLocal("America/New_York", new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-26");   // Sat 31 Oct local
  });
  it("note facts match what the weekly email prints", () => {
    const t = new Date("2026-10-19T00:00:00Z");
    const c = compute({ date: "1997-06-01", time: null, place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } }, t);
    const f = noteFacts(c, t);
    expect(f.phase).toBe("approach");
    expect(f.reread.hash).toBe("#c7");
    expect(positionLine(f)).toContain(`${f.orbText} ${f.dir} your natal degree`);
    expect(f.allowed.length).toBeGreaterThan(0);
  });
});

describe("delivery emails", () => {
  const base = { firstName: "Ana", sign: "Aries", housePhrase: ", in your ninth house", windowStart: "May 2025", windowEnd: "Apr 2028", hitSentence: "One exact pass: 29 Apr 2027.", reportUrl: "https://rite.test/r/t" };
  it("a bought reading quotes prices from config and drops the yearly price when it isn't offered", async () => {
    const { deliveryEmail } = await import("../src/email");
    const m = deliveryEmail({ ...base, upsellUrl: "u", monthlyPrice: 8, yearlyPrice: 69 });
    expect(m.text).toContain("Saturn in Aries, in your ninth house.");
    expect(m.text).toContain("$8 a month, or $69 a year, and it stops itself");
    expect(deliveryEmail({ ...base, upsellUrl: "u", monthlyPrice: 7, yearlyPrice: null }).text).not.toContain("a year");
  });
  it("a gift recipient gets their own copy: who it's from, no refund line", async () => {
    const { giftDeliveryEmail } = await import("../src/email");
    const m = giftDeliveryEmail({ ...base, from: "Jo" });
    expect(m.subject).toBe("Jo gave you your Saturn return");
    expect(m.text).toContain("Jo bought you this.");
    expect(m.text).toContain("we'll fix it");
    expect(m.text).not.toContain("refund");
    const anon = giftDeliveryEmail({ ...base, from: null });
    expect(anon.subject).toBe("Your Saturn return, a gift");
    expect(anon.text).not.toMatch(/null|bought you|P\.S\./);
  });
});
