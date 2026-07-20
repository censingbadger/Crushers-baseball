import { BENCH } from "@/lib/gameday";

// The season playing-time ledger. Youth coaching guides are unanimous that
// playing-time disputes are settled with documentation — innings played,
// innings sat, positions tried — and the dugout already records all of it
// per game. This rolls it up across games so fairness is a fact, not a
// recollection.

export interface UsageGame {
  id: string;
  status: string; // "setup" | "live" | "final"
  currentInning: number;
  innings: number;
}

export interface UsageAssignment {
  gameId: string;
  inning: number;
  playerId: string;
  position: string; // Position | BENCH
}

export interface PlayerUsage {
  playerId: string;
  /** Games the player appeared in (any assignment row). */
  games: number;
  fieldInnings: number;
  benchInnings: number;
  /** Bench share of innings present, 0..1; null before any innings. */
  satShare: number | null;
  /** Field innings by position, most-used first. */
  positions: [string, number][];
}

/**
 * Innings that actually happened in a game: everything up to the current
 * inning for a finished game, and completed innings only (current - 1)
 * while a game is in progress — matching the dugout's own bench math.
 */
export function countedInnings(game: UsageGame): number {
  if (game.status === "final") return Math.min(game.currentInning, 9);
  return Math.max(0, game.currentInning - 1);
}

export function computeSeasonUsage(
  games: UsageGame[],
  assignments: UsageAssignment[],
): Map<string, PlayerUsage> {
  const cutoff = new Map(games.map((g) => [g.id, countedInnings(g)]));
  const acc = new Map<
    string,
    { games: Set<string>; field: number; bench: number; positions: Map<string, number> }
  >();
  for (const a of assignments) {
    const max = cutoff.get(a.gameId);
    if (max === undefined || a.inning > max) continue;
    const cur =
      acc.get(a.playerId) ??
      { games: new Set<string>(), field: 0, bench: 0, positions: new Map<string, number>() };
    cur.games.add(a.gameId);
    if (a.position === BENCH) {
      cur.bench++;
    } else {
      cur.field++;
      cur.positions.set(a.position, (cur.positions.get(a.position) ?? 0) + 1);
    }
    acc.set(a.playerId, cur);
  }
  const out = new Map<string, PlayerUsage>();
  for (const [playerId, c] of acc) {
    const present = c.field + c.bench;
    out.set(playerId, {
      playerId,
      games: c.games.size,
      fieldInnings: c.field,
      benchInnings: c.bench,
      satShare: present > 0 ? c.bench / present : null,
      positions: [...c.positions.entries()].sort((a, b) => b[1] - a[1]),
    });
  }
  return out;
}
