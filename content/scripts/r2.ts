// Minimal R2 client over the S3-compatible API (SigV4 via aws4fetch), shared by upload-week.ts and rolling-plan.ts.
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET (default rite-content), R2_PUBLIC_BASE
// (the bucket's public URL: https://pub-….r2.dev or a custom domain). R2_ENDPOINT overrides the S3 endpoint
// (default https://<account>.r2.cloudflarestorage.com), e.g. for a local S3 stand-in.
import { AwsClient } from "aws4fetch";

export type R2 = { bucket: string; endpoint: string; publicBase: string; client: AwsClient };

/** null when the credentials aren't set (callers fall back to local files or a dry run). */
export function r2FromEnv(): R2 | null {
  const e = process.env;
  if (!e.R2_ACCESS_KEY_ID || !e.R2_SECRET_ACCESS_KEY || !(e.R2_ACCOUNT_ID || e.R2_ENDPOINT)) return null;
  return {
    bucket: e.R2_BUCKET || "rite-content",
    endpoint: (e.R2_ENDPOINT || `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/$/, ""),
    publicBase: (e.R2_PUBLIC_BASE || "").replace(/\/$/, ""),
    client: new AwsClient({ accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" }),
  };
}

const objectUrl = (r2: R2, key: string) => `${r2.endpoint}/${r2.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function r2Put(r2: R2, key: string, body: Uint8Array | string, contentType: string, cacheControl = "public, max-age=31536000, immutable"): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const r = await r2.client.fetch(objectUrl(r2, key), { method: "PUT", body, headers: { "content-type": contentType, "cache-control": cacheControl } });
    if (r.ok) return;
    const text = await r.text().catch(() => "");
    if (attempt >= 3 || (r.status < 500 && r.status !== 429)) throw new Error(`R2 PUT ${key}: ${r.status} ${text.slice(0, 300)}`);
    await new Promise((res) => setTimeout(res, 1000 * attempt));
  }
}

/** The object's text, or null when it doesn't exist. */
export async function r2GetText(r2: R2, key: string): Promise<string | null> {
  const r = await r2.client.fetch(objectUrl(r2, key), { method: "GET" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`R2 GET ${key}: ${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`);
  return r.text();
}

export const publicUrl = (r2: R2 | null, key: string) => `${r2?.publicBase || process.env.R2_PUBLIC_BASE?.replace(/\/$/, "") || "https://<R2_PUBLIC_BASE>"}/${key}`;
