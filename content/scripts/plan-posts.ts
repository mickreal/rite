// Plan posts as the pipeline sees them, with two launch-calendar conventions resolved in one place (render-batch,
// export-batch, check-cohorts, check-captions, rolling-plan and vo-lines all read plans through this):
//
// 1. `fallback` (slots that depend on other people: a reader's quote, a creator's repost). The post itself stays as
//    written (no asset, the intent in its note, made and posted by hand). Its `fallback: { asset, caption, alt, note?,
//    music?, slot? }` is a ready-made video in Rite's own voice. Unless the post says `"use": "original"`, the fallback
//    becomes a post of its own on the same day, straight after it: slot "Fallback: <slot>", `fallback_for` = the
//    original slot, same platforms and time. Being a normal video post with a caption, it is `auto: true` in the week
//    manifest, so auto-posting puts the fallback out unless Mick has the original:
//      - original in hand before that week's Thursday render → set `"use": "original"` on the post (the fallback is
//        then not rendered, exported or uploaded) and post the original by hand as before;
//      - original arrives after the week is uploaded → post it by hand and cancel that day's fallback in the queue.
//    `"use": "both"` keeps the fallback even when the original goes out.
// 2. `interim` (presenter reels that wait for paid takes). `asset` is the finished reel (Anna); `interim` a version of
//    the same reel with no Anna and no voice (remotion/presenter.json, `interimOf`). The export uses `asset` when it
//    is rendered, else `interim` (the manifest says which: `interim: true`), so the slot isn't empty while the
//    ElevenLabs credits are out, and the finished reel replaces it as soon as it's rendered.
export type Fallback = { asset: string; caption?: string; alt?: string | string[]; note?: string; music?: string; slot?: string };
export type PlanPost = {
  date: string; day?: string; slot?: string; kit?: string; asset?: string; interim?: string; platforms?: string[];
  caption?: string; alt?: string | string[]; note?: string; time?: string; ref?: string; music?: string;
  fallback?: Fallback; use?: "fallback" | "original" | "both"; fallback_for?: string;
  [k: string]: unknown;
};

/** The posts a plan publishes: each post, followed by its fallback post when it has one (and `use` isn't "original"). */
export function expandPosts<T extends PlanPost>(posts: T[]): PlanPost[] {
  const out: PlanPost[] = [];
  for (const p of posts) {
    out.push(p);
    const f = p.fallback;
    if (!f || p.use === "original") continue;
    if (!f.asset) throw new Error(`${p.date} ${p.slot ?? ""}: fallback without an asset`);
    out.push({
      date: p.date, ...(p.time ? { time: p.time } : {}), slot: f.slot ?? `Fallback: ${p.slot ?? p.date}`, kit: p.kit,
      asset: f.asset, platforms: p.platforms, caption: f.caption, alt: f.alt, note: f.note,
      ...(f.music ? { music: f.music } : {}), fallback_for: p.slot ?? p.date,
    });
  }
  return out;
}

/** Every asset id a set of posts may need rendered: assets, interim versions. */
export const assetsOf = (posts: PlanPost[]) => [...new Set(posts.flatMap((p) => [p.asset, p.interim]).filter(Boolean) as string[])];

/** A plan file's posts (array or { posts }), expanded. */
export const planPosts = (plan: unknown): PlanPost[] => expandPosts((Array.isArray(plan) ? plan : (plan as { posts: PlanPost[] }).posts) as PlanPost[]);
