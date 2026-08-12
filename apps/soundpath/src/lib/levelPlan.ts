/**
 * Turn measured loudness into a per-snapshot recommendation.
 *
 * Recommendations only — nothing is written to a preset here. Some corrections
 * come out large enough that applying them blind would be worse than leaving the
 * gig alone, so the plan says plainly what fits in the output block and what
 * doesn't rather than clamping and calling it aligned.
 */

import { type LevelDoc, type LevelPreset, type Role } from "./levelDoc";
import { readSettings } from "./settingsStore";

/** The Helix output block's Level runs from -120 dB to +12 dB. */
const MAX_OUTPUT_DB = 12;
const MIN_OUTPUT_DB = -60;

/**
 * The output level a take made *right now* would be recorded through: the
 * loaded version's gain for that snapshot, or the preset's own block gain when
 * nothing levelled is loaded.
 *
 * Stamped onto each reading as it is taken, so the reading stays interpretable
 * no matter what gets loaded afterwards.
 */
export function baselineInForce(
  doc: LevelDoc,
  preset: LevelPreset,
  snapshotIndex: number
): number {
  const version =
    doc.loadedVersion == null
      ? null
      : (doc.versions ?? []).find((v) => v.n === doc.loadedVersion) ?? null;
  const g = version?.presets
    .find((x) => x.hash === preset.hash)
    ?.gains.find((x) => x.index === snapshotIndex)?.outputGainDb;
  if (typeof g === "number") return g;
  // No version loaded: the presets' own levels, plus whatever offset you told
  // us the loaded file carries. Declared, never inferred — this is the number
  // the correction adds straight back, so guessing it wrong is a silent error
  // the size of the offset itself.
  return currentOutputGain(preset.hlx) + (doc.loadedOffsetDb ?? 0);
}

