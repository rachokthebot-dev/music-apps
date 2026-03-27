import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const session = await prisma.practiceSession.create({
    data: {
      songId: body.songId,
      tempo: body.tempo ?? null,
      pitch: body.pitch ?? null,
    },
  });
  return NextResponse.json(session);
}
