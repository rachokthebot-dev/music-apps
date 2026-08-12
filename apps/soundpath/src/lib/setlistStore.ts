/**
 * Setlist bookkeeping.
 *
 * A gig is a dozen presets that all need to sit at sensible levels relative to
 * each other. This stores the whole list so it can be listed, recorded against,
 * and levelled as one. The document shape and the parsing live in levelDoc —
 * a single preset is the same thing with one entry, and the maths must not fork.
 *
 *   setlists/<id>.json   — { id, name, levels, presets: [...] }
 *
 * Keyed by id so the Setlists app can hand over a specific gig and get that
 * gig's levelled .hls back. A single global slot meant the download button on
 * one setlist could hand you a different one's file.
 *
 * There is deliberately no "current setlist": every read needs an explicit id.
 * A remembered one meant opening SoundPath dropped you into whichever gig you
 * last touched, which is exactly the stale state that makes it easy to record
 * against the wrong list.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { PRESET_DIR } from "./masterStore";
import {
  buildPreset,
  DEFAULT_LEVELS,
  docStore,
  safeId,
  userNamesByHash,
  userRolesByHash,
  type LevelDoc,
  type LevelPreset,
} from "./levelDoc";

export {
  DEFAULT_LEVELS,
  buildPreset,
  distinctTones,
  hashPreset,
  snapshotsFrom,
  tonePeers,
} from "./levelDoc";
export type {
  LevelSettings,
  Role,
  SnapshotState,
  VersionPreset,
} from "./levelDoc";

/** The gig's own names for the shared document parts. */
export type SetlistPreset = LevelPreset;
export type StoredSetlist = LevelDoc;

const store = docStore<StoredSetlist>("setlists");

/** Legacy id, from when a hand-uploaded .hls had nowhere else to go. */
export const LOCAL_ID = "local";

/**
 * Id for a session that came from nowhere but an uploaded file. Fresh every
 * time, so uploading a second .hls doesn't overwrite the recordings attached to
 * the first.
 */
export function newSetlistId(): string {
  return `hls-${randomUUID().slice(0, 8)}`;
}

export interface SetlistSummary {
  id: string;
  name: string;
  presets: number;
  /** Snapshots with a reading, out of the total — how far along the gig is. */
  measured: number;
  snapshots: number;
  /** File mtime — every upload, reading and role change rewrites the file. */
  updatedAt: string | null;
}

