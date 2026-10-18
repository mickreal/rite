#!/usr/bin/env node
// npm run admin:totp — make a two-factor secret for /admin/login (RFC 6238: SHA-1, 6 digits, 30 s; the same as src/totp.ts).
// Runs locally with node (18+) or bun, no dependencies, nothing sent anywhere. It prints the setup key and otpauth:// URI
// for your authenticator app, the current code so you can check the app agrees, and the wrangler command that stores
// the secret. It never writes the secret to a file. (No terminal QR: that would need a dependency; use the key or URI.)
//
//   npm run admin:totp                 new secret
//   npm run admin:totp -- --check KEY  print the current code for an existing secret (to compare with your app)

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const crypto = globalThis.crypto;
if (!crypto?.subtle) { console.error("This needs Web Crypto: node 18 or later, or bun."); process.exit(1); }

export function base32Encode(b) {
  let out = "", bits = 0, acc = 0;
  for (const x of b) { acc = (acc << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out += B32[(acc >>> bits) & 31]; } }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s) {
  const clean = s.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const out = []; let bits = 0, acc = 0;
  for (const ch of clean) { acc = (acc << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 0xff); } }
  return Uint8Array.from(out);
}
export async function totp(secret, nowMs = Date.now()) {
  const key = base32Decode(secret);
  let c = Math.floor(nowMs / 30000);
  const msg = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 1e6).padStart(6, "0");
}
export const otpauth = (secret) => `otpauth://totp/Rite:rite-admin?secret=${secret}&issuer=Rite&algorithm=SHA1&digits=6&period=30`;

async function main(argv) {
  const i = argv.indexOf("--check");
  if (i >= 0) {
    const s = argv[i + 1] ?? "";
    if (!base32Decode(s)) { console.error("That isn't a base32 secret."); process.exit(1); }
    console.log(`Current code: ${await totp(s)} (changes every 30 s)`);
    return;
  }
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20))); // 160 bits, as RFC 4226 recommends
  const grouped = secret.match(/.{1,4}/g).join(" ");
  const left = 30 - (Math.floor(Date.now() / 1000) % 30);
  console.log(`
Rite admin two-factor: new secret
=================================

1. Add it to your authenticator app (1Password, Apple Passwords, Google Authenticator, Authy, ...):
   "Enter a setup key" / "Enter code manually":

     Account:   Rite (rite-admin)
     Setup key: ${grouped}
     Type:      time-based, 6 digits, 30 seconds

   Or paste this URI where the app accepts one (1Password: edit the item > one-time password):

     ${otpauth(secret)}

2. Check the app shows this code right now: ${await totp(secret)}  (valid ${left} more seconds)

3. Store the secret in Cloudflare, from the repo root:

     npx wrangler secret put ADMIN_TOTP_SECRET

   When it asks for the value, paste:  ${secret}

   Optionally add ADMIN_TOTP_SECRET=<that value> to .dev.vars, so npm run secrets:push keeps it.

4. Deploy (npm test && npm run deploy), open /admin/login, enter the key, then the code.

Keep the setup key in your password manager too: it's the only way to add a second device. Lost it? Run this again,
set the new secret, deploy; the old one stops working. To turn two-factor off: npx wrangler secret delete ADMIN_TOTP_SECRET.
This secret is shown once and isn't saved anywhere by this script.
`);
}

// run only when executed, not when imported by the tests
import { pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";
const self = (() => { try { return pathToFileURL(realpathSync(process.argv[1] ?? "")).href; } catch { return ""; } })();
if (self === import.meta.url) await main(process.argv.slice(2));
