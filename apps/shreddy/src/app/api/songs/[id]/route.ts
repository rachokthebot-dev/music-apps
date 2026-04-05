import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { unlink } from "fs/promises";
import path from "path";
import { z } from "zod";
import { UPLOADS_DIR, AUDIO_DIR } from "@/lib/paths";

const songPatchSchema = z.object({
  title: z.string().min(1).optional(),
  pinned: z.boolean().optional(),
  folderId: z.string().nullable().optional(),
  notes: z.string().optional(),
  lastPositionSec: z.number().min(0).optional(),
  lastTempo: z.number().min(0.1).max(5).optional(),
  lastPitch: z.number().int().min(-12).max(12).optional(),
  lastSelectedSections: z.string().optional(),
}).strict();

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
  const raw = await request.json();
  const parsed = songPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
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