export function listSetlists(): SetlistSummary[] {
  return allStored()
    .map((d) => {
      const snaps = d.presets.flatMap((p) => p.snapshots);
      return {
        id: d.id,
        name: d.name,
        presets: d.presets.length,
        measured: snaps.filter((s) => s.measuredLufs !== null).length,
        snapshots: snaps.length,
        updatedAt: store.modifiedAt(d.id),
      };
    })
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

/** Every stored setlist — the library listing, and role reuse across gigs. */
function allStored(): StoredSetlist[] {
  migrateLegacy();
  return store.all();
}

/** Earlier versions kept one global setlist.json; fold it in rather than lose it. */
function migrateLegacy(): void {
  const legacy = join(PRESET_DIR, "setlist.json");
  if (!existsSync(legacy)) return;
  try {
    const old = JSON.parse(readFileSync(legacy, "utf-8")) as StoredSetlist;
    old.id ??= LOCAL_ID;
    mkdirSync(store.DIR, { recursive: true });
    const path = join(store.DIR, `${safeId(old.id)}.json`);
    if (!existsSync(path)) writeFileSync(path, JSON.stringify(old), "utf-8");
    rmSync(legacy);
  } catch {
    // A corrupt legacy file shouldn't block the new store.
  }
}

export interface StoredPresetSummary {
  hash: string;
  name: string;
  snapshots: number;
  measured: number;
  /** Gigs this patch appears in — empty is possible once presets outlive one. */
  setlists: string[];
  /** Newest write among those gigs; a patch has no file of its own. */
  updatedAt: string | null;
  /**
   * The last of this patch's own readings, and when it arrived.
   *
   * Both are facts about the patch. `updatedAt` is not — it is the setlist
   * file's mtime, shared by every preset in the gig and moved by touching any
   * of them, which made eight rows all claim to have changed at once.
   */
  measuredAt: string | null;
  addedAt: string | null;
}

/**
 * Every distinct preset stored here, deduped by hash.
 *
 * The hash *is* the preset, so the same patch used in three gigs is one entry
 * carrying one set of readings — which is why swapping a song costs you only
 * that song's recording.
 */
export function listStoredPresets(): StoredPresetSummary[] {
  const byHash = new Map<string, StoredPresetSummary>();
  const lastReading = (p: SetlistPreset): string | null =>
    p.snapshots
      .map((s) => s.measuredAt)
      .filter((d): d is string => Boolean(d))
      .sort()
      .pop() ?? null;

  for (const list of allStored()) {
    const touched = store.modifiedAt(list.id);
    for (const p of list.presets) {
      const seen = byHash.get(p.hash);
      if (seen) {
        if (!seen.setlists.includes(list.name)) seen.setlists.push(list.name);
        if ((touched ?? "") > (seen.updatedAt ?? "")) seen.updatedAt = touched;
        const m = lastReading(p);
        if ((m ?? "") > (seen.measuredAt ?? "")) seen.measuredAt = m;
        if ((p.addedAt ?? "") > (seen.addedAt ?? "")) seen.addedAt = p.addedAt ?? null;
        continue;
      }
      byHash.set(p.hash, {
        hash: p.hash,
        name: p.name,
        snapshots: p.snapshots.length,
        measured: p.snapshots.filter((s) => s.measuredLufs !== null).length,
        setlists: [list.name],
        updatedAt: touched,
        measuredAt: lastReading(p),
        addedAt: p.addedAt ?? null,
      });
    }
  }
  // Sorted by what actually happened to each patch, newest first, falling back
  // to the gig's write time for anything with neither.
  const rank = (p: StoredPresetSummary) => p.measuredAt ?? p.addedAt ?? p.updatedAt ?? "";
  return [...byHash.values()].sort((a, b) => rank(b).localeCompare(rank(a)));
}

export function findPresetByHash(hash: string): SetlistPreset | null {
  for (const list of allStored()) {
    const hit = list.presets.find((p) => p.hash === hash);
    if (hit) return hit;
  }
  return null;
}

/** No id means no setlist — never the last one you happened to open. */
export function readSetlist(id: string | null | undefined): StoredSetlist | null {
  migrateLegacy();
  return store.read(id);
}

/** The store itself, for the shared actions in levelActions. */
export const setlistDocs = store;

export const writeSetlist = store.write;
export const clearSetlist = store.remove;
export const writeVersionPayload = store.writeVersionPayload;
export const readVersionPayload = store.readVersionPayload;
export const hasVersionPayload = store.hasVersionPayload;

/**
 * Unpack a Helix setlist file.
 *
 * The container is { schema: "L6Setlist", encoding: "Base64", encoded_data },
 * where encoded_data is base64 of a zlib-compressed JSON payload holding 128
 * slots. Populated slots are a .hlx file's `data` object; unused ones are `{}`.
 */
export function parseHlsFile(raw: string, id: string): StoredSetlist {
  const outer = JSON.parse(raw) as {
    schema?: string;
    encoded_data?: string;
    meta?: { name?: string };
  };

  if (outer?.schema !== "L6Setlist") {
    throw new Error("Not a Helix setlist (.hls) file");
  }
  if (typeof outer.encoded_data !== "string") {
    throw new Error("Setlist file has no encoded_data");
  }

  const inner = JSON.parse(
    inflateSync(Buffer.from(outer.encoded_data, "base64")).toString("utf-8")
  ) as { meta?: { name?: string }; presets?: unknown[] };

  const slots = Array.isArray(inner.presets) ? inner.presets : [];
  const presets: SetlistPreset[] = [];

  slots.forEach((slot, i) => {
    // `{}` means an unused Helix slot — skip rather than creating a blank entry.
    if (!slot || typeof slot !== "object" || Object.keys(slot).length === 0) return;
    const data = slot as { meta?: { name?: string } };
    // Wrap back into the .hlx shape the estimator and slot loader expect.
    const hlx = JSON.stringify({ schema: "L6Preset", version: 6, meta: {}, data: slot });
    presets.push(buildPreset(i, String(data.meta?.name ?? `Preset ${i + 1}`), hlx));
  });

  return {
    id,
    name: String(inner.meta?.name ?? outer.meta?.name ?? "Setlist"),
    levels: { ...DEFAULT_LEVELS },
    presets,
  };
}

/**
 * Carry measurements and hand-set roles across a re-push.
 *
 * Keyed on the preset hash: swap a preset for a different one and its readings
 * are gone, because they describe a patch that is no longer there. Reorder or
 * rename the setlist and everything survives.
 */
export function mergeMeasurements(next: SetlistPreset[], prev: StoredSetlist | null): SetlistPreset[] {
  // Roles carry across gigs — and in from the preset leveller: naming a
  // snapshot "solo" is a labelling decision about the patch, and it stays true
  // wherever the patch turns up.
  allStored(); // migrate any legacy file before the role scan reads the folder
  const rolesByHash = userRolesByHash();
  // Hand-typed names carry the same way, and for the same reason. Without
  // this, fixing a name while recording would last until the Setlists app
  // next touched the gig — which is the moment you're least watching for it.
  const namesByHash = userNamesByHash();

  // Readings do not. Levelling a gig means recording every snapshot in one
  // sitting on unchanged hardware, so a number from another setlist — taken on
  // a different day, possibly a different guitar, possibly a different global
  // setting the hash cannot see — is exactly the stale input that rule exists
  // to exclude. Only the same setlist's own previous readings survive a
  // re-push, which is what makes editing one song in the Setlists app cheap.
  const readingsByHash = new Map<string, SetlistPreset>();
  if (prev) for (const p of prev.presets) readingsByHash.set(p.hash, p);

  return next.map((p) => {
    const roles = rolesByHash.get(p.hash);
    const names = namesByHash.get(p.hash);
    const readSrc = readingsByHash.get(p.hash);
    if (!roles && !names && !readSrc) return p;
    return {
      ...p,
      name: names?.preset ?? p.name,
      nameSource: names?.preset ? ("user" as const) : p.nameSource,
      snapshots: p.snapshots.map((s) => {
        const m = readSrc?.snapshots?.find((x) => x.index === s.index);
        const known = roles?.get(s.index);
        const typed = names?.snapshots.get(s.index);
        return {
          ...s,
          measuredLufs: m?.measuredLufs ?? null,
          measuredTrimDb: m?.measuredTrimDb ?? null,
          measuredBaselineDb: m?.measuredBaselineDb ?? null,
          measuredAt: m?.measuredAt ?? null,
          name: typed ?? s.name,
          nameSource: typed ? ("user" as const) : s.nameSource,
          role: known ?? s.role,
          roleSource: known ? "user" : s.roleSource,
        };
      }),
    };
  });
}
