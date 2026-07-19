import type { AvailabilityStatus, RsvpStatus } from "@/db/schema";

export interface AvailabilityRow {
  playerId: string;
  day: string; // ISO YYYY-MM-DD
  status: AvailabilityStatus;
}

/**
 * The Saturday anchoring the tournament weekend a day belongs to.
 * Weekends run Mon–Sun, so a Friday-night pool game, Saturday, and Sunday
 * all land on the same anchor.
 */
export function anchorSaturday(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const delta = dow === 6 ? 0 : dow === 0 ? -1 : 6 - dow;
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Cycle for grid taps: unanswered → yes → maybe → no → yes … */
export function nextStatus(current: AvailabilityStatus | undefined): RsvpStatus {
  switch (current) {
    case "yes":
      return "maybe";
    case "maybe":
      return "no";
    case "no":
      return "yes";
    default:
      return "yes";
  }
}

export interface DayCount {
  day: string;
  yes: number;
  maybe: number;
  no: number;
}

export interface WeekendSummary {
  anchor: string; // Saturday ISO
  days: DayCount[]; // chronological
  /** Worst "yes" count across the Sat/Sun core (all days if no Sat/Sun). */
  minYes: number;
}

/**
 * Group availability answers into tournament weekends and count only the
 * players who can actually take the field (the full roster — practice and
 * hopeful players don't factor into whether a weekend is playable).
 */
export function weekendRollup(
  rows: AvailabilityRow[],
  fullPlayerIds: Set<string>,
): WeekendSummary[] {
  const byAnchor = new Map<string, Map<string, DayCount>>();
  for (const row of rows) {
    if (!fullPlayerIds.has(row.playerId)) continue;
    const anchor = anchorSaturday(row.day);
    const days = byAnchor.get(anchor) ?? new Map<string, DayCount>();
    const count = days.get(row.day) ?? { day: row.day, yes: 0, maybe: 0, no: 0 };
    if (row.status === "yes") count.yes++;
    else if (row.status === "maybe") count.maybe++;
    else if (row.status === "no") count.no++;
    days.set(row.day, count);
    byAnchor.set(anchor, days);
  }
  const summaries: WeekendSummary[] = [];
  for (const [anchor, dayMap] of byAnchor) {
    const days = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));
    const core = days.filter((d) => {
      const dow = new Date(`${d.day}T00:00:00Z`).getUTCDay();
      return dow === 6 || dow === 0;
    });
    const scored = core.length > 0 ? core : days;
    const minYes = Math.min(...scored.map((d) => d.yes));
    summaries.push({ anchor, days, minYes });
  }
  return summaries.sort(
    (a, b) => b.minYes - a.minYes || a.anchor.localeCompare(b.anchor),
  );
}
