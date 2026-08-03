import { readFile } from "fs/promises";
import path from "path";

/** The index built by the helix-tone-search project. Read-only here. */
const INDEX_PATH =
  process.env.HELIX_INDEX_PATH ??
  path.join(
    process.env.HOME ?? "",
    "claude/projects/helix-tone-search/web/data/presets.json"
  );

interface PresetRecord {
  id?: string | number;
  name?: string;
  band?: string;
  song?: string;
  artist?: string;
  amp?: string;
  style?: string;
  device?: string;
  downloads?: number;
  url?: string;
  tone_tags?: string[];
  bands?: string[];
}

export interface PresetMatch {
  id: string;
  name: string;
  band: string | null;
  song: string | null;
  amp: string | null;
  downloads: number;
  url: string | null;
  toneTags: string[];
  /** "song" is trustworthy; "band" routinely returns the wrong song, or a bass patch. */
  confidence: "song" | "band" | "none";
  warning?: string;
}

let cached: PresetRecord[] | null = null;

async function loadIndex(): Promise<PresetRecord[]> {
  if (cached) return cached;
  try {
    const raw = await readFile(INDEX_PATH, "utf8");
    const parsed = JSON.parse(raw);
    cached = Array.isArray(parsed) ? parsed : [];
  } catch {
    cached = [];
  }
  return cached;
}

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// A band match that is obviously for another instrument is worse than nothing —
// the Black Parade lookup returns an Ampeg bass patch, which would be silently
// wrong if presented as "your preset".
const WRONG_INSTRUMENT = /\b(bass|ampeg|acoustic|vocal|drum)\b/i;

export async function matchPresets(
  title: string,
  artist: string,
  limit = 3
): Promise<PresetMatch[]> {
  const index = await loadIndex();
  const nt = norm(title);
  const na = norm(artist);
  if (!nt && !na) return [];

  const toMatch = (r: PresetRecord, confidence: "song" | "band"): PresetMatch => {
    const text = `${r.name ?? ""} ${r.amp ?? ""} ${r.style ?? ""}`;
    const wrongInstrument = WRONG_INSTRUMENT.test(text);
    return {
      id: String(r.id ?? r.url ?? r.name ?? ""),
      name: String(r.name ?? "Untitled"),
      band: r.band ?? null,
      song: r.song ?? null,
      amp: r.amp ?? null,
      downloads: Number(r.downloads ?? 0),
      url: r.url ?? null,
      toneTags: Array.isArray(r.tone_tags) ? r.tone_tags : [],
      confidence,
      warning: wrongInstrument
        ? "Looks like a bass or acoustic patch — probably not what you want"
        : confidence === "band"
          ? "Matched the band, not this song"
          : undefined,
    };
  };

  const songHits = index
    .filter((r) => nt && norm(r.song) === nt)
    .sort((a, b) => Number(b.downloads ?? 0) - Number(a.downloads ?? 0))
    .slice(0, limit)
    .map((r) => toMatch(r, "song"));

  if (songHits.length > 0) return songHits;

  const bandHits = index
    .filter((r) => {
      if (!na) return false;
      if (norm(r.band) === na) return true;
      return Array.isArray(r.bands) && r.bands.some((b) => norm(b) === na);
    })
    .sort((a, b) => Number(b.downloads ?? 0) - Number(a.downloads ?? 0))
    .slice(0, limit)
    .map((r) => toMatch(r, "band"));

  return bandHits;
}
