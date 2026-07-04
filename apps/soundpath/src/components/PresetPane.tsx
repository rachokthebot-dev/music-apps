"use client";

/**
 * PresetPane — one preset slot (A = baseline preset, B = preset to align).
 *
 * Owns the slot's full state machine: import (.hlx upload / library pick),
 * loudness landscape with live preview of staged changes, the within-preset
 * GainTargetsPanel, the Output level knob, and Export. Reports a status
 * snapshot up to the page so the cross-preset alignment strip can compute
 * the A↔B baseline delta.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GainTargetsPanel, {
  gainTargetsStorageKey,
  type AlignProposal as GainProposal,
  type Insertion as GainInsertion,
} from "@/components/GainTargetsPanel";
import LibraryPicker from "@/components/LibraryPicker";
import MeasurePanel from "@/components/MeasurePanel";

// ---------------------------------------------------------------------------
// Types mirrored from /api/preset/[slot] shape
// ---------------------------------------------------------------------------

type Loudness = { index: number; name: string; loudnessDb: number; rawLoudnessDb: number };
type SnapshotState = { index: number; name: string };
type SlotResponse = {
  ok: boolean;
  empty?: boolean;
  name?: string;
  outputGain?: number; // absolute baseline dB written into the Output Block
  snapshots?: SnapshotState[];
  loudness?: Loudness[];
  error?: string;
};

/** What the page needs to know about this pane for cross-preset alignment. */
export type PaneStatus = {
  loaded: boolean;
  name: string | null;
  baselineIndex: number;
  /** Raw (unnormalized) estimated dB per snapshot — excludes the Output Block. */
  rawLoudness: Record<number, number>;
  /** The Output Block gain as loaded from the preset file. */
  outputGain: number;
};

// ---------------------------------------------------------------------------
// Pending changes — accumulate from Align Gain, applied on Export.
// Indexed by snapshotIndex → friendlyBlockName → { enabled?, params? }.
// ---------------------------------------------------------------------------

type PendingBlock = { enabled?: boolean; params?: { [param: string]: number } };
type PendingPerSnap = { [friendlyBlock: string]: PendingBlock };
type Pending = { [snapshotIndex: number]: PendingPerSnap };

function mergePending(prev: Pending, snapIdx: number, blockName: string, change: PendingBlock): Pending {
  const next: Pending = { ...prev };
  const perSnap = { ...(next[snapIdx] ?? {}) };
  const prior = perSnap[blockName] ?? {};
  perSnap[blockName] = {
    enabled: change.enabled !== undefined ? change.enabled : prior.enabled,
    params: { ...(prior.params ?? {}), ...(change.params ?? {}) },
  };
  next[snapIdx] = perSnap;
  return next;
}

type Props = {
  slot: "a" | "b";
  label: string;
  /** Preset-scoped pending Output Block edit — null means "no change". Lifted
   *  to the page so the cross-align strip can stage a value on pane B. */
  pendingOutputGain: number | null;
  onPendingOutputGainChange: (v: number | null) => void;
  onStatus: (status: PaneStatus) => void;
};

