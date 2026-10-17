// Narration script for the paid reading: one script per chapter, built from the same computed data and report JSON
// the page renders, so the audio never says anything the page doesn't. Scripts use the pause markup in src/tts.ts:
// a blank line is a paragraph pause, [pause N] is N ms of silence. Within a paragraph, cadence comes from punctuation:
// commas and em-dashes where a reader would breathe (Deepgram treats both as short pauses), one idea per sentence.
//
// Dates are written out in words, the way the page's "13 May 2026" is said aloud: "the thirteenth of May, twenty
// twenty-six". TTS models read digits inconsistently ("thirteen May"), so words make every model say the same thing.
import type { Computed, Cycle } from "./compute";
import { fmtDay } from "./compute";
import type { ReportJson } from "./views/reading";
import { ORDINAL } from "./content/notes";
export { splitForTts } from "./tts";

export const CHAPTERS = 9; // 0..8 (Ask isn't narrated)

// ---------- spoken numbers and dates ----------
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORD_ONES = ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const ORD_TENS = ["", "", "twentieth", "thirtieth"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** 0–99 in words. */
export const numWords = (n: number): string => n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
/** 1–31 as an ordinal word. */
export const ordinalWords = (n: number): string => n < 20 ? ORD_ONES[n] : n % 10 === 0 ? ORD_TENS[n / 10] : `${TENS[Math.floor(n / 10)]}-${ORD_ONES[n % 10]}`;
/** A year the way people say it: nineteen ninety-seven, two thousand and five, twenty twenty-six. */
export function yearWords(y: number): string {
  const hi = Math.floor(y / 100), lo = y % 100;
  if (y >= 2000 && y < 2010) return lo ? `two thousand and ${ONES[lo]}` : "two thousand";
  if (lo === 0) return `${numWords(hi)} hundred`;
  return `${numWords(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : numWords(lo)}`;
}
/** "2026-05-13" → "the thirteenth of May, twenty twenty-six". */
export const spokenDate = (iso: string) => { const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10)); return `the ${ordinalWords(d)} of ${MONTHS[m - 1]}, ${yearWords(y)}`; };
/** "2026-05-13" or a timestamp → "May twenty twenty-six". */
export const spokenMonth = (v: string | number) => { const d = new Date(typeof v === "number" ? v : Date.parse(v)); return `${MONTHS[d.getUTCMonth()]} ${yearWords(d.getUTCFullYear())}`; };

const MON_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const monIdx = (s: string) => MONTHS.findIndex((m) => m.toLowerCase().startsWith(s.slice(0, 3).toLowerCase()));
const dm = (d: string, mo: string, y?: string) => { const day = parseInt(d, 10); if (day < 1 || day > 31) return null; return `the ${ordinalWords(day)} of ${MONTHS[monIdx(mo)]}${y ? `, ${yearWords(parseInt(y, 10))}` : ""}`; };

/** Rewrite written dates and years in free text (the model's prose, code strings) into spoken words. */
export function speakDates(s: string): string {
  return s
    .replace(new RegExp(`\\b(\\d{1,2}) ${MON_RE},? ((?:19|20)\\d\\d)\\b`, "g"), (all, d, mo, y) => dm(d, mo, y) ?? all)
    .replace(new RegExp(`\\b${MON_RE} (\\d{1,2})(?:st|nd|rd|th)?, ((?:19|20)\\d\\d)\\b`, "g"), (all, mo, d, y) => dm(d, mo, y) ?? all)
    .replace(new RegExp(`\\b(\\d{1,2}) ${MON_RE}(?![\\w])`, "g"), (all, d, mo) => dm(d, mo) ?? all)
    .replace(new RegExp(`\\b${MON_RE} ((?:19|20)\\d\\d)\\b`, "g"), (_, mo, y) => `${MONTHS[monIdx(mo)]} ${yearWords(parseInt(y, 10))}`)
    .replace(/(?<![\d.,$])\b((?:19|20)\d\d)\b(?![\d.,]\d)/g, (_, y) => yearWords(parseInt(y, 10)));
}

/** One paragraph of spoken text: degrees spelled out, dates spoken, "·" read as a comma, whitespace collapsed, ends with a stop. */
const say = (s: string) => {
  const t = speakDates(String(s ?? "")).replace(/°/g, " degrees").replace(/\s*·\s*/g, ", ").replace(/\s+/g, " ").trim();
  return t && !/[.!?…"”')]$/.test(t) ? `${t}.` : t;
};
/** "a, b and c" (spoken lists breathe on the commas and land on "and"). */
const list = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? "")
  : `${xs.slice(0, -1).join(", ")}${xs.length > 2 && xs.some((x) => / and /.test(x)) ? "," : ""} and ${xs[xs.length - 1]}`; // Oxford comma when an item has its own "and"
const ordWord = (n: number) => ORD_ONES[n] ?? `${n}th`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const HEAD = "[pause 1000]"; // after a chapter title
const BEAT = "[pause 450]"; // between a label and what it introduces, inside a section
/** Join paragraphs; empty ones vanish. */
const paras = (...ps: Array<string | false | null | undefined>) => ps.filter((p): p is string => !!p && !!p.trim()).join("\n\n");
const heading = (n: string, title: string) => `Chapter ${n} — ${title}. ${HEAD}`;

