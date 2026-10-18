// TOTP (RFC 6238 over RFC 4226 HOTP): HMAC-SHA-1, 6 digits, 30-second steps, the admin sign-in's second factor.
// The secret is base32 (RFC 4648, no padding needed), as authenticator apps show it. No dependency: WebCrypto only.
// scripts/admin-totp.mjs generates a secret with the same parameters (npm run admin:totp).

export const TOTP_PERIOD = 30;
export const TOTP_DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Base32 → bytes. Case, spaces, dashes and trailing '=' are ignored; anything else returns null. */
export function base32Decode(s: string): Uint8Array | null {
  const clean = s.toUpperCase().replace(/[\s-]/g, "").replace(/=+$/, "");
  if (!clean || /[^A-Z2-7]/.test(clean)) return null;
  const out: number[] = [];
  let bits = 0, acc = 0;
  for (const ch of clean) {
    acc = (acc << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 0xff); }
  }
  return Uint8Array.from(out);
}

export function base32Encode(b: Uint8Array): string {
  let out = "", bits = 0, acc = 0;
  for (const x of b) {
    acc = (acc << 8) | x;
    bits += 8;
    while (bits >= 5) { bits -= 5; out += B32[(acc >>> bits) & 31]; }
  }
  if (bits > 0) out += B32[(acc << (5 - bits)) & 31];
  return out;
}

/** A usable secret: valid base32 of at least 80 bits (RFC 4226 asks for 128; npm run admin:totp makes 160). */
export function totpSecretOk(s: string | undefined): boolean {
  const k = s ? base32Decode(s) : null;
  return !!k && k.length >= 10;
}

/** HOTP(K, C), `digits` long, zero-padded. */
export async function hotp(key: Uint8Array, counter: number, digits = TOTP_DIGITS): Promise<string> {
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 0xff; c = Math.floor(c / 256); }
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", k, msg));
  const o = h[h.length - 1]! & 0x0f;
  const bin = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpStep = (nowMs: number) => Math.floor(nowMs / 1000 / TOTP_PERIOD);

/** The code for a base32 secret at a time (ms). */
export async function totpCode(secret: string, nowMs: number, digits = TOTP_DIGITS): Promise<string> {
  const key = base32Decode(secret);
  if (!key) throw new Error("TOTP secret isn't base32");
  return hotp(key, totpStep(nowMs), digits);
}

/**
 * Check a 6-digit code against the steps now-1, now and now+1 (clock drift of up to 30 s either way). Every candidate is
 * computed and compared in constant time, whatever matches. Returns the matched step (for replay protection) or null.
 */
export async function verifyTotp(secret: string, code: string, nowMs: number, window = 1): Promise<number | null> {
  const key = base32Decode(secret);
  const c = (code ?? "").replace(/\s/g, "");
  if (!key || key.length < 10 || !/^\d{6}$/.test(c)) return null;
  const now = totpStep(nowMs);
  let found: number | null = null;
  for (let s = now - window; s <= now + window; s++) {
    const want = await hotp(key, s);
    let d = 0;
    for (let i = 0; i < TOTP_DIGITS; i++) d |= want.charCodeAt(i) ^ c.charCodeAt(i);
    if (d === 0 && found === null) found = s;
  }
  return found;
}

/** The otpauth:// URI authenticator apps (and most password managers) import. */
export function otpauthUri(secret: string, account = "rite-admin", issuer = "Rite"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}
