import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  const body = await request.json();

  // Upsert: if a log for this session+section exists, increment; otherwise create
  const existing = await prisma.sectionPracticeLog.findFirst({
    where: { sessionId, sectionId: body.sectionId },
  });

  if (existing) {
    const log = await prisma.sectionPracticeLog.update({
      where: { id: existing.id },
      data: {
        loopCount: (body.loopCount !== undefined) ? body.loopCount : existing.loopCount + 1,
        durationSec: (body.durationSec !== undefined) ? body.durationSec : existing.durationSec,
      },
    });
    return NextResponse.json(log);
  }

  const log = await prisma.sectionPracticeLog.create({
    data: {
      sessionId,
      sectionId: body.sectionId,
      loopCount: body.loopCount ?? 1,
      durationSec: body.durationSec ?? 0,
    },
  });
  return NextResponse.json(log);
}
