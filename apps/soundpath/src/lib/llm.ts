/**
 * LLM provider abstraction.
 *
 * Two providers supported:
 *   - "gemini"   — Google Gemini Cloud API (Flash by default). High quality on
 *                  structured JSON output. Subject to 503 capacity issues.
 *   - "ollama"   — Local Ollama at http://localhost:11434. Defaults to
 *                  gemma-hermes:latest (Gemma 4 26B-A4B QAT). Slower but
 *                  fully offline and free.
 *
 * All three soundpath features (Match Song, Tone Discovery, Design Preset)
 * call through this abstraction so we can swap providers per request without
 * touching the prompts.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { callWithRetry as callGeminiHttp, getApiKey } from "./gemini";

export type LlmProvider = "claude" | "gemini" | "ollama";

export type LlmRequest = {
  system: string;
  user: string;
  /** Force JSON output (both providers support a JSON-only mode). */
  jsonMode?: boolean;
  /** 0..1 temperature. Default 0.4. */
  temperature?: number;
  /** Output token cap. Default 8000 (Gemini) / 4096 (Ollama). */
  maxOutputTokens?: number;
  /** Override the Ollama model for this request (e.g. "qwen-coding-fast:latest"). */
  ollamaModel?: string;
};

export type LlmResult = {
  text: string;
  provider: LlmProvider;
  model: string;
  /** "STOP" = clean finish; "MAX_TOKENS" = hit output cap; other = provider-specific. */
  finishReason: string;
  durationMs: number;
};

const GEMINI_MODEL = "gemini-2.5-flash";
const OLLAMA_BASE = process.env.OLLAMA_BASE ?? "http://localhost:11434";
// Claude Code CLI — uses OAuth to claude.ai for billing, no API key needed.
// Prefer the known install location to dodge PATH issues in dev server child shells.
const CLAUDE_BIN = (() => {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const localBin = `${homedir()}/.local/bin/claude`;
  if (existsSync(localBin)) return localBin;
  return "claude";
})();
// Per-flow defaults: Match Song + Tone Discovery use gemma-hermes:latest
// (fast — ~130s); Design Preset overrides to qwen-coding-fast (Gemma fails
// on that schema). Override globally with OLLAMA_MODEL env var.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "gemma-hermes:latest";

