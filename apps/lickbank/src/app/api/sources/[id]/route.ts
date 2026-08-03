import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SOURCES_DIR, CLIPS_DIR } from "@/lib/paths";
import { unlink } from "fs/promises";
import path from "path";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const source = await prisma.source.findUnique({
      where: { id },
      include: {
        licks: true,
        importJob: true,
        sections: { orderBy: { startSec: "asc" } },
      },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    return NextResponse.json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get source";
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

    const updateData: Record<string, string> = {};
    if (typeof body.title === "string" && body.title.trim()) {
      updateData.title = body.title.trim();
    }
    if (typeof body.artist === "string") {
      updateData.artist = body.artist.trim();
    }

    const folderIds: string[] | undefined = Array.isArray(body.folderIds) ? body.folderIds : undefined;

    if (Object.keys(updateData).length === 0 && folderIds === undefined) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const source = await prisma.$transaction(async (tx) => {
      if (folderIds !== undefined) {
        await tx.sourceFolder.deleteMany({ where: { sourceId: id } });
        if (folderIds.length > 0) {
          await tx.sourceFolder.createMany({
            data: folderIds.map((folderId, i) => ({
              sourceId: id,
              folderId,
              orderIndex: i,
            })),
          });
        }
      }
      if (Object.keys(updateData).length > 0) {
        return tx.source.update({ where: { id }, data: updateData });
      }
      return tx.source.findUniqueOrThrow({ where: { id } });
    });

    return NextResponse.json(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update source";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const source = await prisma.source.findUnique({
      where: { id },
      include: { licks: true },
    });

    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Delete source media files
    const sourceFiles = [
      source.videoPath ? path.join(SOURCES_DIR, source.videoPath) : null,
      source.audioPath ? path.join(SOURCES_DIR, source.audioPath) : null,
    ].filter(Boolean) as string[];

    // Delete clip files for all licks
    const clipFiles = source.licks.flatMap((lick) =>
      [lick.videoClipPath, lick.audioClipPath]
        .filter(Boolean)
        .map((f) => path.join(CLIPS_DIR, f!))
    );

    for (const file of [...sourceFiles, ...clipFiles]) {
      await unlink(file).catch(() => {});
    }

    // Cascade delete handles licks, sections, sessions, logs
    await prisma.source.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete source";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