export function narrationText(ch: number, c: Computed, cy: Cycle, r: ReportJson, firstName: string | null): string {
  const w = c.window; const st = cy.stage; const now = Date.now();
  const past = (iso: string) => now > Date.parse(iso);
  const span = (from: string | number, to: string | number) => { const a = spokenMonth(from), b = spokenMonth(to); return a === b ? `in ${a}` : `from ${a} to ${b}`; };
  const day = (lead: string, p: { name: string; body: string; before: string; day: string; after: string }) => paras(
    `${lead} ${BEAT} ${say(p.name)}`,
    say(p.body),
    `The week before — ${say(p.before)}`,
    `On the day — ${say(p.day)}`,
    `The month after — ${say(p.after)}`);
  switch (ch) {
    case 0: return paras(
      `${firstName ? `${say(firstName).replace(/\.$/, "")}, this` : "This"} is your Saturn return reading, from Rite. ${BEAT} ${say(r.cover_line)}`,
      `Saturn takes about twenty-nine years to come back to where it was when you were born. Every stretch of that loop asks something different.`,
      `Right now you are ${st.age}, in the stage called ${say(st.name.replace(/:\s*/, ", ").toLowerCase()).replace(/\.$/, "")}. ${say(st.theme)}`,
      `In the sky — ${say(st.sky)}`,
      `What to focus on. ${BEAT} ${say(st.focus)}`,
      `What to let go of. ${BEAT} ${say(st.release)}`,
      `And a question to sit with. ${BEAT} ${say(st.question)}`);
    case 1: return paras(
      heading("one", "your Saturn"),
      say(r.saturn_p1), say(r.saturn_p2),
      `${say(r.house_h3)} ${BEAT} ${say(r.house_p)}`,
      `Three things this placement builds: ${say(list(r.chips_warm))}`,
      `And three traps it can fall into: ${say(list(r.chips_cool))}`);
    case 2: {
      const first = w.hits[0], last = w.hits[w.hits.length - 1];
      return paras(
        heading("two", "the window"),
        `Saturn ${past(w.windowStart) ? "entered" : "enters"} ${c.sign} on ${spokenDate(w.windowStart)}, and ${past(w.windowEnd) ? "left" : "leaves"} on ${spokenDate(w.windowEnd)}. That is your window. It comes in three phases.`,
        `First, the approach — ${span(w.windowStart, first)}. ${BEAT} ${say(r.phase_approach)}`,
        `Then contact — ${span(first, last)}. ${BEAT} ${say(r.phase_contact)}`,
        `And integration — ${span(last, w.windowEnd)}. ${BEAT} ${say(r.phase_integration)}`);
    }
    case 3: {
      const one = w.hits.length === 1;
      const parts = w.hits.map((h, i) => { const p = r.passes[i] ?? r.passes[r.passes.length - 1]; return day(one ? `The exact pass — ${spokenDate(h)}.` : `The ${ordWord(i + 1)} pass — ${spokenDate(h)}.`, p); });
      if (cy.turn && r.turn) parts.push(day(`The closest turn — ${spokenDate(cy.turn.date)}.`, r.turn));
      return paras(heading("three", "the pass and the turn"), ...parts);
    }
    case 4: return paras(
      heading("four", "where it shows up"),
      c.house ? "This is weighted from Saturn's house, and from the houses whose cusps fall in Saturn's own signs." : "Without a birth time the houses can't be set, so this is weighted from Saturn's classic territory.",
      `The top three areas: ${say(list(cy.areas.slice(0, 3).map((a) => a.name.toLowerCase())))}`,
      ...r.areas.map((a) => `${say(a.h3)} ${BEAT} ${say(a.p)}`));
    case 5: return paras(
      heading("five", "month by month"),
      `All ${numWords(Math.min(99, cy.months.length))} months of your window, one at a time.`,
      ...cy.months.map((m) => `${m.name} ${yearWords(m.year)}${m.tag ? ` — ${say(m.tag.replace(/(retrograde|direct) (?=\d)/, "$1 on ").replace(/\b(Now|Exact|Turns)\b/g, (x) => x.toLowerCase())).replace(/\.$/, "")}` : ""}. ${say(m.text)}`));
    case 6: return paras(
      heading("six", "your Saturn history"),
      "Before coming home, Saturn hit three tension points with its own position. Each one lines up with something you can probably remember.",
      ...cy.history.map((h, i) => `At about ${h.ageApprox} — ${span(h.from, h.to)}. ${BEAT} ${h.kind === "square1" ? "The first square: often the first real taste of rules, and limits." : h.kind === "opposition" ? "The opposition: pushing against the structures around you." : "The closing square: the choices that set up this return."} ${BEAT} ${say(r.history_q[i] ?? "")}`));
    case 7: return paras(
      heading("seven", "the workbook"),
      "Prompts for each phase. Start with the one you're in.",
      `The approach. ${BEAT} ${r.workbook_approach.map(say).join(` ${BEAT} `)}`,
      `Contact. ${BEAT} ${r.workbook_contact.map(say).join(` ${BEAT} `)}`,
      `Integration. ${BEAT} ${r.workbook_integration.map(say).join(` ${BEAT} `)}`);
    case 8: return paras(
      heading("eight", "the long arc"),
      "Every turning point of your Saturn cycle, past and ahead.",
      ...cy.ahead.map((p) => `${cap(say(p.name).replace(/\.$/, ""))}, around age ${p.ageApprox} — ${span(p.from, p.to)}.`),
      `Your ${ordWord(c.returnNumber)} return ${past(w.windowEnd) ? "ran" : "runs"} ${span(w.windowStart, w.windowEnd)}, with ${w.hits.length === 1 ? `one exact pass, on ${spokenDate(w.hits[0])}` : `${numWords(w.hits.length)} exact passes`}.`,
      `One line to carry. ${BEAT} ${say(r.carry)} [pause 1200]`,
      "That's your reading. It stays at this link, and it keeps updating as you move through the cycle.");
    default: return "";
  }
}

export const _test = { spokenDate, say, house: (c: Computed) => (c.house ? ORDINAL[c.house] : null), fmtDay };
