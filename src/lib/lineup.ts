import { POSITIONS, type Position } from "@/db/schema";

// Strongest-lineup solver (goal 3): assign players to the nine positions to
// maximize total blended rating, honoring pinned choices. Exact optimum via
// the Hungarian algorithm — at 9 positions x a dozen players this runs in
// microseconds, so the page can re-solve on every request.

export interface LineupCandidate {
  playerId: string;
  name: string;
  /** Blended rating per position; missing positions default to 1. */
  ratings: ReadonlyMap<Position, number>;
}

export interface LineupAssignment {
  playerId: string;
  name: string;
  rating: number;
  pinned: boolean;
  /** No coach has rated this player here — the 1 is a guess, not a grade. */
  unrated: boolean;
}

export interface LineupSolution {
  assignments: Record<Position, LineupAssignment | null>;
  bench: LineupCandidate[];
  total: number;
  warnings: string[];
}

const MISSING_RATING = 1;

function ratingOf(c: LineupCandidate, pos: Position): number {
  return c.ratings.get(pos) ?? MISSING_RATING;
}

/**
 * Kuhn–Munkres on a rows<=cols cost matrix; returns col index per row.
 * Classic potentials formulation, O(rows² · cols).
 */
export function hungarianMin(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  if (n === 0) return [];
  if (n > m) throw new Error("hungarianMin requires rows <= cols");
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0);
  const way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }
  const result = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] > 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

export function solveLineup(
  pool: LineupCandidate[],
  pins: Partial<Record<Position, string>> = {},
): LineupSolution {
  const warnings: string[] = [];
  const assignments = {} as Record<Position, LineupAssignment | null>;
  for (const pos of POSITIONS) assignments[pos] = null;

  // Apply pins first; a player can hold only one position.
  const pinnedPlayerIds = new Set<string>();
  for (const pos of POSITIONS) {
    const playerId = pins[pos];
    if (!playerId) continue;
    if (pinnedPlayerIds.has(playerId)) {
      warnings.push(`Ignored duplicate pin for position ${pos}.`);
      continue;
    }
    const candidate = pool.find((c) => c.playerId === playerId);
    if (!candidate) {
      warnings.push(`Pinned player for ${pos} is not in the available pool.`);
      continue;
    }
    assignments[pos] = {
      playerId,
      name: candidate.name,
      rating: ratingOf(candidate, pos),
      pinned: true,
      unrated: !candidate.ratings.has(pos),
    };
    pinnedPlayerIds.add(playerId);
  }

  const openPositions = POSITIONS.filter((pos) => !assignments[pos]);
  const free = pool.filter((c) => !pinnedPlayerIds.has(c.playerId));

  if (openPositions.length > 0 && free.length > 0) {
    // Rows = open positions, cols = free players padded with dummies so the
    // matrix is at least square. Dummy value 0 → positions go unfilled only
    // when the team is short-handed.
    const cols = Math.max(free.length, openPositions.length);
    const cost = openPositions.map((pos) =>
      Array.from({ length: cols }, (_, j) =>
        j < free.length ? 10 - ratingOf(free[j], pos) : 10,
      ),
    );
    const result = hungarianMin(cost);
    for (let r = 0; r < openPositions.length; r++) {
      const j = result[r];
      if (j >= 0 && j < free.length) {
        const c = free[j];
        assignments[openPositions[r]] = {
          playerId: c.playerId,
          name: c.name,
          rating: ratingOf(c, openPositions[r]),
          pinned: false,
          unrated: !c.ratings.has(openPositions[r]),
        };
      }
    }
  }

  const assignedIds = new Set(
    Object.values(assignments)
      .filter((a): a is LineupAssignment => a !== null)
      .map((a) => a.playerId),
  );
  const bench = pool.filter((c) => !assignedIds.has(c.playerId));
  const unfilled = POSITIONS.filter((pos) => !assignments[pos]);
  if (unfilled.length > 0) {
    warnings.push(
      `Short-handed: ${unfilled.join(", ")} unfilled with ${pool.length} available.`,
    );
  }
  const total = Object.values(assignments).reduce(
    (sum, a) => sum + (a?.rating ?? 0),
    0,
  );
  return { assignments, bench, total, warnings };
}
