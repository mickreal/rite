import { describe, it, expect } from "vitest";
import { nextNoteDate, nextNoteAfterLast, unusedMonths, yearlyRefundCents, yearlyAllowed, windowOpenNotify, windowOpenSendOn, addMonths, seasonPhase, rereadChapter, upcomingDates, comingUpText } from "../src/season";
import { compute, cycle } from "../src/compute";
import { resultPage } from "../src/views/result";
import { seasonManagePage } from "../src/views/season";
import { seasonEmail } from "../src/email";

const inTz = (d: Date, tz: string) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

describe("next note date (Monday 07:00 local)", () => {
  it("is the coming Monday 07:00 in the subscriber's zone", () => {
    // Fri 16 Oct 2026 14:00 Brisbane (UTC+10) → Mon 19 Oct 07:00 Brisbane = 18 Oct 21:00Z
    const d = nextNoteDate("Australia/Brisbane", new Date("2026-10-16T04:00:00Z"));
    expect(d.toISOString()).toBe("2026-10-18T21:00:00.000Z");
    expect(inTz(d, "Australia/Brisbane")).toMatch(/Mon.*07:00/);
  });
  it("on a Monday before 07:00 it is today; at or after 07:00 it is next week", () => {
    // Mon 19 Oct 2026 06:30 Brisbane = 18 Oct 20:30Z
    expect(nextNoteDate("Australia/Brisbane", new Date("2026-10-18T20:30:00Z")).toISOString()).toBe("2026-10-18T21:00:00.000Z");
    // Mon 19 Oct 2026 07:00 Brisbane = 18 Oct 21:00Z → the following Monday
    expect(nextNoteDate("Australia/Brisbane", new Date("2026-10-18T21:00:00Z")).toISOString()).toBe("2026-10-25T21:00:00.000Z");
  });
  it("respects DST in the subscriber's zone", () => {
    // London: Sun 25 Oct 2026 is the clocks-back day; Mon 26 Oct 07:00 GMT = 07:00Z
    const d = nextNoteDate("Europe/London", new Date("2026-10-21T12:00:00Z"));
    expect(d.toISOString()).toBe("2026-10-26T07:00:00.000Z");
    // Before the change, Mon 19 Oct 07:00 BST = 06:00Z
    expect(nextNoteDate("Europe/London", new Date("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-19T06:00:00.000Z");
    // New York, same week: Mon 19 Oct 07:00 EDT = 11:00Z
    expect(nextNoteDate("America/New_York", new Date("2026-10-14T12:00:00Z")).toISOString()).toBe("2026-10-19T11:00:00.000Z");
  });
});

describe("unused months and yearly refund", () => {
  it("counts only full calendar months left in the paid period", () => {
    const end = new Date("2027-06-01T00:00:00Z");
    expect(unusedMonths(new Date("2026-06-01T00:00:00Z"), end)).toBe(12);
    expect(unusedMonths(new Date("2026-10-17T00:00:00Z"), end)).toBe(7);   // 17 Nov … 17 May are full; 17 Jun is past the end
    expect(unusedMonths(new Date("2027-05-02T00:00:00Z"), end)).toBe(0);   // under a month left
    expect(unusedMonths(new Date("2027-05-01T00:00:00Z"), end)).toBe(1);   // exactly one month
    expect(unusedMonths(new Date("2027-07-01T00:00:00Z"), end)).toBe(0);   // already past
  });
  it("refunds the unused twelfths of $59, rounded to the cent, never more than 12", () => {
    expect(yearlyRefundCents(5900, 7)).toBe(3442);   // 5900 * 7/12 = 3441.67
    expect(yearlyRefundCents(5900, 12)).toBe(5900);
    expect(yearlyRefundCents(5900, 0)).toBe(0);
    expect(yearlyRefundCents(5900, 15)).toBe(5900);
    expect(yearlyRefundCents(5900, -2)).toBe(0);
  });
  it("addMonths clamps the day to the month's length", () => {
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-10-17T00:00:00Z"), 9).toISOString().slice(0, 10)).toBe("2027-07-17");
  });
});

describe("yearly gating", () => {
  const today = new Date("2026-10-17T00:00:00Z");
  it("offers yearly only when the window has at least nine months left", () => {
    expect(yearlyAllowed("2027-07-17", today)).toBe(true);
    expect(yearlyAllowed("2027-07-16", today)).toBe(false);
    expect(yearlyAllowed("2028-04-12", today)).toBe(true);
    expect(yearlyAllowed("2026-12-01", today)).toBe(false);
  });
});

describe("window-open notify", () => {
  const today = new Date("2026-10-17T00:00:00Z");
  it("shows only before the window and when it is more than a year out", () => {
    expect(windowOpenNotify("not_yet", "2028-04-20", today)).toBe(true);
    expect(windowOpenNotify("not_yet", "2027-10-17", today)).toBe(false); // exactly 12 months: not "more than"
    expect(windowOpenNotify("not_yet", "2027-10-18", today)).toBe(true);
    expect(windowOpenNotify("not_yet", "2027-03-01", today)).toBe(false);
    expect(windowOpenNotify("in_window", "2029-01-01", today)).toBe(false);
  });
  it("sends 30 days before the window opens", () => {
    expect(windowOpenSendOn("2028-04-20")).toBe("2028-03-21");
    expect(windowOpenSendOn("2028-03-01")).toBe("2028-01-31");
  });
});

describe("note phase, reread link, coming-up list", () => {
  const birth = { date: "1997-08-14", time: "06:40", place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } };
  it("maps today to approach / contact / integration from the hit dates", () => {
    const c = compute(birth, new Date("2026-10-16T00:00:00Z"));
    expect(c.window.hits).toEqual(["2027-04-28"]);
    expect(seasonPhase(c, new Date("2026-10-16T00:00:00Z"))).toBe("approach");
    expect(seasonPhase(c, new Date("2027-04-28T00:00:00Z"))).toBe("contact");
    expect(seasonPhase(c, new Date("2027-05-01T00:00:00Z"))).toBe("integration");
    expect(rereadChapter("approach").hash).toBe("#c7");
    expect(rereadChapter("contact").hash).toBe("#c3");
    expect(rereadChapter("integration").hash).toBe("#c5");
  });
  it("lists the dated things inside 30 days, in order, one per day, and only those", () => {
    const today = new Date("2027-04-10T00:00:00Z");
    const c = compute(birth, today); const cy = cycle(c, today);
    const up = upcomingDates(c, cy, today);
    expect(up.map((u) => u.date)).toContain("2027-04-28");
    expect(up.find((u) => u.date === "2027-04-28")!.label).toMatch(/Contact/);
    for (const u of up) { expect(u.date >= "2027-04-10" && u.date <= "2027-05-10").toBe(true); }
    expect(new Set(up.map((u) => u.date)).size).toBe(up.length);
    expect(up.map((u) => u.date)).toEqual([...up.map((u) => u.date)].sort());
    const text = comingUpText(up);
    expect(text).toMatch(/^Coming up in the next 30 days:\n- /);
    expect(text).toContain("28 Apr 2027");
    expect(comingUpText([])).toMatch(/nothing dated/);
  });
});

describe("manage page and note template", () => {
  const base = { token: "tok1", tz: "Australia/Brisbane", nextNote: "Mon 19 Oct, 07:00", windowEnd: "12 Apr 2028", monthlyPrice: 7, yearlyPrice: 59 };
  it("active monthly with room for yearly: both switch and stop", async () => {
    const h = String(await seasonManagePage({ siteUrl: "x", supportEmail: "hello@rite.report", d: { ...base, status: "active", plan: "month", yearlyAllowed: true } }));
    expect(h).toContain("Switch to $59 a year");
    expect(h).toContain('action="/season/cancel/tok1"');
    expect(h).toContain("$7 a month");
  });
  it("active monthly near the end: no yearly offer", async () => {
    const h = String(await seasonManagePage({ siteUrl: "x", supportEmail: "e", d: { ...base, status: "active", plan: "month", yearlyAllowed: false } }));
    expect(h).not.toContain("Switch to $59 a year");
    expect(h).toContain("isn't offered this close");
  });
  it("past_due explains the pause; canceled offers to start again", async () => {
    expect(String(await seasonManagePage({ siteUrl: "x", supportEmail: "e", d: { ...base, status: "past_due", plan: "year", yearlyAllowed: true } }))).toContain("Payment failed");
    expect(String(await seasonManagePage({ siteUrl: "x", supportEmail: "e", d: { ...base, status: "canceled", plan: null, yearlyAllowed: true } }))).toContain("Start it again");
  });
  it("note email carries the coming-up list, the reread link and the manage link", () => {
    const m = seasonEmail({ firstName: "Sam", transitDeg: "12°", transitSign: "Aries", orb: "1.2°", dir: "from", motionSentence: "It's direct.", body: "Para.\nOne thing this week: x.\nOne line to carry: y.", comingUp: "Coming up in the next 30 days:\n- 28 Apr 2027: Contact", rereadName: "Workbook", rereadUrl: "https://rite.test/r/tok1#c7", manageUrl: "https://rite.test/season/manage/tok1", welcome: true });
    expect(m.subject).toMatch(/starts/);
    expect(m.text).toContain("Reread: Workbook: https://rite.test/r/tok1#c7");
    expect(m.text).toContain("- 28 Apr 2027: Contact");
    expect(m.text).toContain("/season/manage/tok1");
    expect(m.text).toContain("Welcome to Saturn Season");
  });
});

describe("result page swaps to the window-open capture", () => {
  const today = new Date("2026-10-17T00:00:00Z");
  const render = async (c: ReturnType<typeof compute>, reminded?: boolean | "window") =>
    String(await resultPage({ siteUrl: "https://rite.test", id: "abc", c, text: "", placeLabel: "Sydney", birthLabel: "1 Jan 2000", hasTime: false, today, reminded }));
  it("more than a year before the window: one field, hidden kind=window_open", async () => {
    const c = compute({ date: "2000-06-15", time: null, place: { label: "Sydney", lat: -33.87, lon: 151.21, tz: "Australia/Sydney" } }, today);
    expect(c.phase).toBe("not_yet");
    expect(Date.parse(c.window.windowStart)).toBeGreaterThan(addMonths(today, 12).getTime());
    const h = await render(c);
    expect(h).toContain("Tell me when my window opens");
    expect(h).toContain('name="kind" value="window_open"');
    expect(h).toContain('data-kind="window_open"');
    expect(await render(c, "window")).toContain("a month before your window opens");
  });
  it("inside or near the window: the pass reminder card", async () => {
    const c = compute({ date: "1997-08-14", time: null, place: { label: "Melbourne", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } }, today);
    const h = await render(c);
    expect(h).toContain("Get a heads-up before each pass");
    expect(h).not.toContain("window_open");
    expect(h).toContain('data-kind="pass"');
  });
});

describe("next note after the welcome note", () => {
  it("skips a Monday that falls within six days of the last note, like runSeason does", () => {
    // welcome sent Sat 17 Oct 2026 08:00 Melbourne; Mon 19 Oct 07:00 is too soon, so the next note is Mon 26 Oct
    const from = new Date("2026-10-16T21:00:00Z");
    expect(nextNoteAfterLast("Australia/Melbourne", from, "2026-10-16T21:00:00Z").toISOString()).toBe("2026-10-25T20:00:00.000Z");
    expect(nextNoteAfterLast("Australia/Melbourne", from, null).toISOString()).toBe(nextNoteDate("Australia/Melbourne", from).toISOString());
    // last note a week ago: this Monday is fine
    expect(nextNoteAfterLast("Australia/Melbourne", from, "2026-10-11T20:00:00Z").toISOString()).toBe("2026-10-18T20:00:00.000Z");
  });
});
