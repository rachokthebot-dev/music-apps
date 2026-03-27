import { NextRequest, NextResponse } from "next/server";
import { access } from "fs/promises";
import path from "path";
import { CLIPS_DIR } from "@/lib/paths";
import { prisma } from "@/lib/prisma";
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

  const lick = await prisma.lick.findUnique({ where: { id } });
  if (!lick || !lick.audioClipPath) {
    return NextResponse.json({ error: "Lick or audio clip not found" }, { status: 404 });
  }

  const sourceFile = path.join(CLIPS_DIR, lick.audioClipPath);
  try {
    await access(sourceFile);
  } catch {
    return NextResponse.json({ error: "Source audio file not found" }, { status: 404 });
  }

  try {
    const filename = await shiftPitch(sourceFile, CLIPS_DIR, id, semitones);
    return NextResponse.json({ filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pitch processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
