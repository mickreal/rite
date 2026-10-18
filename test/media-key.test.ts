import { describe, it, expect } from "vitest";
// @ts-expect-error: no @types/node in this Workers project; vitest runs in Node
import { execFileSync, spawnSync } from "node:child_process";
// @ts-expect-error: as above
import { createHash } from "node:crypto";
// @ts-expect-error: as above
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
// @ts-expect-error: as above
import { tmpdir } from "node:os";
// @ts-expect-error: as above
import { join } from "node:path";
import { contentHashedName, isContentHashed, sha256Hex, IMMUTABLE_CACHE, MANIFEST_CACHE } from "../content/scripts/media-key";

const HELLO = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"; // sha256("hello")

describe("content-hashed media names (og-content-system's R2 rule)", () => {
  it("hashes with Web Crypto", async () => {
    expect(await sha256Hex(new TextEncoder().encode("hello"))).toBe(HELLO);
  });

  it("matches the engine's r2.content_addressed_key: <stem>-<sha12><last suffix>", () => {
    // expected values printed by og-content-system content-engine/r2.py content_addressed_key(key, b"hello")
    expect(contentHashedName("weeks/w/r/2026-12-15_a_vo.mp4", HELLO)).toBe("weeks/w/r/2026-12-15_a_vo-2cf24dba5fb0.mp4");
    expect(contentHashedName("2026-12-19_carousel-1-what-it-is-01.png", HELLO)).toBe("2026-12-19_carousel-1-what-it-is-01-2cf24dba5fb0.png");
    expect(contentHashedName("noext", HELLO)).toBe("noext-2cf24dba5fb0");
    expect(contentHashedName("a/b.tar.gz", HELLO)).toBe("a/b.tar-2cf24dba5fb0.gz");
  });

  it("refuses something that isn't a sha256", () => {
    expect(() => contentHashedName("a.mp4", "abc")).toThrow();
    expect(() => contentHashedName("a.mp4", HELLO.toUpperCase())).toThrow();
  });

  it("the engine's check passes on a hashed URL and fails on a plain one", () => {
    expect(isContentHashed("https://pub-x.r2.dev/weeks/w/r/a_vo-2cf24dba5fb0.mp4", HELLO)).toBe(true);
    expect(isContentHashed("https://pub-x.r2.dev/weeks/w/r/a_vo.mp4", HELLO)).toBe(false);
  });

  it("media is cached immutable for a year; the manifest always revalidates", () => {
    expect(IMMUTABLE_CACHE).toMatch(/max-age=31536000/);
    expect(IMMUTABLE_CACHE).toMatch(/immutable/);
    expect(MANIFEST_CACHE).toMatch(/no-cache/);
    expect(MANIFEST_CACHE).not.toMatch(/immutable/);
  });
});

const hasBun = spawnSync("bun", ["--version"]).status === 0;
// upload-week needs content/'s own dependencies (aws4fetch); skip rather than fail where `npm ci` hasn't been run in content/.
const hasContentDeps = existsSync(join(process.cwd(), "content", "node_modules", "aws4fetch"));

describe.skipIf(!hasBun || !hasContentDeps)("upload-week.ts --dry-run manifest", () => {
  it("names every media object by its sha256 and records the sha256 per file", () => {
    const dir = mkdtempSync(join(tmpdir(), "rite-week-"));
    const enc = (t: string) => new TextEncoder().encode(t);
    const files: Record<string, Uint8Array> = {
      "2026-12-15_tiktok_aries-three-pass-1997_vo.mp4": enc("vo video"),
      "2026-12-15_tiktok_aries-three-pass-1997.mp4": enc("silent video"),
      "2026-12-19_carousel-1-what-it-is-01.png": enc("slide 1"),
      "2026-12-19_carousel-1-what-it-is-02.png": enc("slide 2"),
    };
    for (const [n, b] of Object.entries(files)) writeFileSync(join(dir, n), b);
    const post = { day: null, slot: null, time: null, ref: null, kit: null, note: null, alt: [], missing: false };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ title: "t", from: "2026-12-14", to: "2026-12-20", posts: [
      { ...post, date: "2026-12-15", asset: "aries-three-pass-1997", platforms: ["tiktok", "reels"], caption: "Clip.",
        files: { tiktok: ["2026-12-15_tiktok_aries-three-pass-1997_vo.mp4", "2026-12-15_tiktok_aries-three-pass-1997.mp4"] } },
      { ...post, date: "2026-12-19", asset: "carousel-1-what-it-is", platforms: ["instagram"], caption: "Slides.",
        files: { instagram: ["2026-12-19_carousel-1-what-it-is-01.png", "2026-12-19_carousel-1-what-it-is-02.png"] } },
      { ...post, date: "2026-12-16", asset: null, ref: "kit-post-3", platforms: ["x", "threads"], caption: "Text.", files: {} },
    ] }));
    const env: Record<string, string | undefined> = { ...process.env, R2_PUBLIC_BASE: "https://pub-test.r2.dev" };
    for (const k of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_ENDPOINT"]) delete env[k];
    const out = execFileSync("bun", ["scripts/upload-week.ts", "--week", "2026-12-14", "--dir", dir, "--dry-run"],
      { cwd: join(process.cwd(), "content"), env, encoding: "utf8" });
    const m = JSON.parse(out.slice(out.indexOf("\n{\n") + 1));
    expect(m.version).toBe(1);
    const sha = (n: string) => createHash("sha256").update(files[n]).digest("hex");

    const video = m.posts[0].media;
    expect(video.type).toBe("video");
    for (const [entry, src] of [[video.vo, "2026-12-15_tiktok_aries-three-pass-1997_vo.mp4"], [video.silent, "2026-12-15_tiktok_aries-three-pass-1997.mp4"]] as const) {
      expect(entry.sha256).toBe(sha(src));
      expect(entry.url).toBe(`https://pub-test.r2.dev/${entry.key}`);
      expect(isContentHashed(entry.url, entry.sha256)).toBe(true);
    }
    // the logical name is unchanged (backward compatible); the key carries the hash
    expect(video.vo.name).toBe("2026-12-15_aries-three-pass-1997_vo.mp4");
    expect(video.vo.key).toMatch(new RegExp(`^weeks/2026-12-14/[a-z0-9]{16}/2026-12-15_aries-three-pass-1997_vo-${sha("2026-12-15_tiktok_aries-three-pass-1997_vo.mp4").slice(0, 12)}\\.mp4$`));

    const slides = m.posts[1].media.files;
    expect(slides.map((f: { sha256: string }) => f.sha256)).toEqual([sha("2026-12-19_carousel-1-what-it-is-01.png"), sha("2026-12-19_carousel-1-what-it-is-02.png")]);
    expect(slides[0].key).toMatch(/2026-12-19_carousel-1-what-it-is-01-[0-9a-f]{12}\.png$/);
    expect(slides.every((f: { url: string; sha256: string }) => isContentHashed(f.url, f.sha256))).toBe(true);
    expect(m.posts[2].media).toBeNull();
    expect(out).toContain(`sha256 ${sha("2026-12-19_carousel-1-what-it-is-02.png")}`);
  });
});
