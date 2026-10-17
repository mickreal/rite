// A small MIME parser for the support inbox (src/inbox.ts): headers (unfolded, RFC 2047 decoded, in message order), the
// text/plain body (or text/html stripped, when there's no plain part), and whether any part is an attachment. Handles
// multipart/* at any depth, quoted-printable and base64, and the charsets the runtime's TextDecoder knows (latin-1 as a
// fallback). Bytes are carried as "binary strings" (one char per byte) until a part's charset is known.

export interface ParsedMail {
  /** Every header in message order, names lower-cased, values unfolded and decoded. */
  headers: Array<[string, string]>;
  header(name: string): string | null;
  headerAll(name: string): string[];
  text: string;
  html: string;
  hasAttachment: boolean;
}

const bin = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return s; };
const bytes = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff; return u; };

function decodeCharset(b: string, charset = "utf-8"): string {
  const cs = charset.trim().toLowerCase().replace(/^"|"$/g, "") || "utf-8";
  if (cs === "us-ascii" || cs === "ascii") return b;
  try { return new TextDecoder(cs).decode(bytes(b)); } catch { /* unknown label */ }
  if (/^(iso-8859-1|latin-?1|windows-1252|cp1252)$/.test(cs)) return b;
  try { return new TextDecoder("utf-8").decode(bytes(b)); } catch { return b; }
}

const qp = (s: string) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
function b64(s: string): string { try { return atob(s.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, (m) => m.slice(0, 2))); } catch { return ""; } }

/** RFC 2047 encoded words (=?charset?B|Q?…?=); raw 8-bit header bytes are read as UTF-8. */
export function decodeWords(v: string): string {
  const raw = /[\x80-\xff]/.test(v) ? decodeCharset(v, "utf-8") : v;
  return raw.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s+(?==\?))?/g, (_, cs: string, enc: string, txt: string) =>
    decodeCharset(enc.toUpperCase() === "B" ? b64(txt) : qp(txt.replace(/_/g, " ")), cs.split("*")[0]));
}

function parseHeaders(block: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    out.push([line.slice(0, i).trim().toLowerCase(), decodeWords(line.slice(i + 1).trim())]);
  }
  return out;
}

/** "text/plain; charset=utf-8; boundary=x" → { value: "text/plain", params: {charset, boundary} } */
export function headerParams(v: string | null | undefined): { value: string; params: Record<string, string> } {
  const [value = "", ...rest] = (v ?? "").split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params: Record<string, string> = {};
  for (const p of rest) {
    const i = p.indexOf("=");
    if (i > 0) params[p.slice(0, i).trim().toLowerCase().replace(/\*$/, "")] = p.slice(i + 1).trim().replace(/^"|"$/g, "");
  }
  return { value: value.trim().toLowerCase(), params };
}

function split(raw: string): { head: string; body: string } {
  const m = /\r?\n\r?\n/.exec(raw);
  return m ? { head: raw.slice(0, m.index), body: raw.slice(m.index + m[0].length) } : { head: raw, body: "" };
}

const stripHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim();

export function parseMail(input: Uint8Array | string): ParsedMail {
  const raw = typeof input === "string" ? bin(new TextEncoder().encode(input)) : bin(input);
  const { head, body } = split(raw);
  const headers = parseHeaders(head);
  const texts: string[] = [], htmls: string[] = [];
  let hasAttachment = false;

  const walk = (hs: Array<[string, string]>, b: string, depth: number, inRelated: boolean) => {
    const get = (n: string) => hs.find(([k]) => k === n)?.[1] ?? null;
    const ct = headerParams(get("content-type") ?? "text/plain");
    const cd = headerParams(get("content-disposition"));
    const filename = cd.params.filename ?? ct.params.name;
    if (ct.value.startsWith("multipart/") && ct.params.boundary && depth < 12) {
      const marker = "--" + ct.params.boundary;
      const chunks = b.split(marker);
      for (const chunk of chunks.slice(1)) {
        if (chunk.startsWith("--")) break; // closing boundary
        const part = split(chunk.replace(/^[ \t]*\r?\n/, ""));
        walk(parseHeaders(part.head), part.body.replace(/\r?\n$/, ""), depth + 1, inRelated || ct.value === "multipart/related");
      }
      return;
    }
    const isText = ct.value === "text/plain" || ct.value === "text/html" || ct.value === "";
    if (cd.value === "attachment") { hasAttachment = true; return; }
    if (!isText) { if (!inRelated) hasAttachment = true; return; } // an inline image inside multipart/related (a signature logo) isn't one
    if (filename && cd.value !== "inline") { hasAttachment = true; return; }
    const cte = (get("content-transfer-encoding") ?? "").trim().toLowerCase();
    const decoded = decodeCharset(cte === "base64" ? b64(b) : cte === "quoted-printable" ? qp(b) : b, ct.params.charset);
    (ct.value === "text/html" ? htmls : texts).push(decoded);
  };
  walk(headers, body, 0, false);

  const html = htmls.join("\n");
  const text = (texts.length ? texts.join("\n") : stripHtml(html)).replace(/\r\n/g, "\n").trim();
  return {
    headers, text, html, hasAttachment,
    header: (n) => headers.find(([k]) => k === n.toLowerCase())?.[1] ?? null,
    headerAll: (n) => headers.filter(([k]) => k === n.toLowerCase()).map(([, v]) => v),
  };
}

/** The address in a From/To value ("Sam <Sam@Example.com>" → "sam@example.com"), or null. */
export function addressOf(v: string | null | undefined): string | null {
  if (!v) return null;
  const m = /<([^<>\s]+@[^<>\s]+)>/.exec(v) ?? /([^\s<>"',;:]+@[^\s<>"',;:]+)/.exec(v);
  return m ? m[1]!.toLowerCase() : null;
}

/** Message-ids in an In-Reply-To / References value, with their angle brackets. */
export const messageIds = (v: string | null | undefined): string[] => (v ?? "").match(/<[^<>\s]+>/g) ?? [];

/**
 * The customer's own words: everything above the first quoted block ("> …" lines, or an "On … wrote:" /
 * "-----Original Message-----" / "From: … Sent:" header).
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*>/.test(l)) break;
    if (/^\s*On .{4,200}wrote:\s*$/.test(l) || (/^\s*On .{4,200}$/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? ""))) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(l) || /^_{5,}$/.test(l.trim())) break;
    if (/^From: .+/.test(l) && /^(Sent|Date): /.test(lines[i + 1] ?? "")) break;
    out.push(l);
  }
  return out.join("\n").trim();
}
