// Effort math for player pages (goal 12). Progress bars are driven by
// effort the kid controls — sessions done — never by coach ratings.

export interface EffortLog {
  day: string; // ISO YYYY-MM-DD
  totalMinutes: number;
}

/** Monday of the week containing the day (ISO string). */
export function weekAnchor(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export interface EffortSummary {
  weekSessions: number;
  weekMinutes: number;
  monthSessions: number;
  monthMinutes: number;
  /** Consecutive weeks (ending now) with at least one session. Forgiving:
   * a quiet current week doesn't break a streak that ran through last week. */
  streakWeeks: number;
  weekTarget: number;
  monthTarget: number;
}

export const WEEK_TARGET = 3;
export const MONTH_TARGET = 10;

export function effortSummary(logs: EffortLog[], todayIso: string): EffortSummary {
  const thisWeek = weekAnchor(todayIso);
  const thisMonth = todayIso.slice(0, 7);
  let weekSessions = 0;
  let weekMinutes = 0;
  let monthSessions = 0;
  let monthMinutes = 0;
  const weeks = new Set<string>();
  for (const log of logs) {
    const anchor = weekAnchor(log.day);
    weeks.add(anchor);
    if (anchor === thisWeek) {
      weekSessions++;
      weekMinutes += log.totalMinutes;
    }
    if (log.day.slice(0, 7) === thisMonth) {
      monthSessions++;
      monthMinutes += log.totalMinutes;
    }
  }

  let streakWeeks = 0;
  const cursor = new Date(`${thisWeek}T00:00:00Z`);
  // A quiet current week is skipped (not broken) — the streak then counts
  // back from last week.
  if (!weeks.has(thisWeek)) cursor.setUTCDate(cursor.getUTCDate() - 7);
  while (weeks.has(cursor.toISOString().slice(0, 10))) {
    streakWeeks++;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }

  return {
    weekSessions,
    weekMinutes,
    monthSessions,
    monthMinutes,
    streakWeeks,
    weekTarget: WEEK_TARGET,
    monthTarget: MONTH_TARGET,
  };
}

export function barPct(n: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((n / target) * 100)));
}
