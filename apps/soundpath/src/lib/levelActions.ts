/**
 * The things you do to a level document, independent of what it is.
 *
 * Storing a reading, correcting a role, declaring what's on the Helix,
 * confirming a pass — a gig and a single preset need all of it and must agree
 * to the decimal, because the same numbers come out of both. When these lived
 * in the setlist routes there was one copy; a second flow meant either sharing
 * them or writing the baseline-stamping rules twice, and the second copy is
 * exactly where a double correction gets in.
 *
 * Each returns { status, body } so a route is a lookup and a call.
 */

import { splitAndMeasure } from "@music-apps/gain-estimator";

import { applyPlanToPresets, planGains } from "./applyLevels";
import { baselineInForce } from "./levelPlan";
import {
  type LevelDoc,
  type LevelPreset,
  type LevelSettings,
  type LevelVersion,
  presetIdentity,
  type Role,
  type VersionPreset,
} from "./levelDoc";

/** The part of a document store these actions need. */
export interface LevelDocStore {
  write(doc: LevelDoc): void;
  writeVersionPayload(id: string, n: number, presets: VersionPreset[]): void;
  hasVersionPayload(id: string, n: number): boolean;
}

export interface ActionResult {
  status: number;
  body: Record<string, unknown>;
}

const ok = (body: Record<string, unknown> = {}): ActionResult => ({
  status: 200,
  body: { ok: true, ...body },
});
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ActionResult => ({
  status,
  body: { ok: false, error, ...extra },
});

/**
 * Store one snapshot's reading, measured in the browser.
 *
 * Live capture records a snapshot at a time and measures it client-side with
 * the same BS.1770 code the upload path runs on the server, so there's nothing
 * to gain from shipping the audio and re-deriving a number we already have. It
 * also sidesteps the failure mode of the multi-chord upload, where a missed or
 * doubled chord throws the whole preset out.
 *
 * measuredTrimDb is 0: a USB capture is a digital tap with no gain stage
 * between the Helix and the browser, so there is no trim to record.
 */
export function storeReading(
  store: LevelDocStore,
  doc: LevelDoc,
  preset: LevelPreset,
  body: { snapshotIndex?: number; lufs?: number; peakDbfs?: number }
): ActionResult {
  const snapshot = preset.snapshots.find((s) => s.index === body.snapshotIndex);
  if (!snapshot) return fail(404, "No snapshot at that index");
  if (typeof body.lufs !== "number" || !Number.isFinite(body.lufs)) {
    return fail(400, "lufs must be a finite number");
  }
  // A take that hit the converter's ceiling has had its peaks flattened, so it
  // measures *quieter* than the patch really is — and the plan would then push
  // it up, making the clipping worse. Refused here rather than warned about in
  // the waveform, because stopping the recorder saves on its own.
  if (typeof body.peakDbfs === "number" && body.peakDbfs >= -0.1) {
    return fail(
      400,
      `That take clipped (peak ${body.peakDbfs.toFixed(1)} dBFS). A clipped chord measures quieter than it is, so the reading would be wrong. Bring the preset's own level down inside the path and record it again — the baseline is stored with each reading, so only this preset needs redoing.`
    );
  }

  snapshot.measuredLufs = Number(body.lufs.toFixed(2));
  snapshot.measuredTrimDb = 0;
  // Stamp the level this take went through, so it stays interpretable after
  // another version is loaded — and so re-recording one preset doesn't
  // invalidate the readings taken through the file that was loaded before it.
  snapshot.measuredBaselineDb = baselineInForce(doc, preset, snapshot.index);
  snapshot.measuredAt = new Date().toISOString();
  store.write(doc);

  const all = doc.presets.flatMap((p) => p.snapshots);
  return ok({
    name: preset.name,
    snapshot: { index: snapshot.index, name: snapshot.name, lufs: snapshot.measuredLufs },
    measured: all.filter((s) => s.measuredLufs !== null).length,
    total: all.length,
  });
}

