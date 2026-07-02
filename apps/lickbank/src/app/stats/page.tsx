"use client";

import { useRouter } from "next/navigation";
import { BackToHome } from "@music-apps/shared/back-to-home";
import useSWR from "swr";

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

interface DayData {
  date: string;
  durationSec: number;
}

interface TopLick {
  id: string;
  name: string;
  totalDurationSec: number;
  sessionCount: number;
}

interface Stats {
  todaySec: number;
  weekSec: number;
  streakDays: number;
  allTimeSec: number;
  last7Days: DayData[];
  topLicks: TopLick[];
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StatsPage() {
  const router = useRouter();
  const { data: stats, isLoading: loading, error } = useSWR<Stats>("/lickbank/api/stats", fetcher);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading stats...</p>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-destructive">{error || "No stats available"}</p>
        <BackToHome label="Back to Library" />
      </div>
    );
  }

  const maxDayDuration = Math.max(
    ...stats.last7Days.map((d) => d.durationSec),
    1
  );

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
        <BackToHome label="Library" />
        <h1 className="text-sm font-medium">Practice Stats</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 lg:p-6 space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Today</p>
              <p className="text-2xl font-bold mt-1">{formatDuration(stats.todaySec)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">This Week</p>
              <p className="text-2xl font-bold mt-1">{formatDuration(stats.weekSec)}</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Streak</p>
              <p className="text-2xl font-bold mt-1">
                {stats.streakDays} {stats.streakDays === 1 ? "day" : "days"}
              </p>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">All Time</p>
              <p className="text-2xl font-bold mt-1">{formatDuration(stats.allTimeSec)}</p>
            </div>
          </div>

          {/* 7-day bar chart */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-4">Last 7 Days</h3>
            <div className="flex items-end gap-2 h-40">
              {stats.last7Days.map((day) => {
                const heightPct =
                  maxDayDuration > 0
                    ? (day.durationSec / maxDayDuration) * 100
                    : 0;
                const date = new Date(day.date + "T12:00:00");
                const dayName = DAY_NAMES[date.getDay()];
                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center justify-end h-full gap-1"
                  >
                    {day.durationSec > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(day.durationSec)}
                      </span>
                    )}
                    <div
                      className="w-full bg-primary/80 rounded-t-md transition-all min-h-[2px]"
                      style={{
                        height: `${Math.max(heightPct, day.durationSec > 0 ? 5 : 2)}%`,
                      }}
                    />
                    <span className="text-xs text-muted-foreground">{dayName}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top practiced licks */}
          <div className="bg-card border border-border rounded-xl p-4">
            <h3 className="text-sm font-medium mb-3">Most Practiced</h3>
            {stats.topLicks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No practice data yet.</p>
            ) : (
              <div className="space-y-2">
                {stats.topLicks.map((lick, idx) => (
                  <button
                    key={lick.id}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted transition-colors text-left"
                    onClick={() => router.push(`/licks/${lick.id}`)}
                  >
                    <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lick.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {lick.sessionCount} {lick.sessionCount === 1 ? "session" : "sessions"}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground shrink-0">
                      {formatDuration(lick.totalDurationSec)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
