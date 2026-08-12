/**
 * What levelling operates on, and where it is kept.
 *
 * A gig and a single preset are the same problem at different sizes: some
 * presets, their snapshots, the role each snapshot plays, a reading per
 * snapshot, and a record of what was on the Helix when those readings were
 * taken. Everything downstream — the plan, the corrections, the versions —
 * reads that shape and nothing else, so it lives here rather than inside the
 * setlist store it grew up in.
 *
 * There are two stores over this one document type, deliberately: a gig is a
 * thing you assemble and a preset is a thing you own, and mixing them meant one
 * listing that had to explain which rows were which. `docStore` is the part
 * they share.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PRESET_DIR } from "./masterStore";

export type Role = "clean" | "rhythm" | "chorus" | "solo";

export interface SnapshotState {
  index: number;
  name: string;
  /**
   * Set when the name was typed here rather than read out of the preset.
   *
   * A hand-typed name sticks across re-pushes and is written into the exported
   * file; a name that came from the payload is re-derived each time, so
   * fixing it in the Setlists app isn't fought over. Absent means derived —
   * the same shape as roleSource, and for the same reason.
   */
  nameSource?: "user";
  role: Role;
  /** Where the role came from, so a guess can be flagged as one. */
  roleSource: "name" | "default" | "user";
  /** Integrated LUFS from a real recording, null until one is uploaded. */
  measuredLufs: number | null;
  /**
   * The uniform trim that recording was made through. Still per reading, for
   * files recorded through an interface where the trim is a real variable. A
   * USB capture has none — the tap is digital, with no gain stage between the
   * Helix and the browser — so those record 0.
   */
  measuredTrimDb: number | null;
  /**
   * The output-block level in force when this take was made.
   *
   * A reading only means something next to the gain that produced it: a
   * correction moves a snapshot from where it *was* to where it should be, and
   * "where it was" is this number. It belongs on the reading rather than the
   * document for the same reason the trim does — the moment two readings come
   * from different passes, one document-wide value describes neither.
   *
   * This is what makes re-recording a single changed preset safe: the older
   * readings carry the baseline they were taken through and stay correct, while
   * the new one is taken through whatever is loaded today.
   *
   * null on readings taken before this was recorded; the plan falls back to the
   * loaded version's gains for those.
   */
  measuredBaselineDb: number | null;
  /** When it was taken. */
  measuredAt: string | null;
}

export interface LevelPreset {
  /** Position in the document — for a setlist, also its Helix slot. */
  index: number;
  name: string;
  /** Set when the name was typed here. See SnapshotState.nameSource. */
  nameSource?: "user";
  /** The .hlx JSON, as stored in a preset file. */
  hlx: string;
  /**
   * Hash of the preset payload. Readings are keyed to it, so replacing a preset
   * drops its reading automatically while reordering or renaming keeps
   * everything. It is also what a version matches against when rebuilding.
   */
  hash: string;
  snapshots: SnapshotState[];
  /** Which song in the Setlists app this came from, for writing roles back. */
  songId?: string;
  /**
   * When this patch arrived — the closest thing to "when was it last changed".
   *
   * The hash *is* the patch, so a different patch is a different entry and this
   * is the moment it appeared. Absent on anything stored before this was
   * recorded, which is why every reader treats it as optional rather than
   * inventing a date.
   */
  addedAt?: string;
}

export interface LevelSettings {
  /** dB above the clean reference for each role. Clean is the origin. */
  rhythmOffsetDb: number;
  chorusOffsetDb: number;
  soloOffsetDb: number;
  /**
   * Uniform trim the recordings were made through. Every file must share it —
   * mixing trims silently puts presets on different scales.
   */
  measurementTrimDb: number;
}

export const DEFAULT_LEVELS: LevelSettings = {
  rhythmOffsetDb: 1.5,
  chorusOffsetDb: 1.5,
  soloOffsetDb: 3.0,
  measurementTrimDb: 0,
};

/**
 * A confirmed levelling pass.
 *
 * Until versions existed the file was recomputed from whatever the readings
 * happened to be at the moment you pressed download, so a file you took to a
 * gig could not be reproduced afterwards — re-record one preset and every later
 * download quietly meant something else. A version freezes the gains, names
 * itself in the file so the Helix shows which pass is loaded, and keeps enough
 * to rebuild the same file later.
 */
export interface LevelVersion {
  /** 1-based and monotonic. Appears in the file's name and the filename. */
  n: number;
  createdAt: string;
  /** What the readings were, in time, so a stale pass is visible. */
  measuredFrom: string | null;
  measuredTo: string | null;
  levels: LevelSettings;
  presets: Array<{
    hash: string;
    name: string;
    index: number;
    /** Snapshot index → output level written, dB. null where unmeasured. */
    gains: Array<{ index: number; outputGainDb: number | null }>;
    /** The readings it came from, so you can see why the gains are what they are. */
    measuredLufs: Array<number | null>;
  }>;
}

