import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  // Clean up orphan sessions (open > 4 hours with no endedAt)
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
  await prisma.practiceSession.updateMany({
    where: {
      endedAt: null,
      startedAt: { lt: fourHoursAgo },
    },
    data: {
      endedAt: new Date(),
      durationSec: 0,
    },
  });

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
