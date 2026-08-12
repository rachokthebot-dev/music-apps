import { deflateSync, crc32 } from "zlib";

/**
 * Build a Helix setlist (.hls) from individual presets.
 *
 * Verified against a real HX Edit export:
 *   { version: 2, schema: "L6Setlist", encoding: "Base64",
 *     compression: { type: "zlib", crc32, decompressed_size },
 *     meta: {...}, encoded_data: base64(zlib(json)) }
 *
 * The inner payload is { meta: { name }, presets: [128] }, where each populated
 * slot is exactly a .hlx file's `data` object and every unused slot is `{}`.
 */
const SLOT_COUNT = 128;

/**
 * Helix shows 16 characters on the device. The scraped catalog bears it out —
 * 1,320 of 8,917 real presets sit at exactly 16 and almost none go past it.
 */
const NAME_MAX = 16;

export interface HlxLike {
  data?: unknown;
}

/**
 * Name a preset after the song rather than whoever uploaded it. On stage you
 * are looking for "Sweet Child", not "ARCHON HEAVY AC" — the author's name says
 * nothing about which song the patch is for.
 */
export function nameForSong(preset: HlxLike, title: string): HlxLike {
  const meta = (preset?.data as { meta?: { name?: string } })?.meta;
  if (meta) meta.name = title.trim().slice(0, NAME_MAX).trim();
  return preset;
}

/**
 * Write hand-typed snapshot names into the preset.
 *
 * The counterpart to nameForSong, one level down. A snapshot's name is what
 * you read off the Helix while playing, so a rename that only lived in the app
 * would be missing from the one place it's needed. Only names a person typed
 * are written — anything derived from the payload is already what's in there.
 *
 * Snapshots the preset doesn't have are skipped rather than created: an
 * absent snapshot block means the author never used that slot, and inventing
 * one would put a named-but-empty snapshot on the device.
 */
export function nameSnapshots(
  preset: HlxLike,
  names: Array<{ index: number; name: string; nameSource?: "user" }>
): HlxLike {
  const tone = (preset?.data as { tone?: Record<string, unknown> })?.tone;
  if (!tone) return preset;
  for (const s of names) {
    if (s.nameSource !== "user") continue;
    const snap = tone[`snapshot${s.index}`] as { "@name"?: string } | undefined;
    if (!snap || typeof snap !== "object") continue;
    snap["@name"] = s.name.trim().slice(0, NAME_MAX).trim();
  }
  return preset;
}

export function buildSetlistFile(name: string, presets: HlxLike[]): string {
  const slots: unknown[] = new Array(SLOT_COUNT).fill(null).map(() => ({}));

  presets.slice(0, SLOT_COUNT).forEach((p, i) => {
    // A preset without `data` would produce a slot HX Edit can't read, so leave
    // the slot empty rather than writing something malformed.
    if (p?.data) slots[i] = p.data;
  });

  const inner = JSON.stringify({ meta: { name }, presets: slots });
  const decompressed = Buffer.from(inner, "utf8");
  const compressed = deflateSync(decompressed);

  return JSON.stringify(
    {
      version: 2,
      meta: {
        build_sha: "",
        device: 2162692,
        device_version: 58720256,
        modifieddate: Math.floor(Date.now() / 1000),
        application: "music-apps setlists",
        name,
        appversion: 58851328,
      },
      encoding: "Base64",
      encoded_data: compressed.toString("base64"),
      compression: {
        crc32: crc32(decompressed) >>> 0,
        decompressed_size: decompressed.length,
        type: "zlib",
      },
      schema: "L6Setlist",
    },
    null,
    2
  );
}