/**
 * Everything the plan needs. A setlist is this plus gig-specific bookkeeping;
 * a preset session is this with exactly one entry in `presets`.
 */
export interface LevelDoc {
  id: string;
  name: string;
  levels: LevelSettings;
  presets: LevelPreset[];
  /** Oldest first. Absent on documents stored before versioning. */
  versions?: LevelVersion[];
  /**
   * Which version is currently loaded on the Helix, or null for the presets as
   * they were uploaded.
   *
   * A reading is only meaningful next to the gain that produced it. Correcting
   * a snapshot means moving it from where it *was* to where it should be, so
   * the plan needs the level that was actually in force during the take — and
   * once you've loaded a levelled file, that is that file's gain, not the one
   * sitting in the stored preset. Getting this wrong applies a correction on
   * top of a correction, silently, with entirely plausible numbers.
   */
  loadedVersion?: number | null;
  /**
   * The record offset baked into the file on the Helix, in dB.
   *
   * Captured when you say so, not read from the live setting: the setting
   * shapes the *next* download, while this describes the file already loaded.
   * Reading the setting instead meant nudging the stepper silently
   * re-interpreted every take that hadn't been stamped yet, and loading a true
   * original — from HX Edit, or from before the offset existed — was corrected
   * by an offset that was never in it.
   */
  loadedOffsetDb?: number | null;
  /**
   * When the presets last changed under an existing document, and which ones.
   *
   * Replacing a preset drops its own readings, which is visible. What isn't is
   * that every *other* reading now predates the change. Whether that matters
   * depends on the reference: averaged across a gig, one fresh reading moves
   * every other preset's target; pinned to a global target, each snapshot is
   * corrected against that number and its own recorded baseline, so recording
   * only what changed is the right thing to do.
   */
  presetsChangedAt?: string | null;
  changedPresets?: string[];
}

/** One preset as a version froze it — already levelled, ready to ship. */
export interface VersionPreset {
  index: number;
  name: string;
  hlx: string;
}

export function hashPreset(hlx: string): string {
  return createHash("sha1").update(hlx).digest("hex").slice(0, 16);
}

/**
 * What a preset *is*, regardless of how it was written down.
 *
 * hashPreset digests the raw bytes, which makes it sensitive to key order —
 * and key order changes on the way through. A patch pushed over from the
 * Setlists app is re-serialised by JSON.stringify; the same patch handed over
 * as a file is not. Identical tone, identical metadata, different hash, and so
 * two entries the app treats as unrelated presets.
 *
 * This digests the meaning instead: keys sorted, recursively. Used where two
 * copies of a patch have to be recognised as the same one — matching a
 * levelling session to a gig's preset, for instance — while hashPreset stays
 * as the stored identity, because changing that would re-key every setlist on
 * disk and drop every reading with it.
 */
export function presetIdentity(hlx: string): string {
  let parsed: unknown;
  try {
    parsed = (JSON.parse(hlx) as { data?: unknown }).data;
  } catch {
    return hashPreset(hlx);
  }
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, canonical(val)])
      );
    }
    return v;
  };
  return createHash("sha1").update(JSON.stringify(canonical(parsed))).digest("hex").slice(0, 16);
}

/** Ids end up in a filename, so keep them to something safe. */
export function safeId(id: string): string {
  return id.replace(/[^\w.-]/g, "_").slice(0, 64);
}

/**
 * A directory of level documents, plus the frozen payload of each version.
 *
 * Version payloads live in a subdirectory rather than beside the documents:
 * anything that enumerates a store reads whatever .json it finds and expects a
 * document, so a payload — a bare array of presets — sitting alongside made
 * every listing throw. A subdirectory can't be mistaken for one.
 */
