// Build 3b: the data behind /admin/inbox (threads), /admin/inbox/t/:id (one thread) and Mick's replies from it.
// Threads are support_messages grouped by thread_key, plus their outbound rows (support_replies) and state (support_threads).
// Without migration 007 the pages still work read-only, with the status worked out from the messages.
import type { Env } from "./index";
import { addressOf, stripQuoted } from "./mime";
import { sendEmailResult } from "./email";
import { customer, history, threadUrlKey } from "./inbox";
import { threadState, updateThread, insertReply, type ThreadStatus, type ThreadOwner, type ReplyRow } from "./support-store";

export { threadUrlKey };
export type Tab = "needs" | "all" | "closed";
export const tabOf = (v: string | undefined): Tab => (v === "all" || v === "closed" ? v : "needs");

export const STATUS_LABEL: Record<ThreadStatus, string> = { needs_mick: "Needs me", assistant: "Handled by assistant", mick_replied: "Mick replied", closed: "Closed" };

export function threadKeyFromUrl(s: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,700}$/.test(s)) return null;
  try {
    const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  } catch { return null; }
}

/** A thread's status when it has no support_threads row (before migration 007): from its latest real message. */
export function derivedStatus(latestStatus: string | undefined): ThreadStatus {
  if (!latestStatus || latestStatus === "ignored") return "closed";
  if (latestStatus === "handled" || latestStatus === "awaiting_delete" || latestStatus === "deleted") return "assistant";
  return "needs_mick";
}

interface MsgLite { id: string; received_at: string; from_addr: string; subject: string | null; body_text: string | null; class: string | null; status: string; thread_key: string }
interface ReplyLite { thread_key: string; author: string; body_text: string | null; status: string; at: string }

export interface ThreadSummary {
  key: string; urlKey: string; from: string; subject: string; snippet: string; lastAt: string; status: ThreadStatus; owner: ThreadOwner;
  cls: string | null; messages: number; replies: number;
}

