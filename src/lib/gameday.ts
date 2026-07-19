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
 * Plan a move: put `playerId` at `target` from `inning` onward. If another
 * player currently holds a target position, they take the mover's old slot
 * (a swap); moving to the bench simply benches the mover and leaves the
 * vacated position empty for a follow-up choice.
 */
export function planMove(
  current: Map<string, string>,
  playerId: string,
  target: Slot,
  inning: number,
  totalInnings: number,
): MovePlan {
  const from = current.get(playerId) ?? BENCH;
  const set: MovePlan["set"] = [];
  const innings: number[] = [];
  for (let i = inning; i <= totalInnings; i++) innings.push(i);

  if (target === from) return { set };

  let occupant: string | null = null;
  if (target !== BENCH) {
    for (const [pid, pos] of current) {
      if (pos === target && pid !== playerId) {
        occupant = pid;
        break;
      }
    }
  }

  for (const i of innings) {
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
