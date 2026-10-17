import { describe, it, expect, vi, afterEach } from "vitest";
import { answerQuestion } from "../src/llm";

afterEach(() => vi.unstubAllGlobals());
const reply = (content: unknown[]) => new Response(JSON.stringify({ content }), { status: 200 });

describe("Anthropic calls", () => {
  it("sends thinking:disabled only to Haiku models, and retries once when a reply has no text", async () => {
    const bodies: Record<string, unknown>[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return n++ === 0 ? reply([{ type: "thinking", thinking: "" }]) : reply([{ type: "text", text: "An answer." }]);
    });
    const env = { ANTHROPIC_API_KEY: "k", MODEL_REPORT: "claude-sonnet-5-5", MODEL_PREVIEW: "claude-haiku-5-5" };
    const out = await answerQuestion(env, "system", "What now?");
    expect(out).toBe("An answer.");
    expect(bodies).toHaveLength(2); // the empty-thinking reply is retried once
    for (const b of bodies) {
      if (/haiku/.test(String(b.model))) expect(b.thinking).toEqual({ type: "disabled" });
      else expect(b.thinking).toBeUndefined();
    }
  });
});