const snip = (t: string | null | undefined, n = 140) => { const s = (stripQuoted(t ?? "") || t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

/** Threads, newest activity first, for one tab, with the count in each tab. Reads the latest 2,000 messages and replies. */
export async function listThreads(db: D1Database, tab: Tab): Promise<{ threads: ThreadSummary[]; counts: Record<Tab, number>; missing006: boolean; missing007: boolean }> {
  const counts: Record<Tab, number> = { needs: 0, all: 0, closed: 0 };
  let msgs: MsgLite[];
  try { msgs = (await db.prepare("SELECT id, received_at, from_addr, subject, substr(body_text,1,4000) body_text, class, status, thread_key FROM support_messages ORDER BY received_at DESC, rowid DESC LIMIT 2000").all<MsgLite>()).results; }
  catch { return { threads: [], counts, missing006: true, missing007: true }; }
  let missing007 = false;
  const states = new Map<string, { status: ThreadStatus; owner: ThreadOwner }>();
  const replies = new Map<string, ReplyLite[]>();
  try {
    for (const t of (await db.prepare("SELECT thread_key, status, owner FROM support_threads ORDER BY updated_at DESC LIMIT 5000").all<{ thread_key: string; status: ThreadStatus; owner: ThreadOwner }>()).results) states.set(t.thread_key, t);
    for (const r of (await db.prepare("SELECT thread_key, author, substr(body_text,1,1000) body_text, status, COALESCE(sent_at, created_at) at FROM support_replies ORDER BY created_at DESC LIMIT 2000").all<ReplyLite>()).results) {
      (replies.get(r.thread_key) ?? replies.set(r.thread_key, []).get(r.thread_key)!).push(r);
    }
  } catch { missing007 = true; }

  const byThread = new Map<string, MsgLite[]>(); // newest first
  for (const m of msgs) (byThread.get(m.thread_key) ?? byThread.set(m.thread_key, []).get(m.thread_key)!).push(m);
  const all: ThreadSummary[] = [];
  for (const [key, ms] of byThread) {
    const real = ms.filter((m) => m.status !== "ignored");
    const latest = ms[0]!, starter = ms[ms.length - 1]!;
    const rs = replies.get(key) ?? [];
    const lastReply = rs[0];
    const st = states.get(key);
    const outNewer = lastReply && lastReply.at > latest.received_at;
    all.push({
      key, urlKey: threadUrlKey(key),
      from: [...ms].reverse().find((m) => m.from_addr !== "deleted")?.from_addr ?? "deleted",
      subject: starter.subject || latest.subject || "(no subject)",
      snippet: outNewer ? `${lastReply.author === "mick" ? "You" : "Assistant"}${lastReply.status === "failed" ? " (not sent)" : ""}: ${snip(lastReply.body_text)}` : snip(latest.body_text),
      lastAt: outNewer ? lastReply.at : latest.received_at,
      status: st?.status ?? derivedStatus(real[0]?.status ?? latest.status),
      owner: st?.owner ?? "assistant",
      cls: ms.find((m) => m.class)?.class ?? null,
      messages: ms.length, replies: rs.filter((r) => r.status === "sent").length,
    });
  }
  all.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
  for (const t of all) { counts.all++; if (t.status === "needs_mick") counts.needs++; if (t.status === "closed") counts.closed++; }
  const shown = all.filter((t) => tab === "all" || (tab === "needs" ? t.status === "needs_mick" : t.status === "closed"));
  return { threads: shown.slice(0, 150), counts, missing006: false, missing007 };
}

export interface InboundItem {
  kind: "in"; at: string; id: string; from: string; subject: string | null; body: string; own: string; cls: string | null; confidence: number | null;
  status: string; action: string | null; outcome: string | null; authPass: boolean; authDetail: string | null; attachment: boolean; draft: string | null;
}
export interface OutboundItem { kind: "out"; at: string; author: "assistant" | "mick"; to: string; subject: string | null; body: string; status: string; legacy?: boolean }
export type TimelineItem = InboundItem | OutboundItem;

export interface ThreadView {
  key: string; urlKey: string; subject: string; from: string; status: ThreadStatus; owner: ThreadOwner; missing007: boolean;
  items: TimelineItem[]; history: string | null; draft: string | null; replyTo: string | null;
}

interface MsgFull { id: string; received_at: string; from_addr: string; subject: string | null; body_text: string | null; message_id: string | null; class: string | null; confidence: number | null;
  status: string; action: string | null; outcome: string | null; auth_pass: number; auth_detail: string | null; has_attachment: number; draft: string | null; reply_message_id: string | null }

const threadMsgs = (db: D1Database, key: string) =>
  db.prepare("SELECT id, received_at, from_addr, subject, body_text, message_id, class, confidence, status, action, outcome, auth_pass, auth_detail, has_attachment, draft, reply_message_id FROM support_messages WHERE thread_key=? ORDER BY received_at, rowid").bind(key).all<MsgFull>();

export async function loadThread(env: Env, key: string): Promise<ThreadView | null> {
  let msgs: MsgFull[];
  try { msgs = (await threadMsgs(env.DB, key)).results; } catch { return null; }
  if (!msgs.length) return null;
  let replies: ReplyRow[] = [], missing007 = false;
  try { replies = (await env.DB.prepare("SELECT * FROM support_replies WHERE thread_key=? ORDER BY created_at").bind(key).all<ReplyRow>()).results; } catch { missing007 = true; }
  const st = missing007 ? null : await threadState(env.DB, key);
  const real = msgs.filter((m) => m.status !== "ignored");

  const items: TimelineItem[] = msgs.map((m) => ({
    kind: "in", at: m.received_at, id: m.id, from: m.from_addr, subject: m.subject, body: m.body_text ?? "", own: stripQuoted(m.body_text ?? "") || (m.body_text ?? ""),
    cls: m.class, confidence: m.confidence, status: m.status, action: m.action, outcome: m.outcome, authPass: !!m.auth_pass, authDetail: m.auth_detail,
    attachment: !!m.has_attachment, draft: m.draft,
  }));
  const stored = new Set(replies.map((r) => r.resend_id).filter(Boolean));
  for (const r of replies) items.push({ kind: "out", at: r.sent_at ?? r.created_at, author: r.author, to: r.to_addr, subject: r.subject, body: r.body_text ?? "", status: r.status });
  // build 3's automatic replies, sent before support_replies existed: the reply text is the message's draft
  for (const m of msgs) if (m.reply_message_id && m.draft && !stored.has(m.reply_message_id)) items.push({ kind: "out", at: m.received_at, author: "assistant", to: m.from_addr, subject: null, body: m.draft, status: "sent", legacy: true });
  items.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1));

  // the draft to prefill: the latest customer message's, if it went to Mick and nobody has replied since
  const lastIn = real.at(-1);
  const answered = lastIn ? replies.some((r) => r.status === "sent" && (r.sent_at ?? r.created_at) >= lastIn.received_at) : true;
  const draft = lastIn && lastIn.status === "forwarded" && lastIn.draft && !answered ? lastIn.draft : null;
  const email = real.find((m) => m.from_addr !== "deleted")?.from_addr ?? null;
  let hist: string | null = null;
  if (email) { try { hist = history(await customer(env, email)); } catch { hist = null; } }
  const replyTo = [...real].reverse().find((m) => m.from_addr !== "deleted")?.from_addr ?? null;
  return {
    key, urlKey: threadUrlKey(key), subject: msgs[0]!.subject || lastIn?.subject || "(no subject)", from: email ?? "deleted",
    status: st?.status ?? derivedStatus(lastIn?.status), owner: st?.owner ?? "assistant", missing007, items, history: hist, draft, replyTo,
  };
}

