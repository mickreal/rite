// Motion and timing constants for every reel (dial clips in clips/render-clip.ts, card verticals in
// remotion/src/VerticalCard.tsx). One place: change a number here and re-render. Seconds unless noted.
//
// Rules these encode (Mick, Oct 2026: "smooth, eased, not too fast"):
//   - constant 30 fps, every frame rendered (no screen recording, no dropped or doubled frames)
//   - every move eases in and out; nothing that moves takes less than ~0.45 s
//   - screens crossfade (no hard cuts); captions fade and rise in, never pop
//   - each on-screen date stays readable for at least 1.5 s after it has settled
//   - no music, ever (it's added in the app's reel editor)

export const FPS = 30;

/** Easing curves, t in [0, 1]. */
export const ease = {
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};
/** CSS equivalent of ease.inOutCubic, for anything the browser animates itself. */
export const CSS_IN_OUT = "cubic-bezier(.65,0,.35,1)";

export const CLIP = {
  // global
  fadeIn: 0.5,            // from the page background at the start
  fadeOut: 0.8,           // to the page background at the end
  tail: 1.2,              // hold after the last caption's beat, before/including the fade-out
  maxDuration: 40,        // the kit's 20–40 s; the renderer warns past this
  minDuration: 20,

  // screen changes (the site swaps steps instantly; the renderer crossfades them in post)
  xfade: 0.5,

  // captions (burned in, in the 430 px band above the page)
  captionIn: 0.55,        // fade + rise
  captionOut: 0.35,       // fade
  captionRise: 22,        // px the caption rises while fading in
  captionGap: 0.05,       // the next caption starts this long before the previous has fully faded

  // pacing of the flow
  introHold: 3.0,         // the site's intro animation plays out under the hook
  focusDelay: 0.55,       // after a screen change, before the first key
  keyDate: 0.2,           // per digit of dd/mm/yyyy
  keyCity: 0.12,          // per letter of the city (±25 % deterministic jitter so it reads as a person typing)
  afterField: 0.75,       // pause after typing, before "Continue"
  timeStepHold: 1.0,      // on "What time?" before "I don't know my birth time"
  firstBeatDelay: 0.5,    // build screen shows → first beat caption
  buildToSummary: 3.6,    // the site's own minimum on the build screen (src/views/flow.ts: 3600 ms)
  summaryReveal: 1.3,     // summary cards finish arriving this long after the summary shows

  // beats without a voiceover: reading time
  minBeat: 2.8,           // captionIn (0.55) + ≥1.5 s settled + margin
  readBase: 1.0,
  readPerWord: 0.3,
  ctaMin: 3.2,

  // voiceover
  voLead: 0.2,            // caption starts fading in this long before its line is spoken
  voTail: 0.5,            // breath after a line before the next caption
  loudnessLUFS: -16,      // integrated, EBU R128
  truePeak: -2.0,         // dBTP target (spec: ≤ −1.5 after AAC encode; 0.5 dB margin)
  loudnessRange: 11,

  // camera: a slow push-in on the summary while the beats play
  pushScale: 1.06,
  pushIn: 3.5,            // seconds the push takes (eased in-out), starting when the summary has settled
};

export const CARD = {
  // card verticals (1080×1350 card on a 1080×1920 frame), 10 s: kit style 6 is 8–12 s
  seconds: 10,
  fadeIn: 0.4, // short: the elements animate in themselves
  fadeOut: 0.8,
  pushFrom: 1.0,
  pushTo: 1.035,
};

/** Fraction of an eased move at time t for a move from a to b (clamped). */
export const progress = (t: number, a: number, b: number, curve: (x: number) => number = ease.inOutCubic) =>
  t <= a ? 0 : t >= b ? 1 : curve((t - a) / (b - a));
