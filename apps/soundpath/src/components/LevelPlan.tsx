"use client";

/**
 * Levelling the gig from real recordings.
 *
 * The estimator that used to drive this predicted loudness from preset
 * parameters and was badly wrong — a modeller's chain is non-linear and its
 * level depends on spectrum, so a preset can read as aligned and still be 20 dB
 * out in the room. Everything here comes from measured LUFS instead.
 *
 * The controls and the snapshot table are shared with the single-preset
 * leveller; what belongs to a gig is the list of presets, the reference
 * averaged across them, and the .hls the whole thing ships as.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import RecordPreset, { when } from "@/components/RecordPreset";
import {
  ConnectHelix,
  EditableName,
  LoadedRow,
  RoleOffsets,
  SEVERITY_DOT,
  SEVERITY_TEXT,
  SnapshotTable,
  TargetRow,
  VersionHistory,
  severity,
  type Plan,
  type PlanPreset,
  type Role,
  type VersionRow,
} from "@/components/levelUi";
import { useHelixCapture } from "@/lib/useHelixCapture";

/** Readings this preset already has from being levelled on its own. */
interface Elsewhere {
  available: number;
  total: number;
  measuredFrom: string | null;
  measuredTo: string | null;
  baselines: Array<number | null>;
  allowed: boolean;
  replaces: number;
}

/**
 * Where a preset sits against the rest of the gig, before correction.
 *
 * Driven by measured loudness, not the old block-reading estimate — that
 * estimate is what said this gig was level while Sweet Child sat 30 dB down.
 *
 * The track is a heatmap along the gig's own range: cool at the quiet end, warm
 * at the loud end, green at the reference. The bar runs from the reference to
 * where the preset actually sits, so its length is the size of the problem.
 */
