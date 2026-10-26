// POST /api/songs/[id]/stems/pitch   { semitones: number }
//
// Pitch-shifted renders of the 4 stems, so the StemsEngine can honour the
// pitch control. The engine plays decoded buffers through the Web Audio
// graph, which has no pitch knob of its own — the only way a muted-stem mix
// can follow the transpose is to hand it audio that is already shifted.
//
// Mirrors POST /api/songs/[id]/pitch (the whole-track path) and reuses the
// same shiftPitch helper, so renders land in AUDIO_DIR under
// `<songId>_stem_<name>_pitch_<up|down><n>.mp3` and are cached on disk.
//
// Shape: { stems: { vocals, drums, bass, other } }

import { NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import { AUDIO_DIR } from "@/lib/paths";
import { shiftPitch, validateSemitones } from "@music-apps/shared";
import { stemFilename, STEM_NAMES, type StemName } from "@/lib/process-stems";

// Four ffmpeg renders, each roughly the length of the song. Cached after the
// first request for a given semitone value, so only the cold path is slow.
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { semitones } = await request.json().catch(() => ({ semitones: null }));

  if (!validateSemitones(semitones)) {
    return NextResponse.json(
      { error: "semitones must be between -12 and 12, non-zero" },
      { status: 400 }
    );
  }

  const sources = STEM_NAMES.map((stem) => ({
    stem,
    file: path.join(AUDIO_DIR, stemFilename(id, stem)),
  }));

  for (const { file } of sources) {
    try {
      await access(file);
    } catch {
      return NextResponse.json({ error: "Stems not rendered for this song" }, { status: 404 });
    }
  }

  try {
    // Sequential, not parallel: four concurrent ffmpeg encodes of a full song
    // starve each other and the audio the user is already playing.
    const stems = {} as Record<StemName, string>;
    for (const { stem, file } of sources) {
      const filename = await shiftPitch(file, AUDIO_DIR, `${id}_stem_${stem}`, semitones);
      stems[stem] = `/shreddy/api/media/${filename}`;
    }
    return NextResponse.json({ stems });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pitch processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
