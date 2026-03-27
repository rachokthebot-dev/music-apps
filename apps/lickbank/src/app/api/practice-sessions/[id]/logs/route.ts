import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { sectionId, loopCount, durationSec } = await request.json();

    if (!sectionId) {
      return NextResponse.json(
        { error: "sectionId is required" },
        { status: 400 }
      );
    }

    // Verify session exists
    const session = await prisma.practiceSession.findUnique({ where: { id } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // Upsert: update if log exists for this session+section, create otherwise
    const existing = await prisma.sectionPracticeLog.findFirst({
      where: { sessionId: id, sectionId },
    });

    let log;
    if (existing) {
      log = await prisma.sectionPracticeLog.update({
        where: { id: existing.id },
        data: {
          loopCount: loopCount ?? existing.loopCount,
          durationSec: durationSec ?? existing.durationSec,
        },
      });
    } else {
      log = await prisma.sectionPracticeLog.create({
        data: {
          sessionId: id,
          sectionId,
          loopCount: loopCount ?? 0,
          durationSec: durationSec ?? 0,
        },
      });
    }

    return NextResponse.json(log, { status: existing ? 200 : 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to upsert log";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
