import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractClip } from "@/lib/extract-clip";

export async function GET() {
  try {
    const licks = await prisma.lick.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        source: { select: { id: true, title: true, artist: true, thumbnailUrl: true } },
        folder: true,
      },
    });

    return NextResponse.json(licks);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list licks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { sourceId, name, startSec, endSec, folderId } = await request.json();

    if (!sourceId || !name || startSec == null || endSec == null) {
      return NextResponse.json(
        { error: "sourceId, name, startSec, and endSec are required" },
        { status: 400 }
      );
    }

    if (startSec < 0 || endSec <= startSec) {
      return NextResponse.json(
        { error: "Invalid time range" },
        { status: 400 }
      );
    }

    const source = await prisma.source.findUnique({ where: { id: sourceId } });
    if (!source) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    if (source.processingStatus !== "ready") {
      return NextResponse.json(
        { error: "Source is not ready yet" },
        { status: 400 }
      );
    }

    const durationSec = endSec - startSec;

    // Create lick first to get ID for clip filenames
    const lick = await prisma.lick.create({
      data: {
        name,
        sourceId,
        startSec,
        endSec,
        durationSec,
        folderId: folderId || null,
      },
    });

    // Extract clip files
    const { videoClipPath, audioClipPath } = await extractClip(
      lick.id,
      sourceId,
      startSec,
      endSec
    );

    // Update lick with clip paths
    const updatedLick = await prisma.lick.update({
      where: { id: lick.id },
      data: { videoClipPath, audioClipPath },
      include: {
        source: { select: { id: true, title: true, artist: true, thumbnailUrl: true } },
        folder: true,
      },
    });

    return NextResponse.json(updatedLick, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create lick";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
