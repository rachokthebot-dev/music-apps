import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";
import { UPLOADS_DIR, AUDIO_DIR } from "@/lib/paths";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const song = await prisma.song.findUnique({
    where: { id },
    include: { sections: { orderBy: { orderIndex: "asc" } }, importJob: true },
  });
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }
  return NextResponse.json(song);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const song = await prisma.song.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.pinned !== undefined && { pinned: body.pinned }),
      ...(body.folderId !== undefined && { folderId: body.folderId || null }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.lastPositionSec !== undefined && { lastPositionSec: body.lastPositionSec }),
      ...(body.lastTempo !== undefined && { lastTempo: body.lastTempo }),
      ...(body.lastPitch !== undefined && { lastPitch: body.lastPitch }),
      ...(body.lastSelectedSections !== undefined && { lastSelectedSections: body.lastSelectedSections }),
    },
  });
  return NextResponse.json(song);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const song = await prisma.song.findUnique({ where: { id } });
  if (!song) {
    return NextResponse.json({ error: "Song not found" }, { status: 404 });
  }

  // Delete files
  try {
    await unlink(path.join(UPLOADS_DIR, song.originalFilePath));
  } catch { /* ignore */ }
  if (song.normalizedAudioPath) {
    try {
      await unlink(path.join(AUDIO_DIR, song.normalizedAudioPath));
    } catch { /* ignore */ }
  }

  await prisma.song.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
