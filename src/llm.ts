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
  const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
  return data.content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
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