/**
 * Measure one uploaded recording containing every snapshot of a preset in turn.
 *
 * One file per preset rather than one long take: the expected snapshot count is
 * known and small, so a missed or doubled chord is caught on the file that
 * caused it instead of shifting every later preset onto the wrong reading.
 */
export async function storeUpload(
  store: LevelDocStore,
  doc: LevelDoc,
  preset: LevelPreset,
  file: File,
  measureSec: number
): Promise<ActionResult> {
  let segments;
  try {
    segments = splitAndMeasure(Buffer.from(await file.arrayBuffer()), {
      expected: preset.snapshots.length,
      measureSec,
    });
  } catch (err) {
    return fail(400, err instanceof Error ? err.message : "Could not read that recording");
  }

  const clipped = segments.filter((s) => s.clipped);
  if (segments.length !== preset.snapshots.length || clipped.length > 0) {
    return {
      status: 200,
      body: {
        ok: false,
        stored: false,
        expected: preset.snapshots.length,
        found: segments.length,
        segments,
        error:
          clipped.length > 0
            ? `${clipped.length} chord(s) clipped at 0 dBFS — a clipped chord measures quieter than it really is.`
            : `Found ${segments.length} chords but "${preset.name}" has ${preset.snapshots.length} snapshots.`,
      },
    };
  }

  // Stamp the trim this take was made through. Unlike a USB capture, a file
  // recorded through an interface really was taken at some trim, and the plan
  // has to add it back to land the preset where the reading says it should.
  preset.snapshots = preset.snapshots.map((s, i) => ({
    ...s,
    measuredLufs: segments[i].lufs,
    measuredTrimDb: doc.levels.measurementTrimDb,
    measuredBaselineDb: baselineInForce(doc, preset, s.index),
    measuredAt: new Date().toISOString(),
  }));
  store.write(doc);

  return ok({
    stored: true,
    name: preset.name,
    snapshots: preset.snapshots.map((s, i) => ({
      index: s.index,
      name: s.name,
      role: s.role,
      lufs: s.measuredLufs,
      peakDbfs: segments[i].peakDbfs,
      crestDb: segments[i].crestDb,
      startSec: segments[i].startSec,
    })),
  });
}

/**
 * Take a preset's readings from wherever else they were made.
 *
 * Levelling a patch on its own and then using that in a gig is a better way
 * round than loading the whole gig back onto the Helix to re-record one song.
 * It is only sound because a reading carries its own baseline: measuredBaselineDb
 * says what level the take went through, so the number stays interpretable
 * outside the document it was recorded in.
 *
 * Two things make it unsafe, and both are checked. A gig that centres on its
 * own recordings has a reference averaged across them, so a reading from
 * anywhere else drags every other song — that is the pinned-target guard. And
 * the readings have to describe *this* patch, which the hash decides.
 *
 * Readings are copied, never gains. The gig applies its own role offsets to
 * them, so a solo levelled at +3 on its own still lands at the gig's +5.
 */
export function importReadings(
  store: LevelDocStore,
  doc: LevelDoc,
  preset: LevelPreset,
  source: LevelPreset,
  targetPinned: boolean
): ActionResult {
  if (!targetPinned) {
    return fail(
      409,
      "This setlist centres on its own recordings, so every reading has to come from the same pass — one taken elsewhere would move every other song. Pin a target level first, then each snapshot is levelled against that and its own recorded baseline, and where it was recorded stops mattering."
    );
  }
  // Compared by what the preset *is*, not by the bytes it was stored as: the
  // same patch re-serialised on its way through another app carries a
  // different hash while being the same preset.
  if (presetIdentity(source.hlx) !== presetIdentity(preset.hlx)) {
    return fail(409, "Those readings describe a different version of this preset.");
  }

  let taken = 0;
  // Readings already here that this would write over. The caller offers this
  // action on presets with nothing recorded, but a partly-recorded one is
  // reachable and replacing those without saying so is exactly the kind of
  // quiet substitution the rest of this app refuses to do.
  let replaced = 0;
  preset.snapshots = preset.snapshots.map((s) => {
    const from = source.snapshots.find((x) => x.index === s.index);
    if (!from || from.measuredLufs === null) return s;
    if (s.measuredLufs !== null) replaced++;
    taken++;
    // measuredAt comes across untouched, so a reading that is actually old
    // still counts as old to the staleness check.
    return {
      ...s,
      measuredLufs: from.measuredLufs,
      measuredTrimDb: from.measuredTrimDb,
      measuredBaselineDb: from.measuredBaselineDb,
      measuredAt: from.measuredAt,
    };
  });

  if (taken === 0) return fail(404, "There are no readings to take.");
  store.write(doc);

  const all = doc.presets.flatMap((p) => p.snapshots);
  return ok({
    taken,
    replaced,
    name: preset.name,
    measured: all.filter((s) => s.measuredLufs !== null).length,
    total: all.length,
  });
}

