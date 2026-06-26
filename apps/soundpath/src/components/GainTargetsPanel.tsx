"use client";

/**
 * GainTargetsPanel — inline editor for the new Align Gain flow.
 *
 * User picks a baseline snapshot and dials in a dB target for every other
 * snapshot. Defaults to "current measured" (so opening the panel with no edits
 * stages nothing). Hitting Compute calls /api/master/align which runs the
 * deterministic aligner with these targets and returns proposals. Stage merges
 * those proposals into the parent's pending state.
 *
 * Baseline + targets persist to localStorage so a reload restores the panel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "soundpath:gainTargets:v1";

export type AlignChange = {
  block: string;
  paramLabel: string;
  dsp: string;
  slot: string;
  param: string;
  value: number;
};
export type StructuralChange = {
  kind: "enableBlock";
  dsp: string;
  slot: string;
  block: string;
};
export type AlignProposal = {
  snapshotIndex: number;
  snapshotName: string;
  currentDb: number;
  targetDb: number;
  deltaDb: number;
  status: "no_change" | "adjusted" | "conflict";
  changes: AlignChange[];
  structuralChanges: StructuralChange[];
  reasoning: string;
  conflict: { kind: string; detail: string } | null;
};
export type Insertion = {
  dsp: string;
  slot: string;
  model: string;
  block: string;
  defaults: Record<string, number>;
} | null;

export type AlignResponse = {
  ok: boolean;
  baselineIndex: number;
  baselineName: string;
  measuredOffsets: Record<string, number>;
  insertion: Insertion;
  proposals: AlignProposal[];
  error?: string;
};

type Persisted = {
  baselineIndex: number;
  targets: Record<number, number>;
};

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (
      typeof parsed.baselineIndex !== "number" ||
      parsed.baselineIndex < 0 ||
      parsed.baselineIndex > 7
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePersisted(p: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // localStorage quota etc — ignore, panel still works in-memory
  }
}

type Props = {
  open: boolean;
  snapshots: Array<{ index: number; name: string }>;
  /** Initial measured-loudness map keyed by snapshot index (relative to snapshot 0). */
  loadedLoudness: Record<number, number>;
  onClose: () => void;
  onStage: (proposals: AlignProposal[], insertion: Insertion) => void;
  onError: (msg: string) => void;
};

/**
 * Compute "current measured relative to baseline" from the loaded loudness map
 * (which is relative to snapshot 0). Just subtract the chosen baseline's value
 * from every other snapshot.
 */
function offsetsFromLoaded(
  loaded: Record<number, number>,
  baselineIndex: number
): Record<number, number> {
  const baselineDb = loaded[baselineIndex] ?? 0;
  const out: Record<number, number> = {};
  for (const [k, v] of Object.entries(loaded)) {
    const idx = Number(k);
    if (idx === baselineIndex) continue;
    out[idx] = Number((v - baselineDb).toFixed(2));
  }
  return out;
}

