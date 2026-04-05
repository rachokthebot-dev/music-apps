import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
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

    const { lickId } = await request.json();

    if (!lickId) {
      return NextResponse.json(
        { error: "lickId is required" },
        { status: 400 }
      );
    }

    const lick = await prisma.lick.findUnique({ where: { id: lickId } });
    if (!lick) {
      return NextResponse.json({ error: "Lick not found" }, { status: 404 });
    }

    const session = await prisma.practiceSession.create({
      data: {
        lickId,
        tempo: lick.lastTempo,
      },
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