const GEMINI_ENDPOINT = (model: string, key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

/** Default provider — env var override; otherwise priority claude > gemini > ollama. */
export function defaultProvider(): LlmProvider {
  const env = process.env.LLM_PROVIDER?.toLowerCase();
  if (env === "ollama" || env === "gemini" || env === "claude") return env;
  return "claude";
}

export async function callLlm(req: LlmRequest, provider?: LlmProvider): Promise<LlmResult> {
  const p = provider ?? defaultProvider();
  if (p === "claude") {
    try {
      return await callClaude(req);
    } catch (e) {
      // Auto-fallback to Gemini Flash only when caller didn't pin "claude"
      // explicitly. If they did, the error should surface (e.g. a smoke test
      // verifying Claude specifically).
      if (provider === "claude") throw e;
      const why = e instanceof Error ? e.message : String(e);
      console.warn(`[llm] Claude failed (${why}); falling back to Gemini Flash`);
      return await callGemini(req);
    }
  }
  if (p === "ollama") return callOllama(req);
  return callGemini(req);
}

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

async function callGemini(req: LlmRequest): Promise<LlmResult> {
  const apiKey = getApiKey();
  const t0 = Date.now();
  const body = {
    system_instruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      maxOutputTokens: req.maxOutputTokens ?? 8000,
      ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };
  const payload = await callGeminiHttp(GEMINI_ENDPOINT(GEMINI_MODEL, apiKey), body, { maxAttempts: 4 });
  const text = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const finishReason =
    (payload.candidates?.[0] as unknown as { finishReason?: string } | undefined)?.finishReason ??
    "STOP";
  return { text, provider: "gemini", model: GEMINI_MODEL, finishReason, durationMs: Date.now() - t0 };
}

// ---------------------------------------------------------------------------
// Ollama
// ---------------------------------------------------------------------------

type OllamaChunk = {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
};

/**
 * Streaming Ollama call. Sends `stream: true` so chunks arrive token-by-token,
 * which keeps undici's body timeout from firing on long generations. Without
 * streaming, a quiet wait of >5 min would kill the connection — exactly the
 * failure mode we hit on 26B-A4B two-agent runs.
 */
async function callOllama(req: LlmRequest): Promise<LlmResult> {
  const t0 = Date.now();
  const model = req.ollamaModel ?? OLLAMA_MODEL;
  const body = {
    model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
    stream: true,
    ...(req.jsonMode ? { format: "json" } : {}),
    options: {
      temperature: req.temperature ?? 0.4,
      // 8K covers Match Song / Tone Discovery (~3K) and Design Preset (~5K).
      num_predict: req.maxOutputTokens ?? 8192,
      // Repetition guard — without this, Gemma 26B-A4B in JSON mode is prone
      // to "thoughtful-thoughtful-…" loops that burn the entire output budget.
      repeat_penalty: 1.15,
      repeat_last_n: 256,
      // Standard Gemma sampling per memory feedback (mirror qwen-hermes shape).
      top_p: 0.95,
      top_k: 64,
      min_p: 0,
    },
  };

  const resp = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(900_000), // overall hard cap, generous
  });
  if (!resp.ok || !resp.body) {
    const errText = resp.ok ? "(no body)" : await resp.text();
    throw new Error(`Ollama HTTP ${resp.status}: ${errText.slice(0, 400)}`);
  }

  // Accumulate streamed chunks. Each line is one JSON object.
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason = "UNKNOWN";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Process complete lines; keep the trailing partial in buffer
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        const chunk = JSON.parse(t) as OllamaChunk;
        if (chunk.message?.content) text += chunk.message.content;
        if (chunk.done) {
          finishReason = (chunk.done_reason ?? "STOP").toUpperCase();
        }
      } catch {
        // Skip malformed lines — usually a partial flush we'll see next read
      }
    }
  }
  // Final flush of any remaining buffer
  if (buffer.trim()) {
    try {
      const chunk = JSON.parse(buffer) as OllamaChunk;
      if (chunk.message?.content) text += chunk.message.content;
      if (chunk.done) finishReason = (chunk.done_reason ?? "STOP").toUpperCase();
    } catch {
      // ignore
    }
  }

  return {
    text,
    provider: "ollama",
    model,
    finishReason,
    durationMs: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Claude (via Claude Code CLI, OAuth to claude.ai — no API key needed)
// ---------------------------------------------------------------------------

async function callClaude(req: LlmRequest): Promise<LlmResult> {
  const t0 = Date.now();
  const args = ["--print", "--append-system-prompt", req.system, req.user];
  return new Promise<LlmResult>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOME: homedir() },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });

    // Generous timeout — observed ~30s for Match Song; allow up to 5 min for
    // bigger schemas (Design Preset) and slow-network OAuth refreshes.
    const timeoutMs = 300_000;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Claude subprocess timeout after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Claude subprocess failed to spawn: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(
          `Claude exited ${code}: ${(stderr || stdout).slice(0, 400)}`
        ));
        return;
      }
      // If Claude detected a not-logged-in state, --print prints to stdout
      // ("Not logged in · Please run /login") rather than erroring. Catch it.
      if (/Not logged in/.test(stdout)) {
        reject(new Error("Claude Code is not logged in. Run `claude` interactively and complete OAuth."));
        return;
      }
      resolve({
        text: stdout.trim(),
        provider: "claude",
        model: "claude-code",
        finishReason: "STOP",
        durationMs: Date.now() - t0,
      });
    });
  });
}

/** Probe whether the Claude Code CLI is installed + logged in. */
export async function probeClaude(): Promise<{ available: boolean; binary: string }> {
  if (!existsSync(CLAUDE_BIN.startsWith("/") ? CLAUDE_BIN : `${homedir()}/.local/bin/claude`)) {
    // Best-effort check — if CLAUDE_BIN is a bare name, we can't tell here.
    if (CLAUDE_BIN.startsWith("/")) return { available: false, binary: CLAUDE_BIN };
  }
  // Try `claude --version` with a short timeout
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { child.kill(); resolve({ available: false, binary: CLAUDE_BIN }); }, 3000);
    child.on("error", () => { clearTimeout(timer); resolve({ available: false, binary: CLAUDE_BIN }); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ available: code === 0 && out.length > 0, binary: CLAUDE_BIN });
    });
  });
}

/** Probe whether Ollama is reachable. Used by the UI to show/hide the toggle. */
export async function probeOllama(): Promise<{ available: boolean; models: string[] }> {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { available: false, models: [] };
    const j = (await r.json()) as { models?: Array<{ name: string }> };
    return { available: true, models: (j.models ?? []).map((m) => m.name) };
  } catch {
    return { available: false, models: [] };
  }
}
