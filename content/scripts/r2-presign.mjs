#!/usr/bin/env node
// Signs short-lived PUT URLs for an upload plan (upload-week.ts --emit), on the machine that holds the R2 keys, so the
// files can be uploaded from somewhere else without the keys ever leaving it. Prints JSON { key: url } to stdout.
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… node scripts/r2-presign.mjs <keys.json> [seconds]
// keys.json: [{ "key": "...", "type": "video/mp4" }, …]. Default expiry 6 hours.
import { AwsClient } from "aws4fetch";
import { readFileSync } from "node:fs";
const [file, secs = "21600"] = process.argv.slice(2);
const e = process.env, bucket = e.R2_BUCKET || "rite-content";
const aws = new AwsClient({ accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const out = {};
for (const { key } of JSON.parse(readFileSync(file, "utf8"))) {
  const u = new URL(`https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`);
  u.searchParams.set("X-Amz-Expires", secs);
  out[key] = (await aws.sign(u.toString(), { method: "PUT", aws: { signQuery: true } })).url;
}
console.log(JSON.stringify(out));
