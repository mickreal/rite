// Anthropic Messages API, called directly with fetch (no SDK needed on Workers).
import { previewSystem, reportSystem, seasonSystem, yearAheadSystem, type SeasonInputs } from "./content/prompts";

interface Env { ANTHROPIC_API_KEY: string; MODEL_REPORT: string; MODEL_PREVIEW: string }

async function complete(env: Env, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  // Haiku can think by default and occasionally spends the whole budget on it, returning only an empty thinking block
  // (the Ask and preview "no text in response" errors). Haiku accepts {type:"disabled"}; Sonnet 5.5 rejects it (it wants
  // "between_tools") and doesn't think by default, so only Haiku gets the parameter. If a reply still has no text, one
  // retry with twice the budget.
  const call = async (budget: number) => {
    const body: Record<string, unknown> = { model, max_tokens: budget, system, messages: [{ role: "user", content: user }] };
    if (/haiku/i.test(model)) body.thinking = { type: "disabled" };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    return res.text();
  };
  let raw = await call(maxTokens);
  let text = extractText(raw);
  if (!text) { raw = await call(maxTokens * 2); text = extractText(raw); }
  if (!text) throw new Error(`Anthropic: no text in response: ${raw.slice(0, 600)}`);
  return text;
}

/** Pull every text block out of a Messages API response, tolerant of nesting (content[], output[], message.content[]). */
export function extractText(raw: string): string {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return ""; }
  const out: string[] = [];
  const walk = (v: unknown, depth = 0) => {
    if (depth > 6 || v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (o.type === "text" && typeof o.text === "string") { out.push(o.text); return; }
      for (const k of ["content", "output", "message", "blocks"]) if (k in o) walk(o[k], depth + 1);
    }
  };
  walk(data);
  return out.join("").trim();
}

export function writePreview(env: Env, inputs: unknown) {
  return complete(env, env.MODEL_PREVIEW, previewSystem(), JSON.stringify(inputs), 400);
}

export function writeReport(env: Env, inputs: unknown) {
  return complete(env, env.MODEL_REPORT, reportSystem(), JSON.stringify(inputs), 6000);
}

/** Year-ahead reading (build 11): the report model, as the main reading. */
export function writeYearAhead(env: Env, inputs: unknown) {
  return complete(env, env.MODEL_REPORT, yearAheadSystem(), JSON.stringify(inputs), 4000);
}

export function writeSeason(env: Env, inputs: SeasonInputs) {
  return complete(env, env.MODEL_PREVIEW, seasonSystem(), JSON.stringify(inputs), 400);
}

/** Guard: every date-like token in the output must appear in the inputs' date list. */
export function datesAreGrounded(text: string, allowed: string[]): boolean {
  const found = text.match(/\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.? \d{4}\b/g) ?? [];
  const ok = new Set(allowed.map(norm));
  return found.every((d) => ok.has(norm(d)));
}
function norm(d: string) { return d.replace(/\.|(?<=\b[A-Z][a-z]{2})[a-z]+/g, "").replace(/\s+/g, " "); }

/** Pull the first JSON object out of a model reply (tolerates fences / stray prose). */
export function parseJsonReply<T>(text: string): T {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("no JSON object in reply: " + text.slice(0, 200));
  return JSON.parse(m[0]) as T;
}

export function answerQuestion(env: Env, system: string, user: string) {
  return complete(env, env.MODEL_PREVIEW, system, user, 700);
}

/** Support inbox classifier (src/inbox.ts): the cheap model, a short JSON reply. */
export function classifySupport(env: Env, system: string, user: string) {
  return complete(env, env.MODEL_PREVIEW, system, user, 200);
}
