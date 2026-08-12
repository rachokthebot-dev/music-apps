"use client";

/**
 * Levelling one preset.
 *
 * The same measure-plan-write loop as a gig, minus the gig: no list of presets,
 * no reference averaged across songs, and a .hlx at the end instead of a .hls.
 * Everything that decides a number — the plan, the baseline stamping, the
 * confirmed versions — is the shared code the setlist view uses, so a preset
 * levelled here lands at the same absolute level as one levelled in a gig.
 *
 * That equivalence is the whole feature, and it only holds with a pinned
 * target. A gig can centre on its own recordings because it has a dozen of
 * them; one preset averaged against itself is already at its own average.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import RecordPreset from "@/components/RecordPreset";
import {
  ConnectHelix,
  EditableName,
  LoadedRow,
  RoleOffsets,
  SnapshotTable,
  TargetRow,
  VersionHistory,
  type Plan,
  type Role,
  type VersionRow,
} from "@/components/levelUi";
import { useHelixCapture } from "@/lib/useHelixCapture";

export function PresetLevel({ presetId }: { presetId?: string | null }) {
  const q = presetId ? `?id=${encodeURIComponent(presetId)}` : "";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [recording, setRecording] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const wav = useRef<HTMLInputElement | null>(null);
  // Owned here rather than in the recorder, so opening and closing it doesn't
  // tear down the AudioContext and re-prompt for the device.
  const cap = useHelixCapture();

  const load = useCallback(async () => {
    if (!presetId) return setPlan(null);
    const d = await fetch(`/soundpath/api/level/plan${q}`).then((r) => r.json());
    setPlan(d.ok ? d : null);
    const v = await fetch(`/soundpath/api/level/versions${q}`).then((r) => r.json());
    setVersions(v.ok ? v.versions : []);
  }, [presetId, q]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmVersion = async () => {
    setConfirming(true);
    try {
      const d = await fetch(`/soundpath/api/level/versions${q}`, { method: "POST" }).then((r) => r.json());
      if (!d.ok) window.alert(d.error ?? "Could not confirm");
      await load();
    } finally {
      setConfirming(false);
    }
  };

  const resetReadings = async () => {
    const n = plan?.measuredCount ?? 0;
    if (!window.confirm(`Clear all ${n} recordings for this preset? Confirmed versions stay downloadable.`)) return;
    await fetch(`/soundpath/api/level/measurements${q}`, { method: "DELETE" });
    await load();
  };

  /** Global, and shared with the gig view — that is what makes the two agree. */
  const setTarget = async (targetLufs: number | null) => {
    await fetch(`/soundpath/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLufs }),
    });
    await load();
  };

  const setOffset = async (recordOffsetDb: number) => {
    await fetch(`/soundpath/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordOffsetDb }),
    });
    await load();
  };

  const setLoaded = async (version: number | null, offsetDb?: number) => {
    await fetch(`/soundpath/api/level/loaded${q}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, offsetDb }),
    });
    await load();
  };

  const setRole = async (snapshotIndex: number, role: Role) => {
    await fetch(`/soundpath/api/level/roles${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: { [snapshotIndex]: role } }),
    });
    await load();
  };

  /**
   * Rename this preset or one of its snapshots. The document is what changes;
   * the preset payload is left alone, because its bytes are what the readings
   * are keyed to. The export writes these names into the .hlx it builds.
   */
  const rename = async (body: { name?: string; snapshots?: Record<string, string> }) => {
    await fetch(`/soundpath/api/level/name${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  };

  const setLevels = async (patch: Record<string, number>) => {
    await fetch(`/soundpath/api/level/levels${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  const uploadWav = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const d = await fetch(`/soundpath/api/level/measure${q}`, { method: "POST", body: fd }).then((r) =>
        r.json()
      );
      setMsg(d.ok ? null : d.error);
      if (d.ok) await load();
    } finally {
      setBusy(false);
    }
  };

  if (!plan) {
    return (
      <div className="rounded-xl border border-border border-dashed p-8 text-center mt-4">
        <p className="text-sm text-muted-foreground">
          {presetId ? "That preset isn't open here." : "No preset open."}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Pick one from the{" "}
          <a href="/soundpath/" className="underline hover:text-foreground">
            library
          </a>
          , or upload an .hlx from{" "}
          <a href="/soundpath/level" className="underline hover:text-foreground">
            every preset
          </a>
          .
        </p>
      </div>
    );
  }

  const preset = plan.presets[0];

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[15px] font-semibold max-w-xs">
              <EditableName
                value={plan.name}
                edited={preset?.nameSource === "user"}
                onCommit={(n) => rename({ name: n })}
              />
            </h2>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${plan.complete ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
            >
              {plan.measuredCount}/{plan.totalCount} measured
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {plan.targetLufs === null
              ? "Pin a target below — on its own a preset has nothing to level against."
              : `Every snapshot against ${plan.targetLufs} LUFS, so this lands where a gig on the same target would put it.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {plan.complete && (
            <button
              onClick={confirmVersion}
              disabled={confirming}
              title={
                plan.sameAsLastVersion
                  ? `Every gain matches v${versions[0]?.n}. The file would be identical.`
                  : undefined
              }
              className={`text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border hover:bg-secondary disabled:opacity-50 whitespace-nowrap ${
                plan.sameAsLastVersion ? "text-muted-foreground" : ""
              }`}
            >
              {confirming
                ? "Confirming…"
                : `Confirm → v${(versions[0]?.n ?? 0) + 1}${plan.sameAsLastVersion ? " (same gains)" : ""}`}
            </button>
          )}
          {versions[0] ? (
            <a
              href={`/soundpath/api/level/export${q}&version=${versions[0].n}`}
              onClick={() => setLoaded(versions[0].n)}
              className="text-sm font-semibold px-3.5 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-500 whitespace-nowrap"
            >
              v{versions[0].n}.hlx ⤓
            </a>
          ) : (
            plan.complete && (
              // Nothing confirmed yet. Still downloadable, but it carries no
              // version number precisely because it isn't one — record anything
              // and this file's gains move.
              <a
                href={`/soundpath/api/level/export${q}`}
                className="text-sm px-3.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                title="Unconfirmed — these gains change as soon as any reading does"
              >
                preview .hlx ⤓
              </a>
            )
          )}
          {plan.measuredCount > 0 && (
            <button
              onClick={resetReadings}
              className="text-[12.5px] px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 whitespace-nowrap"
            >
              Reset recordings
            </button>
          )}
          <ConnectHelix cap={cap} busy={recording} />
        </div>
      </div>

      <TargetRow plan={plan} onChange={setTarget} scope="preset" />

      <LoadedRow
        plan={plan}
        versions={versions}
        kind="hlx"
        originalHref={`/soundpath/api/level/export${q}&version=original`}
        onLoaded={setLoaded}
        onOffset={setOffset}
      />

      <RoleOffsets levels={plan.levels} onChange={setLevels} />

      <div className="flex items-center gap-3 flex-wrap mb-2">
        <span className="text-[12.5px] font-medium">
          {preset.snapshots.length} snapshot{preset.snapshots.length === 1 ? "" : "s"}
        </span>
        {msg && <span className="text-[11.5px] text-destructive">{msg}</span>}
        <span className="ml-auto flex items-center gap-2">
          <input
            ref={wav}
            type="file"
            accept="audio/wav,.wav"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadWav(f);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setRecording(true)}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-500"
          >
            record
          </button>
          <button
            onClick={() => wav.current?.click()}
            disabled={busy}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-border hover:border-muted-foreground/40 disabled:opacity-50"
          >
            {busy ? "measuring…" : "upload .wav"}
          </button>
        </span>
      </div>

      <div className="border border-border rounded-lg overflow-hidden">
        <SnapshotTable
          snapshots={preset.snapshots}
          onRole={setRole}
          onRename={(snapIdx, name) => rename({ snapshots: { [snapIdx]: name } })}
        />
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Written to the path output block, never Channel Volume. <b>⚠</b> means the block can&apos;t
        reach it — fix this preset at the source.
      </p>

      <VersionHistory
        versions={versions}
        open={showVersions}
        onToggle={() => setShowVersions((v) => !v)}
        hrefFor={(n) => `/soundpath/api/level/export${q}&version=${n}`}
        onLoaded={setLoaded}
      />

      {recording && presetId && (
        <RecordPreset
          cap={cap}
          measureUrl={`/soundpath/api/level/measure?id=${encodeURIComponent(presetId)}`}
          source="preset"
          title={plan.name}
          subtitle="one take per snapshot"
          snapshots={preset.snapshots}
          onClose={() => {
            setRecording(false);
            load();
          }}
          onStored={load}
        />
      )}
    </section>
  );
}
