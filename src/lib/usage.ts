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
  /** ISO day the game was played (local). */
  gameDate: string;
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

/** Today's date the way the dugout stamps games (server-local). */
export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Innings that actually happened in a game. The inning stepper is the
 * source of truth when the coach used it — but the dugout doesn't force
 * ceremony, so a finished (or past-date) game whose stepper never moved
 * off inning 1 counts its full planned innings: the game happened, the
 * lineup plan covered it. Today's unfinished games count completed
 * innings only (current − 1), matching the dugout's own bench math.
 */
export function countedInnings(game: UsageGame, todayIso: string): number {
  const stepped = game.currentInning > 1;
  if (game.status === "final") {
    return stepped ? Math.min(game.currentInning, 9) : game.innings;
  }
  if (!stepped && game.gameDate < todayIso) return game.innings;
  return Math.max(0, game.currentInning - 1);
}

export function computeSeasonUsage(
  games: UsageGame[],
  assignments: UsageAssignment[],
  todayIso: string = todayIsoLocal(),
): Map<string, PlayerUsage> {
  const cutoff = new Map(games.map((g) => [g.id, countedInnings(g, todayIso)]));
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
