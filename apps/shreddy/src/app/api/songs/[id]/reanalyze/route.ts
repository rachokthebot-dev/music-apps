import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { AUDIO_DIR } from "@/lib/paths";
import { reanalyzeAudio } from "@/lib/process-audio";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const song = await prisma.song.findUnique({ where: { id } });
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  if (!song.normalizedAudioPath) {
    return NextResponse.json({ error: "Song has no processed audio" }, { status: 400 });
  }

  const audioPath = path.join(AUDIO_DIR, song.normalizedAudioPath);

  // Run re-analysis in background
  reanalyzeAudio(id, audioPath);

  return NextResponse.json({ ok: true, message: "Re-analysis started" });
}
