import { and, desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { RsvpStatus } from "@/db/schema";
import type { RosterPlayer } from "@/lib/data";
import {
  pitchEligibility,
  type DayPitches,
  type Eligibility,
} from "@/lib/pitchsmart";

// The landing screen is a triage surface: everything here reads existing
// tables and reduces them to "what needs a coach's attention right now".

// ---------- pure helpers (unit-tested) ----------

/**
 * The event the homepage leads with: the first one still in progress or
 * upcoming. An event with no end time counts as in progress for three
 * hours — a practice shouldn't vanish from the hero the minute it starts.
 */
export function pickNextEvent<T extends { startsAt: Date; endsAt: Date | null }>(
  events: T[],
  now: Date,
): T | null {
  const FALLBACK_MS = 3 * 60 * 60 * 1000;
  const stillRelevant = events
    .filter((e) => (e.endsAt ?? new Date(e.startsAt.getTime() + FALLBACK_MS)) >= now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return stillRelevant[0] ?? null;
}

export interface EventHeadcount {
  yes: number;
  no: number;
  maybe: number;
  unanswered: number;
  unansweredNames: string[];
}

/** RSVP tallies for one event, counting silence as its own bucket. */
export function eventHeadcount(
  roster: Pick<RosterPlayer, "playerId" | "firstName">[],
  rsvps: Map<string, RsvpStatus> | undefined,
): EventHeadcount {
  const counts = { yes: 0, no: 0, maybe: 0, unanswered: 0, unansweredNames: [] as string[] };
  for (const p of roster) {
    const status = rsvps?.get(p.playerId);
    if (status === "yes") counts.yes++;
    else if (status === "no") counts.no++;
    else if (status === "maybe") counts.maybe++;
    else {
      counts.unanswered++;
      counts.unansweredNames.push(p.firstName);
    }
  }
  return counts;
}

export interface RestingPitcher {
  playerId: string;
  eligibility: Eligibility;
}

/**
 * Players who may not pitch today under Pitch Smart — the homepage flags
 * them so a rest day isn't discovered mid-game. `history` may span any
 * number of players/days; only genuinely blocked players come back.
 */
export function restingPitchers(
  history: { playerId: string; day: string; pitches: number }[],
  todayIso: string,
): RestingPitcher[] {
  // Rest tiers apply to a day's TOTAL. pitchEligibility only sums same-day
  // rows for "today", so collapse per (player, day) before judging.
  const totals = new Map<string, Map<string, number>>();
  for (const h of history) {
    const days = totals.get(h.playerId) ?? new Map<string, number>();
    days.set(h.day, (days.get(h.day) ?? 0) + h.pitches);
    totals.set(h.playerId, days);
  }
  const out: RestingPitcher[] = [];
  for (const [playerId, days] of totals) {
    const list: DayPitches[] = [...days].map(([day, pitches]) => ({ day, pitches }));
    const e = pitchEligibility(list, todayIso);
    if (!e.eligible && e.nextEligibleDay) out.push({ playerId, eligibility: e });
  }
  return out.sort((a, b) =>
    (b.eligibility.nextEligibleDay ?? "").localeCompare(a.eligibility.nextEligibleDay ?? ""),
  );
}

// ---------- queries ----------

/** Roster players with zero matrix ratings this season, from any coach. */
export async function getUnratedPlayers(
  seasonId: string,
  roster: RosterPlayer[],
): Promise<RosterPlayer[]> {
  const db = await getDb();
  const rated = await db
    .selectDistinct({ playerId: tables.positionRatings.playerId })
    .from(tables.positionRatings)
    .where(eq(tables.positionRatings.seasonId, seasonId));
  const ratedIds = new Set(rated.map((r) => r.playerId));
  return roster.filter((p) => !ratedIds.has(p.playerId));
}

export interface ReportMonthProgress {
  started: number;
  published: number;
}

/** How far this month's parent reports have gotten. */
export async function getReportMonthProgress(
  seasonId: string,
  month: string,
): Promise<ReportMonthProgress> {
  const db = await getDb();
  const thisMonth = await db
    .select({ status: tables.reports.status })
    .from(tables.reports)
    .where(
      and(eq(tables.reports.seasonId, seasonId), eq(tables.reports.month, month)),
    );
  return {
    started: thisMonth.length,
    published: thisMonth.filter((r) => r.status === "published").length,
  };
}

/** Per-player per-day pitch totals for the last week of live games. */
export async function getRecentPitchDays(
  seasonId: string,
  sinceIsoDay: string,
): Promise<{ playerId: string; day: string; pitches: number }[]> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.pitchCounts.playerId,
      day: tables.liveGames.gameDate,
      pitches: tables.pitchCounts.pitches,
    })
    .from(tables.pitchCounts)
    .innerJoin(tables.liveGames, eq(tables.pitchCounts.gameId, tables.liveGames.id))
    .where(eq(tables.liveGames.seasonId, seasonId));
  const byKey = new Map<string, { playerId: string; day: string; pitches: number }>();
  for (const r of rows) {
    if (r.day < sinceIsoDay) continue;
    const key = `${r.playerId}|${r.day}`;
    const agg = byKey.get(key) ?? { playerId: r.playerId, day: r.day, pitches: 0 };
    agg.pitches += r.pitches;
    byKey.set(key, agg);
  }
  return [...byKey.values()];
}

/** The game currently being run from the dugout, if any. */
export async function getLiveGame(seasonId: string) {
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(
      and(
        eq(tables.liveGames.seasonId, seasonId),
        eq(tables.liveGames.status, "live"),
      ),
    )
    .orderBy(desc(tables.liveGames.createdAt))
    .limit(1);
  return game ?? null;
}

/** Latest stat game — the "pulse" line for the Stats tile. */
export async function getLatestStatGame(seasonId: string) {
  const db = await getDb();
  const [row] = await db
    .select({
      label: tables.statGames.label,
      opponent: tables.statGames.opponent,
      gameDate: tables.statGames.gameDate,
    })
    .from(tables.statGames)
    .where(eq(tables.statGames.seasonId, seasonId))
    .orderBy(desc(tables.statGames.gameDate))
    .limit(1);
  return row ?? null;
}

/** Distinct matrix raters this season — context for the Matrix tile. */
export async function getRaterCount(seasonId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .selectDistinct({ rater: tables.positionRatings.rater })
    .from(tables.positionRatings)
    .where(eq(tables.positionRatings.seasonId, seasonId));
  return rows.length;
}

export async function getActiveDrillCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: tables.drills.id })
    .from(tables.drills)
    .where(eq(tables.drills.active, true));
  return rows.length;
}
