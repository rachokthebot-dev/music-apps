"use client";

import { useState } from "react";
import LlmProgress from "./LlmProgress";
import ProviderToggle, { useProvider } from "./ProviderToggle";

export type ToneDescriptors = {
  gainStage: string;
  eqShape: string;
  compression: string;
  spatial: string;
  cabCharacter: string;
};

export type MatchSongResult = {
  song: string;
  artist: string;
  era?: string;
  targetSnapshotIndex: number;
  targetSnapshotName: string;
  toneDescriptors: ToneDescriptors;
  enable: string[];
  bypass: string[];
  params: { [block: string]: { [param: string]: number } };
  reasoningPerBlock: { [block: string]: string };
  gapNote?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  snapshots: { index: number; name: string }[];
  /** Legacy: called after a successful Apply (download flow). Still optional. */
  onApplied?: (fileName: string) => void;
  /** Stage-only flow: parent collects the result into pending; nothing written until Export. */
  onStaged?: (result: MatchSongResult) => void;
  onError: (msg: string) => void;
};

const MATCH_SONG_PHASES = [
  "Reading your rig…",
  "Identifying the song's recorded gear…",
  "Mapping to blocks you have…",
  "Setting per-block parameters…",
];

export default function MatchSongModal({ open, onClose, snapshots, onApplied, onStaged, onError }: Props) {
  const [song, setSong] = useState("");
  const [artist, setArtist] = useState("");
  const [target, setTarget] = useState<number>(snapshots[0]?.index ?? 0);
  const [busy, setBusy] = useState<"propose" | "apply" | null>(null);
  const [result, setResult] = useState<MatchSongResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider, probe] = useProvider();

  if (!open) return null;

  const handlePropose = async () => {
    if (!song.trim() || !artist.trim()) {
      onError("Song and artist are required");
      return;
    }
    setBusy("propose");
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/match-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song: song.trim(),
          artist: artist.trim(),
          targetSnapshotIndex: target,
          provider,
        }),
      });
      const j = (await r.json()) as { ok: boolean; result?: MatchSongResult; error?: string };
      if (!j.ok || !j.result) throw new Error(j.error ?? "match failed");
      setResult(j.result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      onError(msg);
    } finally {
      setBusy(null);
    }
  };

  const handleStage = async () => {
    if (!result) return;
    if (onStaged) {
      onStaged(result);
      onClose();
      return;
    }
    // Legacy download flow
    setBusy("apply");
    try {
      const r = await fetch("/api/match-song/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!r.ok) throw new Error(`apply failed: ${(await r.text()).slice(0, 200)}`);
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disposition);
      const fileName = m ? m[1] : "matched.hlx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      onApplied?.(fileName);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const targetName = snapshots.find((s) => s.index === target)?.name ?? `snapshot${target}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl flex flex-col max-h-[calc(100vh-3rem)]">
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-3 border-b border-zinc-900 flex items-baseline justify-between">
          <div>
            <h2 className="text-lg font-semibold">Match Song</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Describe a recording — Gemini dials the chosen snapshot to evoke it.
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-sm">✕</button>
        </div>

        {/* Form */}
        <div className="shrink-0 px-6 py-4 grid grid-cols-2 gap-3 border-b border-zinc-900">
          <div className="col-span-2">
            <label className="block text-xs text-zinc-500 mb-1">Song</label>
            <input
              autoFocus
              value={song}
              onChange={(e) => setSong(e.target.value)}
              placeholder="Smells Like Teen Spirit"
              className="w-full px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100"
              onKeyDown={(e) => {
                if (e.key === "Enter" && song && artist && !busy) handlePropose();
              }}
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Artist</label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="Nirvana"
              className="w-full px-3 py-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-100"
              onKeyDown={(e) => {
                if (e.key === "Enter" && song && artist && !busy) handlePropose();
              }}
            />
          </div>
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
          <div className="col-span-2 flex items-center justify-between gap-3">
            <ProviderToggle provider={provider} onChange={setProvider} probe={probe} disabled={busy !== null} />
            <button
              onClick={handlePropose}
              disabled={busy !== null || !song.trim() || !artist.trim()}
              className="px-4 py-2 text-sm rounded-md border border-blue-700/50 bg-blue-900/40 text-blue-100 hover:bg-blue-900/60 disabled:opacity-40"
            >
              {busy === "propose" ? "Finding match…" : "Find match"}
            </button>
          </div>
        </div>

        {/* Scrollable middle: progress OR result OR error */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {busy === "propose" && (
            <LlmProgress
              phases={MATCH_SONG_PHASES}
              expectedSeconds={provider === "ollama" ? 140 : 12}
            />
          )}
          {error && !busy && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-4">
              <div className="text-sm text-red-200 font-medium mb-1">Match failed</div>
              <div className="text-xs text-red-300/80 break-words">{error}</div>
              <div className="text-xs text-zinc-500 mt-3">
                If this was a transient Gemini overload, click <b>Find match</b> again — the call
                will retry under the hood with backoff.
              </div>
            </div>
          )}
          {result && !busy && <ResultBody result={result} targetName={targetName} />}
          {!result && !busy && !error && (
            <div className="text-sm text-zinc-500 italic">
              Enter a song + artist and click <b>Find match</b>. The result will preview here
              for you to review before staging.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-6 py-3 border-t border-zinc-800 flex items-center justify-between gap-3">
          <div className="text-xs text-zinc-500 leading-snug">
            {result
              ? <>Staging adds these edits to your pending changes. <b>Nothing is written until you click Export.</b></>
              : <>Step 1 of 2 — review the proposal, then stage.</>}
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

// ---------------------------------------------------------------------------
// Result body — shared rendering for the proposal
// ---------------------------------------------------------------------------

function ResultBody({ result, targetName }: { result: MatchSongResult; targetName: string }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-zinc-400">
          <span className="text-zinc-100 font-medium">{result.song}</span> by{" "}
          <span className="text-zinc-100">{result.artist}</span>
          {result.era && <span className="text-zinc-500"> — {result.era}</span>}
          <span className="text-zinc-500"> → {result.targetSnapshotName ?? targetName}</span>
        </div>
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
