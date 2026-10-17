// Numbers and dates as words for voiceover lines ("the thirteenth of May, twenty twenty-six"), and back again, so
// check-cohorts.ts can verify a spoken date or degree the same way it verifies a caption.
//   spokenDate("2026-05-13")      → "the thirteenth of May, twenty twenty-six"
//   spokenMonth("1996-04")        → "April nineteen ninety-six"
//   unspeak("Saturn at ten degrees Aries, exact on the thirteenth of May, twenty twenty-six")
//                                 → "Saturn at 10 degrees Aries, exact on 13 May 2026"
const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const ORD_ONES = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth"];
const ORD_TENS = ["", "", "twentieth", "thirtieth"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 0–99 as words: 7 → "seven", 28 → "twenty-eight". */
export function cardinal(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}
/** 1–31 as an ordinal: 1 → "first", 23 → "twenty-third". */
export function ordinal(n: number): string {
  if (n < 20) return ORD_ONES[n];
  return n % 10 ? `${TENS[Math.floor(n / 10)]}-${ORD_ONES[n % 10]}` : ORD_TENS[n / 10];
}
/** A year the way people say it: 1997 → "nineteen ninety-seven", 2000 → "two thousand", 2005 → "two thousand and five", 2026 → "twenty twenty-six". */
export function year(y: number): string {
  if (y >= 2000 && y <= 2009) return y === 2000 ? "two thousand" : `two thousand and ${ONES[y - 2000]}`;
  const hi = Math.floor(y / 100), lo = y % 100;
  return `${cardinal(hi)} ${lo === 0 ? "hundred" : lo < 10 ? `oh ${ONES[lo]}` : cardinal(lo)}`;
}
/** "2026-05-13" → "the thirteenth of May, twenty twenty-six" (withYear false: "the thirteenth of May"). */
export function spokenDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `the ${ordinal(d)} of ${MONTHS[m - 1]}${withYear ? `, ${year(y)}` : ""}`;
}
/** "1996-04" or "Apr 1996" → "April nineteen ninety-six". */
export function spokenMonth(s: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return `${MONTHS[+m[2] - 1]} ${year(+m[1])}`;
  const k = /^([A-Z][a-z]{2}) (\d{4})$/.exec(s.trim());
  if (!k) throw new Error(`spokenMonth: can't read "${s}"`);
  return `${MONTHS[SHORT.indexOf(k[1])]} ${year(+k[2])}`;
}

// ---------- words → digits (for the date check) ----------
const card = new Map<string, number>(); for (let n = 0; n < 100; n++) card.set(cardinal(n), n);
const ord = new Map<string, number>(); for (let n = 1; n <= 31; n++) ord.set(ordinal(n), n);
const yearWords = new Map<string, number>(); for (let y = 1900; y <= 2099; y++) yearWords.set(year(y), y);
const alt = (xs: Iterable<string>) => [...xs].sort((a, b) => b.length - a.length).map((x) => x.replace(/-/g, "\\-")).join("|");
const ORD_RE = alt(ord.keys()), CARD_RE = alt(card.keys()), YEAR_RE = alt(yearWords.keys()), MON_RE = MONTHS.join("|");

/** Spoken numbers and dates back to the caption style: "13 May 2026", "13 May", "May 2026", "10 degrees", "7.9 degrees". */
export function unspeak(t: string): string {
  return t
    // "the thirteenth of May, twenty twenty-six" / "the thirteenth of May"
    .replace(new RegExp(`\\b(?:the )?(${ORD_RE}) of (${MON_RE})(?:,? (${YEAR_RE}))?\\b`, "gi"), (_, o: string, m: string, y?: string) =>
      `${ord.get(o.toLowerCase())} ${SHORT[MONTHS.findIndex((x) => x.toLowerCase() === m.toLowerCase())]}${y ? ` ${yearWords.get(y.toLowerCase())}` : ""}`)
    // "the fourth to the nineteenth of March": the first ordinal is a day of the same month
    .replace(new RegExp(`\\b(?:the )?(${ORD_RE})(?= (?:to|and) (?:the )?\\d{1,2} [A-Z][a-z]{2})`, "gi"), (_, o: string) => String(ord.get(o.toLowerCase())))
    // "May twenty twenty-six"
    .replace(new RegExp(`\\b(${MON_RE}),? (${YEAR_RE})\\b`, "g"), (_, m: string, y: string) => `${SHORT[MONTHS.indexOf(m)]} ${yearWords.get(y.toLowerCase())}`)
    // a bare year: "born in nineteen ninety-seven"
    .replace(new RegExp(`\\b(${YEAR_RE})\\b`, "gi"), (y: string) => String(yearWords.get(y.toLowerCase())))
    // "seven point nine degrees", "ten degrees"
    .replace(new RegExp(`\\b(${CARD_RE}) point (${CARD_RE})\\b`, "gi"), (_, a: string, b: string) => `${card.get(a.toLowerCase())}.${card.get(b.toLowerCase())}`)
    .replace(new RegExp(`\\b(${CARD_RE})(?= degrees?\\b| today\\b|[.,]| going)`, "gi"), (n: string) => String(card.get(n.toLowerCase())));
}
