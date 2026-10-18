// Content-hashed (immutable) R2 object names for week media, the rule og-content-system's engine enforces before it
// schedules anything on R2 (api.py `_verify_r2_media`): every media file's name carries `-<first 12 hex of its
// sha256>` before the extension, and the manifest records the full sha256 per file. Same naming as the engine's own
// `r2.content_addressed_key` (scripts/upload_verified_media.py): `<stem>-<sha12><ext>`, ext = the last `.suffix`.
// A changed render is a new URL, so a CDN can never serve Postiz a stale copy under an old name.
// Pure (Web Crypto only) so it can be tested; upload-week.ts calls it.

/** Media objects never change under a content-hashed name: cache them for a year. */
export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";
/** manifest.json and latest.json are rewritten in place: always revalidate. */
export const MANIFEST_CACHE = "no-cache, max-age=0, must-revalidate";

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** `2026-12-15_clip_vo.mp4` + sha → `2026-12-15_clip_vo-<sha12>.mp4` (no extension: `<name>-<sha12>`). */
export function contentHashedName(name: string, sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`not a sha256 hex digest: ${sha256}`);
  const slash = name.lastIndexOf("/");
  const dir = name.slice(0, slash + 1), base = name.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
  return `${dir}${stem}-${sha256.slice(0, 12)}${ext}`;
}

/** The check the engine makes on a URL's file name (`-<sha12>` in it). */
export const isContentHashed = (url: string, sha256: string) =>
  (new URL(url).pathname.split("/").pop() ?? "").includes(`-${sha256.slice(0, 12)}`);
