import { and, desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { Position } from "@/db/schema";

export interface CurrentRating {
  playerId: string;
  position: Position;
  rater: string;
  rating: number;
  createdAt: Date;
}

/**
 * The current matrix: latest rating per (player, position, rater) for a
 * season. Older rows are history and stay in the table.
 */
export async function getCurrentRatings(seasonId: string): Promise<CurrentRating[]> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.positionRatings.playerId,
      position: tables.positionRatings.position,
      rater: tables.positionRatings.rater,
      rating: tables.positionRatings.rating,
      createdAt: tables.positionRatings.createdAt,
    })
    .from(tables.positionRatings)
    .where(eq(tables.positionRatings.seasonId, seasonId))
    .orderBy(desc(tables.positionRatings.createdAt));
  const seen = new Set<string>();
  const current: CurrentRating[] = [];
  for (const r of rows) {
    const key = `${r.playerId}|${r.position}|${r.rater}`;
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(r);
  }
  return current;
}

export function listRaters(ratings: CurrentRating[]): string[] {
  return [...new Set(ratings.map((r) => r.rater))].sort();
}

/** rater -> playerId -> position -> rating */
export function ratingLookup(
  ratings: CurrentRating[],
): Map<string, Map<string, Map<Position, number>>> {
  const map = new Map<string, Map<string, Map<Position, number>>>();
  for (const r of ratings) {
    const byPlayer = map.get(r.rater) ?? new Map();
    const byPos = byPlayer.get(r.playerId) ?? new Map();
    byPos.set(r.position, r.rating);
    byPlayer.set(r.playerId, byPos);
    map.set(r.rater, byPlayer);
  }
  return map;
}

/** playerId -> position -> mean of each rater's current rating */
export function blendedLookup(
  ratings: CurrentRating[],
): Map<string, Map<Position, number>> {
  const sums = new Map<string, Map<Position, { total: number; n: number }>>();
  for (const r of ratings) {
    const byPos = sums.get(r.playerId) ?? new Map();
    const cell = byPos.get(r.position) ?? { total: 0, n: 0 };
    cell.total += r.rating;
    cell.n += 1;
    byPos.set(r.position, cell);
    sums.set(r.playerId, byPos);
  }
  const out = new Map<string, Map<Position, number>>();
  for (const [playerId, byPos] of sums) {
    const m = new Map<Position, number>();
    for (const [pos, { total, n }] of byPos) {
      m.set(pos, Math.round((total / n) * 10) / 10);
    }
    out.set(playerId, m);
  }
  return out;
}

export async function insertRatingIfChanged(params: {
  seasonId: string;
  playerId: string;
  position: Position;
  rating: number;
  rater: string;
  createdByUserId?: string;
}): Promise<boolean> {
  const db = await getDb();
  const [latest] = await db
    .select({ rating: tables.positionRatings.rating })
    .from(tables.positionRatings)
    .where(
      and(
        eq(tables.positionRatings.seasonId, params.seasonId),
        eq(tables.positionRatings.playerId, params.playerId),
        eq(tables.positionRatings.position, params.position),
        eq(tables.positionRatings.rater, params.rater),
      ),
    )
    .orderBy(desc(tables.positionRatings.createdAt))
    .limit(1);
  if (latest && latest.rating === params.rating) return false;
  await db.insert(tables.positionRatings).values({
    seasonId: params.seasonId,
    playerId: params.playerId,
    position: params.position,
    rating: params.rating,
    rater: params.rater,
    createdByUserId: params.createdByUserId ?? null,
  });
  return true;
}
