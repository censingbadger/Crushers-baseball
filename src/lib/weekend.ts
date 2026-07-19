import { POSITIONS, type Position } from "@/db/schema";

// Pure balance math for weekend innings allocation, mirroring the checks
// the coach's planning spreadsheet did by hand:
//  - every player's innings (field + pitching + bench) total games x innings
//  - every position (including P) is covered for exactly games x innings
//  - bench absorbs the surplus players x innings

export interface PlanLineInput {
  playerId: string;
  posA: Position | null;
  inningsA: number;
  posB: Position | null;
  inningsB: number;
  pitchInnings: number;
}

export interface PlayerBalance {
  playerId: string;
  assigned: number; // field + pitching
  bench: number; // expected total - assigned (can be negative when over)
  ok: boolean;
}

export interface PositionBalance {
  position: Position;
  supplied: number;
  needed: number;
  ok: boolean;
}

export interface WeekendBalance {
  totalPerPlayer: number;
  players: PlayerBalance[];
  positions: PositionBalance[];
  benchSupplied: number;
  benchNeeded: number;
  allOk: boolean;
  warnings: string[];
}

export function computeWeekendBalance(
  lines: PlanLineInput[],
  games: number,
  inningsPerGame: number,
): WeekendBalance {
  const totalPerPlayer = games * inningsPerGame;
  const warnings: string[] = [];

  const supplied = new Map<Position, number>();
  for (const pos of POSITIONS) supplied.set(pos, 0);

  const players: PlayerBalance[] = lines.map((line) => {
    let fieldA = 0;
    let fieldB = 0;
    if (line.posA) {
      if (line.posA === "P") {
        warnings.push(
          `Player ${line.playerId}: use the Pitch column for pitching innings, not a field slot.`,
        );
      } else {
        fieldA = line.inningsA;
        supplied.set(line.posA, (supplied.get(line.posA) ?? 0) + fieldA);
      }
    } else if (line.inningsA > 0) {
      warnings.push(`Innings entered with no position selected (slot A).`);
    }
    if (line.posB) {
      if (line.posB === "P") {
        warnings.push(
          `Player ${line.playerId}: use the Pitch column for pitching innings, not a field slot.`,
        );
      } else if (line.posB === line.posA) {
        warnings.push(`Slot A and slot B are the same position; combine them.`);
        fieldB = line.inningsB;
        supplied.set(line.posB, (supplied.get(line.posB) ?? 0) + fieldB);
      } else {
        fieldB = line.inningsB;
        supplied.set(line.posB, (supplied.get(line.posB) ?? 0) + fieldB);
      }
    } else if (line.inningsB > 0) {
      warnings.push(`Innings entered with no position selected (slot B).`);
    }
    supplied.set("P", (supplied.get("P") ?? 0) + line.pitchInnings);

    const assigned = fieldA + fieldB + line.pitchInnings;
    const bench = totalPerPlayer - assigned;
    return { playerId: line.playerId, assigned, bench, ok: bench >= 0 };
  });

  const positions: PositionBalance[] = POSITIONS.map((position) => {
    const s = supplied.get(position) ?? 0;
    return { position, supplied: s, needed: totalPerPlayer, ok: s === totalPerPlayer };
  });

  const benchNeeded = Math.max(0, (lines.length - POSITIONS.length) * totalPerPlayer);
  const benchSupplied = players.reduce((sum, p) => sum + Math.max(0, p.bench), 0);

  const allOk =
    positions.every((p) => p.ok) &&
    players.every((p) => p.ok) &&
    benchSupplied === benchNeeded &&
    warnings.length === 0;

  return {
    totalPerPlayer,
    players,
    positions,
    benchSupplied,
    benchNeeded,
    allOk,
    warnings,
  };
}
