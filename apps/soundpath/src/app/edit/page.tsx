"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MatchSongModal, { type MatchSongResult } from "@/components/MatchSongModal";
import ToneDiscoveryModal from "@/components/ToneDiscoveryModal";
import SignalChainFlow from "@/components/SignalChainFlow";
import GainTargetsPanel, {
  type AlignProposal as GainProposal,
  type Insertion as GainInsertion,
} from "@/components/GainTargetsPanel";

// ---------------------------------------------------------------------------
// Types mirrored from /api/master shape
// ---------------------------------------------------------------------------

type Loudness = { index: number; name: string; loudnessDb: number };
type ChainBlock = {
  dsp: string;
  slot: string;
  model: string;
  friendly: string;
  category: string | null;
  basedOn?: string;
  path?: number;
  position?: number;
  defaults: { [param: string]: number };
};
type SnapshotState = {
  index: number;
  name: string;
  blocks: { [slotPath: string]: boolean };       // "dsp0/block7" → true
  params: { [slotPath: string]: { [param: string]: number } };
};
type AlignChange = {
  block: string;       // friendly name
  paramLabel: string;
  dsp: string;
  slot: string;
  param: string;
  value: number;
};
type AlignProposal = {
  snapshotIndex: number;
  snapshotName: string;
  currentDb: number;
  targetDb: number;
  deltaDb: number;
  status: "no_change" | "adjusted" | "conflict";
  changes: AlignChange[];
  reasoning: string;
};
type MasterResponse = {
  ok: boolean;
  masterName?: string;
  outputGain?: number; // absolute baseline dB written into the Output Block
  chain?: ChainBlock[];
  snapshots?: SnapshotState[];
  loudness?: Loudness[];
  alignmentProposals?: AlignProposal[];
  error?: string;
};

// ---------------------------------------------------------------------------
// Pending changes — accumulate from Align Gain and Match Song, applied on
// Export. Indexed by snapshotIndex → friendlyBlockName → { enabled?, params? }.
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