const ROLES: Role[] = ["clean", "rhythm", "chorus", "solo"];

/**
 * What each snapshot counts as.
 *
 * Roles are guessed from snapshot names, which is wrong often enough that this
 * has to be correctable: "OD Wah Wah" reads as neither rhythm nor solo, and a
 * preset's "Main" may well be its loudest sound. A hand-set role sticks across
 * re-pushes; a guessed one is re-derived.
 */
export function setRoles(
  store: LevelDocStore,
  doc: LevelDoc,
  preset: LevelPreset,
  roles: Record<string, string>
): ActionResult {
  preset.snapshots = preset.snapshots.map((s) => {
    const r = roles[String(s.index)];
    if (!r || !ROLES.includes(r as Role)) return s;
    return { ...s, role: r as Role, roleSource: "user" };
  });
  store.write(doc);
  return ok({ snapshots: preset.snapshots });
}

const LEVEL_KEYS = [
  "rhythmOffsetDb",
  "chorusOffsetDb",
  "soloOffsetDb",
  "measurementTrimDb",
] as const;

/**
 * The offsets every preset targets, and the trim the recordings were made
 * through. measurementTrimDb matters as much as the offsets: a recording made
 * through a uniformly quietened build measures that much lower, and the plan
 * has to add it back or everything lands short by exactly that amount.
 */
export function setLevels(
  store: LevelDocStore,
  doc: LevelDoc,
  body: Record<string, unknown>
): ActionResult {
  const next: LevelSettings = { ...doc.levels };
  for (const k of LEVEL_KEYS) if (typeof body[k] === "number") next[k] = body[k] as number;
  doc.levels = next;
  store.write(doc);
  return ok({ levels: next });
}

/**
 * Declare which version is on the Helix right now.
 *
 * The plan corrects a snapshot from where it *was* to where it should be, so it
 * needs the level that was in force during the take. That is the loaded file's
 * gain, not whatever sits in the stored preset — and once you've loaded a
 * levelled file those are different numbers. Reasoning from the wrong one
 * corrects an already-corrected level and the output is confidently wrong.
 *
 * Set automatically when you download a version. Settable by hand for the case
 * the app can't see: you loaded something from HX Edit instead.
 */
export function setLoaded(
  store: LevelDocStore,
  doc: LevelDoc,
  body: { version?: number | null; offsetDb?: number }
): ActionResult {
  const v = body.version;
  if (v !== null && v !== undefined) {
    if (!(doc.versions ?? []).some((x) => x.n === v)) return fail(404, `No version ${v}`);
  }

  doc.loadedVersion = v ?? null;
  // A confirmed version has its gains written in absolutely; an offset only
  // ever describes the original-presets file, so loading a version clears it.
  if (v !== null && v !== undefined) doc.loadedOffsetDb = 0;
  else if (typeof body.offsetDb === "number" && Number.isFinite(body.offsetDb)) {
    doc.loadedOffsetDb = body.offsetDb;
  }
  store.write(doc);
  return ok({ loadedVersion: doc.loadedVersion, loadedOffsetDb: doc.loadedOffsetDb ?? 0 });
}

