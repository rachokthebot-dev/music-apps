/**
 * Shared Gemini helpers — API key resolution + retry-with-backoff.
 *
 * Gemini returns 503 "model overloaded" during demand spikes, sometimes after
 * 1–2 seconds. Without retry the UI sees a fast failure that looks like the
 * call "stopped before finishing". Five retries with exponential backoff
 * (2s, 4s, 8s, 16s, capped 30s) handles all but the longest outages.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

export function getApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  const keyFile = join(homedir(), ".config/gemini/key");
  try {
    return readFileSync(keyFile, "utf-8").trim();
  } catch {
    throw new Error(
      "GEMINI_API_KEY not set and ~/.config/gemini/key missing. " +
        "Add `export GEMINI_API_KEY=...` to ~/.zshenv."
    );
  }
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 5;

export async function callWithRetry(
  url: string,
  body: unknown,
  { maxAttempts = MAX_ATTEMPTS }: { maxAttempts?: number } = {}
): Promise<GeminiResponse> {
  const payload = JSON.stringify(body);
  let delay = 2000;
  let lastErr: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
    } catch (err) {
      // Network errors are also retryable
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts) {
        await sleep(delay);
        delay = Math.min(30000, delay * 2);
        continue;
      }
      throw lastErr;
    }

    if (resp.ok) return (await resp.json()) as GeminiResponse;

    const text = await resp.text();
    const transient = TRANSIENT.has(resp.status);
    if (!transient || attempt === maxAttempts) {
      throw new Error(`Gemini HTTP ${resp.status} after ${attempt} attempt(s): ${text.slice(0, 400)}`);
    }
    console.warn(`[gemini] HTTP ${resp.status} attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`);
    await sleep(delay);
    delay = Math.min(30000, delay * 2);
  }

  throw lastErr ?? new Error("callWithRetry exhausted without response");
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
