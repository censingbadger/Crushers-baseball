import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { Position } from "@/db/schema";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import {
  addBatting,
  addCatching,
  addFielding,
  addPitching,
  EMPTY_BATTING,
  EMPTY_CATCHING,
  EMPTY_FIELDING,
  EMPTY_PITCHING,
  type BattingTotals,
  type CatchingTotals,
  type FieldingTotals,
  type PitchingTotals,
} from "@/lib/stats";

// The "one-stop shop" data: coach matrix ratings and GameChanger season
// stats side by side, keyed by player, for the roster views.

export async function getSeasonBattingByPlayer(
  seasonId: string,
): Promise<Map<string, BattingTotals>> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.battingLines.playerId,
      ab: tables.battingLines.ab,
      r: tables.battingLines.r,
      h: tables.battingLines.h,
      doubles: tables.battingLines.doubles,
      triples: tables.battingLines.triples,
      hr: tables.battingLines.hr,
      rbi: tables.battingLines.rbi,
      bb: tables.battingLines.bb,
      k: tables.battingLines.k,
      sb: tables.battingLines.sb,
      hbp: tables.battingLines.hbp,
      sf: tables.battingLines.sf,
    })
    .from(tables.battingLines)
    .innerJoin(tables.statGames, eq(tables.battingLines.statGameId, tables.statGames.id))
    .where(eq(tables.statGames.seasonId, seasonId));
  const out = new Map<string, BattingTotals>();
  for (const { playerId, ...line } of rows) {
    out.set(playerId, addBatting(out.get(playerId) ?? EMPTY_BATTING, line));
  }
  return out;
}

export async function getSeasonPitchingByPlayer(
  seasonId: string,
): Promise<Map<string, PitchingTotals>> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.pitchingLines.playerId,
      outs: tables.pitchingLines.outs,
      bf: tables.pitchingLines.bf,
      pitches: tables.pitchingLines.pitches,
      h: tables.pitchingLines.h,
      r: tables.pitchingLines.r,
      er: tables.pitchingLines.er,
      bb: tables.pitchingLines.bb,
      k: tables.pitchingLines.k,
    })
    .from(tables.pitchingLines)
    .innerJoin(tables.statGames, eq(tables.pitchingLines.statGameId, tables.statGames.id))
    .where(eq(tables.statGames.seasonId, seasonId));
  const out = new Map<string, PitchingTotals>();
  for (const { playerId, ...line } of rows) {
    out.set(playerId, addPitching(out.get(playerId) ?? EMPTY_PITCHING, line));
  }
  return out;
}

export async function getSeasonFieldingByPlayer(
  seasonId: string,
): Promise<Map<string, FieldingTotals>> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.fieldingLines.playerId,
      po: tables.fieldingLines.po,
      a: tables.fieldingLines.a,
      e: tables.fieldingLines.e,
      dp: tables.fieldingLines.dp,
    })
    .from(tables.fieldingLines)
    .innerJoin(tables.statGames, eq(tables.fieldingLines.statGameId, tables.statGames.id))
    .where(eq(tables.statGames.seasonId, seasonId));
  const out = new Map<string, FieldingTotals>();
  for (const { playerId, ...line } of rows) {
    out.set(playerId, addFielding(out.get(playerId) ?? EMPTY_FIELDING, line));
  }
  return out;
}

export async function getSeasonCatchingByPlayer(
  seasonId: string,
): Promise<Map<string, CatchingTotals>> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.catchingLines.playerId,
      outs: tables.catchingLines.outs,
      pb: tables.catchingLines.pb,
      sbAllowed: tables.catchingLines.sbAllowed,
      cs: tables.catchingLines.cs,
    })
    .from(tables.catchingLines)
    .innerJoin(tables.statGames, eq(tables.catchingLines.statGameId, tables.statGames.id))
    .where(eq(tables.statGames.seasonId, seasonId));
  const out = new Map<string, CatchingTotals>();
  for (const { playerId, ...line } of rows) {
    out.set(playerId, addCatching(out.get(playerId) ?? EMPTY_CATCHING, line));
  }
  return out;
}

/** Blended (all-coach average) matrix ratings, playerId → position → rating. */
export async function getBlendedRatingsByPlayer(
  seasonId: string,
): Promise<Map<string, Map<Position, number>>> {
  return blendedLookup(await getCurrentRatings(seasonId));
}

/** A player's strongest positions by blended rating, best first. */
export function topPositions(
  ratings: Map<Position, number> | undefined,
  count = 2,
): { position: Position; rating: number }[] {
  if (!ratings) return [];
  return [...ratings.entries()]
    .map(([position, rating]) => ({ position, rating }))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, count);
}
