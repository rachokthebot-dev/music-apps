"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock, Flame, Music, TrendingUp, Loader2 } from "lucide-react";

interface DailyBreakdown {
  date: string;
  durationSec: number;
}

interface TopSong {
  songId: string;
  title: string;
  artist: string;
  totalTimeSec: number;
  sessionCount: number;
}

interface Stats {
  today: { durationSec: number; sessions: number };
  week: { durationSec: number; sessions: number };
  allTime: { durationSec: number; sessions: number };
  streak: number;
  dailyBreakdown: DailyBreakdown[];
  topSongs: TopSong[];
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export default function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(res => res.json())
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-xl font-semibold text-foreground">Practice Stats</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </main>
    );
  }

  if (!stats) return null;

  const maxDailyTime = Math.max(...stats.dailyBreakdown.map(d => d.durationSec), 1);

  return (
    <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" className="p-2 -ml-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-xl font-semibold text-foreground">Practice Stats</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="size-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatDuration(stats.today.durationSec)}</p>
          <p className="text-xs text-muted-foreground">{stats.today.sessions} session{stats.today.sessions !== 1 ? "s" : ""}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="size-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">This Week</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatDuration(stats.week.durationSec)}</p>
          <p className="text-xs text-muted-foreground">{stats.week.sessions} session{stats.week.sessions !== 1 ? "s" : ""}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="size-4 text-orange-500" />
            <span className="text-xs text-muted-foreground">Streak</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.streak}</p>
          <p className="text-xs text-muted-foreground">day{stats.streak !== 1 ? "s" : ""}</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Music className="size-4 text-violet-500" />
            <span className="text-xs text-muted-foreground">All Time</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatDuration(stats.allTime.durationSec)}</p>
          <p className="text-xs text-muted-foreground">{stats.allTime.sessions} session{stats.allTime.sessions !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Daily bar chart */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Last 7 Days</h2>
        <div className="flex items-end gap-2 h-32">
          {stats.dailyBreakdown.map((day) => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {day.durationSec > 0 ? formatDuration(day.durationSec) : ""}
              </span>
              <div
                className={`w-full rounded-t-md transition-all ${
                  day.durationSec > 0
                    ? "bg-blue-400 dark:bg-blue-500"
                    : "bg-muted"
                }`}
                style={{
                  height: `${Math.max((day.durationSec / maxDailyTime) * 100, day.durationSec > 0 ? 8 : 2)}%`,
                  minHeight: day.durationSec > 0 ? "4px" : "2px",
                }}
              />
              <span className="text-[10px] text-muted-foreground">
                {getDayLabel(day.date)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top practiced songs */}
      {stats.topSongs.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="text-sm font-semibold text-foreground mb-3">Most Practiced This Week</h2>
          <ul className="space-y-2">
            {stats.topSongs.map((song, idx) => (
              <li key={song.songId}>
                <Link
                  href={`/songs/${song.songId}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="text-sm font-medium text-muted-foreground w-5 text-center">{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{song.title}</p>
                    {song.artist && (
                      <p className="text-xs text-muted-foreground truncate">{song.artist}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium text-foreground">{formatDuration(song.totalTimeSec)}</p>
                    <p className="text-[10px] text-muted-foreground">{song.sessionCount} session{song.sessionCount !== 1 ? "s" : ""}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.allTime.sessions === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center size-14 rounded-full bg-muted mb-4">
            <Music className="size-6 text-muted-foreground" />
          </div>
          <p className="text-base font-medium text-foreground mb-1">No practice sessions yet</p>
          <p className="text-sm text-muted-foreground">Start practicing to see your stats here.</p>
        </div>
      )}
    </main>
  );
}