export function docStore<T extends LevelDoc>(dirName: string) {
  const DIR = join(PRESET_DIR, dirName);
  const VERSION_DIR = join(DIR, "versions");
  const pathFor = (id: string) => join(DIR, `${safeId(id)}.json`);
  const versionPath = (id: string, n: number) => join(VERSION_DIR, `${safeId(id)}.v${n}.json`);

  return {
    DIR,
    pathFor,

    read(id: string | null | undefined): T | null {
      if (!id) return null;
      try {
        return JSON.parse(readFileSync(pathFor(id), "utf-8")) as T;
      } catch {
        return null;
      }
    },

    write(doc: T): void {
      mkdirSync(DIR, { recursive: true });
      writeFileSync(pathFor(doc.id), JSON.stringify(doc), "utf-8");
    },

    remove(id: string | null | undefined): void {
      if (!id) return;
      if (existsSync(pathFor(id))) rmSync(pathFor(id));
      // Take the frozen payloads with it, or they'd outlive the document.
      if (existsSync(VERSION_DIR)) {
        const prefix = `${safeId(id)}.v`;
        for (const f of readdirSync(VERSION_DIR)) {
          if (f.startsWith(prefix) && f.endsWith(".json")) rmSync(join(VERSION_DIR, f));
        }
      }
    },

    /** File mtime — every reading, role change and upload rewrites the file. */
    modifiedAt(id: string): string | null {
      try {
        return statSync(pathFor(id)).mtime.toISOString();
      } catch {
        return null;
      }
    },

    all(): T[] {
      if (!existsSync(DIR)) return [];
      return readdirSync(DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          try {
            return JSON.parse(readFileSync(join(DIR, f), "utf-8")) as T;
          } catch {
            return null;
          }
        })
        // Shape check, not just non-null: one stray file of the wrong shape
        // used to take down every caller with "presets is not iterable".
        .filter((x): x is T => Boolean(x) && Array.isArray((x as T).presets));
    },

    /**
     * Freeze a version's finished presets alongside it.
     *
     * Storing only the gains made a version a diff against the live presets, so
     * replacing one quietly took every earlier version down with it. A
     * levelling pass you already played a gig on shouldn't stop existing
     * because you changed something afterwards.
     *
     * Separate file rather than inside the document: the document is read on
     * every request, and 95 KB of preset payload per version would be parsed
     * each time for something only a download needs.
     */
    writeVersionPayload(id: string, n: number, presets: VersionPreset[]): void {
      mkdirSync(VERSION_DIR, { recursive: true });
      writeFileSync(versionPath(id, n), JSON.stringify(presets));
    },

    readVersionPayload(id: string, n: number): VersionPreset[] | null {
      try {
        return JSON.parse(readFileSync(versionPath(id, n), "utf-8")) as VersionPreset[];
      } catch {
        return null;
      }
    },

    /** Versions confirmed before payloads existed have none, and fall back. */
    hasVersionPayload(id: string, n: number): boolean {
      return existsSync(versionPath(id, n));
    },
  };
}

// Names that say what a snapshot is. "Lead" is as common as "Solo", and
// "Crunch"/"Verse" mean rhythm in practice.
const ROLE_WORDS: Array<[RegExp, Role]> = [
  [/\b(clean|jazz)\b/i, "clean"],
  [/\b(solo|lead)\b/i, "solo"],
  [/\b(chorus|refrain)\b/i, "chorus"],
  [/\b(rhythm|rhy|crunch|verse|heavy|drive|main|base|basic)\b/i, "rhythm"],
];

function roleFromName(name: string): Role | null {
  for (const [re, role] of ROLE_WORDS) if (re.test(name)) return role;
  return null;
}

/** Snapshots a preset's author never touched carry a factory name or none. */
function isUnused(name: string): boolean {
  const n = name.trim();
  return n === "" || /^snapshot\s*\d+$/i.test(n);
}

/** Key a snapshot by what it actually does, ignoring cosmetics. */
function toneKey(snap: unknown): string {
  const canonical = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([k]) => k !== "@name" && k !== "@ledcolor")
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, val]) => [k, canonical(val)])
      );
    }
    return v;
  };
  return JSON.stringify(canonical(snap));
}

/**
 * Distinct tones in a preset, as the lowest slot index of each group.
 *
 * Helix always stores eight slots and there is no flag saying which are in use:
 * `@valid` reads true on all eight in most real presets and is missing entirely
 * in others. Content is the only honest signal — an author who set up three
 * snapshots leaves the rest as copies of one another.
 */
export function distinctTones(tone: Record<string, unknown>): number[] {
  const seen = new Map<string, number>();
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`];
    if (!snap) continue;
    const key = toneKey(snap);
    if (!seen.has(key)) seen.set(key, i);
  }
  return [...seen.values()].sort((a, b) => a - b);
}

/** Every slot that shares a representative's tone, itself included. */
export function tonePeers(tone: Record<string, unknown>, index: number): number[] {
  const ref = tone[`snapshot${index}`];
  if (!ref) return [index];
  const key = toneKey(ref);
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`];
    if (snap && toneKey(snap) === key) out.push(i);
  }
  return out;
}

/**
 * Read the snapshots out of a .hlx.
 *
 * Names win where the author gave any: a named preset's unnamed slots are the
 * factory tail far more often than a real tone. When nothing is named at all,
 * fall back to the distinct tones — presets that switch between two sounds
 * without labelling either are common enough that treating them as one fixed
 * tone loses a real level.
 */