export type ReplyResult = { ok: true; id: string } | { ok: false; duplicate?: boolean; error: string };

/**
 * Mick's reply: sent from SUPPORT_EMAIL, In-Reply-To the latest customer message and References every customer message in
 * the thread (so it threads in their mail app, and their answer finds this thread again). The nonce is claimed first
 * (support_replies.nonce is UNIQUE), so a resubmitted form never sends twice. On success the thread is "mick_replied"
 * and taken over: the assistant won't act on it again until it's handed back.
 */
export async function sendReply(env: Env, key: string, text: string, nonce: string, log?: (kind: string, ref: string, detail: unknown) => Promise<void>): Promise<ReplyResult> {
  const body = text.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { ok: false, error: "This form is out of date. Reload the page and send again." };
  if (!body) return { ok: false, error: "The reply is empty." };
  if (body.length > 20000) return { ok: false, error: "The reply is over 20,000 characters." };
  if (/\{[^{}\n]{0,400}\}/.test(body)) return { ok: false, error: "The reply still has a {…} part from the draft. Fill it in or delete it, then send." };
  const allMsgs = (await threadMsgs(env.DB, key)).results;
  const msgs = allMsgs.filter((m) => m.status !== "ignored" && m.from_addr !== "deleted");
  const last = msgs.at(-1);
  if (!last) return { ok: false, error: "There's no customer message in this thread to reply to." };
  const first = allMsgs[0]!;
  const s = first.subject || last.subject || "";
  const subject = /^re:/i.test(s) ? s : `Re: ${s || "your email"}`;
  const ids = [...new Set(msgs.map((m) => m.message_id).filter(Boolean) as string[])].slice(-10);
  const headers: Record<string, string> = last.message_id ? { "In-Reply-To": last.message_id, References: ids.join(" ") } : {};

  const claim = await insertReply(env.DB, { thread_key: key, author: "mick", to_addr: last.from_addr, subject, body_text: body, in_reply_to: last.message_id, references_hdr: headers.References ?? null,
    nonce, status: "sending", resend_id: null, sent_at: null });
  if (!claim.inserted) return { ok: false, duplicate: true, error: "Already sent (this form was submitted before)." };

  const sent = await sendEmailResult(env, last.from_addr, subject, body, undefined, { from: `Rite <${addressOf(env.SUPPORT_EMAIL) ?? env.SUPPORT_EMAIL}>`, headers });
  await env.DB.prepare("UPDATE support_replies SET status=?, resend_id=?, sent_at=? WHERE id=?").bind(sent.ok ? "sent" : "failed", sent.id, sent.ok ? new Date().toISOString() : null, claim.id).run();
  if (!sent.ok) return { ok: false, error: "Resend didn't accept it, so nothing was sent (the error is on /admin). Your text is below; send again." };
  await updateThread(env.DB, key, { status: "mick_replied", owner: "mick" });
  await log?.("support_reply", claim.id, { thread: key.slice(0, 120), by: "mick" });
  return { ok: true, id: claim.id };
}

export type ThreadAction = "close" | "reopen" | "take" | "handback";
export const THREAD_ACTIONS: readonly ThreadAction[] = ["close", "reopen", "take", "handback"];

/** Close, Reopen, "I've got this" (take over) and "Hand back to assistant". Idempotent. False without migration 007. */
export async function changeThread(db: D1Database, key: string, a: ThreadAction): Promise<boolean> {
  switch (a) {
    case "close": return updateThread(db, key, { status: "closed" });
    case "reopen": return updateThread(db, key, { status: "needs_mick" });
    case "take": return updateThread(db, key, { owner: "mick" });
    case "handback": return updateThread(db, key, { owner: "assistant" });
  }
}

export const newNonce = () => { const b = crypto.getRandomValues(new Uint8Array(18)); return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