export default function GainTargetsPanel({
  open,
  snapshots,
  loadedLoudness,
  onClose,
  onStage,
  onError,
}: Props) {
  const [baselineIndex, setBaselineIndex] = useState<number>(0);
  const [targets, setTargets] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState<"computing" | "staging" | null>(null);
  const [preview, setPreview] = useState<AlignResponse | null>(null);
  // True when the panel has just rehydrated from storage / loaded data and
  // the user hasn't typed anything yet. Used to suppress the "stale" hint.
  const [dirty, setDirty] = useState(false);

  // Restore persisted state on first mount. If absent, prefill targets with
  // the current measured offsets so opening the panel reads as "no change".
  useEffect(() => {
    if (!open) return;
    const persisted = loadPersisted();
    if (persisted) {
      setBaselineIndex(persisted.baselineIndex);
      setTargets(persisted.targets);
    } else {
      setBaselineIndex(0);
      setTargets(offsetsFromLoaded(loadedLoudness, 0));
    }
    setPreview(null);
    setDirty(false);
    // intentionally fire on open transition only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Re-derive targets to "current measured" whenever baseline changes.
  // Keeps the panel's initial state intuitive: starting offsets always read
  // as "no change for any snapshot relative to the new baseline."
  const resetTargetsToMeasured = useCallback(
    (newBaseline: number) => {
      setTargets(offsetsFromLoaded(loadedLoudness, newBaseline));
      setDirty(false);
    },
    [loadedLoudness]
  );

  const handleBaselineChange = useCallback(
    (idx: number) => {
      setBaselineIndex(idx);
      resetTargetsToMeasured(idx);
      setPreview(null);
    },
    [resetTargetsToMeasured]
  );

  const handleTargetChange = useCallback((idx: number, value: number) => {
    setTargets((prev) => ({ ...prev, [idx]: value }));
    setDirty(true);
    setPreview(null);
  }, []);

  // Persist whenever baseline or targets change.
  useEffect(() => {
    if (!open) return;
    savePersisted({ baselineIndex, targets });
  }, [open, baselineIndex, targets]);

  const measuredOffsets = useMemo(
    () => offsetsFromLoaded(loadedLoudness, baselineIndex),
    [loadedLoudness, baselineIndex]
  );

  const handleCompute = useCallback(async () => {
    setBusy("computing");
    try {
      const r = await fetch("/soundpath/api/master/align", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baselineIndex,
          targets,
          allowBoostInsertion: true,
        }),
      });
      const j = (await r.json()) as AlignResponse;
      if (!j.ok) throw new Error(j.error ?? "alignment failed");
      setPreview(j);
      setDirty(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [baselineIndex, targets, onError]);

  const handleStage = useCallback(() => {
    if (!preview) return;
    setBusy("staging");
    try {
      const staged = preview.proposals.filter(
        (p) =>
          p.status === "adjusted" &&
          (p.changes.length > 0 || p.structuralChanges.length > 0)
      );
      onStage(staged, preview.insertion);
      onClose();
    } finally {
      setBusy(null);
    }
  }, [preview, onStage, onClose]);

  if (!open) return null;

  const conflictCount = preview?.proposals.filter((p) => p.status === "conflict").length ?? 0;
  const adjustedCount = preview?.proposals.filter((p) => p.status === "adjusted").length ?? 0;
  const totalParamChanges = preview?.proposals.reduce(
    (n, p) => (p.status === "adjusted" ? n + p.changes.length : n),
    0
  ) ?? 0;

  return (
    <section className="mb-6 rounded-lg border border-blue-700/40 bg-blue-950/15 p-4">
      <header className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium text-blue-100">Align Gain — targets</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Pick a baseline. Set a dB offset for every other snapshot. The aligner uses
            ChVol first, then a Boost block (inserts one if needed), and never touches
            Drive or tone knobs.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-zinc-500 hover:text-zinc-200 underline"
        >
          close
        </button>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-500">
              <th className="text-left pb-2 pr-3">Snapshot</th>
              <th className="text-right pb-2 px-3">Measured (dB)</th>
              <th className="text-center pb-2 px-3">Baseline</th>
              <th className="text-right pb-2 px-3">Target (dB)</th>
              <th className="text-left pb-2 pl-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => {
              const isBaseline = s.index === baselineIndex;
              const measured = measuredOffsets[s.index] ?? 0;
              const target = isBaseline ? 0 : targets[s.index] ?? 0;
              const proposal = preview?.proposals.find((p) => p.snapshotIndex === s.index);
              return (
                <tr
                  key={s.index}
                  className={`border-t border-zinc-800/60 ${isBaseline ? "bg-blue-900/15" : ""}`}
                >
                  <td className="py-1.5 pr-3">
                    <span className="text-zinc-500 mr-2 tabular-nums">{s.index}</span>
                    <span className="text-zinc-100">{s.name}</span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-zinc-400">
                    {isBaseline ? "—" : `${measured >= 0 ? "+" : ""}${measured.toFixed(2)}`}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <input
                      type="radio"
                      name="gain-baseline"
                      checked={isBaseline}
                      onChange={() => handleBaselineChange(s.index)}
                      className="accent-blue-500"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    {isBaseline ? (
                      <span className="text-zinc-600 tabular-nums">0.00</span>
                    ) : (
                      <input
                        type="number"
                        step={0.5}
                        value={target}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) handleTargetChange(s.index, v);
                        }}
                        className="w-20 px-1.5 py-0.5 text-right text-sm tabular-nums bg-zinc-950 border border-zinc-700 rounded text-zinc-100 outline-none focus:border-blue-500/70"
                      />
                    )}
                  </td>
                  <td className="py-1.5 pl-3 text-xs">
                    {isBaseline ? (
                      <span className="text-blue-300/80">baseline · 0 dB anchor</span>
                    ) : !proposal ? (
                      <span className="text-zinc-600">—</span>
                    ) : proposal.status === "no_change" ? (
                      <span className="text-zinc-500">within tolerance</span>
                    ) : proposal.status === "conflict" ? (
                      <span className="text-amber-400" title={proposal.conflict?.detail}>
                        ⚠ {proposal.conflict?.kind ?? "conflict"}
                      </span>
                    ) : (
                      <span className="text-emerald-400" title={proposal.reasoning}>
                        ✓ Δ {proposal.deltaDb >= 0 ? "+" : ""}{proposal.deltaDb.toFixed(2)} dB
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {preview?.insertion && (
        <div className="mt-3 text-xs text-blue-300 bg-blue-950/40 border border-blue-800/40 rounded px-3 py-2">
          Will insert a new {preview.insertion.block} block at{" "}
          <span className="font-mono">{preview.insertion.dsp}/{preview.insertion.slot}</span>{" "}
          (bypassed on snapshots that don&apos;t need it).
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-zinc-500">
          {preview && !dirty ? (
            <>
              <span className="text-emerald-400">{adjustedCount}</span> adjustment
              {adjustedCount === 1 ? "" : "s"}
              {conflictCount > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-400">{conflictCount}</span> conflict
                  {conflictCount === 1 ? "" : "s"}
                </>
              )}
              {" · "}
              {totalParamChanges} param change{totalParamChanges === 1 ? "" : "s"} total
            </>
          ) : preview && dirty ? (
            <span className="text-amber-400/80">edits made — recompute to refresh</span>
          ) : (
            <span>Set targets, then compute to see the plan.</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCompute}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-blue-700/50 bg-blue-900/40 text-blue-100 hover:bg-blue-900/60 disabled:opacity-50"
          >
            {busy === "computing" ? "Computing…" : preview ? "Recompute" : "Compute"}
          </button>
          <button
            onClick={handleStage}
            disabled={busy !== null || !preview || adjustedCount === 0 || dirty}
            className="px-3 py-1.5 text-sm rounded-md border border-emerald-700/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-40"
          >
            {busy === "staging" ? "Staging…" : "Stage proposals"}
          </button>
        </div>
      </footer>
    </section>
  );
}
