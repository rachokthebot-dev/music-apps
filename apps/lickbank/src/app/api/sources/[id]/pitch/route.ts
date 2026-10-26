import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import { SOURCES_DIR } from "@/lib/paths";
import { prisma } from "@/lib/prisma";
import { shiftPitch, validateSemitones } from "@music-apps/shared";

/**
 * Same job as the lick pitch route, on the whole song instead of one clip —
 * practising in the clipper needs the full-length audio shifted. shiftPitch
 * caches per (id, semitones), so the minute of ffmpeg on a long source is paid
 * once per key rather than on every toggle.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { semitones } = await request.json();

  if (!validateSemitones(semitones)) {
    return NextResponse.json(
      { error: "semitones must be between -12 and 12, non-zero" },
      { status: 400 }
    );
  }

  const source = await prisma.source.findUnique({ where: { id } });
  if (!source || !source.audioPath) {
    return NextResponse.json({ error: "Source or audio not found" }, { status: 404 });
  }

  const sourceFile = path.join(SOURCES_DIR, source.audioPath);
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json({ error: "Source audio file not found" }, { status: 404 });
  }

  try {
    const filename = await shiftPitch(sourceFile, SOURCES_DIR, id, semitones);
    return NextResponse.json({ filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pitch processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
