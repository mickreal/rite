# Sign pages QA, 2026-10-17

Rendered from `wrangler dev --local` on 2026-10-17 with Playwright (Chromium), 1280×900 full page (`*-desktop.png`) and 390×844 top 2000 px (`*-mobile.png`). No console errors, no horizontal overflow at either width on any page. FAQPage JSON-LD present with three entries on every page.

Page-wide fixes made during this pass (apply to all twelve):

- `signData` picked the *next* transit whenever one existed, so the "Saturn left …" lede was unreachable and Pisces showed "enters Pisces in Apr 2052". Now picks whichever of the previous and next stretches is nearer to today.
- The view treated the *last* period of a stretch as the main one. For signs whose stretch ends with a short pass back (Cancer, Leo, Libra, Scorpio, Capricorn, Pisces) that mislabelled the main stretch as "a first dip". Main is now the longest pass; the others are labelled "a first dip" / "a last pass back" by position. Leo no longer shows two "first dip" labels.
- Added a "between passes" lede for the case where today falls in the gap inside a stretch (not hit today; Aries would have hit it Oct 2025 to Feb 2026).
- Birth-range cards headline the longest range, not the first dip (Taurus first-return card led with Jun–Oct 1998 before).
- FAQ block was centred while the rest of the page is left-aligned; now left-aligned, list capped at 820 px.

Per sign:

- Aries: fine. In now, until Apr 2028; first dip May–Sep 2025 shown; first return born Apr 1996–Jun 1998 / Oct 1998–Mar 1999; second Mar 1967–Apr 1969.
- Taurus: fine. Next, Apr 2028–Jun 2030, "last there Jun 1998 to Apr 2001"; first return 1998–2001 in three ranges; second 1969–72.
- Gemini: fine. Next, Jun 2030–Jul 2032; second-return cohort 1971–74 in three ranges, correct.
- Cancer: fixed. Trailing pass Feb–May 2035 was labelled the main stretch; now "then a last pass back".
- Leo: fixed. Three passes (dip, main, last pass) now labelled correctly on the card and the bar.
- Virgo: fine. Dip Oct 2036–Feb 2037 then main Jul 2037–Sep 2039; cohorts 2007–10 and 1977–80.
- Libra: fixed. Last pass Jun–Jul 2042 was the headline; now main is Sep 2039–Nov 2041.
- Scorpio: fixed. Was "enters Scorpio in Nov 2041"; now "left Scorpio in Sep 2015 and comes back in Nov 2041", cohorts 1982–85 (first) and 1953–56 (second).
- Sagittarius: fixed (same selection fix). Left Dec 2017; cohorts 1985–88 / 1956–59.
- Capricorn: fixed (same). Left Dec 2020; main Dec 2017–Mar 2020 with last pass Jul–Dec 2020; cohorts 1988–91 / 1959–62.
- Aquarius: fixed (same). Left Mar 2023; cohorts 1991–94 / 1962–64.
- Pisces: fixed (same). Left Feb 2026; main Mar 2023–May 2025 with last pass Sep 2025–Feb 2026; cohorts 1993–96 / 1964–67. Before the fix the 1993–96 cohort was shown as "second return".

Needs a human:

- Pages whose transit is far off (Taurus onward through Libra) lead with "enters … in 20xx" and the first-return cohort is children. That's correct, but the visitor today is more likely the previous cohort (e.g. a 1981-born Libra). The card shows "last there …" and the second-return range covers them; decide whether that's enough or whether those pages should lead with the previous stretch.
- Second-return cohorts are listed but there is no third-return (born ~88 years before) range; fine for now.
- The "How long it lasts: About 2 to 3 years" card is static copy on every page.
