// Brand soundtrack: which track and which part of it each post's video gets. Pure logic (no ffmpeg), so it can be
// tested; scripts/add-music.ts does the mixing and export-batch.ts calls both.
//
// Directions (content/music/library.json):
//   felt-piano (A1–A3) and orbit (C1–C2): use "voice" → voice-led pieces: dial clips (cohort ids in clips/cohorts.json)
//     and Anna presenter reels (remotion/presenter.json). Alternates felt-piano / orbit post by post.
//   pulse (B1–B4): use "cards" → cohort/quote card verticals, sign verticals, and any other video.
// A post's silent and _vo versions get the same track and offset.
//
// Rotation is deterministic: the n-th video of a use in a plan (by date, then position), plus a base taken from the
// plan's first posting date (days since MUSIC_EPOCH), so rolling weeks don't all start on the same track. Each track
// keeps a cursor: its k-th use in the plan starts STRIDE offsets further on, so consecutive posts on a track continue
// through the piece ("flow across pieces"). Ordinals are counted over the whole plan before --from/--to, so a weekly
// render of the launch plan picks exactly what a full render picks.
//
// Overrides: MUSIC=off (env) disables music; a post's `music` field: "off", "<track id>" or "<track id>@<seconds>".
// Overrides never use up the rotation; a "<track id>@<seconds>" pin doesn't advance that track's offset cursor either.

export type Use = "voice" | "cards";
export type Direction = "felt-piano" | "orbit" | "pulse";
export type Track = { id: string; direction: Direction; file: string; duration: number; lufs: number; use: Use; offsets: number[] };
export type Library = { version: number; note?: string; tracks: Track[] };
export type Choice = { track: string; direction: Direction; use: Use; offsetIndex: number; offset?: number; source: "rotation" | "override" };
export type PostLike = { date: string; asset?: string; music?: string };

export const MUSIC_EPOCH = "2026-10-19"; // day 1 of the launch calendar as written
export const STRIDE = 4;                 // offsets to advance per use of a track (library offsets are 8 s apart → 32 s)
export const FADE_OUT = 1.5;             // music fade at the end of a video (s); the start offset must leave room

const DAY = 86400000;
export const dayNumber = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${MUSIC_EPOCH}T00:00:00Z`)) / DAY);

/** Which kind of bed a video gets, from its asset id. */
export function useFor(asset: string, ids: { cohorts: Set<string>; presenter: Set<string> }): Use {
  const a = asset.replace(/_vo$/, "");
  if (ids.presenter.has(a) || ids.cohorts.has(a)) return "voice";
  return "cards";
}

/** Usable start offsets for a track: every `step` s from `first` s, none in the last `tail` s. */
export function offsetsFor(duration: number, { first = 4, step = 8, tail = 20 } = {}): number[] {
  const out: number[] = [];
  for (let t = first; t <= duration - tail + 1e-9; t += step) out.push(Math.round(t * 1000) / 1000);
  return out.length ? out : [0];
}

/** Rotation pools: voice alternates felt-piano / orbit, cycling the variations of each; cards cycle pulse. */
export function pick(lib: Library, use: Use, n: number): Track {
  const by = (d: Direction) => lib.tracks.filter((t) => t.direction === d).sort((a, b) => a.id.localeCompare(b.id));
  if (use === "voice") {
    const fams = [by("felt-piano"), by("orbit")].filter((f) => f.length);
    if (!fams.length) throw new Error("music library has no voice tracks");
    const fam = fams[((n % fams.length) + fams.length) % fams.length];
    const k = Math.floor(n / fams.length);
    return fam[((k % fam.length) + fam.length) % fam.length];
  }
  const pool = by("pulse");
  if (!pool.length) throw new Error("music library has no pulse tracks");
  return pool[((n % pool.length) + pool.length) % pool.length];
}

/**
 * One choice per post index (null: no music: not a video, MUSIC=off, or the post's music is "off").
 * `isVideo(asset)` says whether the post's asset is a rendered video (mp4).
 */
export function planMusic(posts: PostLike[], lib: Library, opts: { isVideo: (asset: string) => boolean; ids: { cohorts: Set<string>; presenter: Set<string> }; env?: Record<string, string | undefined> }): Array<Choice | null> {
  const env = opts.env ?? {};
  const off = /^(off|0|false|no)$/i.test(env.MUSIC ?? "");
  const order = posts.map((p, i) => ({ p, i })).sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.i - b.i));
  const base = posts.length ? Math.max(0, dayNumber(order[0].p.date)) : 0;
  const count: Record<Use, number> = { voice: 0, cards: 0 };
  const uses = new Map<string, number>(); // track id → uses so far (the offset cursor)
  const out: Array<Choice | null> = posts.map(() => null);
  for (const { p, i } of order) {
    if (!p.asset || !opts.isVideo(p.asset)) continue;
    const use = useFor(p.asset, opts.ids);
    const o = (p.music ?? "").trim();
    if (off || /^off$/i.test(o)) continue;
    let track: Track, source: Choice["source"] = "rotation", fixed: number | undefined;
    if (o) {
      const [id, at] = o.split("@");
      const t = lib.tracks.find((x) => x.id === id);
      if (!t) throw new Error(`${p.date} ${p.asset}: music "${o}" is not a track in content/music/library.json (or "off")`);
      if (at !== undefined && !(Number.isFinite(+at) && +at >= 0)) throw new Error(`${p.date} ${p.asset}: music offset "${at}" is not a number of seconds`);
      track = t; source = "override"; fixed = at === undefined ? undefined : +at;
    } else track = pick(lib, use, base + count[use]++);
    // a pinned start ("C2@40") doesn't move the track's cursor, so adding a pinned post leaves every other post's
    // track and offset as they were (how a plan gains posts without re-mixing the ones already reviewed)
    const k = uses.get(track.id) ?? 0; if (fixed === undefined) uses.set(track.id, k + 1);
    const offsetIndex = (((Math.floor(base / 7) + k) * STRIDE) % track.offsets.length + track.offsets.length) % track.offsets.length;
    out[i] = { track: track.id, direction: track.direction, use, offsetIndex, ...(fixed !== undefined ? { offset: fixed } : {}), source };
  }
  return out;
}

/** The start offset in seconds for a video of `seconds` length: the chosen offset, or the latest one that still
 *  fits the video (with its fade-out) before the end of the track; 0 when the video is longer than the track (looped). */
export function resolveOffset(track: Track, choice: Choice, seconds: number): number {
  if (choice.offset !== undefined) return choice.offset;
  const fits = (t: number) => t + seconds <= track.duration - 0.25;
  const want = track.offsets[choice.offsetIndex] ?? track.offsets[0];
  if (fits(want)) return want;
  const ok = track.offsets.filter((t) => t <= want && fits(t));
  if (ok.length) return ok[ok.length - 1];
  const any = track.offsets.filter(fits);
  return any.length ? any[any.length - 1] : 0;
}
