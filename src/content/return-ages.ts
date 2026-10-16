// Ages at each Saturn return, as computed by scanReturn() (src/astro/saturn.ts) over a sweep of birth dates
// (noon UTC, every 11 days, 1930–2044 for the first return, 1930–2014 second, 1930–1984 third).
// Ages are in years since birth; bounds are the sweep's min/max widened to the next 0.1. test/guides.test.ts re-runs a coarser
// sweep of scanReturn() and fails if any return falls outside these, so this file cannot drift from the maths.
//   pass:   age at the first and last exact crossing of the natal degree
//   window: age at window open (Saturn enters the natal sign) and close (it leaves for good)
//   length: window length in years
export const RETURN_AGES = {
  1: { pass: [28.3, 30.5], window: [26.0, 32.9] },
  2: { pass: [58.1, 59.8], window: [55.1, 62.0] },
  3: { pass: [87.2, 88.9], window: [85.0, 91.8] },
} as const;
export const WINDOW_YEARS = [2.1, 3.7] as const;

/** Whole years of age, the way people say them: "between 28 and 30". */
export const ageSpan = (r: readonly [number, number]) => `${Math.floor(r[0])} and ${Math.floor(r[1])}`;
