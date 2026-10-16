// Anthropic Messages API, called directly with fetch (no SDK needed on Workers).
import { previewSystem, reportSystem, seasonSystem } from "./content/prompts";

interface Env { ANTHROPIC_API_KEY: string; MODEL_REPORT: string; MODEL_PREVIEW: string }

async function complete(env: Env, model: string, system: string, user: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const raw = await res.text();
  const text = extractText(raw);
  if (!text) throw new Error(`Anthropic: no text in response: ${raw.slice(0, 1500)}`);
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
  return complete(env, env.MODEL_REPORT, reportSystem(), JSON.stringify(inputs), 2200);
}

export function writeSeason(env: Env, inputs: unknown) {
  return complete(env, env.MODEL_PREVIEW, seasonSystem(), JSON.stringify(inputs), 300);
}

/** Guard: every date-like token in the output must appear in the inputs' date list. */
export function datesAreGrounded(text: string, allowed: string[]): boolean {
  const found = text.match(/\b\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}\b/g) ?? [];
  const ok = new Set(allowed);
  return found.every((d) => ok.has(d));
}
