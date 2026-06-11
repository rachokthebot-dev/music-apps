/**
 * POST /api/llm/generate
 *
 * Generic LLM passthrough so other apps on this host (HelAIx) can route their
 * chat calls through SoundPath's provider abstraction — getting Claude (OAuth)
 * by default with automatic fallback to Gemini Flash, without each app having
 * to re-implement provider switching.
 *
 * Body: { system: string, user: string, jsonMode?: boolean,
 *         temperature?: number, maxOutputTokens?: number,
 *         provider?: "claude" | "gemini" | "ollama" }
 *
 * Returns: { text, provider, model, finishReason, durationMs }
 */

import { callLlm, type LlmProvider, type LlmRequest } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = LlmRequest & { provider?: LlmProvider };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch (e) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.system !== "string" || typeof body.user !== "string") {
    return Response.json(
      { error: "Both `system` and `user` strings are required." },
      { status: 400 },
    );
  }

  try {
    const result = await callLlm(
      {
        system: body.system,
        user: body.user,
        jsonMode: body.jsonMode,
        temperature: body.temperature,
        maxOutputTokens: body.maxOutputTokens,
      },
      body.provider,
    );
    return Response.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 502 });
  }
}
