import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const orderSchema = z.object({ songIds: z.array(z.string()) });

/** Set the order of the songs in a folder: songIds, first to last. */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsed = orderSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  // updateMany, not update: a song taken out of the folder mid-drag is
  // skipped rather than failing the whole reorder.
  await prisma.$transaction([
    ...parsed.data.songIds.map((songId, i) =>
      prisma.songFolder.updateMany({
        where: { songId, folderId: id },
        data: { orderIndex: i },
      })
    ),
    // A reorder is a change: the folder moves to the top of the folder list.
    prisma.folder.updateMany({ where: { id }, data: { updatedAt: new Date() } }),
  ]);
  return NextResponse.json({ ok: true });
}
