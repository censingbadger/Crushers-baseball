import { POSITIONS } from "@/db/schema";

// Pure helpers for dugout-dashboard state, computed from the per-inning
// assignment rows.

export const BENCH = "BENCH";
export type Slot = (typeof POSITIONS)[number] | typeof BENCH;

export interface AssignmentRow {
  inning: number;
  playerId: string;
  position: string;
}

/** inning -> playerId -> slot */
export function assignmentsByInning(
  rows: AssignmentRow[],
): Map<number, Map<string, string>> {
  const map = new Map<number, Map<string, string>>();
  for (const r of rows) {
    const inning = map.get(r.inning) ?? new Map<string, string>();
    inning.set(r.playerId, r.position);
    map.set(r.inning, inning);
  }
  return map;
}

/** Innings (<= through) a player spent on the bench. */
export function benchInnings(
  rows: AssignmentRow[],
  playerId: string,
  through: number,
): number {
  return rows.filter(
    (r) => r.playerId === playerId && r.position === BENCH && r.inning <= through,
  ).length;
}

/** Innings (<= through) a player spent at a fielding position. */
export function fieldInnings(
  rows: AssignmentRow[],
  playerId: string,
  through: number,
): number {
  return rows.filter(
    (r) =>
      r.playerId === playerId &&
      r.position !== BENCH &&
      r.inning <= through,
  ).length;
}

export interface MovePlan {
  /** rows to write for innings from `inning` to `totalInnings` */
  set: { inning: number; playerId: string; position: string }[];
}

/**
 * Plan a move: put `playerId` at `target` for every inning in
 * [fromInning, toInning], resolving the swap PER INNING against that
 * inning's own alignment (`byInning`: inning → playerId → slot). A
 * planned game holds a different lineup each inning, so the player
 * displaced at `target`, and the slot `playerId` vacates, must be read
 * per inning — otherwise a drag in one inning stamps that inning's
 * occupant across all the others and scrambles the plan (pulling a
 * planned pitcher, double-booking a later inning, punching empty holes).
 * The displaced occupant takes the mover's slot for that inning (a
 * swap); a move to the bench just benches the mover, leaving the vacated
 * spot open. Innings with no alignment yet (unseeded) are skipped, and
 * an inning where the player already holds `target` is left untouched.
 * A fresh game whose innings are identical resolves the same in each, so
 * this is a no-op change for the unplanned case.
 */
export function planMove(
  byInning: Map<number, Map<string, string>>,
  playerId: string,
  target: Slot,
  fromInning: number,
  toInning: number,
): MovePlan {
  const set: MovePlan["set"] = [];
  for (let i = fromInning; i <= toInning; i++) {
    const map = byInning.get(i);
    if (!map) continue;
    const from = map.get(playerId) ?? BENCH;
    if (target === from) continue;
    let occupant: string | null = null;
    if (target !== BENCH) {
      for (const [pid, pos] of map) {
        if (pos === target && pid !== playerId) {
          occupant = pid;
          break;
        }
      }
    }
    set.push({ inning: i, playerId, position: target });
    if (occupant) {
      set.push({ inning: i, playerId: occupant, position: from });
    }
  }
  return { set };
}

/** Field slots with nobody in them for a given inning's map. */
export function emptyPositions(current: Map<string, string>): string[] {
  const filled = new Set(current.values());
  return POSITIONS.filter((p) => !filled.has(p));
}

export interface OccupancyRow {
  playerId: string;
  position: string;
  updatedAtMs: number;
}

/**
 * Two dugout screens editing at once can land two players on the same
 * position for an inning — each write is per-player, and serverless
 * Postgres-over-HTTP gives us no cross-row transactions to prevent it.
 * Resolve deterministically instead: per double-held field slot, the
 * newest write keeps it and everyone else goes to the bench (last tap
 * wins, same as the rest of the dugout). Ties break by playerId so every
 * device heals to the identical answer. Returns the playerIds to bench;
 * the bench itself can hold any number of players.
 */
export function duplicateOccupants(rows: OccupancyRow[]): string[] {
  const bySlot = new Map<string, OccupancyRow[]>();
  for (const r of rows) {
    if (r.position === BENCH) continue;
    const list = bySlot.get(r.position) ?? [];
    list.push(r);
    bySlot.set(r.position, list);
  }
  const bench: string[] = [];
  for (const list of bySlot.values()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs || a.playerId.localeCompare(b.playerId),
    );
    for (const loser of sorted.slice(1)) bench.push(loser.playerId);
  }
  return bench;
}
