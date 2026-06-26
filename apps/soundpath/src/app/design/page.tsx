"use client";

/**
 * /design — Preset Designer
 *
 * Takes 3 free-form tone descriptions, calls Gemini, shows a preview of the
 * generated chain + snapshots, and offers to open it in /edit/ (which sets
 * the result as the active master).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import LlmProgress from "@/components/LlmProgress";
import ProviderToggle, { useProvider } from "@/components/ProviderToggle";

// Mirror of the server's response shape — kept narrow so the UI can render
// what it needs without re-importing the whole estimator types.
type DesignedBlock = {
  dsp: "dsp0" | "dsp1";
  slot: string;
  path: 0 | 1;
  position: number;
  model: string;
  cab?: string;
};
type DesignedSnapshot = {
  index: number;
  name: string;
  enabledBlocks: string[];
  params: { [slot: string]: { [param: string]: number } };
};
type Design = {
  presetName: string;
  designNotes?: string;
  chain: DesignedBlock[];
  snapshots: DesignedSnapshot[];
};
type Loudness = { index: number; name: string; loudnessDb: number };
type DesignResponse = {
  ok: boolean;
  mode?: "single" | "two-agent";
  rig?: {
    presetName: string;
    designNotes: string;
    chain: Array<{ category: string; realWorldName: string; role: string }>;
    snapshots: Array<{ index: number; name: string; intent: string; activeCategories: string[] }>;
  } | null;
  design?: Design;
  hlx?: string;
  loudness?: Loudness[];
  applyReport?: { placed: number; snapshotsConfigured: number; warnings: string[] };
  validation?: { warnings: string[]; dspPerPath: { [path: string]: number } };
  durations?: { designerMs?: number; engineerMs?: number; totalMs?: number };
  error?: string;
};

const DESIGN_PHASES = [
  "Reading your three tones…",
  "Choosing amps + cabs…",
  "Laying out the chain…",
  "Configuring 8 snapshots…",
  "Deriving solo variants…",
];

const TWO_AGENT_PHASES = [
  "Designer: sketching real-world rig…",
  "Designer: writing per-snapshot intent…",
  "Engineer: mapping to Helix block IDs…",
  "Engineer: configuring snapshots + params…",
  "Validating DSP budget + block coverage…",
];

function expectedDurationSec(provider: "claude" | "gemini" | "ollama", mode: "single" | "two-agent"): number {
  if (provider === "ollama") return mode === "two-agent" ? 360 : 220;
  // Claude OAuth subprocess ≈ Gemini Flash latency in our bake-off (~30s),
  // bump two-agent slightly to cover the second prompt's overhead.
  if (provider === "claude") return mode === "two-agent" ? 70 : 35;
  return mode === "two-agent" ? 50 : 30;
}

const TONE_PRESETS: { label: string; t1: string; t2: string; t3: string }[] = [
  {
    label: "Jazz / Rock / Metal",
    t1: "warm late-night jazz",
    t2: "classic rock crunch",
    t3: "modern progressive metal",
  },
  {
    label: "Blues / Country / Funk",
    t1: "edge-of-breakup blues",
    t2: "twangy country chicken-pickin'",
    t3: "tight slap-funk clean",
  },
  {
    label: "Indie / Post-rock / Shoegaze",
    t1: "jangly indie rhythm",
    t2: "wash of post-rock delays",
    t3: "fuzzy shoegaze wall",
  },
];

export default function DesignPage() {
  const router = useRouter();
  const [tones, setTones] = useState<[string, string, string]>(["", "", ""]);
  const [busy, setBusy] = useState<"generate" | "open" | null>(null);
  const [result, setResult] = useState<DesignResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [provider, setProvider, probe] = useProvider();
  const [mode, setMode] = useState<"single" | "two-agent">("two-agent");

  // Hard rule: two-agent mode is cloud-only. Local Gemma takes 6–8 min PER call,
  // making two sequential calls impractical. Auto-snap to single-agent whenever
  // the user selects Ollama, and lock the toggle until they switch back.
  useEffect(() => {
    if (provider === "ollama" && mode !== "single") setMode("single");
  }, [provider, mode]);

  // Note: Design Preset uses qwen-coding-fast (not gemma-hermes) when on local
  // provider. Gemma fails on this specific structured-output schema; qwen
  // models complete reliably in ~6–8 min.

  const updateTone = (i: 0 | 1 | 2, v: string) => {
    const next = [...tones] as [string, string, string];
    next[i] = v;
    setTones(next);
  };

  const handleGenerate = useCallback(async () => {
    if (tones.some((t) => !t.trim())) {
      setErr("Fill in all 3 tone descriptions");
      return;
    }
    setBusy("generate");
    setErr(null);
    setResult(null);
    try {
      const r = await fetch("/soundpath/api/design-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tones, provider, mode }),
      });
      const j = (await r.json()) as DesignResponse;
      if (!j.ok) throw new Error(j.error ?? "design failed");
      setResult(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, [tones]);

  const handleOpenInEditor = useCallback(async () => {
    if (!result?.hlx) return;
    setBusy("open");
    try {
      const blob = new Blob([result.hlx], { type: "application/json" });
      const file = new File([blob], `${result.design?.presetName || "designed"}.hlx`, {
        type: "application/json",
      });
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/soundpath/api/master", { method: "POST", body: form });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "save failed");
      router.push("/edit");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }, [result, router]);

  const handleDownload = useCallback(() => {
    if (!result?.hlx) return;
    const blob = new Blob([result.hlx], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.design?.presetName || "designed"}.hlx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <main className="p-6 max-w-5xl mx-auto min-h-screen">
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Design new preset</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Describe 3 tones. Gemini designs the chain, 8 snapshots, and solo variants.
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
        >
          ← Back
        </button>
      </header>

      {/* Input form */}
      <section className="mb-6">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <label className="block text-xs uppercase tracking-wider text-zinc-500 mb-1">
                  Tone {i + 1}
                </label>
                <input
                  value={tones[i]}
                  onChange={(e) => updateTone(i as 0 | 1 | 2, e.target.value)}
                  placeholder={
                    i === 0 ? "warm late-night jazz" :
                    i === 1 ? "classic rock crunch" :
                    "modern progressive metal"
                  }
                  className="w-full px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100"
                  disabled={busy !== null}
                />
              </div>
            ))}
          </div>

          {/* Preset chips */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            <span className="text-[11px] text-zinc-500 self-center mr-1">try:</span>
            {TONE_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => setTones([p.t1, p.t2, p.t3])}
                disabled={busy !== null}
                className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 flex-wrap">
              <ProviderToggle
                provider={provider}
                onChange={setProvider}
                probe={probe}
                disabled={busy !== null}
              />
              <div className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("two-agent")}
                  disabled={busy !== null || provider === "ollama"}
                  title={
                    provider === "ollama"
                      ? "Two-agent requires cloud LLM — local Gemma is too slow for two sequential calls"
                      : "Designer + Engineer (2 LLM calls, cleaner output, fewer hallucinations)"
                  }
                  className={`text-[11px] px-2 py-0.5 rounded transition ${
                    mode === "two-agent"
                      ? "bg-purple-900/60 text-purple-100"
                      : "text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-400 disabled:cursor-not-allowed"
                  }`}
                >
                  Two-agent
                </button>
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  disabled={busy !== null}
                  title="Single LLM call (faster, more responsibility on the model)"
                  className={`text-[11px] px-2 py-0.5 rounded ${
                    mode === "single"
                      ? "bg-zinc-700 text-zinc-100"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  Single
                </button>
              </div>
              {provider === "ollama" && (
                <span className="text-[10px] text-zinc-500 italic">
                  two-agent disabled — local Gemma needs single-call mode
                </span>
              )}
            </div>
            <button
              onClick={handleGenerate}
              disabled={busy !== null || tones.some((t) => !t.trim())}
              className="px-4 py-2 text-sm rounded-md border border-purple-700/50 bg-purple-900/40 text-purple-100 hover:bg-purple-900/60 disabled:opacity-40"
            >
              {busy === "generate" ? "Designing…" : "Design preset"}
            </button>
          </div>
        </div>
      </section>

      {/* Progress / error / result */}
      {busy === "generate" && (
        <section className="mb-6">
          <LlmProgress
            phases={mode === "two-agent" ? TWO_AGENT_PHASES : DESIGN_PHASES}
            expectedSeconds={expectedDurationSec(provider, mode)}
          />
        </section>
      )}

      {err && !busy && (
        <section className="mb-6">
          <div className="rounded-md border border-red-900/50 bg-red-950/30 p-4">
            <div className="text-sm text-red-200 font-medium mb-1">Design failed</div>
            <div className="text-xs text-red-300/80 break-words">{err}</div>
            <div className="text-xs text-zinc-500 mt-3">
              If this was a transient Gemini overload, click <b>Design preset</b> again — the call
              retries with backoff under the hood.
            </div>
          </div>
        </section>
      )}

      {result?.design && (
        <section>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-5 mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h2 className="text-lg font-medium text-zinc-100">{result.design.presetName}</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {result.applyReport?.placed} chain blocks · {result.applyReport?.snapshotsConfigured} snapshots configured
                  {result.applyReport && result.applyReport.warnings.length > 0 && (
                    <span className="ml-2 text-amber-300">
                      · {result.applyReport.warnings.length} warning{result.applyReport.warnings.length === 1 ? "" : "s"}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
                >
                  Download .hlx
                </button>
                <button
                  onClick={handleOpenInEditor}
                  disabled={busy !== null}
                  className="px-3 py-1.5 text-sm rounded-md border border-emerald-700/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-40"
                >
                  {busy === "open" ? "Opening…" : "Open in editor →"}
                </button>
              </div>
            </div>
            {result.design.designNotes && (
              <p className="text-xs text-zinc-400 italic mb-2">{result.design.designNotes}</p>
            )}
          </div>

          {/* Loudness landscape */}
          {result.loudness && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 mb-4">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                Loudness landscape (CLEAN baseline)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
                {result.loudness.map((s) => {
                  const v = s.loudnessDb;
                  return (
                    <div key={s.index} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
                      <div className="text-[10px] text-zinc-500">slot {s.index}</div>
                      <div className="text-xs font-medium text-zinc-100 truncate">{s.name}</div>
                      <div className="text-base font-light tabular-nums mt-1 text-zinc-200">
                        {v > 0 ? "+" : ""}{v.toFixed(1)} dB
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Designer's rig view (two-agent only) */}
          {result.rig && (
            <div className="rounded-lg border border-purple-900/40 bg-purple-950/15 p-4 mb-4">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-xs uppercase tracking-wider text-purple-300">
                  Designer · real-world rig
                </h3>
                {result.durations && (
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    designer {(result.durations.designerMs! / 1000).toFixed(1)}s ·
                    engineer {(result.durations.engineerMs! / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
              {result.rig.designNotes && (
                <p className="text-xs text-zinc-300 italic mb-3">{result.rig.designNotes}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                {result.rig.chain.map((c, i) => (
                  <div key={i} className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-zinc-500 text-[10px] uppercase tracking-wider">{c.category}</span>
                      <span className="text-zinc-100 font-medium">{c.realWorldName}</span>
                    </div>
                    {c.role && <div className="text-[10px] text-zinc-500 mt-0.5">{c.role}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DSP budget per path */}
          {result.validation?.dspPerPath && Object.keys(result.validation.dspPerPath).length > 0 && (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 mb-4">
              <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">DSP usage per path</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(result.validation.dspPerPath).map(([path, total]) => {
                  const over = total > 100;
                  const near = total > 95;
                  const color = over ? "bg-red-500" : near ? "bg-amber-500" : "bg-emerald-500";
                  return (
                    <div key={path} className="min-w-[160px]">
                      <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-zinc-300 font-mono">{path}</span>
                        <span className={`tabular-nums ${over ? "text-red-300" : near ? "text-amber-300" : "text-emerald-300"}`}>
                          {total.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded bg-zinc-800 overflow-hidden">
                        <div className={color} style={{ width: `${Math.min(100, total)}%`, height: "100%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chain */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 mb-4">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Chain (Helix block IDs)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
              {result.design.chain.map((b, i) => (
                <div key={i} className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 flex items-baseline gap-2">
                  <span className="text-zinc-500">{b.dsp}.{b.slot}</span>
                  <span className="text-zinc-500">p{b.path}/{b.position}</span>
                  <span className="text-zinc-100 font-mono">{b.model}</span>
                  {b.cab && <span className="text-zinc-500">→ {b.cab}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Snapshot summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 mb-4">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Snapshots</h3>
            <div className="space-y-1.5">
              {result.design.snapshots.map((s) => (
                <div key={s.index} className="text-xs flex items-baseline gap-3 border-b border-zinc-900 last:border-b-0 pb-1.5">
                  <span className="text-zinc-500 tabular-nums">[{s.index}]</span>
                  <span className="text-zinc-100 font-medium w-28 truncate">{s.name}</span>
                  <span className="text-zinc-400 flex-1 truncate font-mono">
                    enable: {s.enabledBlocks.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Warnings */}
          {result.applyReport && result.applyReport.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 p-4">
              <h3 className="text-xs uppercase tracking-wider text-amber-300 mb-2">Warnings</h3>
              <ul className="text-xs text-amber-200 space-y-1">
                {result.applyReport.warnings.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
