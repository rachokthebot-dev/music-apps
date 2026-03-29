"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface PracticeSession {
  id: string;
  startedAt: string; // ISO string
  endedAt: string | null;
  durationSec: number;
  progressionId: string;
  key: string;
  tempo: number;
  complexityLevel: string;
}

export interface DailyBreakdown {
  date: string; // YYYY-MM-DD
  totalSec: number;
}

export interface PracticeStats {
  todaySec: number;
  weekSec: number;
  allTimeSec: number;
  streak: number;
  dailyBreakdown: DailyBreakdown[];
}

const STORAGE_KEY = "chordcraft-practice-sessions";

function loadSessions(): PracticeSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveSessions(sessions: PracticeSession[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function calculateStreak(sessions: PracticeSession[]): number {
  const completedSessions = sessions.filter((s) => s.endedAt && s.durationSec > 0);
  if (completedSessions.length === 0) return 0;

  const daySet = new Set<string>();
  for (const s of completedSessions) {
    const d = new Date(s.startedAt);
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  const now = new Date();
  const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

  if (!daySet.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  let streak = 0;
  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (daySet.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function buildDailyBreakdown(sessions: PracticeSession[]): DailyBreakdown[] {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const breakdown: DailyBreakdown[] = [];

  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const totalSec = sessions
      .filter((s) => {
        if (!s.endedAt || s.durationSec <= 0) return false;
        const d = new Date(s.startedAt);
        return d >= dayStart && d < dayEnd;
      })
      .reduce((sum, s) => sum + s.durationSec, 0);

    breakdown.push({
      date: dayStart.toISOString().split("T")[0],
      totalSec,
    });
  }

  return breakdown;
}

function computeStats(sessions: PracticeSession[]): PracticeStats {
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

  return {
    todaySec,
    weekSec,
    allTimeSec,
    streak: calculateStreak(sessions),
    dailyBreakdown: buildDailyBreakdown(sessions),
  };
}

export function usePracticeStats() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [stats, setStats] = useState<PracticeStats>({
    todaySec: 0,
    weekSec: 0,
    allTimeSec: 0,
    streak: 0,
    dailyBreakdown: [],
  });
  const activeSessionRef = useRef<string | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load sessions on mount
  useEffect(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    setStats(computeStats(loaded));
  }, []);

  const refreshStats = useCallback(() => {
    const loaded = loadSessions();
    setSessions(loaded);
    setStats(computeStats(loaded));
  }, []);

  const startSession = useCallback(
    (progressionId: string, key: string, tempo: number, complexityLevel: string) => {
      // End any active session first
      if (activeSessionRef.current) {
        endSessionInternal(activeSessionRef.current);
      }

      const session: PracticeSession = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        startedAt: new Date().toISOString(),
        endedAt: null,
        durationSec: 0,
        progressionId,
        key,
        tempo,
        complexityLevel,
      };

      const updated = [...loadSessions(), session];
      saveSessions(updated);
      setSessions(updated);
      activeSessionRef.current = session.id;

      // Set 30s inactivity timer
      resetInactivityTimer();

      return session.id;
    },
    []
  );

  const endSessionInternal = (sessionId: string) => {
    const all = loadSessions();
    const idx = all.findIndex((s) => s.id === sessionId);
    if (idx === -1) return;

    const session = all[idx];
    if (session.endedAt) return; // already ended

    const endedAt = new Date();
    const startedAt = new Date(session.startedAt);
    const durationSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

    all[idx] = {
      ...session,
      endedAt: endedAt.toISOString(),
      durationSec: Math.max(0, durationSec),
    };

    saveSessions(all);
    setSessions(all);
    setStats(computeStats(all));
  };

  const endSession = useCallback(() => {
    if (activeSessionRef.current) {
      endSessionInternal(activeSessionRef.current);
      activeSessionRef.current = null;
    }
    clearInactivityTimer();
  }, []);

  const resetInactivityTimer = () => {
    clearInactivityTimer();
    inactivityTimerRef.current = setTimeout(() => {
      if (activeSessionRef.current) {
        endSessionInternal(activeSessionRef.current);
        activeSessionRef.current = null;
      }
    }, 30000); // 30 seconds
  };

  const clearInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
  };

  // Call this on user activity (chord changes, etc.) to reset the inactivity timer
  const recordActivity = useCallback(() => {
    if (activeSessionRef.current) {
      resetInactivityTimer();
    }
  }, []);

  return {
    stats,
    startSession,
    endSession,
    recordActivity,
    refreshStats,
    activeSessionId: activeSessionRef.current,
  };
}

// Utility to format seconds as human-readable
export function formatDuration(totalSec: number): string {
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}
