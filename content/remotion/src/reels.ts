// Presenter reels as the renderer, the date check and scripts/presenter-prep.ts see them: remotion/presenter.json with
// its two shorthands resolved.
//
// - Times can be numbers (seconds in the VO take) or references into the reel's script: "@s3" is when script line s3
//   starts in the take, "@s3+0.4" / "@s3-0.2" offset from it, "@end" the end of the take. `timing` holds the start of
//   each line: estimated from the text (2.6 words a second, scripts/presenter-prep.ts --estimate) until the take
//   exists, then measured from it (Scribe word timings), so the cut follows the voice without hand-timing.
// - `interimOf: "<reel id>"`: the same reel with Anna taken out, for posting while the paid takes don't exist: every
//   presenter segment becomes a `line` segment showing its captions, there is no voice (`audio` dropped), and the
//   timing is the parent's. The export adds the brand soundtrack, so an interim reel is music only.
// - A presenter segment's `captions: "auto"` captions it with the script lines it covers (their `show` text).
import DATA from "../presenter.json";

export type Line = { id: string; say: string; show?: string; anna?: boolean };
export type Seg = Record<string, any> & { kind: string; from: number; to: number | null };
type Base = {
  id: string; kit?: string; layout?: "cards" | "captions"; audio?: string; interimOf?: string; script?: Line[];
  timing?: Record<string, number>; anna?: { src: string; from: string; to: string }; kicker?: string;
  postBetween?: [string, string]; postWhy?: string; timed?: string; built?: string;
};
export type Reel = Base & { voSeconds: number; tail: number; segments: Seg[] };
type Raw = Base & { voSeconds?: number; tail?: number; segments?: any[] };

export const RAW = (DATA as unknown as { reels: Raw[] }).reels;
const TIME_KEYS = new Set(["from", "to", "at", "lineAt", "tailAt", "years", "inside", "one", "three", "date"]);

/** "@s3+0.4" → seconds, from the reel's timing table. */
export function timeOf(v: unknown, r: Pick<Raw, "id" | "timing" | "voSeconds">): unknown {
  if (typeof v !== "string" || !v.startsWith("@")) return v;
  const m = /^@([\w-]+)([+-]\d+(?:\.\d+)?)?$/.exec(v);
  if (!m) throw new Error(`${r.id}: bad time "${v}"`);
  const base = m[1] === "end" ? r.voSeconds : r.timing?.[m[1]];
  if (base === undefined) throw new Error(`${r.id}: "${v}" has no timing (run scripts/presenter-prep.ts --estimate ${r.id})`);
  return Math.round((base + (m[2] ? +m[2] : 0)) * 1000) / 1000;
}
const resolve = (v: any, r: Raw, key = ""): any => {
  if (Array.isArray(v)) return v.map((x) => resolve(x, r, key));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x, r, k)]));
  return TIME_KEYS.has(key) || (typeof v === "string" && /^@[\w-]+([+-]\d+(\.\d+)?)?$/.test(v)) ? timeOf(v, r) : v;
};

/** The script lines whose start falls in [from, to) (to = null: to the end). */
const linesIn = (r: Raw, from: number, to: number | null) =>
  (r.script ?? []).filter((l) => { const t = r.timing?.[l.id]; return t !== undefined && t >= from - 1e-6 && (to === null || t < to - 1e-6); });

export function getReel(id: string): Reel {
  const raw = RAW.find((x) => x.id === id);
  if (!raw) throw new Error(`no presenter reel "${id}" in remotion/presenter.json`);
  if (raw.interimOf) {
    const base = getReel(raw.interimOf);
    const parent = RAW.find((x) => x.id === raw.interimOf)!;
    const segments = base.segments.map((s) => s.kind !== "presenter" ? s : {
      kind: "line", from: s.from, to: s.to, interim: true, kicker: raw.kicker ?? undefined,
      words: (s.captions as Array<{ at: number; text: string }>).map((c, i, a) => ({ at: c.at, text: c.text, key: i === a.length - 1 })),
    });
    return { ...base, ...Object.fromEntries(Object.entries(raw).filter(([k]) => !["segments", "script", "timing"].includes(k))), id: raw.id, interimOf: raw.interimOf, audio: undefined, segments, script: parent.script, timing: parent.timing } as Reel;
  }
  const voSeconds = raw.voSeconds ?? 0;
  const r = { ...raw, voSeconds } as Raw;
  const segments = (raw.segments ?? []).map((s: any) => {
    const seg = resolve(s, r) as Seg;
    if (seg.kind === "presenter" && s.captions === "auto") {
      const ls = linesIn(r, seg.from, seg.to);
      seg.captions = ls.map((l, i) => ({ at: r.timing![l.id], to: i + 1 < ls.length ? r.timing![ls[i + 1].id] - 0.12 : (seg.to ?? voSeconds), text: l.show ?? l.say }));
    }
    return seg;
  });
  return { ...(r as Reel), voSeconds, tail: raw.tail ?? 1.4, segments };
}

export const reelIds = () => RAW.map((r) => r.id);
export const reelSeconds = (id: string) => { const r = getReel(id); return r.voSeconds + r.tail; };
/** Every string a viewer reads or hears in a reel (for the date check): script lines (spoken) and segment text (shown). */
export function reelTexts(id: string): { spoken: string[]; shown: string[] } {
  const raw = RAW.find((x) => x.id === id)!;
  const r = getReel(id);
  const shown: string[] = [];
  const walk = (v: unknown, k = "") => {
    if (typeof v === "string") { if (!["kind", "src", "sign"].includes(k) && !v.startsWith("@")) shown.push(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
    else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk);
  };
  walk(r.segments);
  return { spoken: raw.interimOf ? [] : (r.script ?? []).map((l) => l.say), shown: [...shown, ...(r.script ?? []).map((l) => l.show ?? "").filter(Boolean)] };
}