export function snapshotsFrom(hlx: string): SnapshotState[] {
  let tone: Record<string, unknown> | undefined;
  try {
    tone = (JSON.parse(hlx) as { data?: { tone?: Record<string, unknown> } })?.data?.tone;
  } catch {
    return [];
  }
  if (!tone) return [];

  const anyNamed = Array.from({ length: 8 }, (_, i) => tone![`snapshot${i}`]).some(
    (s) => s && !isUnused(String((s as { "@name"?: string })["@name"] ?? ""))
  );
  const keep = anyNamed ? null : new Set(distinctTones(tone));

  const out: SnapshotState[] = [];
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`] as { "@name"?: string } | undefined;
    if (!snap) continue;
    const raw = String(snap["@name"] ?? "");
    if (keep ? !keep.has(i) : isUnused(raw)) continue;
    const name = isUnused(raw) ? `Snapshot ${i + 1}` : raw;
    const named = roleFromName(name);
    out.push({
      index: i,
      name,
      role: named ?? "rhythm",
      roleSource: named ? "name" : "default",
      measuredLufs: null,
      measuredTrimDb: null,
      measuredBaselineDb: null,
      measuredAt: null,
    });
  }

  if (out.length === 0) {
    return [
      {
        index: 0,
        name: "Whole preset",
        role: "rhythm",
        roleSource: "default",
        measuredLufs: null,
        measuredTrimDb: null,
        measuredBaselineDb: null,
        measuredAt: null,
      },
    ];
  }
  return out;
}

export function buildPreset(index: number, name: string, hlx: string, songId?: string): LevelPreset {
  return { index, name, hlx, hash: hashPreset(hlx), snapshots: snapshotsFrom(hlx), songId };
}

/** Directories holding level documents. Both are scanned for hand-set roles. */
const DOC_DIRS = ["setlists", "leveling"];

/**
 * Every role a person has actually set, keyed by preset hash and snapshot.
 *
 * A role is a labelling decision about the patch — "this snapshot is the solo"
 * — so it stays true wherever that patch turns up, in a gig or on its own.
 * Guessed roles are excluded: they are re-derived from the snapshot name each
 * time, and letting one gig's guess pin another's would freeze a mistake.
 *
 * Readings deliberately do not travel this way. They describe one pass on one
 * rig on one day; a role describes the patch.
 *
 * Scanned off disk rather than passed in, so neither store has to know the
 * other exists.
 */
export function userRolesByHash(): Map<string, Map<number, Role>> {
  const out = new Map<string, Map<number, Role>>();
  for (const doc of eachStoredDoc()) {
    for (const p of doc.presets) {
      for (const s of p.snapshots ?? []) {
        if (s.roleSource !== "user") continue;
        const byIndex = out.get(p.hash) ?? new Map<number, Role>();
        byIndex.set(s.index, s.role);
        out.set(p.hash, byIndex);
      }
    }
  }
  return out;
}

/** Every readable level document in DOC_DIRS. Unreadable ones are skipped. */
function* eachStoredDoc(): Generator<LevelDoc> {
  for (const dir of DOC_DIRS) {
    const path = join(PRESET_DIR, dir);
    if (!existsSync(path)) continue;
    for (const f of readdirSync(path)) {
      if (!f.endsWith(".json")) continue;
      let doc: LevelDoc;
      try {
        doc = JSON.parse(readFileSync(join(path, f), "utf-8")) as LevelDoc;
      } catch {
        continue;
      }
      if (!Array.isArray(doc?.presets)) continue;
      yield doc;
    }
  }
}

/** A patch's hand-typed names: its own, and its snapshots' by index. */
export interface UserNames {
  preset?: string;
  snapshots: Map<number, string>;
}

/**
 * Every name a person has actually typed, keyed by preset hash.
 *
 * Same rule as userRolesByHash, and scanned in the same pass of the same
 * directories: naming a patch "Verse — clean" is a decision about the patch,
 * so it holds wherever that patch turns up and survives the Setlists app
 * re-pushing the gig. Names read out of the payload are excluded — those are
 * re-derived from the .hlx each time, and pinning one gig's copy would freeze
 * a name the source has since corrected.
 */
export function userNamesByHash(): Map<string, UserNames> {
  const out = new Map<string, UserNames>();
  const entry = (hash: string): UserNames => {
    const found = out.get(hash) ?? { snapshots: new Map<number, string>() };
    out.set(hash, found);
    return found;
  };

  for (const doc of eachStoredDoc()) {
    for (const p of doc.presets) {
      if (p.nameSource === "user" && p.name) entry(p.hash).preset = p.name;
      for (const s of p.snapshots ?? []) {
        if (s.nameSource === "user" && s.name) entry(p.hash).snapshots.set(s.index, s.name);
      }
    }
  }
  return out;
}

/** The name a .hlx carries, or a fallback. */
export function presetNameOf(hlx: string, fallback = "Preset"): string {
  try {
    const meta = (JSON.parse(hlx) as { data?: { meta?: { name?: string } } })?.data?.meta;
    const n = String(meta?.name ?? "").trim();
    return n || fallback;
  } catch {
    return fallback;
  }
}
