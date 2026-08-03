import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Set the running order.
 *
 * orderIndex drives the .hls slot a preset lands in, so reordering here is what
 * puts patch 3 under footswitch 3 when the band changes the set.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const ids: unknown = body?.songIds;
    if (!Array.isArray(ids) || ids.some((s) => typeof s !== "string")) {
      return NextResponse.json({ error: "songIds must be an array of ids" }, { status: 400 });
    }

    const songs = await prisma.setlistSong.findMany({
      where: { setlistId: id },
      select: { id: true },
    });
    // A partial list would leave holes in the order, and ids from another
    // setlist would silently move songs out from under it.
    const known = new Set(songs.map((s) => s.id));
    if (ids.length !== songs.length || ids.some((s) => !known.has(s as string))) {
      return NextResponse.json(
        { error: "songIds must list every song in this setlist exactly once" },
        { status: 400 }
      );
    }

    await prisma.$transaction(
      (ids as string[]).map((songId, orderIndex) =>
        prisma.setlistSong.update({ where: { id: songId }, data: { orderIndex } })
      )
    );

    return NextResponse.json({ ok: true, count: ids.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reorder";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
