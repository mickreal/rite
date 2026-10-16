// Narration script for the paid reading: one plain-text script per chapter, built from the same
// computed data and report JSON the page renders, so the audio never says anything the page doesn't.
import type { Computed, Cycle } from "./compute";
import { fmtDay, fmtMonth } from "./compute";
import type { ReportJson } from "./views/reading";
import { fmtMonYrL } from "./astro/cycle";
import { ORDINAL } from "./content/notes";

export const CHAPTERS = 9; // 0..8 (Ask isn't narrated)
const say = (s: string) => s.replace(/°/g, " degrees").replace(/\s+/g, " ").trim();
const spokenDate = (iso: string) => { const [y, m, d] = iso.split("-"); const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]; return `${parseInt(d, 10)} ${M[parseInt(m, 10) - 1]} ${y}`; };
const ordWord = (n: number) => ["first", "second", "third"][n - 1] ?? `${n}th`;

export function narrationText(ch: number, c: Computed, cy: Cycle, r: ReportJson, firstName: string | null): string {
  const w = c.window; const st = cy.stage;
  const house = c.house ? ORDINAL[c.house] : null;
  switch (ch) {
    case 0: return say(`${firstName ? `${firstName}, this` : "This"} is your Saturn return reading from Rite. ${r.cover_line}
      Saturn takes about twenty-nine years to come home, and every stretch of that loop asks something different. Right now you are ${st.age}, in the stage called ${st.name.toLowerCase()}. ${st.theme}
      In the sky: ${st.sky} Focus on: ${st.focus} Let go of: ${st.release} A question to sit with: ${st.question}`);
    case 1: return say(`Chapter one. Your Saturn. ${r.saturn_p1} ${r.saturn_p2} ${r.house_h3}. ${r.house_p}
      Three things this placement builds: ${r.chips_warm.join(", ")}. Three traps it falls into: ${r.chips_cool.join(", ")}.`);
    case 2: return say(`Chapter two. The window. Saturn ${Date.now() > Date.parse(w.windowStart) ? "entered" : "enters"} ${c.sign} on ${spokenDate(w.windowStart)} and ${Date.now() > Date.parse(w.windowEnd) ? "left" : "leaves"} on ${spokenDate(w.windowEnd)}. That is your window, in three phases.
      Approach, from ${fmtMonYrL(Date.parse(w.windowStart))} to ${fmtMonYrL(Date.parse(w.hits[0]))}. ${r.phase_approach}
      Contact, ${w.hits.length === 1 ? `in ${fmtMonYrL(Date.parse(w.hits[0]))}` : `from ${fmtMonYrL(Date.parse(w.hits[0]))} to ${fmtMonYrL(Date.parse(w.hits[w.hits.length - 1]))}`}. ${r.phase_contact}
      Integration, from ${fmtMonYrL(Date.parse(w.hits[w.hits.length - 1]))} to ${fmtMonYrL(Date.parse(w.windowEnd))}. ${r.phase_integration}`);
    case 3: {
      const parts = w.hits.map((h, i) => { const p = r.passes[i] ?? r.passes[r.passes.length - 1]; return `${w.hits.length === 1 ? "The exact pass" : `Pass ${["one", "two", "three"][i]}`}, ${spokenDate(h)}. ${p.name}. ${p.body} The week before: ${p.before} On the day: ${p.day} The month after: ${p.after}`; });
      if (cy.turn && r.turn) parts.push(`The closest turn, ${spokenDate(cy.turn.date)}. ${r.turn.name}. ${r.turn.body} The week before: ${r.turn.before} On the day: ${r.turn.day} The month after: ${r.turn.after}`);
      return say(`Chapter three. The pass and the turn. ${parts.join(" ")}`);
    }
    case 4: return say(`Chapter four. Where it shows up. ${c.house ? "Weighted from Saturn's house and the houses whose cusps fall in Saturn's own signs." : "Without a birth time the houses can't be set, so this is weighted from Saturn's classic territory."} The top three areas: ${cy.areas.slice(0, 3).map((a) => a.name.toLowerCase()).join("; ")}.
      ${r.areas.map((a) => `${a.h3}. ${a.p}`).join(" ")}`);
    case 5: return say(`Chapter five. Month by month. All ${cy.months.length} months of your window. ${cy.months.map((m) => `${m.name} ${m.year}${m.isNow ? ", now" : ""}${m.tag ? `, ${m.tag.toLowerCase()}` : ""}. ${m.text}`).join(" ")}`);
    case 6: return say(`Chapter six. Your Saturn history. Saturn hit three tension points with its own position before coming home. Each one lines up with something you can probably remember.
      ${cy.history.map((h, i) => `Age ${h.ageApprox}, ${h.from === h.to ? fmtMonYrL(Date.parse(h.from)) : `${fmtMonYrL(Date.parse(h.from))} to ${fmtMonYrL(Date.parse(h.to))}`}. ${h.kind === "square1" ? "The first square, often the first real taste of rules and limits." : h.kind === "opposition" ? "The opposition, pushing against the structures around you." : "The closing square, the choices that set up this return."} ${r.history_q[i] ?? ""}`).join(" ")}`);
    case 7: return say(`Chapter seven. The workbook. Prompts for each phase; start with the one you're in.
      Approach. ${r.workbook_approach.join(" ")} Contact. ${r.workbook_contact.join(" ")} Integration. ${r.workbook_integration.join(" ")}`);
    case 8: return say(`Chapter eight. The long arc. Every turning point of your Saturn cycle, past and ahead.
      ${cy.ahead.map((p) => `${p.name}, around age ${p.ageApprox}, ${fmtMonYrL(Date.parse(p.from))}${p.from !== p.to ? ` to ${fmtMonYrL(Date.parse(p.to))}` : ""}.`).join(" ")}
      Your ${ordWord(c.returnNumber)} return ${Date.now() > Date.parse(w.windowEnd) ? "ran" : "runs"} ${fmtMonth(w.windowStart)} to ${fmtMonth(w.windowEnd)}, with ${w.hits.length === 1 ? "one exact pass" : `${w.hits.length} exact passes`}${w.hits.length === 1 ? ` on ${spokenDate(w.hits[0])}` : ""}.
      One line to carry: ${r.carry} That's your reading. It stays at this link and keeps updating as you move through the cycle.`);
    default: return "";
  }
}

/** Split for the TTS request limit, on sentence boundaries. */
export function splitForTts(text: string, max = 1800): string[] {
  const out: string[] = []; let cur = "";
  for (const sent of text.split(/(?<=[.!?])\s+/)) {
    if ((cur + " " + sent).length > max && cur) { out.push(cur.trim()); cur = ""; }
    cur += (cur ? " " : "") + sent;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export const _test = { spokenDate, say, house: (c: Computed) => (c.house ? ORDINAL[c.house] : null), fmtDay };
