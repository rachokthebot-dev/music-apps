"use client";

/**
 * Compact toggle for picking which LLM provider serves the next request.
 *
 * Fetches /api/llm/probe once per mount to hide options that aren't available
 * (no API key, no Ollama running). Persists the choice in localStorage so the
 * toggle keeps your preference across modals + page loads.
 */

import { useEffect, useState } from "react";

export type Provider = "claude" | "gemini" | "ollama";

type Probe = {
  ok: boolean;
  default: Provider;
  claude: { available: boolean; binary: string };
  gemini: { available: boolean };
  ollama: { available: boolean; models: string[] };
};

const LS_KEY = "soundpath:llmProvider";

export function useProvider(): [Provider, (p: Provider) => void, Probe | null] {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [probe, setProbe] = useState<Probe | null>(null);

  useEffect(() => {
    fetch("/soundpath/api/llm/probe")
      .then((r) => r.json())
      .then((j: Probe) => {
        setProbe(j);
        const stored = typeof window !== "undefined" ? localStorage.getItem(LS_KEY) : null;
        const candidate = (stored as Provider | null) ?? j.default;
        const okFor = (p: Provider) =>
          p === "claude" ? j.claude.available :
          p === "gemini" ? j.gemini.available :
          j.ollama.available;
        // Walk the priority list and pick the first available.
        if (okFor(candidate)) {
          setProvider(candidate);
        } else {
          const fallback = (["claude", "gemini", "ollama"] as const).find(okFor);
          setProvider(fallback ?? "gemini");
        }
      })
      .catch(() => {
        // Probe failed — fall back to gemini, the UI still works.
        setProvider("gemini");
      });
  }, []);

  const update = (p: Provider) => {
    setProvider(p);
    if (typeof window !== "undefined") localStorage.setItem(LS_KEY, p);
  };

  return [provider, update, probe];
}

type Props = {
  provider: Provider;
  onChange: (p: Provider) => void;
  probe: Probe | null;
  disabled?: boolean;
  /** When set, the Ollama option is force-disabled with this tooltip text.
   *  Used by features (like Design Preset) where local Gemma is unreliable. */
  lockToCloudReason?: string;
};

export default function ProviderToggle({ provider, onChange, probe, disabled, lockToCloudReason }: Props) {
  if (!probe) return null;
  const claudeOk = probe.claude.available;
  const geminiOk = probe.gemini.available;
  const ollamaOk = probe.ollama.available && !lockToCloudReason;
  if (!claudeOk && !geminiOk && !ollamaOk) return null;

  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
      <button
        type="button"
        onClick={() => onChange("claude")}
        disabled={disabled || !claudeOk}
        className={`text-[11px] px-2 py-0.5 rounded transition ${
          provider === "claude"
            ? "bg-purple-900/60 text-purple-100"
            : "text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        }`}
        title={claudeOk ? "Claude (OAuth via Claude Code CLI)" : "Claude Code CLI not installed or not logged in"}
      >
        Claude
      </button>
      <button
        type="button"
        onClick={() => onChange("gemini")}
        disabled={disabled || !geminiOk}
        className={`text-[11px] px-2 py-0.5 rounded transition ${
          provider === "gemini"
            ? "bg-blue-900/60 text-blue-100"
            : "text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        }`}
        title={geminiOk ? "Google Gemini Flash (cloud, fallback)" : "GEMINI_API_KEY not set"}
      >
        Gemini Flash
      </button>
      <button
        type="button"
        onClick={() => onChange("ollama")}
        disabled={disabled || !ollamaOk}
        className={`text-[11px] px-2 py-0.5 rounded transition ${
          provider === "ollama"
            ? "bg-emerald-900/60 text-emerald-100"
            : "text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:cursor-not-allowed"
        }`}
        title={
          lockToCloudReason
            ? lockToCloudReason
            : ollamaOk
              ? `Ollama local (${probe.ollama.models[0] ?? ""})`
              : "Ollama not reachable"
        }
      >
        Local
      </button>
    </div>
  );
}
