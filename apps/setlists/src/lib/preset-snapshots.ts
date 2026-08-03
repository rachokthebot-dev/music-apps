export type Role = "clean" | "rhythm" | "chorus" | "solo";

export interface ParsedSnapshot {
  index: number;
  name: string;
  role: Role;
  /**
   * "name" when the snapshot said what it is, "rank" when we guessed by order,
   * "single" when the preset has no snapshots and is one fixed tone.
   */
  roleSource: "name" | "rank" | "single";
}

// Real presets use "Lead" as often as "Solo", and "Crunch"/"Verse" for rhythm.
const ROLE_WORDS: Array<[RegExp, Role]> = [
  [/\b(clean|jazz)\b/i, "clean"],
  [/\b(solo|lead)\b/i, "solo"],
  [/\b(chorus|refrain)\b/i, "chorus"],
  // "Main" and "Base" show up as the default/backing tone in real presets.
  [/\b(rhythm|rhy|crunch|verse|heavy|drive|main|base|basic)\b/i, "rhythm"],
];

/**
 * Snapshots a preset author never touched. Helix ships eight slots whether or
 * not they're used, so an untouched one carries its factory name or none at
 * all — giving those a level target would invent structure that isn't there.
 */
function isUnused(name: string): boolean {
  const n = name.trim();
  return n === "" || /^snapshot\s*\d+$/i.test(n);
}

function roleFromName(name: string): Role | null {
  for (const [re, role] of ROLE_WORDS) {
    if (re.test(name)) return role;
  }
  return null;
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
 * Helix always stores eight slots, and there is no flag saying which are in
 * use: `@valid` reads true on all eight in most real presets and is missing
 * entirely in others, so it tells us nothing. Content does — an author who set
 * up three snapshots leaves the other five as copies of one another.
 */
function distinctTones(tone: Record<string, unknown>): number[] {
  const seen = new Map<string, number>();
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`];
    if (!snap) continue;
    const key = toneKey(snap);
    if (!seen.has(key)) seen.set(key, i);
  }
  return [...seen.values()].sort((a, b) => a - b);
}

/**
 * Read the snapshots out of a .hlx, assigning each a role. Names win where they
 * say something; the rest are ranked so the quietest reads as clean and the
 * loudest as solo. Unused slots are dropped entirely.
 *
 * When a preset names nothing at all, fall back to its distinct tones. Three of
 * eight presets in a real setlist name no snapshot yet plainly switch between
 * two sounds, and rejecting those as "no snapshots" made a levellable preset
 * look broken. Names still win where they exist: a named preset's unnamed
 * slots are the factory tail far more often than they are a real tone.
 */
export function parseSnapshots(
  preset: unknown,
  loudnessByIndex?: Record<number, number>
): ParsedSnapshot[] {
  const tone = (preset as { data?: { tone?: Record<string, unknown> } })?.data?.tone;
  if (!tone) return [];

  const raw: Array<{ index: number; name: string }> = [];
  for (let i = 0; i < 8; i++) {
    const snap = tone[`snapshot${i}`] as { "@name"?: string } | undefined;
    if (!snap) continue;
    const name = String(snap["@name"] ?? "");
    if (isUnused(name)) continue;
    raw.push({ index: i, name });
  }

  if (raw.length === 0) {
    for (const index of distinctTones(tone)) {
      raw.push({ index, name: `Snapshot ${index + 1}` });
    }
  }

  // Only a preset with no snapshot slots at all gets here now. Nothing to
  // target and no baseline to anchor to, so rejecting still beats shipping one
  // song at whatever level its author happened to use.
  if (raw.length === 0) return [];

  const out: ParsedSnapshot[] = raw.map((r) => {
    const named = roleFromName(r.name);
    return {
      index: r.index,
      name: r.name,
      role: named ?? "rhythm",
      roleSource: named ? "name" : "rank",
    };
  });

  // Anything the names didn't settle gets ordered by estimated loudness, when
  // we have it: quietest is the clean end, loudest the solo end.
  const unresolved = out.filter((s) => s.roleSource === "rank");
  if (unresolved.length > 0 && loudnessByIndex) {
    const sorted = [...unresolved].sort(
      (a, b) => (loudnessByIndex[a.index] ?? 0) - (loudnessByIndex[b.index] ?? 0)
    );
    sorted.forEach((s, i) => {
      const frac = sorted.length === 1 ? 0.5 : i / (sorted.length - 1);
      s.role = frac < 0.34 ? "clean" : frac < 0.67 ? "rhythm" : "solo";
    });
  }

  return out.sort((a, b) => a.index - b.index);
}