/**
 * Clear every reading.
 *
 * All-or-nothing, because what invalidates readings is never one preset: it's
 * the rig moving underneath all of them — a new guitar, a firmware update, a
 * global setting nobody wrote down. Any of those makes every reading describe a
 * setup that no longer exists, so there is nothing to salvage selectively.
 *
 * Confirmed versions are untouched. They record the gains they shipped with and
 * stay downloadable — clearing the readings starts the next pass, it doesn't
 * retract the last one.
 */
export function clearReadings(store: LevelDocStore, doc: LevelDoc): ActionResult {
  let cleared = 0;
  for (const preset of doc.presets) {
    for (const s of preset.snapshots) {
      if (s.measuredLufs !== null) cleared++;
      s.measuredLufs = null;
      s.measuredTrimDb = null;
      s.measuredBaselineDb = null;
      s.measuredAt = null;
    }
  }
  store.write(doc);
  return ok({
    cleared,
    total: doc.presets.flatMap((p) => p.snapshots).length,
    versions: (doc.versions ?? []).length,
  });
}

/** Confirmed passes, newest first, each flagged with whether it still rebuilds. */
export function listVersions(store: LevelDocStore, doc: LevelDoc): ActionResult {
  const live = new Set(doc.presets.map((p) => p.hash));
  return ok({
    versions: [...(doc.versions ?? [])].reverse().map((v) => ({
      frozen: store.hasVersionPayload(doc.id, v.n),
      n: v.n,
      createdAt: v.createdAt,
      measuredFrom: v.measuredFrom,
      measuredTo: v.measuredTo,
      presets: v.presets.length,
      levels: v.levels,
      // A frozen version carries its own finished presets and always rebuilds.
      // Older ones apply their stored gains to whatever still holds the
      // matching hash, so replacing a preset takes them with it.
      rebuildable: store.hasVersionPayload(doc.id, v.n) || v.presets.every((p) => live.has(p.hash)),
      missing: store.hasVersionPayload(doc.id, v.n)
        ? []
        : v.presets.filter((p) => !live.has(p.hash)).map((p) => p.name),
    })),
  });
}

/**
 * Freeze the current plan as the next version.
 *
 * Downloads resolve to the newest confirmed version, so this is what makes a
 * levelling pass real — and what stops a file you already took to a gig from
 * quietly changing meaning the next time you record something.
 *
 * Requires a reading on every snapshot. A partial set doesn't produce a partial
 * answer: unmeasured snapshots fall back to the block level, so what you'd get
 * is a file that is levelled in places and untouched in others, with nothing on
 * the Helix to say which is which.
 */
export function confirmVersion(store: LevelDocStore, doc: LevelDoc): ActionResult {
  const all = doc.presets.flatMap((p) => p.snapshots);
  const unmeasured = all.filter((s) => s.measuredLufs === null);
  if (all.length === 0 || unmeasured.length > 0) {
    return fail(
      409,
      `${unmeasured.length} of ${all.length} snapshots still need recording. A version has to come from a complete set — anything unmeasured keeps the level it already had.`,
      { unmeasured: unmeasured.length, total: all.length }
    );
  }

  const stamps = all.map((s) => s.measuredAt).filter((d): d is string => Boolean(d)).sort();
  const gains = planGains(doc);
  const versions = doc.versions ?? [];

  const version: LevelVersion = {
    n: (versions[versions.length - 1]?.n ?? 0) + 1,
    createdAt: new Date().toISOString(),
    measuredFrom: stamps[0] ?? null,
    measuredTo: stamps[stamps.length - 1] ?? null,
    levels: { ...doc.levels },
    presets: doc.presets.map((p) => ({
      hash: p.hash,
      name: p.name,
      index: p.index,
      gains: gains.get(p.hash) ?? [],
      measuredLufs: p.snapshots.map((s) => s.measuredLufs),
    })),
  };

  // Freeze the finished presets so this pass survives its sources being
  // replaced later.
  store.writeVersionPayload(
    doc.id,
    version.n,
    applyPlanToPresets(doc).map((a) => ({
      index: a.preset.index,
      name: a.preset.name,
      hlx: a.hlx,
    }))
  );

  doc.versions = [...versions, version];
  store.write(doc);
  return ok({ version: { n: version.n, createdAt: version.createdAt } });
}
