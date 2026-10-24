// 4K masters (README "4K masters"). SCALE=2 renders every card, vertical, dial clip and presenter reel at twice the
// layout size (cards 2160×2700, verticals 2160×3840) into content/out/master/<group>/; scripts/downscale.ts then makes
// the 1080-wide upload renders in content/out/<group>/ with the same names, which is what export-batch.ts, media-key.ts
// and upload-week.ts have always read. SCALE unset (or 1) is the old behaviour exactly: 1080 renders straight into out/.
//
// Pure helpers here (tested in test/scale.test.ts); the ffmpeg runs are in scripts/downscale.ts.
import { join } from "node:path";

/** Asset groups under content/out/ that hold renders (the presenter's media subfolders are not renders). */
export const GROUPS = ["clips", "signs", "cohorts", "quotes", "stills", "presenter", "carousels"] as const;
export type Group = (typeof GROUPS)[number];
/** The upload width every master is brought down to (Instagram, TikTok, Facebook, Threads, Pinterest). */
export const UPLOAD_WIDTH = 1080;

/** SCALE from the environment: 1 (default) or 2. Anything else is refused, so a typo can't render a 3240-wide batch. */
export function renderScale(env: Record<string, string | undefined> = process.env): 1 | 2 {
  const v = (env.SCALE ?? "").trim();
  if (v === "" || v === "1") return 1;
  if (v === "2") return 2;
  throw new Error(`SCALE must be 1 or 2 (got "${v}")`);
}

/** Where renders go: content/out/master for SCALE 2, content/out otherwise. */
export const renderRoot = (content: string, scale: number) => (scale > 1 ? join(content, "out", "master") : join(content, "out"));

/** H.264 level for a frame size at 30 fps: 4.2 covers 1080×1920, 5.1 covers 2160×3840. */
export const x264Level = (w: number, h: number) => (w * h > 1920 * 1088 ? "5.1" : "4.2");

/** CRF for a render: masters are kept near-lossless (14); 1080 renders keep their old values. */
export const masterCrf = (scale: number, normal: number) => (scale > 1 ? 14 : normal);

/** Output size of a downscale to `width` (even height, aspect kept). */
export function fitWidth(w: number, h: number, width = UPLOAD_WIDTH): { w: number; h: number } {
  if (w <= width) return { w, h };
  const nh = Math.round((h * width) / w / 2) * 2;
  return { w: width, h: nh };
}

const COLOR = ["-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv"];

/** ffmpeg args: a master video → the 1080-wide upload copy. Audio is copied untouched (no second loudness pass). */
export function downscaleVideoArgs(input: string, output: string, size: { w: number; h: number }): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-map", "0:v:0", "-map", "0:a?",
    "-vf", `scale=${size.w}:${size.h}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-level", x264Level(size.w, size.h), "-pix_fmt", "yuv420p",
    "-g", "60", "-bf", "2", ...COLOR, "-c:a", "copy", "-map_metadata", "0", "-movflags", "+faststart", output];
}

/** ffmpeg args: a master PNG → the 1080-wide upload PNG (lanczos). */
export function downscaleStillArgs(input: string, output: string, size: { w: number; h: number }): string[] {
  return ["-y", "-hide_banner", "-loglevel", "error", "-i", input, "-vf", `scale=${size.w}:${size.h}:flags=lanczos+accurate_rnd`, "-frames:v", "1", output];
}

/** Which master files need a fresh upload copy: missing, or older than the master. */
export function staleUploads(pairs: Array<{ master: string; upload: string; masterMtime: number; uploadMtime: number | null }>): string[] {
  return pairs.filter((p) => p.uploadMtime === null || p.uploadMtime < p.masterMtime).map((p) => p.master);
}
