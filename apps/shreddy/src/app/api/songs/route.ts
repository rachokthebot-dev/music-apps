import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: {
      importJob: true,
      folders: {
        orderBy: { orderIndex: "asc" },
        include: { folder: { select: { id: true, name: true } } },
      },
    },
  });
  return NextResponse.json(songs);
}
