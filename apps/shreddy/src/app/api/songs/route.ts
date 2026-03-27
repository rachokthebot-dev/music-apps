import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    include: { importJob: true, folder: true },
  });
  return NextResponse.json(songs);
}
