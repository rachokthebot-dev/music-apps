import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const STRINGS = [
  "lickbankVideoUrl",
  "lickbankSourceId",
  "shreddyVideoUrl",
  "shreddySongId",
  "presetChoice",
  "presetName",
  "presetUrl",
  "presetPath",
] as const;

/** Per-song wizard choices: the two video picks and the preset decision. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const data: Record<string, string | number | null> = {};
    for (const key of STRINGS) {
      // null clears a choice (e.g. switching a song back to "no preset").
      if (body?.[key] === null) data[key] = null;
      else if (typeof body?.[key] === "string") data[key] = body[key];
    }
    if (typeof body?.presetTrimDb === "number") data.presetTrimDb = body.presetTrimDb;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Pointing a song at a different preset makes the downloaded file and its
    // snapshot roles stale. Clearing them is what tells the run to fetch the new
    // one — otherwise it sees a presetPath, skips the download, and you keep the
    // preset you just replaced.
    if ("presetUrl" in data && !("presetPath" in data)) {
      const current = await prisma.setlistSong.findUnique({
        where: { id },
        select: { presetUrl: true },
      });
      if (current && current.presetUrl !== data.presetUrl) {
        data.presetPath = null;
        await prisma.presetSnapshot.deleteMany({ where: { songId: id } });
      }
    }

    const song = await prisma.setlistSong.update({
      where: { id },
      data,
      include: { snapshots: { orderBy: { index: "asc" } } },
    });
    return NextResponse.json(song);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update song";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
