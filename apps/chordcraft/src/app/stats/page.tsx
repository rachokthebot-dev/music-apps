"use client";

import { useEffect, useState } from "react";
import { usePracticeStats, formatDuration, type PracticeStats } from "@/hooks/usePracticeStats";
import { Flame, Clock, Calendar, TrendingUp } from "lucide-react";

export default function StatsPage() {
  const { stats, refreshStats } = usePracticeStats();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    refreshStats();
  }, [refreshStats]);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading stats...</div>
      </div>
    );
  }

  const maxDailySec = Math.max(...stats.dailyBreakdown.map((d) => d.totalSec), 1);

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl md:text-3xl font-bold mb-6">Practice Stats</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-8">
        <StatCard
          icon={<Clock className="w-5 h-5 text-blue-400" />}
          label="Today"
          value={formatDuration(stats.todaySec)}
        />
        <StatCard
          icon={<Calendar className="w-5 h-5 text-purple-400" />}
          label="This Week"
          value={formatDuration(stats.weekSec)}
        />
        <StatCard
          icon={<Flame className="w-5 h-5 text-orange-400" />}
          label="Streak"
          value={stats.streak > 0 ? `${stats.streak} day${stats.streak !== 1 ? "s" : ""}` : "No streak"}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5 text-green-400" />}
          label="All Time"
          value={formatDuration(stats.allTimeSec)}
        />
      </div>

      {/* 7-day bar chart */}
      <div className="bg-card border border-border rounded-xl p-4 md:p-6">
        <h2 className="text-sm md:text-base font-semibold text-muted-foreground mb-4">Last 7 Days</h2>
        <div className="flex items-end gap-2 md:gap-3 h-40 md:h-52">
          {stats.dailyBreakdown.map((day) => {
            const height = day.totalSec > 0 ? Math.max((day.totalSec / maxDailySec) * 100, 4) : 0;
            const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "short",
            });
            const isToday =
              day.date === new Date().toISOString().split("T")[0];

            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                {day.totalSec > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatDuration(day.totalSec)}
                  </span>
                )}
                <div
                  className={`w-full rounded-t-md transition-all ${
                    isToday ? "bg-primary" : "bg-primary/50"
                  }`}
                  style={{ height: `${height}%`, minHeight: day.totalSec > 0 ? "4px" : "0px" }}
                />
                <span
                  className={`text-[10px] ${
                    isToday ? "text-primary font-semibold" : "text-muted-foreground"
                  }`}
                >
                  {dayLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {stats.allTimeSec === 0 && (
        <div className="mt-8 text-center text-muted-foreground text-sm">
          No practice sessions yet. Start practicing to see your stats!
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-xs md:text-sm text-muted-foreground">{label}</div>
        <div className="text-lg md:text-xl font-bold mt-0.5">{value}</div>
      </div>
    </div>
  );
}
