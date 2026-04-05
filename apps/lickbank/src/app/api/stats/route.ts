import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateStreak, buildDailyBreakdown, getDateRanges, corsHeaders } from "@music-apps/shared";

export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function GET() {
  try {
    const { todayStart, weekStart } = getDateRanges();

    // Today's practice time
    const todayResult = await prisma.practiceSession.aggregate({
      where: { startedAt: { gte: todayStart }, durationSec: { not: null } },
      _sum: { durationSec: true },
      _count: true,
    });

    // This week's practice time
    const weekResult = await prisma.practiceSession.aggregate({
      where: { startedAt: { gte: weekStart }, durationSec: { not: null } },
      _sum: { durationSec: true },
      _count: true,
    });

    // All time
    const allTimeResult = await prisma.practiceSession.aggregate({
      where: { durationSec: { not: null } },
      _sum: { durationSec: true },
      _count: true,
    });

    // Streak
    const recentSessions = await prisma.practiceSession.findMany({
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
      take: 365,
    });
    const streak = calculateStreak(recentSessions.map((s) => s.startedAt));

    // Daily breakdown for the past 7 days
    const dailyBreakdown = await buildDailyBreakdown(async (dayStart, dayEnd) => {
      const result = await prisma.practiceSession.aggregate({
        where: {
          startedAt: { gte: dayStart, lt: dayEnd },
          durationSec: { not: null },
        },
        _sum: { durationSec: true },
      });
      return result._sum.durationSec ?? 0;
    });

    // Top 5 most practiced licks this week
    const topLicksRaw = await prisma.practiceSession.groupBy({
      by: ["lickId"],
      where: { startedAt: { gte: weekStart }, durationSec: { not: null } },
      _sum: { durationSec: true },
      _count: true,
      orderBy: { _sum: { durationSec: "desc" } },
      take: 5,
    });

    // Batch fetch lick details (avoids N+1)
    const lickIds = topLicksRaw.map((e) => e.lickId);
    const licks = await prisma.lick.findMany({
      where: { id: { in: lickIds } },
      select: {
        id: true,
        name: true,
        source: { select: { title: true, artist: true } },
      },
    });
    const lickMap = new Map(licks.map((l) => [l.id, l]));

    const topLicks = topLicksRaw.map((entry) => {
      const lick = lickMap.get(entry.lickId);
      return {
        lickId: entry.lickId,
        name: lick?.name ?? "Unknown",
        sourceTitle: lick?.source?.title ?? "",
        artist: lick?.source?.artist ?? "",
        totalTimeSec: entry._sum.durationSec ?? 0,
        sessionCount: entry._count,
      };
    });

    return NextResponse.json({
      today: {
        durationSec: todayResult._sum.durationSec ?? 0,
        sessions: todayResult._count,
      },
      week: {
        durationSec: weekResult._sum.durationSec ?? 0,
        sessions: weekResult._count,
      },
      allTime: {
        durationSec: allTimeResult._sum.durationSec ?? 0,
        sessions: allTimeResult._count,
      },
      streak,
      dailyBreakdown,
      topLicks,
    }, { headers: corsHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get stats";
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
