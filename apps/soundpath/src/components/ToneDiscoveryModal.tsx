"use client";

import { useState } from "react";
import LlmProgress from "./LlmProgress";
import ProviderToggle, { useProvider } from "./ProviderToggle";
import type { MatchSongResult } from "./MatchSongModal";

type ToneDiscoveryResult = MatchSongResult & { whyThisExemplar: string };

type Props = {
  open: boolean;
  onClose: () => void;
  snapshots: { index: number; name: string }[];
  onStaged: (result: MatchSongResult) => void;
  onError: (msg: string) => void;
};

const VIBE_PRESETS = [
  "Late-night smoky jazz",
  "Stadium rock anthem",
  "90s grunge — verse mood",
  "Stoner doom riff",
  "Country chicken-pickin'",
  "Surf rock with reverb",
  "Bluesy edge of breakup",
  "Modern djent chug",
];

const TONE_DISCOVERY_PHASES = [
  "Reading your rig…",
  "Searching for an iconic exemplar…",
  "Locking in the song + era…",
  "Mapping to your blocks…",
];

export default function ToneDiscoveryModal({ open, onClose, snapshots, onStaged, onError }: Props) {
  const [vibe, setVibe] = useState("");
  const [target, setTarget] = useState<number>(snapshots[0]?.index ?? 0);
  const [busy, setBusy] = useState<"discover" | null>(null);
  const [result, setResult] = useState<ToneDiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider, probe] = useProvider();

  if (!open) return null;

  const handleDiscover = async () => {
    if (!vibe.trim()) {
      onError("Describe the vibe (or pick a preset)");
      return;
    }
    setBusy("discover");
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/tone-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vibe: vibe.trim(), targetSnapshotIndex: target, provider }),
      });
      const j = (await r.json()) as { ok: boolean; result?: ToneDiscoveryResult; error?: string };
      if (!j.ok || !j.result) throw new Error(j.error ?? "discovery failed");
      setResult(j.result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleStage = () => {
    if (!result) return;
    onStaged(result);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col max-h-[calc(100vh-3rem)]">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-3 border-b border-zinc-900 flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold">Tone Discovery</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Describe a vibe — Gemini picks an iconic song that exemplifies it and dials it in.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-sm">✕</button>
        </div>

        {/* Form */}
        <div className="shrink-0 px-6 py-4 border-b border-zinc-900">
          <label className="block text-xs text-zinc-500 mb-1">Vibe</label>
          <input
            autoFocus
            value={vibe}
            onChange={(e) => setVibe(e.target.value)}
            placeholder="warm late-night jazz vibe"
            className="w-full px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100"
            onKeyDown={(e) => {
              if (e.key === "Enter" && vibe && !busy) handleDiscover();
            }}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VIBE_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setVibe(p)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Target snapshot</label>
              <select
                value={target}
                onChange={(e) => setTarget(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100"
              >
                {snapshots.map((s) => (
                  <option key={s.index} value={s.index}>
                    {s.index}: {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-2">
              <ProviderToggle provider={provider} onChange={setProvider} probe={probe} disabled={busy !== null} />
              <button
                onClick={handleDiscover}
                disabled={busy !== null || !vibe.trim()}
                className="px-4 py-2 text-sm rounded-md border border-purple-700/50 bg-purple-900/40 text-purple-100 hover:bg-purple-900/60 disabled:opacity-40"
              >
                {busy === "discover" ? "Discovering…" : "Discover tone"}
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable middle */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {busy === "discover" && (
            <LlmProgress
              phases={TONE_DISCOVERY_PHASES}
              expectedSeconds={provider === "ollama" ? 140 : 12}
            />
          )}
          {error && !busy && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-4">
              <div className="text-sm text-red-200 font-medium mb-1">Discovery failed</div>
              <div className="text-xs text-red-300/80 break-words">{error}</div>
              <div className="text-xs text-zinc-500 mt-3">
                If this was a transient Gemini overload, click <b>Discover tone</b> again — the call
                will retry under the hood with backoff.
              </div>
            </div>
          )}
          {result && !busy && <DiscoveryBody result={result} />}
          {!result && !busy && !error && (
            <div className="text-sm text-zinc-500 italic">
              Describe a vibe or click a preset chip, then <b>Discover tone</b>. The pick will
              preview here for you to review before staging.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-zinc-800 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500 leading-snug">
            {result
              ? <>Staging adds these edits to your pending changes. <b>Nothing is written until you click Export.</b></>
              : <>Step 1 of 2 — review the pick, then stage.</>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleStage}
              disabled={!result || busy !== null}
              className="px-4 py-1.5 text-sm rounded-md border border-emerald-700/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-30"
            >
              Stage changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoveryBody({ result }: { result: ToneDiscoveryResult }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-zinc-400">
          Chose: <span className="text-zinc-100 font-medium">{result.song}</span> by{" "}
          <span className="text-zinc-100">{result.artist}</span>
          {result.era && <span className="text-zinc-500"> — {result.era}</span>}
          <span className="text-zinc-500"> → {result.targetSnapshotName}</span>
        </div>
        {result.whyThisExemplar && (
          <div className="mt-1 text-xs text-purple-300/80 italic">
            Why: {result.whyThisExemplar}
          </div>
        )}
        <div className="text-xs text-zinc-500 mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <span><span className="text-zinc-400">gain:</span> {result.toneDescriptors.gainStage}</span>
          <span><span className="text-zinc-400">EQ:</span> {result.toneDescriptors.eqShape}</span>
          <span><span className="text-zinc-400">comp:</span> {result.toneDescriptors.compression}</span>
          <span><span className="text-zinc-400">space:</span> {result.toneDescriptors.spatial}</span>
          <span><span className="text-zinc-400">cab:</span> {result.toneDescriptors.cabCharacter}</span>
        </div>
      </div>

      {result.gapNote && (
        <div className="rounded-md border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200">
          <span className="font-medium text-amber-100">Gap:</span> {result.gapNote}
        </div>
      )}

      {result.enable.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-emerald-500 mb-1">Enable</div>
          <div className="text-sm text-emerald-200">{result.enable.join(" · ")}</div>
        </div>
      )}
      {result.bypass.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Bypass</div>
          <div className="text-sm text-zinc-400">{result.bypass.join(" · ")}</div>
        </div>
      )}

      {Object.keys(result.params).length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-2">Parameters</div>
          <div className="space-y-2">
            {Object.entries(result.params).map(([blk, params]) => (
              <div key={blk} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="text-sm font-medium text-zinc-100 mb-1">{blk}</div>
                <div className="text-sm text-zinc-300 flex flex-wrap gap-x-3 gap-y-1 mb-1">
                  {Object.entries(params).map(([p, v]) => (
                    <span key={p} className="tabular-nums">
                      <span className="text-zinc-500">{p}</span> {v}
                    </span>
                  ))}
                </div>
                {result.reasoningPerBlock[blk] && (
                  <div className="text-xs text-zinc-500 italic">{result.reasoningPerBlock[blk]}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
