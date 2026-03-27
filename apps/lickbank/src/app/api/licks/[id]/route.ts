import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CLIPS_DIR } from "@/lib/paths";
import { unlink } from "fs/promises";
import path from "path";

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
