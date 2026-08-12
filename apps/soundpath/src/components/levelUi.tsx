"use client";

/**
 * The parts of a levelling screen that don't care what is being levelled.
 *
 * A gig and a single preset show the same numbers, because they come from the
 * same plan: the target and its ceiling, what's on the Helix right now, the
 * role offsets, and a row per snapshot. Only the scale differs — a gig lists
 * presets, a preset is just the table.
 */

// Its own subpath, not the package barrel: the barrel pulls in the ffmpeg and
// yt-dlp helpers, which import child_process and can't be bundled for a client.
import { EditableName } from "@music-apps/shared/editable-name";

import { useHelixCapture } from "@/lib/useHelixCapture";
import { when } from "@/components/RecordPreset";

export { EditableName };

export type Role = "clean" | "rhythm" | "chorus" | "solo";

/** A confirmed levelling pass, as the versions endpoint reports it. */
export interface VersionRow {
  n: number;
  createdAt: string;
  measuredFrom: string | null;
  measuredTo: string | null;
  presets: number;
  rebuildable: boolean;
  missing: string[];
}

export interface PlanSnapshot {
  index: number;
  name: string;
  /** "user" when the name was typed here rather than read off the preset. */
  nameSource?: string;
  role: Role;
  roleSource: string;
  measuredLufs: number | null;
  measuredTrimDb: number | null;
  measuredAt: string | null;
  targetLufs: number | null;
  adjustDb: number | null;
  outputGainDb: number | null;
  shortfallDb: number;
  achievable: boolean;
}

export interface PlanPreset {
  index: number;
  name: string;
  /** "user" when the name was typed here rather than read off the preset. */
  nameSource?: string;
  /** Identifies the patch — what a levelling session for it is keyed to. */
  hash: string;
  /** Changed since the rest was recorded, and not yet in a confirmed version. */
  changedPending: boolean;
  offsetFromReferenceDb: number | null;
  measured: boolean;
  currentOutputGainDb: number;
  baselineGainDb: number[];
  baselineKnown: boolean;
  snapshots: PlanSnapshot[];
}

export interface Plan {
  name: string;
  levels: {
    rhythmOffsetDb: number;
    chorusOffsetDb: number;
    soloOffsetDb: number;
    measurementTrimDb: number;
  };
  referenceLufs: number | null;
  loadedVersion: number | null;
  targetLufs: number | null;
  headroomDb: number;
  recordOffsetDb: number;
  loadedOffsetDb: number;
  maxTargetLufs: number | null;
  recommendedTargetLufs: number | null;
  changedPresets: string[];
  staleReadings: number;
  /** Confirming now would freeze the same gains the last version already has. */
  sameAsLastVersion: boolean;
  measuredCount: number;
  totalCount: number;
  complete: boolean;
  measuredTrims: number[];
  presets: PlanPreset[];
}

const ROLE_STYLE: Record<Role, string> = {
  clean: "bg-sky-500/15 text-sky-500",
  rhythm: "bg-emerald-500/15 text-emerald-500",
  chorus: "bg-indigo-500/15 text-indigo-400",
  solo: "bg-amber-500/15 text-amber-500",
};

/**
 * Role picker.
 *
 * A native <select>, after the hand-rolled popup that replaced it turned out
 * to be worse: absolutely positioned inside a table cell, it was clipped by
 * the row's own bounds on the last preset in the list, so the options simply
 * couldn't be reached. The OS draws a native popup above everything and
 * anchors it itself. `color-scheme` is what keeps it dark, which was the
 * original reason for going custom.
 */
export function RoleSelect({
  value,
  source,
  onChange,
}: {
  value: Role;
  source: string;
  onChange: (r: Role) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Role)}
        title={
          source === "user"
            ? "You set this"
            : source === "name"
              ? "From the snapshot name"
              : "Guessed — worth checking"
        }
        className={`text-[10px] font-bold pl-2 pr-1 py-1 rounded-full cursor-pointer border-0 appearance-none ${ROLE_STYLE[value]}`}
        style={{ colorScheme: "dark" }}
      >
        {(["clean", "rhythm", "chorus", "solo"] as Role[]).map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {source === "default" && <span className="text-[10px] text-amber-500 font-bold">?</span>}
    </span>
  );
}

