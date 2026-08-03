import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { buildSetlistFile, nameForSong, type HlxLike } from "@music-apps/gain-estimator";
import type { HelixPreset } from "@music-apps/gain-estimator";

const PRESET_DIR = path.resolve(process.cwd(), "../data/presets");

/** Download the whole setlist as one .hls, in setlist order. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ?trimDb=-20 cuts every preset's final output by the same amount. Used to
  // get a measurement take under the clipping point: an equal cut everywhere
  // leaves the relative levels — the only thing being measured — untouched.
  const trimDb = Number(new URL(request.url).searchParams.get("trimDb") ?? 0);
  const setlist = await prisma.setlist.findUnique({
    where: { id },
    include: {
      songs: {
        orderBy: { orderIndex: "asc" },
        include: { snapshots: { orderBy: { index: "asc" } } },
      },
    },
  });
  if (!setlist) return NextResponse.json({ error: "Setlist not found" }, { status: 404 });

  // Slot position follows setlist position, so song 5 is always slot 5 — a
  // song without a preset leaves its slot empty rather than shifting the rest.
  const presets: HlxLike[] = [];
  for (const song of setlist.songs) {
    if (!song.presetPath) {
      presets.push({});
      continue;
    }
    try {
      const raw = await readFile(path.join(PRESET_DIR, song.presetPath), "utf8");
      const preset = JSON.parse(raw) as HelixPreset;

      // Ships the preset exactly as downloaded. Levels used to be written here
      // from the static estimator, but a modeller's loudness can't be predicted
      // from its parameters — it reported zero spread on a gig that audibly
      // jumped. Offsets now come from a measured recording instead.
      presets.push(nameForSong(uniformTrim(preset, trimDb) as HlxLike, song.title));
    } catch {
      presets.push({});
    }
  }

  const file = buildSetlistFile(setlist.name.slice(0, 32), presets);
  const safe = setlist.name.replace(/[^\w\-]+/g, "_").slice(0, 40) || "setlist";

  return new NextResponse(file, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}.hls"`,
    },
  });
}

/** Cut every routed output on the terminal path by the same number of dB. */
function uniformTrim(preset: HelixPreset, trimDb: number): HelixPreset {
  if (!trimDb) return preset;
  const tone = preset.data?.tone as Record<string, unknown> | undefined;
  if (!tone) return preset;
  const a = (tone.dsp0 as { outputA?: Record<string, unknown> } | undefined)?.outputA;
  const dsp = a?.["@output"] === 2 ? "dsp1" : "dsp0";
  const path = tone[dsp] as Record<string, Record<string, unknown>> | undefined;
  if (!path) return preset;
  for (const [slot, node] of Object.entries(path)) {
    if (!slot.startsWith("output") || !node || node["@output"] === 0) continue;
    const cur = typeof node.gain === "number" ? node.gain : 0;
    node.gain = Number(Math.max(-60, Math.min(12, cur + trimDb)).toFixed(2));
  }
  return preset;
}
