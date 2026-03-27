import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: songId } = await params;

  const sessions = await prisma.practiceSession.findMany({
    where: { songId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      sectionLogs: {
        include: { section: { select: { name: true } } },
      },
    },
  });

  // Aggregate totals
  const totalSessions = await prisma.practiceSession.count({ where: { songId } });
  const totalTimeResult = await prisma.practiceSession.aggregate({
    where: { songId, durationSec: { not: null } },
    _sum: { durationSec: true },
  });

  return NextResponse.json({
    sessions,
    totalSessions,
    totalTimeSec: totalTimeResult._sum.durationSec ?? 0,
  });
}
