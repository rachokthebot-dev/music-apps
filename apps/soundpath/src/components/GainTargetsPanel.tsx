"use client";

/**
 * GainTargetsPanel — inline editor for the within-preset Align Gain flow.
 *
 * User picks a baseline snapshot and dials in a dB target for every other
 * snapshot. Defaults to "current measured" (so the initial state stages
 * nothing). Hitting Compute calls /api/preset/[slot]/align which runs the
 * deterministic aligner with these targets and returns proposals. Stage merges
 * those proposals into the parent pane's pending state.
 *
 * Baseline + targets persist to localStorage (per slot) so a reload restores
 * the panel; the pane clears the key and remounts this component on import.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

export function gainTargetsStorageKey(slot: "a" | "b"): string {
  return `soundpath:gainTargets:${slot}`;
}

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

function loadPersisted(slot: "a" | "b"): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(gainTargetsStorageKey(slot));
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

function savePersisted(slot: "a" | "b", p: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(gainTargetsStorageKey(slot), JSON.stringify(p));
  } catch {
    // localStorage quota etc — ignore, panel still works in-memory
  }
}

type Props = {
  slot: "a" | "b";
  snapshots: Array<{ index: number; name: string }>;
  /** Initial measured-loudness map keyed by snapshot index (relative to snapshot 0). */
  loadedLoudness: Record<number, number>;
  /** Reports baseline selection up so the pane can drive cross-preset alignment. */
  onBaselineChange?: (idx: number) => void;
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
  slot,
  snapshots,
  loadedLoudness,
  onBaselineChange,
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
  // the current measured offsets so the initial state reads as "no change".
  // The pane remounts this component (key) on import, so mount = fresh preset.
  useEffect(() => {
    const persisted = loadPersisted(slot);
    const baseline = persisted?.baselineIndex ?? 0;
    setBaselineIndex(baseline);
    setTargets(persisted?.targets ?? offsetsFromLoaded(loadedLoudness, baseline));
    onBaselineChange?.(baseline);
    setPreview(null);
    setDirty(false);
    // intentionally fire on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      onBaselineChange?.(idx);
    },
    [resetTargetsToMeasured, onBaselineChange]
  );

  const handleTargetChange = useCallback((idx: number, value: number) => {
    setTargets((prev) => ({ ...prev, [idx]: value }));
    setDirty(true);
    setPreview(null);
  }, []);

  // Persist whenever baseline or targets change.
  useEffect(() => {
    savePersisted(slot, { baselineIndex, targets });
  }, [slot, baselineIndex, targets]);

  const measuredOffsets = useMemo(
    () => offsetsFromLoaded(loadedLoudness, baselineIndex),
    [loadedLoudness, baselineIndex]
  );

  const handleCompute = useCallback(async () => {
    setBusy("computing");
    try {
      const r = await fetch(`/soundpath/api/preset/${slot}/align`, {
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
  }, [slot, baselineIndex, targets, onError]);

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
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }, [preview, onStage]);

  const conflictCount = preview?.proposals.filter((p) => p.status === "conflict").length ?? 0;
  const adjustedCount = preview?.proposals.filter((p) => p.status === "adjusted").length ?? 0;
  const totalParamChanges = preview?.proposals.reduce(
    (n, p) => (p.status === "adjusted" ? n + p.changes.length : n),
    0
  ) ?? 0;

  return (
    <section className="mb-6 rounded-lg border border-blue-200 dark:border-blue-700/40 bg-blue-50/60 dark:bg-blue-950/15 p-4">
      <header className="mb-3">
        <h2 className="text-sm font-medium text-blue-800 dark:text-blue-100">Align Gain — targets</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Pick a baseline. Set a dB offset for every other snapshot. The aligner uses
          ChVol first, then a Boost block (inserts one if needed), and never touches
          Drive or tone knobs.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  className={`border-t border-border/60 ${isBaseline ? "bg-blue-100/50 dark:bg-blue-900/15" : ""}`}
                >
                  <td className="py-1.5 pr-3">
                    <span className="text-muted-foreground mr-2 tabular-nums">{s.index}</span>
                    <span className="text-foreground">{s.name}</span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                    {isBaseline ? "—" : `${measured >= 0 ? "+" : ""}${measured.toFixed(2)}`}
                  </td>
                  <td className="py-1.5 px-3 text-center">
                    <input
                      type="radio"
                      name={`gain-baseline-${slot}`}
                      checked={isBaseline}
                      onChange={() => handleBaselineChange(s.index)}
                      className="accent-blue-500"
                    />
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    {isBaseline ? (
                      <span className="text-muted-foreground/70 tabular-nums">0.00</span>
                    ) : (
                      <input
                        type="number"
                        step={0.5}
                        value={target}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) handleTargetChange(s.index, v);
                        }}
                        className="w-20 px-1.5 py-0.5 text-right text-sm tabular-nums bg-background border border-input rounded text-foreground outline-none focus:border-blue-500/70"
                      />
                    )}
                  </td>
                  <td className="py-1.5 pl-3 text-xs">
                    {isBaseline ? (
                      <span className="text-blue-700/80 dark:text-blue-300/80">baseline · 0 dB anchor</span>
                    ) : !proposal ? (
                      <span className="text-muted-foreground/70">—</span>
                    ) : proposal.status === "no_change" ? (
                      <span className="text-muted-foreground">within tolerance</span>
                    ) : proposal.status === "conflict" ? (
                      <span className="text-amber-600 dark:text-amber-400" title={proposal.conflict?.detail}>
                        ⚠ {proposal.conflict?.kind ?? "conflict"}
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400" title={proposal.reasoning}>
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
        <div className="mt-3 text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/40 border border-blue-300 dark:border-blue-800/40 rounded px-3 py-2">
          Will insert a new {preview.insertion.block} block at{" "}
          <span className="font-mono">{preview.insertion.dsp}/{preview.insertion.slot}</span>{" "}
          (bypassed on snapshots that don&apos;t need it).
        </div>
      )}

      <footer className="mt-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {preview && !dirty ? (
            <>
              <span className="text-emerald-600 dark:text-emerald-400">{adjustedCount}</span> adjustment
              {adjustedCount === 1 ? "" : "s"}
              {conflictCount > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-600 dark:text-amber-400">{conflictCount}</span> conflict
                  {conflictCount === 1 ? "" : "s"}
                </>
              )}
              {" · "}
              {totalParamChanges} param change{totalParamChanges === 1 ? "" : "s"} total
            </>
          ) : preview && dirty ? (
            <span className="text-amber-700/80 dark:text-amber-400/80">edits made — recompute to refresh</span>
          ) : (
            <span>Set targets, then compute to see the plan.</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCompute}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-blue-300 dark:border-blue-700/50 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-100 hover:bg-blue-200 dark:hover:bg-blue-900/60 disabled:opacity-50"
          >
            {busy === "computing" ? "Computing…" : preview ? "Recompute" : "Compute"}
          </button>
          <button
            onClick={handleStage}
            disabled={busy !== null || !preview || adjustedCount === 0 || dirty}
            className="px-3 py-1.5 text-sm rounded-md border border-emerald-400 dark:border-emerald-700/50 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-100 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 disabled:opacity-40"
          >
            {busy === "staging" ? "Staging…" : "Stage proposals"}
          </button>
        </div>
      </footer>
    </section>
  );
}