export default function PresetPane({
  slot,
  label,
  pendingOutputGain,
  onPendingOutputGainChange,
  onStatus,
}: Props) {
  const [data, setData] = useState<SlotResponse | null>(null);
  const [busy, setBusy] = useState<null | "import" | "export">(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [pending, setPending] = useState<Pending>({});
  /** Block to insert at preset level when the aligner needs a fresh Boost. */
  const [pendingInsertion, setPendingInsertion] = useState<GainInsertion>(null);
  /** Baseline snapshot picked in the GainTargetsPanel — drives cross-align. */
  const [baselineIndex, setBaselineIndex] = useState(0);
  /** Predicted loudness landscape after pending changes apply. */
  const [previewLoudness, setPreviewLoudness] = useState<Loudness[] | null>(null);
  /** Bumped on import so GainTargetsPanel remounts with a clean slate. */
  const [importSeq, setImportSeq] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/soundpath/api/preset/${slot}`);
      const j = (await r.json()) as SlotResponse;
      setData(j);
    } catch (err) {
      setData({ ok: false, error: String(err) });
    }
  }, [slot]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Report status up whenever the loaded preset or baseline selection changes.
  useEffect(() => {
    onStatus({
      loaded: Boolean(data?.ok),
      name: data?.name ?? null,
      baselineIndex,
      rawLoudness: Object.fromEntries(
        (data?.loudness ?? []).map((l) => [l.index, l.rawLoudnessDb])
      ),
      outputGain: data?.outputGain ?? 0,
    });
  }, [data, baselineIndex, onStatus]);

  // Live preview of the loudness landscape with pending changes applied.
  // Debounced 250ms so rapid edits don't flood the server. Output gain
  // doesn't affect the landscape (it's normalized — everything shifts
  // uniformly), so we exclude it from this effect's dependencies.
  useEffect(() => {
    if (Object.keys(pending).length === 0 && !pendingInsertion) {
      setPreviewLoudness(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch(`/soundpath/api/preset/${slot}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pending,
            ...(pendingInsertion ? { insertion: pendingInsertion } : {}),
          }),
        });
        const j = (await r.json()) as { ok: boolean; loudness?: Loudness[]; error?: string };
        if (j.ok && j.loudness) setPreviewLoudness(j.loudness);
      } catch {
        // preview failure is silent — landscape just stays at loaded values
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [slot, pending, pendingInsertion]);

  const showFlash = useCallback((kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 4500);
  }, []);

  // -------------------------------------------------------------------------
  // Import — clears pending changes and resets the targets panel
  // -------------------------------------------------------------------------

  const afterImport = useCallback(
    async (name: string) => {
      setPending({});
      setPendingInsertion(null);
      onPendingOutputGainChange(null);
      setBaselineIndex(0);
      try {
        window.localStorage.removeItem(gainTargetsStorageKey(slot));
      } catch {
        // ignore
      }
      setImportSeq((n) => n + 1);
      await reload();
      showFlash("ok", `Imported ${name}`);
    },
    [slot, reload, onPendingOutputGainChange, showFlash]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy("import");
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch(`/soundpath/api/preset/${slot}`, { method: "POST", body: form });
        const j = (await r.json()) as { ok: boolean; name?: string; error?: string };
        if (!j.ok) throw new Error(j.error ?? "upload failed");
        await afterImport(j.name ?? file.name);
      } catch (err) {
        showFlash("err", err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [slot, afterImport, showFlash]
  );

  const handleClear = useCallback(async () => {
    if (!window.confirm("Clear this preset? Staged changes and measurements are discarded.")) {
      return;
    }
    setBusy("import");
    try {
      const r = await fetch(`/soundpath/api/preset/${slot}`, { method: "DELETE" });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "clear failed");
      setPending({});
      setPendingInsertion(null);
      onPendingOutputGainChange(null);
      setBaselineIndex(0);
      setMeasureOpen(false);
      try {
        window.localStorage.removeItem(gainTargetsStorageKey(slot));
      } catch {
        // ignore
      }
      setImportSeq((n) => n + 1);
      await reload();
    } catch (err) {
      showFlash("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [slot, reload, onPendingOutputGainChange, showFlash]);

  const handleLibraryPick = useCallback(
    async (presetId: string, name: string) => {
      setLibraryOpen(false);
      setBusy("import");
      try {
        const r = await fetch(`/soundpath/api/preset/${slot}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ presetId }),
        });
        const j = (await r.json()) as { ok: boolean; name?: string; error?: string };
        if (!j.ok) throw new Error(j.error ?? "import failed");
        await afterImport(j.name ?? name);
      } catch (err) {
        showFlash("err", err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [slot, afterImport, showFlash]
  );

  // -------------------------------------------------------------------------
  // Align Gain staging — merge proposals into pending
  // -------------------------------------------------------------------------

  const handleGainStaged = useCallback(
    (proposals: GainProposal[], insertion: GainInsertion) => {
      let next: Pending = pending;
      let paramCount = 0;
      let enableCount = 0;

      for (const prop of proposals) {
        for (const c of prop.changes) {
          next = mergePending(next, prop.snapshotIndex, c.block, {
            params: { [c.param]: c.value },
          });
          paramCount += 1;
        }
        for (const sc of prop.structuralChanges ?? []) {
          if (sc.kind === "enableBlock") {
            next = mergePending(next, prop.snapshotIndex, sc.block, { enabled: true });
            enableCount += 1;
          }
        }
      }

      setPending(next);
      setPendingInsertion(insertion);
      const insertNote = insertion
        ? ` · will insert ${insertion.block} at ${insertion.dsp}/${insertion.slot}`
        : "";
      showFlash(
        "ok",
        `Staged ${paramCount} param change${paramCount === 1 ? "" : "s"}` +
          (enableCount > 0 ? ` + ${enableCount} block enable${enableCount === 1 ? "" : "s"}` : "") +
          ` across ${proposals.length} snapshot${proposals.length === 1 ? "" : "s"}${insertNote}.`
      );
    },
    [pending, showFlash]
  );

  // -------------------------------------------------------------------------
  // Export — only path that writes a file
  // -------------------------------------------------------------------------

  const totalPendingChanges = useMemo(() => {
    let n = 0;
    for (const perSnap of Object.values(pending)) {
      for (const change of Object.values(perSnap)) {
        if (change.enabled !== undefined) n += 1;
        if (change.params) n += Object.keys(change.params).length;
      }
    }
    if (pendingOutputGain !== null) n += 1;
    if (pendingInsertion) n += 1;
    return n;
  }, [pending, pendingOutputGain, pendingInsertion]);

  const handleExport = useCallback(async () => {
    setBusy("export");
    try {
      const r = await fetch(`/soundpath/api/preset/${slot}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending,
          // Only send outputGain when it was edited — keeps the export
          // untouched when no preset-level adjustment was made.
          ...(pendingOutputGain !== null ? { outputGain: pendingOutputGain } : {}),
          ...(pendingInsertion ? { insertion: pendingInsertion } : {}),
        }),
      });
      if (!r.ok) throw new Error(`export failed (HTTP ${r.status})`);
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disposition);
      const fileName = m ? m[1] : "aligned.hlx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      showFlash("ok", `Exported ${fileName} (also saved next to the slot files)`);
    } catch (err) {
      showFlash("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [slot, pending, pendingOutputGain, pendingInsertion, showFlash]);

  const handleResetPending = useCallback(() => {
    setPending({});
    setPendingInsertion(null);
    onPendingOutputGainChange(null);
    showFlash("ok", "Cleared pending changes.");
  }, [onPendingOutputGainChange, showFlash]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const onPickFile = () => fileInputRef.current?.click();
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
    e.target.value = "";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleUpload(f);
  };

  const loaded = Boolean(data?.ok);
  const { name, snapshots = [], loudness = [] } = data ?? {};

  return (
    <section
      className={`rounded-xl border p-4 ${
        dragOver ? "border-blue-500/60 ring-2 ring-blue-500/30" : "border-border"
      } bg-card/50`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <LibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={handleLibraryPick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".hlx,application/json"
        className="hidden"
        onChange={onFileChange}
      />

      <header className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <div className="text-xs text-muted-foreground">
            {loaded ? (
              <span className="text-foreground/80">{name}</span>
            ) : (
              "no preset loaded"
            )}
            {dragOver && <span className="ml-2 text-blue-600 dark:text-blue-400">drop .hlx to import</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onPickFile}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-secondary hover:bg-accent disabled:opacity-50"
          >
            {busy === "import" ? "Importing…" : "Upload .hlx"}
          </button>
          <button
            onClick={() => setLibraryOpen(true)}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-input bg-secondary hover:bg-accent disabled:opacity-50"
          >
            From library…
          </button>
          {loaded && (
            <>
              <button
                onClick={() => setMeasureOpen((prev) => !prev)}
                disabled={busy !== null}
                className={`px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 ${
                  measureOpen
                    ? "border-teal-500 dark:border-teal-500/70 bg-teal-200 dark:bg-teal-800/60 text-teal-900 dark:text-teal-50"
                    : "border-teal-300 dark:border-teal-700/50 bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-100 hover:bg-teal-900/60"
                }`}
              >
                {measureOpen ? "Close Measure" : "Measure"}
              </button>
              <button
                onClick={handleClear}
                disabled={busy !== null}
                title="Unload this preset (staged changes and measurements are discarded)"
                className="px-3 py-1.5 text-sm rounded-md border border-red-300 dark:border-red-900/50 bg-secondary text-muted-foreground hover:bg-red-100 dark:hover:bg-red-950/40 hover:text-red-800 dark:hover:text-red-200 disabled:opacity-50"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      {flash && (
        <div
          className={`mb-3 rounded-md px-3 py-2 text-xs ${
            flash.kind === "ok"
              ? "bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-200"
              : "bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/40 text-red-800 dark:text-red-200"
          }`}
        >
          {flash.text}
        </div>
      )}

      {!loaded && !data?.empty && data?.error && (
        <div className="rounded-lg border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-3 text-red-800 dark:text-red-200 text-sm mb-3">
          {data.error}
        </div>
      )}

      {!loaded ? (
        <div className="rounded-lg border border-dashed border-input p-8 text-center text-sm text-muted-foreground">
          Drop a <code className="text-foreground/80">.hlx</code> here, upload one, or pick from the
          library to get started.
        </div>
      ) : (
        <>
          {/* Loudness landscape — 8 cards, one per snapshot.
              Shows predicted post-stage value (rose) when pending changes touch a snapshot. */}
          <div className="mb-4">
            <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-baseline gap-2">
              Loudness landscape (snapshot 0 = 0 dB)
              {previewLoudness && (
                <span className="text-rose-600/80 dark:text-rose-400/80 normal-case tracking-normal">
                  · predicted post-stage
                </span>
              )}
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {loudness.map((s) => {
                const isBaseline = s.index === baselineIndex;
                const previewSnap = previewLoudness?.find((p) => p.index === s.index);
                const predictedDb = previewSnap?.loudnessDb ?? s.loudnessDb;
                const changed =
                  previewSnap !== undefined && Math.abs(predictedDb - s.loudnessDb) > 0.05;
                const dbDisplay = `${predictedDb > 0 ? "+" : ""}${predictedDb.toFixed(1)}`;
                const oldDbDisplay = `${s.loudnessDb > 0 ? "+" : ""}${s.loudnessDb.toFixed(1)}`;
                return (
                  <div
                    key={s.index}
                    className={`rounded-md border p-1.5 ${
                      changed
                        ? "border-rose-300 dark:border-rose-700/50 bg-rose-100/60 dark:bg-rose-950/15"
                        : isBaseline
                          ? "border-blue-300 dark:border-blue-700/50 bg-blue-50 dark:bg-blue-950/20"
                          : "border-border bg-secondary/50"
                    }`}
                    title={isBaseline ? "baseline snapshot" : undefined}
                  >
                    <div className="text-[10px] text-muted-foreground truncate">
                      {s.index} · {s.name}
                    </div>
                    <div
                      className={`text-sm font-light tabular-nums ${
                        changed ? "text-rose-600 dark:text-rose-300" : "text-foreground"
                      }`}
                    >
                      {dbDisplay} dB
                    </div>
                    {changed && (
                      <div className="text-[9px] text-muted-foreground tabular-nums">was {oldDbDisplay}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <MeasurePanel
            key={`measure:${slot}:${importSeq}`}
            slot={slot}
            open={measureOpen}
            onClose={() => setMeasureOpen(false)}
          />

          <GainTargetsPanel
            key={`${slot}:${importSeq}`}
            slot={slot}
            snapshots={snapshots.map((s) => ({ index: s.index, name: s.name }))}
            loadedLoudness={Object.fromEntries(loudness.map((l) => [l.index, l.loudnessDb]))}
            onBaselineChange={setBaselineIndex}
            onStage={handleGainStaged}
            onError={(msg) => showFlash("err", msg)}
          />

          <div className="mt-4 flex items-center justify-between gap-3 flex-wrap">
            <OutputLevelControl
              loaded={data?.outputGain ?? 0}
              pending={pendingOutputGain}
              onChange={onPendingOutputGainChange}
              disabled={busy !== null}
            />
            <div className="flex gap-2 items-center">
              {totalPendingChanges > 0 && (
                <span className="text-xs text-amber-700/80 dark:text-amber-300/80">
                  {totalPendingChanges} staged change{totalPendingChanges === 1 ? "" : "s"}
                </span>
              )}
              <button
                onClick={handleResetPending}
                disabled={busy !== null || totalPendingChanges === 0}
                className="px-3 py-1.5 text-sm rounded-md border border-input bg-secondary hover:bg-accent disabled:opacity-30"
              >
                Reset
              </button>
              <button
                onClick={handleExport}
                disabled={busy !== null || totalPendingChanges === 0}
                className="px-4 py-1.5 text-sm rounded-md border border-emerald-400 dark:border-emerald-700/50 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-100 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 disabled:opacity-40"
              >
                {busy === "export"
                  ? "Exporting…"
                  : `Export${totalPendingChanges ? ` (${totalPendingChanges})` : ""}`}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// OutputLevelControl — preset-scoped baseline knob (the Output Block "gain"
// param). One number per preset: shift the whole preset up/down vs other
// presets without changing the internal snapshot-to-snapshot alignment.
// The cross-align strip stages this value on pane B.
// ---------------------------------------------------------------------------

function OutputLevelControl({
  loaded,
  pending,
  onChange,
  disabled,
}: {
  loaded: number;
  pending: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
}) {
  const effective = pending ?? loaded;
  const dirty = pending !== null && pending !== loaded;
  const bump = (delta: number) => onChange(Math.max(-30, Math.min(12, effective + delta)));

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs uppercase tracking-wider text-muted-foreground">Output level</label>
      <div className="inline-flex items-center gap-1 rounded-md border border-input bg-secondary p-0.5">
        <button
          onClick={() => bump(-0.5)}
          disabled={disabled}
          className="px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="-0.5 dB"
        >
          −
        </button>
        <input
          type="number"
          step="0.5"
          value={effective.toFixed(1)}
          disabled={disabled}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className={`w-16 text-center text-sm tabular-nums bg-transparent outline-none ${
            dirty ? "text-rose-600 dark:text-rose-300 font-medium" : "text-foreground"
          }`}
        />
        <span className="text-xs text-muted-foreground pr-1">dB</span>
        <button
          onClick={() => bump(+0.5)}
          disabled={disabled}
          className="px-2 py-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
          title="+0.5 dB"
        >
          +
        </button>
      </div>
      {dirty ? (
        <button
          onClick={() => onChange(null)}
          disabled={disabled}
          className="text-[10px] text-muted-foreground hover:text-foreground/80 underline disabled:opacity-30"
          title={`Revert to loaded value ${loaded.toFixed(1)} dB`}
        >
          revert
        </button>
      ) : (
        <span className="text-[10px] text-muted-foreground/70 italic">baseline of the loaded preset</span>
      )}
    </div>
  );
}
