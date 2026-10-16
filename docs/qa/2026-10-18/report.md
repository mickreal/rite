# QA sweep, 18 Oct 2026 (run 17 Oct morning)

Branch `n3/qa-a11y`, merged to main. Tests 91 → 92 on the branch (139 on main after all Night 3 merges); tsc clean.
Screenshots: `shots/` (96, full page, reduced motion on). Tools: `tools/` (QA, contrast, flow and seed scripts; `support.js`
lets the design artboards render). Accessibility findings: `a11y.md`.

## Method

- Local wrangler, D1 seeded from `compute()` (`tools/seed.ts`): four previews (1997 Melbourne in window; 1996 London, no
  time, past its pass; 1999 Brisbane, window 2028; 1968 Toronto, second return, three passes); generated purchases with a
  canned `ReportJson`; a `writing` purchase locked to 2099 (never calls the model); a `failed` purchase; an active monthly
  subscription; a gift code.
- `/start`: `POST /preview` intercepted with a 302 to a seeded preview. No geocoder or LLM calls.
- Per page at 390 and 1280: console errors, failed requests, horizontal overflow, text invisible under reduced motion,
  unnamed SVGs, unlabelled inputs, Tab walk at 1280.

**Result:** no console errors, failed requests or overflow on any page; every internal link 200. `/` and `/start` (all six
states) match their artboards; sign pages unchanged since 17 Oct; every date shown matches `compute()`.

## Defects found and fixed

| Defect | Where | Fix |
|---|---|---|
| With reduced motion on, the whole FAQ, Saturn glyph, paper cards and echo line never appeared (reduced-motion rules came before the `opacity:0` rules at equal specificity). Same for the `/p` chart's pass markers. | `landing.ts:134`, `result.ts:14` | Overrides moved last |
| Reading scrubber year labels evenly spaced over Jan 2025 – Dec 2060, so "2045" sat at ~2049 (also in the artboard) | `reading.ts:165` | Labels placed by date |
| `/season/manage` showed the coming Monday as the next note right after the welcome note; the cron skips anything under six days | `index.ts` (manage route) | `nextNoteAfterLast()`, tested |
| "Your window is in about 2 years away" | `result.ts:91` | "Your window opens in about 2 years" |
| "Start it again" shown to people who never subscribed | `season.ts` | "Start it" |
| "You're in" message said "Monday morning" | Season subscribe | Names the real next-note date |
| Hero date field clipped "mm/dd/yyyy" at 390 px (also in the design); inputs misaligned | `landing.ts:95` | Fixed |
| `/start` dropped keyboard focus on `<body>` when the summary appeared | `flow.ts` | Focus moves to the summary |

## Off against the design (not changed)

- `/p` chart has no shaded window band and no "closes" label (`result.ts:52-61`).
- Natal label ("your natal Saturn, 20° Aries") is right-aligned at x=958, so the curve crosses it on `/p` and reading
  chapter 2 (`reading.ts:185`).
- Reading hero is one stats strip rather than tiles: deliberate (1b61cda), pending Mick's design update.
- Long arc says "Age 59" where the artboard says 58. Value comes from `cycle()` in `src/astro/` (not touched); the
  artboard was hand-written.

## Worth a look (not changed)

- Failed page returns HTTP 500 (`index.ts:460`), so the console logs an error on a page that renders fine.
- `/season/manage` at 1280: the fourth stat tile wraps onto its own row (`season.ts:12`).
- `/gift/thanks` jumps from h1 to h3 (`gift.ts:13`).

## Decisions for Mick

1. Bring back the shaded window band on `/p`, and move the natal label so the curve doesn't cross it?
2. Failed page: keep HTTP 500, or 200 with the error copy?
