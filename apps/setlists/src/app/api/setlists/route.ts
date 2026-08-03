import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const setlists = await prisma.setlist.findMany({
    orderBy: { createdAt: "desc" },
    include: { songs: { orderBy: { orderIndex: "asc" } } },
  });
  return NextResponse.json(setlists);
}

interface IncomingSong {
  title?: string;
  artist?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const songs: IncomingSong[] = Array.isArray(body?.songs) ? body.songs : [];

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }
    const cleaned = songs
      .map((s) => ({ title: String(s?.title ?? "").trim(), artist: String(s?.artist ?? "").trim() }))
      .filter((s) => s.title);
    if (cleaned.length === 0) {
      return NextResponse.json({ error: "at least one song is required" }, { status: 400 });
    }

    const setlist = await prisma.setlist.create({
      data: {
        name,
        sourceType: body?.sourceType === "apple" ? "apple" : "paste",
        sourceUrl: typeof body?.sourceUrl === "string" ? body.sourceUrl : null,
        songs: {
          create: cleaned.map((s, i) => ({
            orderIndex: i,
            title: s.title,
            artist: s.artist,
          })),
        },
      },
      include: { songs: { orderBy: { orderIndex: "asc" } } },
    });

    return NextResponse.json(setlist, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create setlist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