export function buildPlan(doc: LevelDoc) {
  const { levels } = doc;
  const offsetFor = (r: Role) =>
    r === "clean" ? 0 : r === "solo" ? levels.soloOffsetDb : r === "chorus" ? levels.chorusOffsetDb : levels.rhythmOffsetDb;

  const all = doc.presets.flatMap((p) => p.snapshots.map((s) => ({ p, s })));
  const measured = all.filter((x) => x.s.measuredLufs !== null);

  // The version on the pedal now. Only a fallback: what matters is the gain
  // each take was made through, which the reading itself records.
  const loadedVersion =
    doc.loadedVersion == null
      ? null
      : (doc.versions ?? []).find((v) => v.n === doc.loadedVersion) ?? null;

  /**
   * The level this snapshot's reading was taken through.
   *
   * Off the reading where it has one. Using the currently-loaded version for
   * every snapshot only works while all the readings came from one pass through
   * one file; re-record a single changed song and that assumption is false for
   * the rest of them, which would correct already-corrected levels.
   *
   * Readings from before this was stamped fall back to the loaded version, and
   * unmeasured snapshots to what a take now would see.
   */
  const baselineOf = (p: LevelPreset, index: number): number => {
    const stamped = p.snapshots.find((s) => s.index === index)?.measuredBaselineDb;
    if (typeof stamped === "number") return stamped;
    return baselineInForce(doc, p, index);
  };

  /**
   * Where the gig sits: the average of (measured − role offset), which is the
   * point that moves the fewest presets.
   *
   * Snapshots the output block can't reach are dropped from that average. A
   * take that needs +18 dB is going to sit 6 dB low whatever we do, and
   * letting it vote drags the reference toward a level nothing else should
   * follow — with two such snapshots out of 21 that was 0.5 dB on every other
   * preset, and it also stopped the measure-level-remeasure loop settling,
   * because the residual reappeared on each pass. Achievability depends on the
   * reference, so this settles it by iteration; two rounds is plenty for a
   * handful of outliers, and it always terminates.
   */
  const meanOf = (rows: typeof measured): number | null =>
    rows.length === 0
      ? null
      : Number(
          (
            rows.reduce((t, x) => t + (x.s.measuredLufs as number) - offsetFor(x.s.role), 0) /
            rows.length
          ).toFixed(2)
        );

  const settings = readSettings();

  /**
   * The highest target this gig can actually hit.
   *
   * Every snapshot has to fit under the output block's +12 dB ceiling:
   *   baseline + trim + (target + roleOffset − measured) ≤ MAX
   * so the quietest-measuring snapshot, relative to what its role demands, is
   * what caps the whole gig. Aim above that and it clamps; aim at exactly that
   * and it sits on the ceiling with nothing in hand, which is why the setting
   * keeps a few dB back.
   */
  const headroomFor = (limit: number) =>
    measured.length === 0
      ? null
      : Math.min(
          ...measured.map(
            (x) =>
              limit -
              baselineOf(x.p, x.s.index) -
              (x.s.measuredTrimDb ?? levels.measurementTrimDb) -
              offsetFor(x.s.role) +
              (x.s.measuredLufs as number)
          )
        );
  const maxTargetLufs = headroomFor(MAX_OUTPUT_DB);
  const recommendedTargetLufs =
    maxTargetLufs === null ? null : Number((maxTargetLufs - settings.headroomDb).toFixed(2));

  let reference = meanOf(measured);
  let counted = measured;
  for (let round = 0; round < 2 && reference !== null; round++) {
    const ref = reference;
    const reachable = measured.filter((x) => {
      const target = ref + offsetFor(x.s.role);
      const wanted =
        baselineOf(x.p, x.s.index) +
        (x.s.measuredTrimDb ?? levels.measurementTrimDb) +
        (target - (x.s.measuredLufs as number));
      return wanted >= MIN_OUTPUT_DB && wanted <= MAX_OUTPUT_DB;
    });
    // All of them out of range means the trim is wrong, not the takes; keep
    // the honest average rather than dividing by zero.
    if (reachable.length === 0 || reachable.length === counted.length) break;
    counted = reachable;
    reference = meanOf(reachable);
  }
  let excludedFromReference = measured.length - counted.length;

  // A global target overrides the gig's own centre. The iteration above only
  // exists to stop unreachable takes dragging an average; with a fixed number
  // there is no average to drag.
  if (settings.targetLufs !== null) {
    reference = settings.targetLufs;
    excludedFromReference = 0;
  }

  const presets = doc.presets.map((p) => {
    const outGain = currentOutputGain(p.hlx);
    // Per snapshot, not per preset: a levelled file writes an override on each
    // one, so snapshot 3 was recorded through its own level. Falls back to the
    // preset's block gain for anything the loaded version doesn't cover — a
    // preset added since, or the original upload.
    const loadedGains = loadedVersion?.presets.find((x) => x.hash === p.hash)?.gains;
    const baselineFor = (i: number): number => baselineOf(p, i);
    // A reading that stamped its own baseline is known regardless of what is
    // loaded now; only unstamped ones depend on the loaded version covering
    // this preset.
    const baselineKnown =
      Boolean(loadedGains) ||
      loadedVersion === null ||
      p.snapshots.every((s) => s.measuredLufs === null || typeof s.measuredBaselineDb === "number");
    const rows = p.snapshots.map((s) => {
      const m = s.measuredLufs;
      const target = reference === null ? null : Number((reference + offsetFor(s.role)).toFixed(2));
      const adjust = m === null || target === null ? null : Number((target - m).toFixed(2));
      // The take was made at (baseline + trim), so the level that lands this
      // snapshot on target is that same baseline plus the correction. Leaving
      // the trim out would offset every preset by however much the measurement
      // build was turned down; taking the baseline from the stored preset when
      // a levelled file was loaded corrects an already-corrected level.
      // Each reading carries the trim it was taken at; the document-level value
      // is only the default for readings made before that was recorded.
      const trim = s.measuredTrimDb ?? levels.measurementTrimDb;
      const baseline = baselineFor(s.index);
      const wanted = adjust === null ? null : Number((baseline + trim + adjust).toFixed(2));
      const capped =
        wanted === null ? null : Math.max(MIN_OUTPUT_DB, Math.min(MAX_OUTPUT_DB, wanted));
      const shortfall = wanted === null || capped === null ? 0 : Number((wanted - capped).toFixed(2));
      return {
        index: s.index,
        name: s.name,
        nameSource: s.nameSource,
        role: s.role,
        roleSource: s.roleSource,
        measuredLufs: m,
        measuredTrimDb: s.measuredTrimDb,
        measuredAt: s.measuredAt ?? null,
        targetLufs: target,
        adjustDb: adjust,
        outputGainDb: capped,
        /** Non-zero means the output block can't go far enough. */
        shortfallDb: shortfall,
        achievable: shortfall === 0,
      };
    });
    // Where this preset sits relative to the gig, before any correction: the
    // mean of (measured − role offset) against the reference. Zero means it is
    // already in the right place; the bar reads off this.
    const known = rows.filter((r) => r.measuredLufs !== null);
    const offsetFromReferenceDb =
      known.length === 0 || reference === null
        ? null
        : Number(
            (
              known.reduce((t, r) => t + (r.measuredLufs as number) - offsetFor(r.role), 0) /
                known.length -
              reference
            ).toFixed(2)
          );

    return {
      index: p.index,
      name: p.name,
      nameSource: p.nameSource,
      hash: p.hash,
      /**
       * Changed, and that change hasn't reached a confirmed version yet.
       *
       * The bare "changed" flag stays true until a full re-record, which makes
       * it useless as a to-do marker: it goes on saying so long after you've
       * dealt with it. Once a version carries this preset's hash, the change is
       * captured and there is nothing left to act on.
       */
      changedPending:
        (doc.changedPresets ?? []).includes(p.name) &&
        !(doc.versions ?? []).some((v) => v.presets.some((x) => x.hash === p.hash)),
      offsetFromReferenceDb,
      measured: rows.every((r) => r.measuredLufs !== null),
      currentOutputGainDb: outGain,
      /** What the takes were made through — the loaded version's gains, or the preset's own. */
      baselineGainDb: rows.map((r) => baselineFor(r.index)),
      /** False when the loaded version has no entry for this preset, so the baseline is a guess. */
      baselineKnown,
      snapshots: rows,
    };
  });

  // What trims the existing readings were actually taken through. More than one
  // is legal — each reading carries its own — but it's worth showing, because a
  // stale value in the stepper used to be invisible and shifted everything.
  const trims = [...new Set(measured.map((x) => x.s.measuredTrimDb ?? levels.measurementTrimDb))].sort(
    (a, b) => a - b
  );

  return {
    name: doc.name,
    levels,
    loadedVersion: doc.loadedVersion ?? null,
    /** Null when each gig centres on itself; a number when it's pinned. */
    targetLufs: settings.targetLufs,
    headroomDb: settings.headroomDb,
    /** How far down the original-presets download is, so takes don't clip going in. */
    recordOffsetDb: settings.recordOffsetDb,
    /** The offset the loaded file actually carries — what the maths uses. */
    loadedOffsetDb: doc.loadedOffsetDb ?? 0,
    /** The most this gig can take before something hits the ceiling. */
    maxTargetLufs: maxTargetLufs === null ? null : Number(maxTargetLufs.toFixed(2)),
    recommendedTargetLufs,
    changedPresets: doc.changedPresets ?? [],
    /**
     * Readings taken before the presets last changed.
     *
     * Not simply "some songs are unmeasured" — that shows in the count. This
     * is the part that doesn't: the songs that *are* measured were measured in
     * an earlier pass, and the reference averages them together with anything
     * recorded now.
     */
    staleReadings: doc.presetsChangedAt
      ? measured.filter((x) => (x.s.measuredAt ?? "") < doc.presetsChangedAt!).length
      : 0,
    /** Snapshots left out of the reference because the block can't reach them. */
    excludedFromReference,
    /**
     * Whether confirming now would produce a different file from the last one.
     *
     * Not a reason to stop you — a version also records when a pass happened
     * and which readings it came from, and freezing one after re-recording
     * everything is worth doing even if the gains land in the same place. It
     * is worth saying, though, so pressing it is a choice rather than a
     * surprise.
     */
    sameAsLastVersion: (() => {
      const last = (doc.versions ?? [])[(doc.versions ?? []).length - 1];
      if (!last || measured.length === 0) return false;
      const wanted = new Map(
        presets.map((p) => [p.hash, p.snapshots.map((s) => s.outputGainDb)])
      );
      if (last.presets.length !== presets.length) return false;
      return last.presets.every((p) => {
        const now = wanted.get(p.hash);
        if (!now) return false;
        const then = p.gains.map((g) => g.outputGainDb);
        return now.length === then.length && now.every((v, i) => v === then[i]);
      });
    })(),
    measuredTrims: trims,
    referenceLufs: reference,
    measuredCount: measured.length,
    totalCount: all.length,
    complete: measured.length === all.length && all.length > 0,
    unachievable: presets.flatMap((p) =>
      p.snapshots.filter((s) => !s.achievable).map((s) => ({ preset: p.name, snapshot: s.name, shortfallDb: s.shortfallDb }))
    ),
    presets,
  };
}

/** Level on the path that actually reaches the jacks. */
function currentOutputGain(hlx: string): number {
  try {
    const tone = (JSON.parse(hlx) as { data?: { tone?: Record<string, unknown> } })?.data?.tone;
    if (!tone) return 0;
    const a = (tone.dsp0 as { outputA?: Record<string, unknown> } | undefined)?.outputA;
    // @output 2 means path 1 feeds path 2, so path 2 ends the chain.
    const dsp = a?.["@output"] === 2 ? "dsp1" : "dsp0";
    const out = (tone[dsp] as { outputA?: { gain?: number } } | undefined)?.outputA;
    return typeof out?.gain === "number" ? out.gain : 0;
  } catch {
    return 0;
  }
}

