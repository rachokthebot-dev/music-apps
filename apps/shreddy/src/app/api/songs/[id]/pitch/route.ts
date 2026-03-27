import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import { AUDIO_DIR } from "@/lib/paths";
import { shiftPitch, validateSemitones } from "@music-apps/shared";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { semitones } = await request.json();

  if (!validateSemitones(semitones)) {
    return NextResponse.json({ error: "semitones must be between -12 and 12, non-zero" }, { status: 400 });
  }

  const sourceFile = path.join(AUDIO_DIR, `${id}.mp3`);
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json({ error: "Source audio not found" }, { status: 404 });
  }

  try {
    const filename = await shiftPitch(sourceFile, AUDIO_DIR, id, semitones);
    return NextResponse.json({ filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pitch processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
