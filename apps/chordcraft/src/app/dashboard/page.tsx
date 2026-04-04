"use client";

import { useEffect, useState, useCallback } from "react";
import { LayoutDashboard, Clock, Flame, Calendar, TrendingUp, Guitar, Music, Headphones } from "lucide-react";
import { getAppUrl, APP_REGISTRY } from "@music-apps/shared/app-registry";
import { AppSwitcher } from "@music-apps/shared/app-switcher";

interface TopItem {
  name: string;
  subtitle: string;
  totalTimeSec: number;
  sessionCount: number;
}

interface AppStats {
  todaySec: number;
  weekSec: number;
  allTimeSec: number;
  streak: number;
  dailyBreakdown: { date: string; totalSec: number }[];
  topItems: TopItem[];
}

interface DashboardData {
  shreddy: AppStats | null;
  lickbank: AppStats | null;
  chordcraft: AppStats | null;
}

const emptyStats: AppStats = {
  todaySec: 0,
  weekSec: 0,
  allTimeSec: 0,
  streak: 0,
  dailyBreakdown: [],
  topItems: [],
};

function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

function getChordCraftStats(): AppStats {
  try {
    const raw = localStorage.getItem("chordcraft-practice-sessions");
    if (!raw) return emptyStats;
    const sessions = JSON.parse(raw) as Array<{
      startedAt: string;
      endedAt: string | null;
      durationSec: number;
    }>;

    const completed = sessions.filter((s) => s.endedAt && s.durationSec > 0);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const todaySec = completed
      .filter((s) => new Date(s.startedAt) >= todayStart)
      .reduce((sum, s) => sum + s.durationSec, 0);
    const weekSec = completed
      .filter((s) => new Date(s.startedAt) >= weekStart)
      .reduce((sum, s) => sum + s.durationSec, 0);
    const allTimeSec = completed.reduce((sum, s) => sum + s.durationSec, 0);

    // Daily breakdown
    const dailyBreakdown: { date: string; totalSec: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(todayStart);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const total = completed
        .filter((s) => {
          const d = new Date(s.startedAt);
          return d >= dayStart && d < dayEnd;
        })
        .reduce((sum, s) => sum + s.durationSec, 0);
      dailyBreakdown.push({ date: dayStart.toISOString().split("T")[0], totalSec: total });
    }

    // Streak
    const daySet = new Set<string>();
    for (const s of completed) {
      const d = new Date(s.startedAt);
      daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    }
    const checkDate = new Date(todayStart);
    const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (!daySet.has(todayKey)) checkDate.setDate(checkDate.getDate() - 1);
    let streak = 0;
    while (daySet.has(`${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    return { todaySec, weekSec, allTimeSec, streak, dailyBreakdown, topItems: [] };
  } catch {
    return emptyStats;
  }
}

async function fetchAppStats(appId: string): Promise<AppStats | null> {
  const app = APP_REGISTRY.find((a) => a.id === appId);
  if (!app) return null;
  try {
    const baseUrl = `${window.location.protocol}//${window.location.hostname}:${app.port}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${baseUrl}/api/stats`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    // Normalize topSongs (Shreddy) and topLicks (LickBank) to topItems
    const topItems: TopItem[] = [];
    for (const item of data.topSongs ?? []) {
      topItems.push({
        name: item.title ?? "Unknown",
        subtitle: item.artist ?? "",
        totalTimeSec: item.totalTimeSec ?? 0,
        sessionCount: item.sessionCount ?? 0,
      });
    }
    for (const item of data.topLicks ?? []) {
      topItems.push({
        name: item.name ?? "Unknown",
        subtitle: item.sourceTitle ?? "",
        totalTimeSec: item.totalTimeSec ?? 0,
        sessionCount: item.sessionCount ?? 0,
      });
    }
    return {
      todaySec: data.today?.durationSec ?? 0,
      weekSec: data.week?.durationSec ?? 0,
      allTimeSec: data.allTime?.durationSec ?? 0,
      streak: data.streak ?? 0,
      dailyBreakdown: data.dailyBreakdown ?? [],
      topItems,
    };
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({ shreddy: null, lickbank: null, chordcraft: null });
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [shreddy, lickbank] = await Promise.all([
      fetchAppStats("shreddy"),
      fetchAppStats("lickbank"),
    ]);
    const chordcraft = getChordCraftStats();
    setData({ shreddy, lickbank, chordcraft });
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const totals = {
    todaySec: (data.shreddy?.todaySec ?? 0) + (data.lickbank?.todaySec ?? 0) + (data.chordcraft?.todaySec ?? 0),
    weekSec: (data.shreddy?.weekSec ?? 0) + (data.lickbank?.weekSec ?? 0) + (data.chordcraft?.weekSec ?? 0),
    allTimeSec: (data.shreddy?.allTimeSec ?? 0) + (data.lickbank?.allTimeSec ?? 0) + (data.chordcraft?.allTimeSec ?? 0),
    streak: Math.max(data.shreddy?.streak ?? 0, data.lickbank?.streak ?? 0, data.chordcraft?.streak ?? 0),
  };

  // Merge daily breakdowns
  const dailyMap = new Map<string, number>();
  for (const app of [data.shreddy, data.lickbank, data.chordcraft]) {
    for (const day of app?.dailyBreakdown ?? []) {
      dailyMap.set(day.date, (dailyMap.get(day.date) ?? 0) + day.totalSec);
    }
  }
  const dailyBreakdown = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totalSec]) => ({ date, totalSec }));
  const maxDailySec = Math.max(...dailyBreakdown.map((d) => d.totalSec), 1);

  const apps = [
    { id: "shreddy", name: "Shreddy", stats: data.shreddy, icon: Guitar, color: "text-orange-400", bg: "bg-orange-500/15" },
    { id: "lickbank", name: "LickBank", stats: data.lickbank, icon: Headphones, color: "text-blue-400", bg: "bg-blue-500/15" },
    { id: "chordcraft", name: "ChordCraft", stats: data.chordcraft, icon: Music, color: "text-purple-400", bg: "bg-purple-500/15" },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <header className="border-b border-border px-4 md:px-6 py-3 md:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 md:w-7 md:h-7 text-emerald-400" />
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <AppSwitcher currentAppId="dashboard" />
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">Loading stats...</div>
        ) : (
          <div className="space-y-6">
            {/* Total stats */}
            <div className="grid grid-cols-2 gap-3 md:gap-4">
              <StatCard icon={<Clock className="w-5 h-5 text-blue-400" />} label="Today" value={formatDuration(totals.todaySec)} />
              <StatCard icon={<Calendar className="w-5 h-5 text-purple-400" />} label="This Week" value={formatDuration(totals.weekSec)} />
              <StatCard icon={<Flame className="w-5 h-5 text-orange-400" />} label="Best Streak" value={totals.streak > 0 ? `${totals.streak} day${totals.streak !== 1 ? "s" : ""}` : "No streak"} />
              <StatCard icon={<TrendingUp className="w-5 h-5 text-green-400" />} label="All Time" value={formatDuration(totals.allTimeSec)} />
            </div>

            {/* 7-day chart */}
            {dailyBreakdown.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 md:p-6">
                <h2 className="text-sm md:text-base font-semibold text-muted-foreground mb-4">Last 7 Days (All Apps)</h2>
                <div className="flex items-end gap-2 md:gap-3 h-36 md:h-48">
                  {dailyBreakdown.map((day) => {
                    const height = day.totalSec > 0 ? Math.max((day.totalSec / maxDailySec) * 100, 4) : 0;
                    const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                    const isToday = day.date === new Date().toISOString().split("T")[0];

                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        {day.totalSec > 0 && (
                          <span className="text-[10px] text-muted-foreground">{formatDuration(day.totalSec)}</span>
                        )}
                        <div
                          className={`w-full rounded-t-md transition-all ${isToday ? "bg-emerald-500" : "bg-emerald-500/50"}`}
                          style={{ height: `${height}%`, minHeight: day.totalSec > 0 ? "4px" : "0px" }}
                        />
                        <span className={`text-[10px] ${isToday ? "text-emerald-400 font-semibold" : "text-muted-foreground"}`}>
                          {dayLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Per-app breakdown */}
            <div className="space-y-3">
              <h2 className="text-sm md:text-base font-semibold text-muted-foreground">By App</h2>
              {apps.map((app) => {
                const Icon = app.icon;
                const stats = app.stats;
                const isExpanded = selectedApp === app.id;
                return (
                  <div key={app.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <button
                      className="w-full p-4 md:p-5 flex items-center gap-4 hover:bg-muted/30 transition-colors"
                      onClick={() => setSelectedApp(isExpanded ? null : app.id)}
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${app.bg}`}>
                        <Icon className={`w-5 h-5 ${app.color}`} />
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-semibold text-sm">{app.name}</div>
                        {stats ? (
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                            <span>Today: {formatDuration(stats.todaySec)}</span>
                            <span>Week: {formatDuration(stats.weekSec)}</span>
                            <span>Total: {formatDuration(stats.allTimeSec)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">Not available</span>
                        )}
                      </div>
                      {stats && stats.streak > 0 && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
                          <Flame className="w-3 h-3" />
                          {stats.streak}
                        </div>
                      )}
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Expanded detail view */}
                    {isExpanded && stats && (
                      <div className="border-t border-border px-4 md:px-5 py-4 space-y-4">
                        {/* App 7-day chart */}
                        {stats.dailyBreakdown.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-muted-foreground mb-3">Last 7 Days</h3>
                            <div className="flex items-end gap-2 h-24">
                              {stats.dailyBreakdown.map((day) => {
                                const maxSec = Math.max(...stats.dailyBreakdown.map((d) => d.totalSec), 1);
                                const height = day.totalSec > 0 ? Math.max((day.totalSec / maxSec) * 100, 4) : 0;
                                const dayLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                                const isToday = day.date === new Date().toISOString().split("T")[0];
                                return (
                                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                                    {day.totalSec > 0 && (
                                      <span className="text-[9px] text-muted-foreground">{formatDuration(day.totalSec)}</span>
                                    )}
                                    <div
                                      className={`w-full rounded-t-sm ${isToday ? app.color.replace("text-", "bg-") : app.color.replace("text-", "bg-").replace("400", "500/40")}`}
                                      style={{ height: `${height}%`, minHeight: day.totalSec > 0 ? "3px" : "0px" }}
                                    />
                                    <span className={`text-[9px] ${isToday ? `${app.color} font-semibold` : "text-muted-foreground"}`}>
                                      {dayLabel}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Top songs/licks */}
                        {stats.topItems.length > 0 && (
                          <div>
                            <h3 className="text-xs font-semibold text-muted-foreground mb-2">
                              Most Practiced This Week
                            </h3>
                            <div className="space-y-1.5">
                              {stats.topItems.map((item, idx) => {
                                const maxTime = stats.topItems[0]?.totalTimeSec ?? 1;
                                const barPct = Math.max((item.totalTimeSec / maxTime) * 100, 2);
                                return (
                                  <div key={idx} className="relative">
                                    <div
                                      className={`absolute inset-y-0 left-0 rounded-md ${app.bg} opacity-60`}
                                      style={{ width: `${barPct}%` }}
                                    />
                                    <div className="relative flex items-center justify-between px-3 py-2">
                                      <div className="min-w-0">
                                        <span className="text-sm font-medium">{item.name}</span>
                                        {item.subtitle && (
                                          <span className="text-xs text-muted-foreground ml-2">{item.subtitle}</span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 shrink-0 ml-2">
                                        <span className="text-xs text-muted-foreground">{item.sessionCount} sessions</span>
                                        <span className="text-sm font-semibold">{formatDuration(item.totalTimeSec)}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {stats.topItems.length === 0 && stats.allTimeSec > 0 && (
                          <p className="text-xs text-muted-foreground">No detailed breakdown available for this week.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {totals.allTimeSec === 0 && (
              <div className="text-center text-muted-foreground text-sm py-4">
                No practice sessions yet. Start practicing in any app!
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
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
