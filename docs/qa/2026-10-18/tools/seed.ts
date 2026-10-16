import { compute } from "../../../../src/compute";
const q = (v: unknown) => v === null || v === undefined ? "NULL" : typeof v === "number" ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const now = new Date().toISOString();
const births = [
  { id: "qaprev000001", date: "1997-08-14", time: "06:40", place: { label: "Melbourne, Victoria, Australia", lat: -37.81, lon: 144.96, tz: "Australia/Melbourne" } },
  { id: "qaprev000002", date: "1996-05-10", time: null, place: { label: "London, England, United Kingdom", lat: 51.507, lon: -0.128, tz: "Europe/London" } },
  { id: "qaprev000003", date: "1999-07-02", time: "14:30", place: { label: "Brisbane, Queensland, Australia", lat: -27.47, lon: 153.03, tz: "Australia/Brisbane" } },
  { id: "qaprev000004", date: "1968-03-20", time: null, place: { label: "Toronto, Ontario, Canada", lat: 43.65, lon: -79.38, tz: "America/Toronto" } },
];
const out: string[] = [];
for (const b of births) {
  const c = compute(b);
  const text = `Saturn in ${c.sign}: seeded QA preview paragraph. This text stands in for the model's paragraph, which needs an API key.`;
  out.push(`INSERT OR REPLACE INTO previews (id, created_at, birth_date, birth_time, place_label, lat, lon, tz, birth_utc, natal_lon, natal_sign, natal_degree, natal_house, return_number, window_start, window_end, peak_start, peak_end, hits, phase, preview_text, ref) VALUES (${[b.id, now, b.date, b.time, b.place.label, b.place.lat, b.place.lon, b.place.tz, c.birthUtc, c.natalLon, c.sign, c.degree, c.house, c.returnNumber, c.window.windowStart, c.window.windowEnd, c.window.peakStart, c.window.peakEnd, JSON.stringify(c.window.hits), c.phase, text, null].map(q).join(",")});`);
  console.error(b.id, c.sign, c.phase, c.returnNumber, c.window.windowStart, c.window.windowEnd, c.window.hits);
}
const pass = (n: string) => ({ name: n, body: "Seeded body text for this pass. It describes what tends to come up and what to do with it, in plain words, without any dates.", before: "Finish the thing you have been circling.", day: "Keep the day light. Write down what you notice.", after: "Decide one thing and tell someone." });
const report = {
  cover_line: "The structure you built at twenty-two is being tested, and the parts that hold are yours to keep.",
  saturn_p1: "Saturn in Aries asks for nerve without recklessness. Seeded QA paragraph one, long enough to wrap across a few lines at mobile width so the layout gets exercised properly.",
  saturn_p2: "Seeded QA paragraph two. It talks about work, routines and the body, and about the difference between being useful and being used.",
  house_h3: "Saturn in your 12th house",
  house_p: "Seeded house paragraph. The quiet work, rest, and what happens out of sight.",
  chips_warm: ["Craft", "Routines that serve you", "Health as practice"],
  chips_cool: ["Overwork", "Self-criticism", "Fixing other people"],
  phase_approach: "Seeded approach phase text.", phase_contact: "Seeded contact phase text.", phase_integration: "Seeded integration phase text.",
  passes: [pass("The pass"), pass("The second pass"), pass("The third pass")],
  turn: pass("The turn"),
  areas: [{ h3: "Work and daily routine", p: "Seeded area paragraph one." }, { h3: "Rest and what you hide", p: "Seeded area paragraph two." }],
  history_q: ["What did you take on at seven that was too big for you?", "What rule did you make at fourteen?", "What did you leave behind at twenty-two?"],
  workbook_approach: ["What are you finishing?", "What are you no longer willing to carry?"],
  workbook_contact: ["What did the pass show you?", "Who did you call?"],
  workbook_integration: ["What is the new rule?", "What did you keep?"],
  carry: "Build the thing that would still be worth having if nobody saw it.",
};
const P = (id: string, pid: string, status: string, md: string | null, deliv: string | null) =>
  `INSERT OR REPLACE INTO purchases (id, preview_id, created_at, email, first_name, stripe_session_id, stripe_payment_intent, amount_cents, tier, report_md, report_json, status, delivered_at) VALUES (${[id, pid, now, "qa@example.com", "Sam", null, null, 2900, "full", md, null, status, deliv].map(q).join(",")});`;
out.push(P("qatokreading00000000000a", "qaprev000001", "generated", JSON.stringify(report), now));
out.push(P("qatokreading00000000000b", "qaprev000002", "generated", JSON.stringify(report), now));
out.push(P("qatokreading00000000000c", "qaprev000004", "generated", JSON.stringify(report), now));
// writing: lock timestamp far in the future so /r never re-kicks generation (no LLM call)
out.push(P("qatokwriting00000000000a", "qaprev000001", "writing", null, "2099-01-01T00:00:00.000Z"));
out.push(P("qatokfailed000000000000a", "qaprev000001", "failed", null, now));
out.push(`INSERT OR REPLACE INTO subscriptions (id, purchase_id, created_at, status, last_sent_at, next_send_local_hour, plan) VALUES ('sub_qa_active', 'qatokreading00000000000a', ${q(now)}, 'active', ${q(now)}, 7, 'month');`);
out.push(`INSERT OR REPLACE INTO gifts (code, created_at, buyer_email, buyer_name, message, stripe_session_id, stripe_payment_intent, amount_cents, redeemed_purchase_id, redeemed_at) VALUES ('QAGIFT23', ${q(now)}, 'buyer@example.com', 'Alex', 'Happy return.', NULL, NULL, 2900, NULL, NULL);`);
console.log(out.join("\n"));