function LevelBar({ value, lo, hi }: { value: number | null; lo: number; hi: number }) {
  const span = hi - lo;
  const pos = (v: number) => (span <= 0 ? 50 : ((v - lo) / span) * 100);
  const pct = value === null ? null : pos(value);
  // Where 0 dB — the gig reference — falls on this scale.
  const zero = Math.max(0, Math.min(100, pos(0)));
  const sev = value === null ? "ok" : severity(value);

  return (
    <span
      className="hidden sm:flex items-center gap-2 shrink-0"
      title={
        value === null
          ? "Not measured yet"
          : `${value > 0 ? "+" : ""}${value} dB from the gig reference — ${
              value > 0 ? "louder" : "quieter"
            } than everything else`
      }
    >
      <span
        className="relative w-28 h-1.5 rounded-full overflow-hidden"
        style={{
          background: `linear-gradient(to right,
            rgb(56 189 248 / 0.35) 0%,
            rgb(16 185 129 / 0.35) ${zero}%,
            rgb(244 63 94 / 0.35) 100%)`,
        }}
      >
        {/* the reference itself */}
        <span className="absolute top-0 bottom-0 w-px bg-foreground/40" style={{ left: `${zero}%` }} />
        {/* distance from reference to where this preset sits */}
        {pct !== null && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 h-1.5 ${SEVERITY_DOT[sev]} opacity-70`}
            style={{ left: `${Math.min(zero, pct)}%`, width: `${Math.abs(pct - zero)}%` }}
          />
        )}
        {pct !== null && (
          <span
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full ring-1 ring-background ${SEVERITY_DOT[sev]}`}
            style={{ left: `${pct}%` }}
          />
        )}
      </span>
      <span
        className={`text-[10.5px] font-semibold tabular-nums w-12 text-right ${
          value === null ? "text-muted-foreground" : SEVERITY_TEXT[sev]
        }`}
      >
        {value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`}
      </span>
    </span>
  );
}

export function LevelPlan({ setlistId }: { setlistId?: string | null }) {
  const router = useRouter();
  const q = setlistId ? `?id=${encodeURIComponent(setlistId)}` : "";
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<Record<number, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const [hlsBusy, setHlsBusy] = useState(false);
  const [recording, setRecording] = useState<number | null>(null);
  // Owned here, not in the recorder: opening a preset used to build a fresh
  // AudioContext and re-prompt, so levelling a gig meant granting the mic once
  // per song. One connection lasts the whole pass.
  const cap = useHelixCapture();
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [showVersions, setShowVersions] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [elsewhere, setElsewhere] = useState<Record<number, Elsewhere>>({});

  const load = useCallback(async () => {
    // No id means no gig — never whichever one was open last.
    if (!setlistId) return setPlan(null);
    const r = await fetch(`/soundpath/api/setlist/plan${q}`);
    const d = await r.json();
    setPlan(d.ok ? d : null);
    const v = await fetch(`/soundpath/api/setlist/versions${q}`).then((x) => x.json());
    setVersions(v.ok ? v.versions : []);

    // Which presets have been levelled on their own since. Only asked about
    // for ones with nothing recorded here: a preset that already has readings
    // doesn't need rescuing. Where they do overlap the action counts what it
    // would overwrite and the confirm says so, rather than substituting
    // quietly — but not offering it at all is the better default.
    if (d.ok) {
      const pending = d.presets.filter((p: PlanPreset) => !p.measured);
      const found = await Promise.all(
        pending.map(async (p: PlanPreset) => {
          const x = await fetch(`/soundpath/api/setlist/${p.index}/readings${q}`)
            .then((res) => res.json())
            .catch(() => null);
          return x?.ok && x.available > 0 ? ([p.index, x] as const) : null;
        })
      );
      setElsewhere(Object.fromEntries(found.filter(Boolean) as Array<[number, Elsewhere]>));
    }
  }, [q, setlistId]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Freeze the current plan as the next version.
   *
   * Downloads resolve to the newest confirmed version, so this is what makes a
   * levelling pass real — and what stops a file you already took to a gig from
   * quietly changing meaning the next time you record something.
   */
  const confirmVersion = async () => {
    setConfirming(true);
    try {
      const r = await fetch(`/soundpath/api/setlist/versions${q}`, { method: "POST" });
      const d = await r.json();
      if (!d.ok) window.alert(d.error ?? "Could not confirm");
      await load();
    } finally {
      setConfirming(false);
    }
  };

  /**
   * Clear every reading so the next pass starts clean.
   *
   * All-or-nothing because what invalidates readings is never one song: it's
   * the rig moving underneath all of them — a different guitar, a Helix global
   * setting, a firmware update. Re-recording a single *changed* preset needs no
   * reset at all; that is just a recording, and the reading it replaces was
   * dropped with the preset it described.
   */
  const resetReadings = async () => {
    const n = plan?.measuredCount ?? 0;
    if (!window.confirm(`Clear all ${n} recordings for this setlist? Confirmed versions stay downloadable.`)) return;
    await fetch(`/soundpath/api/setlist/measurements${q}`, { method: "DELETE" });
    await load();
  };

  /**
   * The target every gig aims at. Global, so two setlists levelled months
   * apart land in the same place — which a per-gig average can't do, since it
   * follows whatever that gig's own recordings happened to be.
   */
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
    await fetch(`/soundpath/api/setlist/loaded${q}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version, offsetDb }),
    });
    await load();
  };

  /**
   * Re-baseline this gig from an HX Edit export.
   *
   * For the case where the pedal is ahead of the app: you changed a patch at
   * soundcheck, or between songs, and that file is now the truth. The setlist
   * keeps its identity, levels and version history; the presets are replaced
   * and every reading goes, because they measured patches that no longer
   * exist. A gig unrelated to this one belongs on the Library page instead,
   * where the same upload starts its own session.
   */
  const uploadHls = async (file: File) => {
    if (
      !window.confirm(
        `Replace this setlist's presets with "${file.name}"?\n\n` +
          `${plan?.measuredCount ?? 0} recordings will be cleared — they measured the presets ` +
          `being replaced. Confirmed versions stay in the history but can no longer be rebuilt.\n\n` +
          `To load a different gig instead, go back to every setlist and upload it there.`
      )
    ) {
      return;
    }
    setHlsBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/soundpath/api/setlist${q}`, { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok) await load();
      else window.alert(d.error ?? "Could not read that setlist");
    } finally {
      setHlsBusy(false);
    }
  };

  const upload = async (index: number, file: File) => {
    setBusy(index);
    setMsg((m) => ({ ...m, [index]: "" }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/soundpath/api/setlist/${index}/measure${q}`, { method: "POST", body: fd });
      const d = await r.json();
      setMsg((m) => ({ ...m, [index]: d.ok ? "" : d.error }));
      if (d.ok) await load();
    } finally {
      setBusy(null);
    }
  };

  /**
   * Take the readings this preset already has from being levelled on its own.
   *
   * The readings come across, not the gains — this gig applies its own role
   * offsets to them. Each one carries the level it was recorded through, which
   * is what makes it mean the same thing here as it did there.
   */
  const takeReadings = async (index: number, name: string) => {
    const src = elsewhere[index];
    if (!src) return;
    if (
      !window.confirm(
        `Use the ${src.available} reading${src.available === 1 ? "" : "s"} from levelling ` +
          `"${name}" on its own?\n\n` +
          `Taken ${when(src.measuredTo)}, through ${src.baselines.join(", ")} dB. ` +
          `They'll be levelled against this gig's target and role offsets, same as anything ` +
          `recorded here.` +
          (src.replaces > 0
            ? `\n\nThis replaces ${src.replaces} reading${src.replaces === 1 ? "" : "s"} already ` +
              `recorded here for this preset.`
            : "")
      )
    ) {
      return;
    }
    setBusy(index);
    try {
      const d = await fetch(`/soundpath/api/setlist/${index}/readings${q}`, { method: "POST" })
        .then((r) => r.json());
      if (!d.ok) window.alert(d.error ?? "Could not take those readings");
      await load();
    } finally {
      setBusy(null);
    }
  };

  /**
   * Go level this preset on its own.
   *
   * The better way round for a preset that changed: one .hlx on the Helix
   * instead of the whole gig, and you can re-record it as often as you like
   * without disturbing anything else. `from` is carried so the preset view can
   * offer the way back.
   */
  const levelOnItsOwn = async (index: number, hash: string) => {
    setBusy(index);
    try {
      const d = await fetch(`/soundpath/api/level`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetHash: hash }),
      }).then((r) => r.json());
      if (!d.ok) {
        window.alert(d.error ?? "Could not open that preset");
        setBusy(null);
        return;
      }
      router.push(`/level?id=${encodeURIComponent(d.id)}&from=${encodeURIComponent(setlistId!)}`);
    } catch {
      setBusy(null);
    }
  };

  const setRole = async (index: number, snapIdx: number, role: Role) => {
    await fetch(`/soundpath/api/setlist/${index}/roles${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles: { [snapIdx]: role } }),
    });
    await load();
  };

  /**
   * Rename a preset or one of its snapshots.
   *
   * The name is a label on the document, never a change to the preset payload:
   * the payload's bytes are what the readings are keyed to, so editing a name
   * in there would drop every recording this gig has. The export writes these
   * names into the file it builds.
   */
  const rename = async (index: number, body: { name?: string; snapshots?: Record<string, string> }) => {
    await fetch(`/soundpath/api/setlist/${index}/name${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await load();
  };

  const setLevels = async (patch: Record<string, number>) => {
    await fetch(`/soundpath/api/setlist/levels${q}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await load();
  };

  if (!plan) {
    return (
      <div className="rounded-xl border border-border border-dashed p-8 text-center mt-4">
        <p className="text-sm text-muted-foreground">
          {setlistId ? "That setlist isn't stored here." : "No setlist open."}
        </p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Pick one from{" "}
          <a href="/soundpath/setlist" className="underline hover:text-foreground">
            every setlist
          </a>
          , or upload an .hls there to start a session.
        </p>
      </div>
    );
  }

  const offs = plan.presets.map((p) => p.offsetFromReferenceDb).filter((v): v is number => v !== null);
  const barLo = offs.length ? Math.min(...offs) : 0;
  const barHi = offs.length ? Math.max(...offs) : 0;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div>
          {/* The gig's own name, not a label for the screen — this page is
              reached from three places and "Level the gig" told you nothing
              about which one you were looking at. */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-[15px] font-semibold">{plan.name}</h2>
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${plan.complete ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}
            >
              {plan.measuredCount}/{plan.totalCount} measured
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
            {plan.targetLufs === null
              ? "Record the whole gig in one sitting — the reference is averaged across it."
              : `Every snapshot against ${plan.targetLufs} LUFS, so record only what changed.`}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border cursor-pointer hover:bg-secondary whitespace-nowrap">
            {hlsBusy ? "Reading…" : "Replace from .hls"}
            <input
              type="file"
              accept=".hls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadHls(f);
                e.target.value = "";
              }}
            />
          </label>
          {plan.complete && (
            // Left enabled when it would produce the same gains as last time.
            // A version also records when the pass happened and what it came
            // from, which is worth freezing after a re-record even if the
            // numbers land in the same place — but you should know.
            <button
              onClick={confirmVersion}
              disabled={confirming}
              title={
                plan.sameAsLastVersion
                  ? `Every gain matches v${versions[0]?.n}. The file would be identical; the version would only record that you recorded again.`
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
              href={`/soundpath/api/setlist/export${q}&version=${versions[0].n}`}
              onClick={() => setLoaded(versions[0].n)}
              className="text-sm font-semibold px-3.5 py-2 rounded-lg border border-violet-500/40 bg-violet-500/10 text-violet-500 whitespace-nowrap"
            >
              v{versions[0].n}.hls ⤓
            </a>
          ) : (
            plan.complete && (
              // Nothing confirmed yet. Still downloadable, but it carries no
              // version number precisely because it isn't one — record
              // anything and this file's gains move.
              <a
                href={`/soundpath/api/setlist/export${q}`}
                className="text-sm px-3.5 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground"
                title="Unconfirmed — these gains change as soon as any reading does"
              >
                preview .hls ⤓
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
          <ConnectHelix cap={cap} busy={recording !== null} />
        </div>
      </div>

      {/* The banner that lived here said a preset had changed and then, with a
          pinned target, that this was fine — a paragraph to say nothing needed
          doing. Which preset changed is now a pill on its own row.

          Unpinned is the case that still needs saying, because there it isn't
          fine: the reference is averaged across the gig, so one fresh reading
          moves every other preset's target and the result looks complete
          either way. */}
      {plan.staleReadings > 0 && plan.targetLufs === null && (
        <p className="mb-3 px-3 py-2 rounded-lg border border-amber-500/40 bg-amber-500/5 text-[11.5px] text-amber-600 dark:text-amber-400">
          {plan.changedPresets.join(", ")} changed after the other {plan.staleReadings} reading
          {plan.staleReadings === 1 ? " was" : "s were"} taken, and this gig averages its own
          recordings — so a partial re-record mixes two passes. Pin a target below, or reset and do
          the lot.
        </p>
      )}

      <TargetRow plan={plan} onChange={setTarget} scope="gig" />

      <LoadedRow
        plan={plan}
        versions={versions}
        kind="hls"
        originalHref={`/soundpath/api/setlist/export${q}&version=original`}
        onLoaded={setLoaded}
        onOffset={setOffset}
      />

      <RoleOffsets levels={plan.levels} onChange={setLevels} />
      {/* The trim stepper lived here. It described a gain stage between the
          Helix and the browser, and over USB there isn't one — every live take
          stamps 0. It only ever offered a way to set a wrong number, which then
          shifted every level invisibly. Readings keep their own measuredTrimDb
          so files recorded through an interface still resolve correctly. */}
      <p className="text-[11px] text-muted-foreground mb-4">
        {plan.referenceLufs !== null && (
          <>Reference sits at <b>{plan.referenceLufs} LUFS</b>.</>
        )}
      </p>

      <div className="flex flex-col gap-1.5">
        {plan.presets.map((p) => (
          <div key={p.index} className="border border-border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-3 py-2.5 text-[12.5px]">
              <span className="text-muted-foreground w-5">{p.index + 1}</span>
              <div className="flex-1 min-w-0">
                {/* The name truncates, the badge does not — it sits outside
                    the truncating span, or a crowded row drops the one thing
                    telling you this preset is the odd one out. */}
                <span className="font-medium flex items-center gap-2 min-w-0">
                  {/* Editable rather than part of the expand toggle: clicking
                      a name to rename it and getting the panel instead is the
                      kind of thing you only forgive once. */}
                  <EditableName
                    value={p.name}
                    edited={p.nameSource === "user"}
                    onCommit={(n) => rename(p.index, { name: n })}
                    className="min-w-0"
                  />
                  {p.changedPending && (
                    <span
                      className="shrink-0 text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600"
                      title="Changed since the rest was recorded, and not in a confirmed version yet"
                    >
                      changed
                    </span>
                  )}
                </span>
                <button
                  onClick={() => setOpen(open === p.index ? null : p.index)}
                  className="text-[11px] text-muted-foreground text-left block"
                >
                  {p.snapshots.length} snapshot{p.snapshots.length > 1 ? "s" : ""}
                  {msg[p.index] && <span className="text-destructive"> · {msg[p.index]}</span>}
                </button>
              </div>
              {/* Anything with nothing recorded can be levelled on its own —
                  one .hlx on the pedal rather than the whole gig — and the
                  readings come back here when they exist. */}
              {!p.measured && !elsewhere[p.index] && setlistId && (
                <button
                  onClick={() => levelOnItsOwn(p.index, p.hash)}
                  disabled={busy === p.index}
                  title="Open this preset on its own, record it, and bring the readings back"
                  className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-500 disabled:opacity-50 shrink-0"
                >
                  {busy === p.index ? "…" : "level on its own ↗"}
                </button>
              )}
              {/* Levelled on its own since. Offered rather than taken, because
                  a session recorded weeks ago on a different guitar looks
                  exactly like one recorded five minutes ago. */}
              {elsewhere[p.index] && (
                <span className="text-[11px] flex items-center gap-1.5 shrink-0">
                  {/* Short, because this row is already crowded and the song's
                      own name has first claim on the space. Where they came
                      from and when is on the tooltip and in the confirm. */}
                  <span
                    className="text-muted-foreground hidden md:inline"
                    title={`Recorded in the preset leveller ${when(elsewhere[p.index].measuredTo)}, through ${elsewhere[p.index].baselines.join(", ")} dB`}
                  >
                    {elsewhere[p.index].available} reading
                    {elsewhere[p.index].available === 1 ? "" : "s"} ready
                  </span>
                  {elsewhere[p.index].allowed ? (
                    <button
                      onClick={() => takeReadings(p.index, p.name)}
                      disabled={busy === p.index}
                      className="font-bold px-2 py-1 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-500 disabled:opacity-50"
                    >
                      {busy === p.index ? "…" : "use them"}
                    </button>
                  ) : (
                    <span
                      className="text-amber-600 dark:text-amber-400"
                      title="This gig centres on its own recordings, so every reading has to come from the same pass. Pin a target level and this becomes safe."
                    >
                      needs a pinned target ⚠
                    </span>
                  )}
                </span>
              )}
              <LevelBar value={p.offsetFromReferenceDb} lo={barLo} hi={barHi} />
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.measured ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                {p.measured ? "measured" : "no recording"}
              </span>
              <input
                ref={(el) => { inputs.current[p.index] = el; }}
                type="file" accept="audio/wav,.wav" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(p.index, f); e.target.value = ""; }}
              />
              <button
                onClick={() => setRecording(p.index)}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-violet-500/40 bg-violet-500/10 text-violet-500 shrink-0"
              >
                record
              </button>
              <button
                onClick={() => inputs.current[p.index]?.click()}
                disabled={busy === p.index}
                className="text-[11px] font-bold px-2.5 py-1.5 rounded-md border border-border hover:border-muted-foreground/40 disabled:opacity-50 shrink-0"
              >
                {busy === p.index ? "measuring…" : "upload .wav"}
              </button>
              <button onClick={() => setOpen(open === p.index ? null : p.index)} className="text-muted-foreground/50 text-xs">
                {open === p.index ? "▾" : "▸"}
              </button>
            </div>

            {open === p.index && (
              <SnapshotTable
                snapshots={p.snapshots}
                onRole={(snapIdx, role) => setRole(p.index, snapIdx, role)}
                onRename={(snapIdx, name) => rename(p.index, { snapshots: { [snapIdx]: name } })}
              />
            )}
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3">
        Written to the path output block, never Channel Volume. <b>⚠</b> means the block can&apos;t
        reach it — fix that preset at the source.
      </p>

      <VersionHistory
        versions={versions}
        open={showVersions}
        onToggle={() => setShowVersions((v) => !v)}
        hrefFor={(n) => `/soundpath/api/setlist/export${q}&version=${n}`}
        onLoaded={setLoaded}
      />

      {recording !== null && setlistId && (
        <RecordPreset
          cap={cap}
          measureUrl={`/soundpath/api/setlist/${recording}/measure?id=${encodeURIComponent(setlistId)}`}
          source="setlist"
          title={plan.presets.find((p) => p.index === recording)?.name ?? ""}
          subtitle={`Slot ${recording + 1} · one take per snapshot`}
          snapshots={plan.presets.find((p) => p.index === recording)?.snapshots ?? []}
          onClose={() => {
            setRecording(null);
            load();
          }}
          onStored={load}
        />
      )}
    </section>
  );
}
