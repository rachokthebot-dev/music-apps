/**
 * GET /api/llm/probe
 *
 * Reports which LLM providers are reachable. The UI uses this to show or
 * hide the local-Gemma toggle (no point exposing Ollama if it isn't running).
 */

import { probeClaude, probeOllama, type LlmProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [claude, ollama] = await Promise.all([probeClaude(), probeOllama()]);
  const geminiKeyPresent =
    !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;

  // Smart default priority: claude > gemini > ollama. Per user direction —
  // Claude via OAuth produces noticeably better tone-reasoning than Flash
  // at comparable latency, and Gemini Flash is the immediate fallback.
  let smartDefault: LlmProvider = "gemini";
  const envOverride = process.env.LLM_PROVIDER?.toLowerCase();
  if (envOverride === "ollama" || envOverride === "gemini" || envOverride === "claude") {
    smartDefault = envOverride;
  } else if (claude.available) {
    smartDefault = "claude";
  } else if (geminiKeyPresent) {
    smartDefault = "gemini";
  } else if (ollama.available) {
    smartDefault = "ollama";
  }

  return Response.json({
    ok: true,
    default: smartDefault,
    claude,
    gemini: { available: geminiKeyPresent },
    ollama,
  });
}
