/**
 * Levelling one preset on its own.
 *
 * Same document, same maths, same recording flow as a gig — see levelDoc — but
 * scoped to a single patch, for the case that has nothing to do with a setlist:
 * a preset that arrived from HelAIx, or one you generated, that needs to sit at
 * the same level as everything else you own.
 *
 * This only means anything because the target is global. A gig can centre on
 * its own recordings; one preset has no centre of its own to find, so it is
 * levelled against the pinned target in settings and its own recorded baseline.
 *
 *   leveling/<hash>.json          — the session
 *   leveling/versions/<hash>.vN.json — each confirmed pass, frozen
 *
 * Keyed by the preset's hash, not a session id: the readings describe a patch,
 * so the same patch reopened is the same session, and a patch edited elsewhere
 * is a different one that starts empty. That is the same rule the setlist store
 * uses to decide which readings survive a re-push.
 */

import {
  buildPreset,
  DEFAULT_LEVELS,
  docStore,
  hashPreset,
  presetIdentity,
  presetNameOf,
  userRolesByHash,
  type LevelDoc,
} from "./levelDoc";

export type PresetLevelDoc = LevelDoc;

const store = docStore<PresetLevelDoc>("leveling");

/** The store itself, for the shared actions in levelActions. */
export const presetDocs = store;

export const readPresetLevel = store.read;
export const writePresetLevel = store.write;
export const clearPresetLevel = store.remove;
export const writeVersionPayload = store.writeVersionPayload;
export const readVersionPayload = store.readVersionPayload;
export const hasVersionPayload = store.hasVersionPayload;

/**
 * Open the session for a preset, creating it the first time.
 *
 * Never overwrites: reopening a patch you have already recorded gets those
 * readings back, which is the whole point of keying on the hash. A patch whose
 * bytes changed hashes differently and starts clean, because its readings
 * measured a preset that no longer exists.
 */
export function openPresetLevel(hlx: string, name?: string): PresetLevelDoc {
  const id = hashPreset(hlx);
  // By what the preset is, not the bytes it arrived as. The same patch reaches
  // here written two ways — raw from the file, and re-serialised on its way
  // through the Setlists app — and keying on the bytes meant opening it from
  // the library made a second, empty session beside the one you had already
  // recorded into.
  const existing = findSessionFor(hlx);
  if (existing) return existing;

  const label = name?.trim() || presetNameOf(hlx);
  const preset = buildPreset(0, label, hlx);

  // A role you set by hand in a gig describes this patch, not that gig, so it
  // comes with it. Without this, a snapshot named something the guesser can't
  // read — "WET", "OD Wah Wah" — silently reverts to the rhythm default here
  // and targets 1.5 dB off where the same snapshot targets in the setlist.
  const known = userRolesByHash().get(id);
  if (known) {
    preset.snapshots = preset.snapshots.map((s) =>
      known.has(s.index) ? { ...s, role: known.get(s.index)!, roleSource: "user" as const } : s
    );
  }

  const doc: PresetLevelDoc = {
    id,
    name: label,
    levels: { ...DEFAULT_LEVELS },
    presets: [preset],
  };
  store.write(doc);
  return doc;
}

/**
 * The session describing this patch, however its bytes happen to be arranged.
 *
 * Keyed lookup by hash is the fast path and covers the normal case. The scan
 * behind it is for the copy that came a different way round — the same patch
 * re-serialised on its way through another app hashes differently while being
 * the same preset in every way that matters.
 */
export function findSessionFor(hlx: string): PresetLevelDoc | null {
  const direct = store.read(hashPreset(hlx));
  if (direct) return direct;
  const id = presetIdentity(hlx);
  return store.all().find((d) => d.presets.some((p) => presetIdentity(p.hlx) === id)) ?? null;
}

export interface PresetLevelSummary {
  id: string;
  name: string;
  measured: number;
  snapshots: number;
  versions: number;
  updatedAt: string | null;
}

export function listPresetLevels(): PresetLevelSummary[] {
  return store
    .all()
    .map((d) => {
      const snaps = d.presets.flatMap((p) => p.snapshots);
      return {
        id: d.id,
        name: d.name,
        measured: snaps.filter((s) => s.measuredLufs !== null).length,
        snapshots: snaps.length,
        versions: (d.versions ?? []).length,
        updatedAt: store.modifiedAt(d.id),
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