/** How far off is too far. Same thresholds as the per-snapshot change column. */
export function severity(db: number): "ok" | "warn" | "bad" {
  const a = Math.abs(db);
  return a <= 2 ? "ok" : a <= 6 ? "warn" : "bad";
}

export const SEVERITY_DOT = { ok: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-rose-500" } as const;
export const SEVERITY_TEXT = {
  ok: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-rose-500",
} as const;

export function Stepper({
  label,
  value,
  onChange,
  suffix,
  step = 0.5,
  min = -Infinity,
  max = Infinity,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  /** Role offsets are nudged in half-dBs; a record offset is tens of dB. */
  step?: number;
  min?: number;
  max?: number;
}) {
  // Bounds belong here, not in the caller. A caller that clamped inside its own
  // onChange left the button looking live while doing nothing, which reads as a
  // broken control rather than one sitting at its limit.
  const go = (next: number) => onChange(Number(Math.max(min, Math.min(max, next)).toFixed(1)));
  const atMin = value <= min;
  const atMax = value >= max;
  const btn = (dead: boolean) =>
    `px-1.5 text-sm font-bold ${dead ? "text-muted-foreground/30 cursor-not-allowed" : "text-muted-foreground hover:text-foreground"}`;
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 border border-border rounded-lg bg-card">
      <span className="text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
        <button disabled={atMin} onClick={() => go(value - step)} className={btn(atMin)}>−</button>
        <b className="min-w-10 text-center text-[12.5px] tabular-nums">
          {value > 0 ? "+" : ""}
          {value.toFixed(1)}
        </b>
        <button disabled={atMax} onClick={() => go(value + step)} className={btn(atMax)}>+</button>
      </div>
      {suffix && <span className="text-[10.5px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}

/**
 * Where the levelling is aimed, and whether it fits.
 *
 * The ceiling isn't a preference: the output block stops at +12 dB, so the
 * snapshot needing the biggest boost caps everything else. Rather than make
 * that a number to guess at, the row reports the most this can take and offers
 * a value a few dB under it.
 */
export function TargetRow({
  plan,
  onChange,
  scope,
}: {
  plan: Plan;
  onChange: (t: number | null) => void;
  /** What "auto" would centre on — a gig has its own; one preset doesn't. */
  scope: "gig" | "preset";
}) {
  const pinned = plan.targetLufs !== null;
  const overshoot =
    pinned && plan.maxTargetLufs !== null ? plan.targetLufs! - plan.maxTargetLufs : null;
  const tooHigh = overshoot !== null && overshoot > 0;

  return (
    <div
      className={`flex items-center gap-2.5 flex-wrap mb-3 px-3 py-2 rounded-lg border ${
        tooHigh ? "border-amber-500/40 bg-amber-500/5" : "border-border"
      }`}
    >
      <span className="text-[11.5px] font-semibold">Target level</span>
      <select
        value={pinned ? "fixed" : "auto"}
        onChange={(e) =>
          onChange(e.target.value === "auto" ? null : plan.recommendedTargetLufs ?? -20)
        }
        className="text-[11.5px] px-2 py-1 rounded-md border border-border bg-background"
        style={{ colorScheme: "dark" }}
      >
        <option value="auto">
          {scope === "gig" ? "this gig's own centre" : "this preset's own centre"}
        </option>
        <option value="fixed">the same for everything</option>
      </select>

      {pinned && (
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            step={0.5}
            value={plan.targetLufs ?? 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-20 text-[11.5px] px-2 py-1 rounded-md border border-border bg-background tabular-nums"
          />
          <span className="text-[11px] text-muted-foreground">LUFS</span>
        </span>
      )}

      {plan.maxTargetLufs !== null && (
        <span className="text-[11px] text-muted-foreground">
          {scope === "gig" ? "this gig" : "this preset"} tops out at{" "}
          <span className="tabular-nums text-foreground">{plan.maxTargetLufs} LUFS</span>
          {plan.recommendedTargetLufs !== null && (
            <>
              {" "}
              ·{" "}
              <button
                onClick={() => onChange(plan.recommendedTargetLufs)}
                className="underline hover:text-foreground"
              >
                use {plan.recommendedTargetLufs} ({plan.headroomDb} dB in hand)
              </button>
            </>
          )}
        </span>
      )}

      {tooHigh && (
        <p className="w-full text-[11px] text-amber-600 dark:text-amber-400">
          {overshoot!.toFixed(1)} dB too high — the quietest snapshot will clamp at +12. Lower it,
          or fix that preset at the source.
        </p>
      )}
      {!pinned && scope === "preset" && (
        // Centring one preset on itself is a no-op dressed as a setting: the
        // average of its own snapshots is where it already sits.
        <span className="text-[11px] text-amber-600 dark:text-amber-400">
          On its own this leaves the preset where it started. Pin a target to relate it to anything.
        </span>
      )}
      {!pinned && scope === "gig" && (
        <span className="text-[11px] text-muted-foreground">
          Each gig centres on itself, so two can sit far apart. Pin it and they match.
        </span>
      )}
    </div>
  );
}

/**
 * What is on the pedal right now, and the file you load to record through.
 *
 * Every correction is measured from this. It is the one setting that is
 * invisible when wrong — the numbers stay plausible either way.
 */
export function LoadedRow({
  plan,
  versions,
  originalHref,
  kind,
  onLoaded,
  onOffset,
}: {
  plan: Plan;
  versions: VersionRow[];
  originalHref: string;
  /** The extension of the file being levelled, for the download's label. */
  kind: "hls" | "hlx";
  onLoaded: (version: number | null, offsetDb?: number) => void;
  onOffset: (db: number) => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/5">
        <span className="text-[11.5px] font-semibold">On the Helix right now</span>
        <select
          value={plan.loadedVersion ?? ""}
          onChange={(e) => onLoaded(e.target.value === "" ? null : Number(e.target.value))}
          className="text-[11.5px] px-2 py-1 rounded-md border border-border bg-background"
          style={{ colorScheme: "dark" }}
        >
          <option value="">{kind === "hls" ? "the original presets" : "the original preset"}</option>
          {versions.map((v) => (
            <option key={v.n} value={v.n}>
              v{v.n} — {new Date(v.createdAt).toLocaleDateString()}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1.5 pl-2.5 py-1 rounded-md border border-dashed border-border">
          <a
            href={originalHref}
            // Downloading says the original is what's on the pedal now. It
            // must not decide *how* the file is offset — the checkbox does
            // that, and forcing the offset on here is what silently handed
            // back a backed-off file when a plain one was asked for.
            onClick={() => onLoaded(null, plan.loadedOffsetDb)}
            className="text-[11.5px] font-semibold hover:underline"
            title={
              plan.loadedOffsetDb !== 0
                ? `Exactly as stored, turned down ${Math.abs(plan.loadedOffsetDb)} dB because "in the loaded file" is ticked. Untick it for the untouched preset.`
                : "Exactly as stored, with no levelling and no offset applied. This is what you load to record a fresh pass."
            }
          >
            original .{kind} ⤓
          </a>
          {/* Grouped with the download and nothing else. Sitting loose in this
              row it read as a property of whatever is on the Helix, which it
              never is — a confirmed version carries no offset, by design. */}
          <label
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none"
            title="Tick this when the file on the Helix has the offset baked in — the original download follows it, so ticked you get the backed-off file and unticked you get the preset untouched. It captures the value as it is now, so moving the stepper afterwards won't re-interpret takes you've already recorded."
          >
            <input
              type="checkbox"
              className="accent-current"
              checked={plan.loadedOffsetDb !== 0}
              onChange={(e) => onLoaded(null, e.target.checked ? plan.recordOffsetDb : 0)}
            />
            in the loaded file
          </label>
          <Stepper
            label="at"
            value={plan.recordOffsetDb}
            onChange={onOffset}
            suffix="dB"
            step={3}
            min={-40}
            max={0}
          />
        </span>
        <span className="text-[11px] text-muted-foreground">
          Corrections are measured from this. Get it wrong and readings are corrected twice.
        </span>
      </div>
      {/* Only while the original is loaded. The offset exists to keep a
          recording pass out of the converter's ceiling, and a confirmed version
          is a finished file — it carries no offset and never will, so
          explaining one here is just noise. */}
      {plan.loadedOffsetDb !== 0 && plan.loadedVersion === null && (
        <p className="text-[11px] text-muted-foreground -mt-2 mb-3 pl-3">
          Loaded file is <b>{Math.abs(plan.loadedOffsetDb)} dB</b> down, so takes don&apos;t clip
          going in. Added straight back in the correction, so the finished file is the same either
          way — but untick it if that isn&apos;t what&apos;s on the pedal.
        </p>
      )}
    </>
  );
}

/** The role offsets, which are per-document rather than global. */
export function RoleOffsets({
  levels,
  onChange,
}: {
  levels: Plan["levels"];
  onChange: (patch: Record<string, number>) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-2">
      <Stepper
        label="Rhythm"
        value={levels.rhythmOffsetDb}
        onChange={(v) => onChange({ rhythmOffsetDb: v })}
        suffix="over clean"
      />
      <Stepper
        label="Chorus"
        value={levels.chorusOffsetDb}
        onChange={(v) => onChange({ chorusOffsetDb: v })}
        suffix="over clean"
      />
      <Stepper
        label="Solo"
        value={levels.soloOffsetDb}
        onChange={(v) => onChange({ soloOffsetDb: v })}
        suffix="over clean"
      />
    </div>
  );
}

/** One row per snapshot: what it measured, what it should be, what to write. */
export function SnapshotTable({
  snapshots,
  onRole,
  onRename,
}: {
  snapshots: PlanSnapshot[];
  onRole: (snapshotIndex: number, role: Role) => void;
  onRename: (snapshotIndex: number, name: string) => void;
}) {
  return (
    <table className="w-full text-[12px] border-t border-border">
      <thead>
        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary/40">
          <th className="text-left px-3 py-1.5">Snapshot</th>
          <th className="text-left">Role</th>
          <th className="text-left">Recorded</th>
          <th className="text-right">Measured</th>
          <th className="text-right">at trim</th>
          <th className="text-right">Target</th>
          <th className="text-right">Change</th>
          <th className="text-right pr-3">Output level</th>
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s) => (
          <tr key={s.index} className="border-t border-border/60">
            <td className="px-3 py-1.5 max-w-[13rem]">
              <EditableName
                value={s.name}
                edited={s.nameSource === "user"}
                onCommit={(n) => onRename(s.index, n)}
              />
            </td>
            <td>
              <RoleSelect value={s.role} source={s.roleSource} onChange={(r) => onRole(s.index, r)} />
            </td>
            <td
              className="text-muted-foreground/70 whitespace-nowrap"
              title={s.measuredAt ? new Date(s.measuredAt).toLocaleString() : undefined}
            >
              {when(s.measuredAt)}
            </td>
            <td
              className={`text-right tabular-nums ${
                s.adjustDb === null ? "text-muted-foreground" : SEVERITY_TEXT[severity(s.adjustDb)]
              }`}
            >
              {s.measuredLufs ?? "—"}
            </td>
            <td className="text-right tabular-nums text-muted-foreground/70">
              {s.measuredTrimDb === null
                ? "—"
                : `${s.measuredTrimDb > 0 ? "+" : ""}${s.measuredTrimDb}`}
            </td>
            <td className="text-right tabular-nums text-muted-foreground">{s.targetLufs ?? "—"}</td>
            <td
              className={`text-right tabular-nums font-semibold ${
                s.adjustDb === null ? "" : SEVERITY_TEXT[severity(s.adjustDb)]
              }`}
            >
              {s.adjustDb === null ? "—" : `${s.adjustDb > 0 ? "+" : ""}${s.adjustDb}`}
            </td>
            <td className="text-right tabular-nums pr-3 font-semibold">
              {s.outputGainDb === null ? "—" : s.outputGainDb}
              {!s.achievable && <span className="text-destructive"> ⚠{s.shortfallDb}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The input the takes come through, and its live level. */
export function ConnectHelix({
  cap,
  busy,
}: {
  cap: ReturnType<typeof useHelixCapture>;
  /** True while a recorder is open — releasing the device then would kill it. */
  busy: boolean;
}) {
  const capDb = cap.meter > 0 ? 20 * Math.log10(cap.meter) : -Infinity;

  if (!cap.applied) {
    return (
      <button
        onClick={() => cap.enable()}
        className="text-[12.5px] font-semibold px-3 py-2 rounded-lg border border-border hover:bg-secondary"
      >
        Connect Helix
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-[11px] px-2.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      <span className="text-muted-foreground truncate max-w-32" title={cap.applied.label}>
        {cap.applied.label}
      </span>
      <span className="tabular-nums text-muted-foreground">
        {capDb === -Infinity ? "—" : `${capDb.toFixed(0)} dB`}
      </span>
      {cap.applied.channelCount < 2 && (
        <span
          className="text-amber-600 dark:text-amber-400 font-semibold"
          title="A mono downmix loses 3 dB on a dry patch and 6 dB on a wide one, so the error doesn't cancel between snapshots."
        >
          mono ⚠
        </span>
      )}
      <button
        onClick={cap.disable}
        disabled={busy}
        title={busy ? "Close the recorder first" : "Release the Helix so other apps can use it"}
        className="text-muted-foreground/60 hover:text-destructive disabled:opacity-30"
      >
        ✕
      </button>
    </span>
  );
}

/** Every confirmed pass, collapsed until asked for. */
export function VersionHistory({
  versions,
  open,
  onToggle,
  hrefFor,
  onLoaded,
}: {
  versions: VersionRow[];
  open: boolean;
  onToggle: () => void;
  hrefFor: (n: number) => string;
  onLoaded: (n: number) => void;
}) {
  if (versions.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <button onClick={onToggle} className="text-[11.5px] text-muted-foreground hover:text-foreground">
        {open ? "▾" : "▸"} {versions.length} confirmed version{versions.length === 1 ? "" : "s"}
      </button>
      {open && (
        <ul className="mt-2 flex flex-col gap-1">
          {versions.map((v) => (
            <li
              key={v.n}
              className="flex items-center gap-3 text-[11.5px] px-2.5 py-1.5 rounded-md border border-border"
            >
              <span className="font-semibold tabular-nums">v{v.n}</span>
              <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleString()}</span>
              {v.presets > 1 && <span className="text-muted-foreground">{v.presets} presets</span>}
              {v.rebuildable ? (
                <a
                  href={hrefFor(v.n)}
                  onClick={() => onLoaded(v.n)}
                  className="ml-auto underline hover:text-foreground"
                >
                  download
                </a>
              ) : (
                // The stored gains apply to a preset hash that no longer exists
                // here, so rebuilding would emit a different file under the
                // same version number.
                <span
                  className="ml-auto text-amber-600 dark:text-amber-400"
                  title={`Replaced since: ${v.missing.join(", ")}`}
                >
                  can&apos;t rebuild ⚠
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
