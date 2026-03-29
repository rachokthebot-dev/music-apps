import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLIPS_DIR } from "@/lib/paths";
import { unlink } from "fs/promises";
import path from "path";
import { extractClip } from "@/lib/extract-clip";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lick = await prisma.lick.findUnique({
      where: { id },
      include: {
        source: { select: { id: true, title: true, artist: true, thumbnailUrl: true } },
        folder: true,
        sections: { orderBy: { orderIndex: "asc" } },
      },
    });

    if (!lick) {
      return NextResponse.json({ error: "Lick not found" }, { status: 404 });
    }

    return NextResponse.json(lick);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get lick";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const allowedFields = ["name", "folderId", "lastPositionSec", "lastTempo", "notes"];
    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        data[field] = body[field];
      }
    }

    // Handle boundary changes — requires re-extraction
    const boundaryChange = "startSec" in body || "endSec" in body;
    if (boundaryChange) {
      const existing = await prisma.lick.findUnique({ where: { id }, include: { source: true } });
      if (!existing) {
        return NextResponse.json({ error: "Lick not found" }, { status: 404 });
      }

      const newStart = body.startSec ?? existing.startSec;
      const newEnd = body.endSec ?? existing.endSec;

      if (newStart < 0 || newEnd <= newStart) {
        return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
      }

      data.startSec = newStart;
      data.endSec = newEnd;
      data.durationSec = newEnd - newStart;

      // Delete old clip files
      const oldFiles = [existing.videoClipPath, existing.audioClipPath]
        .filter(Boolean)
        .map((f) => path.join(CLIPS_DIR, f!));
      for (const file of oldFiles) {
        await unlink(file).catch(() => {});
      }

      // Re-extract clips with new boundaries
      const { videoClipPath, audioClipPath } = await extractClip(
        id,
        existing.sourceId,
        newStart,
        newEnd
      );
      data.videoClipPath = videoClipPath;
      data.audioClipPath = audioClipPath;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const lick = await prisma.lick.update({
      where: { id },
      data,
      include: {
        source: { select: { id: true, title: true, artist: true, thumbnailUrl: true } },
        folder: true,
        sections: { orderBy: { orderIndex: "asc" } },
      },
    });

    return NextResponse.json(lick);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update lick";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const lick = await prisma.lick.findUnique({ where: { id } });
    if (!lick) {
      return NextResponse.json({ error: "Lick not found" }, { status: 404 });
    }

    // Delete clip files
    const clipFiles = [lick.videoClipPath, lick.audioClipPath]
      .filter(Boolean)
      .map((f) => path.join(CLIPS_DIR, f!));

    for (const file of clipFiles) {
      await unlink(file).catch(() => {});
    }

    // Cascade delete handles sections, sessions, logs
    await prisma.lick.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete lick";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
