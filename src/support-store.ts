// Build 3b: thread state and outbound replies for the support inbox (migration 007: support_threads, support_replies).
// Used by the email() handler (src/inbox.ts) and the inbox UI (src/inbox-ui.ts). Every call here tolerates migration 007
// not being applied yet: the handler then behaves exactly as build 3 did (no takeover, no stored replies, every note sent).

/** needs_mick: waiting on Mick. assistant: handled by the assistant. mick_replied: Mick answered last. closed. */
export type ThreadStatus = "needs_mick" | "assistant" | "mick_replied" | "closed";
export const THREAD_STATUSES: readonly ThreadStatus[] = ["needs_mick", "assistant", "mick_replied", "closed"];
/** assistant: the assistant may act on new messages (inside INBOX_AUTO and its guards). mick: taken over, it only drafts. */
export type ThreadOwner = "assistant" | "mick";
export interface ThreadState { thread_key: string; status: ThreadStatus; owner: ThreadOwner; updated_at: string; notified_msg_id: string | null }

const now = () => new Date().toISOString();

export async function threadState(db: D1Database, key: string): Promise<ThreadState | null> {
  try { return await db.prepare("SELECT thread_key, status, owner, updated_at, notified_msg_id FROM support_threads WHERE thread_key=?").bind(key).first<ThreadState>(); }
  catch { return null; }
}

/** Creates the thread's row if it has none. False when the table doesn't exist (migration 007 not applied). */
export async function ensureThread(db: D1Database, key: string): Promise<boolean> {
  try { await db.prepare("INSERT OR IGNORE INTO support_threads (thread_key, status, owner, updated_at) VALUES (?, 'needs_mick', 'assistant', ?)").bind(key, now()).run(); return true; }
  catch { return false; }
}

/** Sets status and/or owner. False when the table doesn't exist. */
export async function updateThread(db: D1Database, key: string, f: { status?: ThreadStatus; owner?: ThreadOwner }): Promise<boolean> {
  if (!(await ensureThread(db, key))) return false;
  try {
    await db.prepare("UPDATE support_threads SET status=COALESCE(?, status), owner=COALESCE(?, owner), updated_at=? WHERE thread_key=?").bind(f.status ?? null, f.owner ?? null, now(), key).run();
    return true;
  } catch { return false; }
}

/**
 * A thread's status after a customer message has been handled. A thread Mick has taken over always goes back to
 * "needs_mick"; otherwise it follows what happened to the message. An ignored message (auto-reply, bounce) leaves the
 * thread as it was, or closes it if it's the only message.
 */
export async function afterInbound(db: D1Database, key: string, msgStatus: string, toMick: boolean, mickOwns: boolean): Promise<void> {
  let status: ThreadStatus | null;
  if (msgStatus === "ignored") {
    const n = Number((await db.prepare("SELECT COUNT(*) n FROM support_messages WHERE thread_key=? AND status != 'ignored'").bind(key).first<{ n: number }>())?.n ?? 0);
    status = n === 0 ? "closed" : null;
  } else if (mickOwns || toMick || msgStatus === "forwarded" || msgStatus === "received") status = "needs_mick";
  else status = "assistant";
  if (status) await updateThread(db, key, { status });
}

/**
 * True once per (thread, customer message): the note to Mick about this message hasn't gone yet, and now it's marked as
 * sent. Without migration 007 it's always true (build 3 behaviour).
 */
export async function claimNotify(db: D1Database, key: string, msgId: string): Promise<boolean> {
  if (!(await ensureThread(db, key))) return true;
  try {
    const r = await db.prepare("UPDATE support_threads SET notified_msg_id=? WHERE thread_key=? AND (notified_msg_id IS NULL OR notified_msg_id != ?)").bind(msgId, key, msgId).run();
    return Number(r.meta?.changes ?? 0) > 0;
  } catch { return true; }
}

export interface ReplyRow {
  id: string; thread_key: string; created_at: string; author: "assistant" | "mick"; to_addr: string; subject: string | null; body_text: string | null;
  in_reply_to: string | null; references_hdr: string | null; nonce: string | null; status: "sending" | "sent" | "failed"; resend_id: string | null; sent_at: string | null;
}

export const replyId = () => { const b = crypto.getRandomValues(new Uint8Array(12)); return "sr_" + [...b].map((x) => x.toString(36).padStart(2, "0")).join("").slice(0, 16); };

/** Inserts an outbound row. False when the nonce was already used (a resubmitted form): nothing is inserted. Throws without migration 007. */
export async function insertReply(db: D1Database, r: Omit<ReplyRow, "id" | "created_at"> & { id?: string; created_at?: string }): Promise<{ inserted: boolean; id: string }> {
  const id = r.id ?? replyId();
  const res = await db.prepare(`INSERT OR IGNORE INTO support_replies (id, thread_key, created_at, author, to_addr, subject, body_text, in_reply_to, references_hdr, nonce, status, resend_id, sent_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, r.thread_key, r.created_at ?? now(), r.author, r.to_addr, r.subject, r.body_text, r.in_reply_to, r.references_hdr, r.nonce, r.status, r.resend_id, r.sent_at).run();
  return { inserted: Number(res.meta?.changes ?? 0) > 0, id };
}

/** The assistant's own reply, stored so the thread page shows it. Never throws (the email handler must not fail on it). */
export async function storeAssistantReply(db: D1Database, r: { thread_key: string; to_addr: string; subject: string | null; body_text: string | null; in_reply_to: string | null; references_hdr: string | null; ok: boolean; resend_id: string | null }) {
  try {
    await insertReply(db, { ...r, author: "assistant", nonce: null, status: r.ok ? "sent" : "failed", sent_at: r.ok ? now() : null });
  } catch { /* migration 007 not applied */ }
}
