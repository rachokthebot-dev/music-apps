/**
 * Pure utility functions for practice statistics.
 * These operate on data — no Prisma dependency.
 */

/**
 * Calculate a practice streak from a list of session dates.
 * Returns the number of consecutive days with practice, counting back from today.
 */
export function calculateStreak(sessionDates: Date[]): number {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const daySet = new Set<string>();
  for (const d of sessionDates) {
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  let streak = 0;
  const checkDate = new Date(todayStart);
  const todayKey = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;

  // If no practice today, start checking from yesterday
  if (!daySet.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

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

export interface DailyBreakdown {
  date: string; // ISO date string (YYYY-MM-DD)
  totalSec: number;
}

/**
 * Build a 7-day breakdown from daily duration data.
 * Pass a function that returns the total seconds for a given day range.
 */
export async function buildDailyBreakdown(
  getDayTotal: (dayStart: Date, dayEnd: Date) => Promise<number>
): Promise<DailyBreakdown[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const breakdown: DailyBreakdown[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = new Date(todayStart);
    dayStart.setDate(dayStart.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const totalSec = await getDayTotal(dayStart, dayEnd);
    breakdown.push({
      date: dayStart.toISOString().split("T")[0],
      totalSec,
    });
  }

  return breakdown;
}

/**
 * Get the start of today and the start of the current week (Sunday).
 */
export function getDateRanges() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
  return { todayStart, weekStart };
}