function isLocalRequest(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Home() {
  const [data, setData] = useState<MasterResponse | null>(null);
  const [busy, setBusy] = useState<null | "import" | "align" | "export" | "open">(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [matchSongOpen, setMatchSongOpen] = useState(false);
  const [toneDiscoveryOpen, setToneDiscoveryOpen] = useState(false);
  const [gainTargetsOpen, setGainTargetsOpen] = useState(false);
  const [pending, setPending] = useState<Pending>({});
  /** Block to insert at preset level when the aligner needs a fresh Boost. */
  const [pendingInsertion, setPendingInsertion] = useState<GainInsertion>(null);
  const [snapIdx, setSnapIdx] = useState<number>(0);
  /** Preset-scoped pending edit — null means "no change, inherit from the loaded master". */
  const [pendingOutputGain, setPendingOutputGain] = useState<number | null>(null);
  /** Predicted loudness landscape after pending changes apply, refreshed by /api/master/preview. */
  const [previewLoudness, setPreviewLoudness] = useState<Loudness[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/master");
      const j = (await r.json()) as MasterResponse;
      setData(j);
    } catch (err) {
      setData({ ok: false, error: String(err) });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Live preview of the loudness landscape with pending changes applied.
  // Debounced 250ms so rapid edits don't flood the server. Output gain
  // doesn't affect the landscape (it's CLEAN-normalized — everything shifts
  // uniformly), so we exclude it from this effect's dependencies.
  useEffect(() => {
    if (Object.keys(pending).length === 0 && !pendingInsertion) {
      setPreviewLoudness(null);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await fetch("/api/master/preview", {
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
  }, [pending, pendingInsertion]);

  const showFlash = (kind: "ok" | "err", text: string) => {
    setFlash({ kind, text });
    setTimeout(() => setFlash(null), 4500);
  };

  // -------------------------------------------------------------------------
  // Import (upload a new master) — clears pending changes
  // -------------------------------------------------------------------------

  const handleUpload = useCallback(
    async (file: File) => {
      setBusy("import");
      try {
        const form = new FormData();
        form.append("file", file);
        const r = await fetch("/api/master", { method: "POST", body: form });
        const j = (await r.json()) as { ok: boolean; name?: string; error?: string };
        if (!j.ok) throw new Error(j.error ?? "upload failed");
        setPending({});
        setPendingOutputGain(null);
        setPendingInsertion(null);
        await reload();
        showFlash("ok", `Imported ${j.name}`);
      } catch (err) {
        showFlash("err", err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [reload]
  );

  // -------------------------------------------------------------------------
  // Align Gain — opens the GainTargetsPanel, which calls the new align API.
  // When the user clicks Stage in the panel, we merge proposals into pending
  // (same shape as Match Song staging).
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
        `Align Gain staged ${paramCount} param change${paramCount === 1 ? "" : "s"}` +
          (enableCount > 0 ? ` + ${enableCount} block enable${enableCount === 1 ? "" : "s"}` : "") +
          ` across ${proposals.length} snapshot${proposals.length === 1 ? "" : "s"}${insertNote}.`
      );
    },
    [pending]
  );

  // -------------------------------------------------------------------------
  // Match Song applied — modal returns the proposal, we merge into pending
  // and switch the dropdown to the target snapshot so the user sees changes
  // -------------------------------------------------------------------------

  const handleMatchApplied = useCallback(
    (result: MatchSongResult) => {
      let next: Pending = pending;
      for (const name of result.enable) {
        next = mergePending(next, result.targetSnapshotIndex, name, { enabled: true });
      }
      for (const name of result.bypass) {
        next = mergePending(next, result.targetSnapshotIndex, name, { enabled: false });
      }
      for (const [blockName, params] of Object.entries(result.params)) {
        next = mergePending(next, result.targetSnapshotIndex, blockName, { params });
      }
      setPending(next);
      setSnapIdx(result.targetSnapshotIndex);
      showFlash(
        "ok",
        `Match Song staged for ${result.targetSnapshotName}: ${result.song} by ${result.artist}.`
      );
    },
    [pending]
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

  // Include pendingInsertion in the dependency list since the export body
  // changes when it's staged.
  const handleExport = useCallback(async () => {
    setBusy("export");
    try {
      const r = await fetch("/api/master/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pending,
          // Only send outputGain when the user has edited it — keeps the
          // export untouched when no preset-level adjustment was made.
          ...(pendingOutputGain !== null ? { outputGain: pendingOutputGain } : {}),
          // Boost-block insertion from the gain-targets flow, if staged.
          ...(pendingInsertion ? { insertion: pendingInsertion } : {}),
        }),
      });
      if (!r.ok) throw new Error(`export failed (HTTP ${r.status})`);
      const blob = await r.blob();
      const disposition = r.headers.get("Content-Disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(disposition);
      const fileName = m ? m[1] : "edited.hlx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      showFlash("ok", `Exported ${fileName} (saved to iCloud)`);
    } catch (err) {
      showFlash("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [pending, pendingOutputGain, pendingInsertion]);

  const handleResetPending = useCallback(() => {
    setPending({});
    setPendingOutputGain(null);
    setPendingInsertion(null);
    showFlash("ok", "Cleared pending changes.");
  }, []);

  const handleOpenInHxEdit = useCallback(async () => {
    setBusy("open");
    try {
      const r = await fetch("/api/master/open-in-hx-edit", { method: "POST" });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "open failed");
      showFlash("ok", "Opened in HX Edit on this Mac");
    } catch (err) {
      showFlash("err", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!data) {
    return (
      <main className="p-8">
        <p className="text-zinc-400">Reading master preset…</p>
      </main>
    );
  }

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

  const { masterName, chain = [], snapshots = [], loudness = [], ok, error } = data;
  const snapshot = snapshots[snapIdx];
  const snapshotPending = pending[snapIdx] ?? {};
  const showOpenInHxEdit = isLocalRequest();

  return (
    <main
      className={`p-6 max-w-7xl mx-auto min-h-screen ${dragOver ? "ring-2 ring-blue-500/40" : ""}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="mb-6 flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-baseline gap-4 flex-wrap">
          <h1 className="text-2xl font-semibold">soundpath</h1>
          <div className="text-sm text-zinc-500">
            Master: <span className="text-zinc-300">{masterName ?? "(none)"}</span>
            {dragOver && <span className="ml-3 text-blue-400">drop .hlx to import</span>}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".hlx,application/json"
            className="hidden"
            onChange={onFileChange}
          />
          <button
            onClick={onPickFile}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === "import" ? "Importing…" : "Import .hlx"}
          </button>
          <button
            onClick={() => setGainTargetsOpen((prev) => !prev)}
            disabled={busy !== null}
            className={`px-3 py-1.5 text-sm rounded-md border disabled:opacity-50 ${
              gainTargetsOpen
                ? "border-blue-500/70 bg-blue-800/60 text-blue-50"
                : "border-blue-700/50 bg-blue-900/40 text-blue-100 hover:bg-blue-900/60"
            }`}
          >
            {gainTargetsOpen ? "Close Align" : "Align Gain"}
          </button>
          <button
            onClick={() => setMatchSongOpen(true)}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-blue-700/50 bg-blue-900/40 text-blue-100 hover:bg-blue-900/60 disabled:opacity-50"
          >
            Match Song
          </button>
          <button
            onClick={() => setToneDiscoveryOpen(true)}
            disabled={busy !== null}
            className="px-3 py-1.5 text-sm rounded-md border border-purple-700/50 bg-purple-900/40 text-purple-100 hover:bg-purple-900/60 disabled:opacity-50"
          >
            Tone Discovery
          </button>
          <button
            onClick={handleResetPending}
            disabled={busy !== null || totalPendingChanges === 0}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30"
          >
            Reset
          </button>
          <button
            onClick={handleExport}
            disabled={busy !== null || totalPendingChanges === 0}
            className="px-4 py-1.5 text-sm rounded-md border border-emerald-700/50 bg-emerald-900/40 text-emerald-100 hover:bg-emerald-900/60 disabled:opacity-40"
          >
            {busy === "export" ? "Exporting…" : `Export${totalPendingChanges ? ` (${totalPendingChanges})` : ""}`}
          </button>
          {showOpenInHxEdit && (
            <button
              onClick={handleOpenInHxEdit}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50"
              title="Open last exported .hlx in HX Edit on this Mac"
            >
              {busy === "open" ? "Opening…" : "Open in HX Edit"}
            </button>
          )}
        </div>
      </header>

      <MatchSongModal
        open={matchSongOpen}
        onClose={() => setMatchSongOpen(false)}
        snapshots={snapshots.map((s) => ({ index: s.index, name: s.name }))}
        onApplied={(_fileName) => {/* not used in stage-only flow */}}
        onStaged={handleMatchApplied}
        onError={(msg) => showFlash("err", msg)}
      />
      <ToneDiscoveryModal
        open={toneDiscoveryOpen}
        onClose={() => setToneDiscoveryOpen(false)}
        snapshots={snapshots.map((s) => ({ index: s.index, name: s.name }))}
        onStaged={handleMatchApplied}
        onError={(msg) => showFlash("err", msg)}
      />

      {flash && (
        <div
          className={`mb-4 rounded-md px-3 py-2 text-sm ${
            flash.kind === "ok"
              ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-200"
              : "bg-red-950/40 border border-red-800/40 text-red-200"
          }`}
        >
          {flash.text}
        </div>
      )}

      {totalPendingChanges > 0 && !flash && (
        <div className="mb-4 rounded-md px-3 py-2 text-sm bg-amber-950/30 border border-amber-800/40 text-amber-200 flex items-center justify-between gap-3">
          <span>
            <span className="font-medium">{totalPendingChanges}</span> staged change
            {totalPendingChanges === 1 ? "" : "s"} across{" "}
            <span className="font-medium">{Object.keys(pending).length}</span> snapshot
            {Object.keys(pending).length === 1 ? "" : "s"} — none written yet. Click{" "}
            <span className="font-medium">Export</span> to save the .hlx.
          </span>
        </div>
      )}

      {!ok && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-red-200 mb-6">
          <p className="font-medium">Could not read master preset.</p>
          <p className="text-sm mt-2 text-red-300/80">{error}</p>
        </div>
      )}

      <GainTargetsPanel
        open={gainTargetsOpen}
        snapshots={snapshots.map((s) => ({ index: s.index, name: s.name }))}
        loadedLoudness={Object.fromEntries(loudness.map((l) => [l.index, l.loudnessDb]))}
        onClose={() => setGainTargetsOpen(false)}
        onStage={handleGainStaged}
        onError={(msg) => showFlash("err", msg)}
      />

      {/* Loudness landscape — 8 cards, one per snapshot
          Shows predicted post-stage value (rose) when pending changes touch a snapshot. */}
      <section className="mb-6">
        <h2 className="text-xs uppercase tracking-wider text-zinc-500 mb-2 flex items-baseline gap-2">
          Loudness landscape (CLEAN = 0 dB baseline)
          {previewLoudness && (
            <span className="text-[10px] text-rose-400/80 normal-case tracking-normal">
              · showing predicted post-stage values
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          {loudness.map((s) => {
            const isBaseline = s.index === 0;
            const isSolo = s.index >= 4;
            const isCurrent = s.index === snapIdx;
            const previewSnap = previewLoudness?.find((p) => p.index === s.index);
            const predictedDb = previewSnap?.loudnessDb ?? s.loudnessDb;
            const changed = previewSnap !== undefined && Math.abs(predictedDb - s.loudnessDb) > 0.05;
            const dbDisplay = `${predictedDb > 0 ? "+" : ""}${predictedDb.toFixed(1)}`;
            const oldDbDisplay = `${s.loudnessDb > 0 ? "+" : ""}${s.loudnessDb.toFixed(1)}`;
            return (
              <button
                key={s.index}
                onClick={() => setSnapIdx(s.index)}
                className={`text-left rounded-lg border p-2 transition ${
                  changed
                    ? isCurrent
                      ? "border-rose-500/60 bg-rose-900/20 ring-1 ring-rose-500/30"
                      : "border-rose-700/50 bg-rose-950/15 hover:bg-rose-950/25"
                    : isCurrent
                      ? "border-blue-500/60 bg-blue-900/30 ring-1 ring-blue-500/30"
                      : isBaseline
                        ? "border-blue-700/40 bg-blue-950/20 hover:bg-blue-950/40"
                        : isSolo
                          ? "border-amber-800/30 bg-amber-950/10 hover:bg-amber-950/20"
                          : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-900/70"
                }`}
              >
                <div className="text-[10px] text-zinc-500">slot {s.index}</div>
                <div className="text-xs font-medium text-zinc-100 leading-tight truncate">{s.name}</div>
                <div className={`text-lg font-light tabular-nums mt-1 ${changed ? "text-rose-300" : "text-zinc-200"}`}>
                  {dbDisplay} dB
                </div>
                {changed && (
                  <div className="text-[10px] text-zinc-500 tabular-nums leading-tight">
                    was {oldDbDisplay} dB
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Snapshot selector + Output Level (preset-wide baseline knob) */}
      <section className="mb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-zinc-500">Snapshot</label>
          <select
            value={snapIdx}
            onChange={(e) => setSnapIdx(Number(e.target.value))}
            className="px-3 py-1.5 text-sm rounded-md border border-zinc-700 bg-zinc-900 text-zinc-100"
          >
            {snapshots.map((s) => (
              <option key={s.index} value={s.index}>
                {s.index}: {s.name}
              </option>
            ))}
          </select>
          {snapshotPending && Object.keys(snapshotPending).length > 0 && (
            <span className="text-xs text-amber-300/80">
              {Object.keys(snapshotPending).length} pending change{Object.keys(snapshotPending).length === 1 ? "" : "s"} on this snapshot
            </span>
          )}
        </div>

        <OutputLevelControl
          loaded={data?.outputGain ?? 0}
          pending={pendingOutputGain}
          onChange={setPendingOutputGain}
          disabled={busy !== null}
        />

        {totalPendingChanges > 0 && (
          <div className="text-xs text-zinc-500">
            <span className="text-amber-300">{totalPendingChanges}</span> total staged change
            {totalPendingChanges === 1 ? "" : "s"} across {Object.keys(pending).length} snapshot
            {Object.keys(pending).length === 1 ? "" : "s"}
          </div>
        )}
      </section>

      {/* Signal chain flow */}
      <section>
        <SignalChainFlow
          chain={chain}
          snapshot={snapshot}
          snapshotPending={snapshotPending}
        />
      </section>

      <footer className="mt-8 pt-4 border-t border-zinc-900 text-xs text-zinc-600">
        v0.4 · Signal-chain flow · Stage edits with Align Gain + Match Song + Tone Discovery · Preset baseline (Output Block) editable · Export writes file
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------
// OutputLevelControl — preset-scoped baseline knob (the Output Block "gain"
// param). One number per preset: shift the whole preset up/down vs other
// presets without changing the internal snapshot-to-snapshot alignment.
//
// Workflow: load preset A → note its baseline (e.g. 0.0 dB). Load preset B,
// see its baseline (e.g. -3.0 dB). Edit B's baseline up to match A's perceived
// loudness; export → all 4 output slots get the new value.
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
      <label className="text-xs uppercase tracking-wider text-zinc-500">Output level</label>
      <div className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 p-0.5">
        <button
          onClick={() => bump(-0.5)}
          disabled={disabled}
          className="px-2 py-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
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
            dirty ? "text-rose-300 font-medium" : "text-zinc-200"
          }`}
        />
        <span className="text-xs text-zinc-500 pr-1">dB</span>
        <button
          onClick={() => bump(+0.5)}
          disabled={disabled}
          className="px-2 py-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
          title="+0.5 dB"
        >
          +
        </button>
      </div>
      {dirty ? (
        <button
          onClick={() => onChange(null)}
          disabled={disabled}
          className="text-[10px] text-zinc-500 hover:text-zinc-300 underline disabled:opacity-30"
          title={`Revert to loaded value ${loaded.toFixed(1)} dB`}
        >
          revert
        </button>
      ) : (
        <span className="text-[10px] text-zinc-600 italic">baseline of the loaded preset</span>
      )}
    </div>
  );
}
