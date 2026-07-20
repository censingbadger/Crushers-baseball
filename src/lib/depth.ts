import { POSITIONS, type Position, type PositionRoleKind } from "@/db/schema";

// The depth-chart math: ability says how WELL a player would play a spot,
// the role matrix says whether we WANT him there, and the game mode says
// what tonight is for. Suggestions rank on ability × role multiplier —
// leverage joins only in the full-field solver, where cross-position
// trades actually happen (within one slot it would cancel out anyway).

export type LineupMode = "compete" | "develop";

export type RolesByPlayer = Record<
  string,
  Partial<Record<Position, PositionRoleKind>> | undefined
>;

/**
 * How much defense matters per position at 11U: catchers touch every
 * pitch, the left side eats ground balls, corners of the outfield see the
 * least action. Single numbers by design — tuning is a one-line change.
 */
export const LEVERAGE: Record<Position, number> = {
  C: 1.5,
  P: 1.4,
  SS: 1.4,
  "1B": 1.2,
  "2B": 1.1,
  "3B": 1.1,
  CF: 1.0,
  LF: 0.8,
  RF: 0.8,
};

/**
 * Role multipliers per mode, normalized so a blank cell is exactly 1.0 —
 * an unmarked matrix ranks identically to today's ability-only engine,
 * and the recommend engine's 1–10 thresholds keep their meaning.
 * Compete: primary spots first, develop only when clearly better,
 * never = blocked. Develop (up big / scrimmage): develop spots jump
 * ahead, primaries step back so regulars rotate out, emergency unlocks.
 */
const ROLE_MULT: Record<LineupMode, Record<PositionRoleKind | "none", number>> = {
  compete: {
    primary: 1.25,
    secondary: 1.1,
    none: 1.0,
    develop: 0.7,
    emergency: 0.3,
    never: 0,
  },
  develop: {
    develop: 1.45,
    secondary: 1.15,
    none: 1.0,
    primary: 0.95,
    emergency: 0.9,
    never: 0,
  },
};

/** Extra pull toward a kid's own ★ position when the game allows it. */
export const ASPIRING_BONUS_DEVELOP = 0.75;

const MISSING_ABILITY = 1;

/**
 * One cell's decision weight. Stays on the familiar 1–10 band (max ~12
 * with the develop bonus) so the recommend engine's thresholds keep
 * their meaning. Weight 0 means "blocked here" — never-cells and
 * nothing else.
 */
export function roleWeighted(
  ability: number,
  role: PositionRoleKind | undefined,
  mode: LineupMode,
  aspiring = false,
): number {
  const mult = ROLE_MULT[mode][role ?? "none"];
  if (mult === 0) return 0;
  const bonus = mode === "develop" && aspiring ? ASPIRING_BONUS_DEVELOP : 0;
  return ability * mult + bonus;
}

/**
 * Dense weight map (every listed player × all nine positions) shaped like
 * the ratings record, for the recommend engine. Unrated cells weigh in at
 * the ability floor of 1 — same stance as the rest of the app: the engine
 * never talks a coach into an unknown.
 */
export function roleWeights(
  playerIds: readonly string[],
  ratingsByPlayer: Record<string, Record<string, number> | undefined>,
  rolesByPlayer: RolesByPlayer,
  mode: LineupMode,
  aspiringByPlayer: Record<string, string[]> = {},
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const pid of playerIds) {
    const row: Record<string, number> = {};
    for (const pos of POSITIONS) {
      row[pos] = roleWeighted(
        ratingsByPlayer[pid]?.[pos] ?? MISSING_ABILITY,
        rolesByPlayer[pid]?.[pos],
        mode,
        (aspiringByPlayer[pid] ?? []).includes(pos),
      );
    }
    out[pid] = row;
  }
  return out;
}

/**
 * Solver weights: leverage × role-weighted ability. This is what makes
 * the full-field arrangement spend the best gloves where the ball goes —
 * a 9 at shortstop is worth more than the same 9 in left.
 */
export function solverWeights(
  playerIds: readonly string[],
  ratingsByPlayer: Record<string, Record<string, number> | undefined>,
  rolesByPlayer: RolesByPlayer,
  mode: LineupMode,
  aspiringByPlayer: Record<string, string[]> = {},
): Record<string, Record<string, number>> {
  const base = roleWeights(
    playerIds,
    ratingsByPlayer,
    rolesByPlayer,
    mode,
    aspiringByPlayer,
  );
  const damp = mode === "develop" ? 0.3 : 1; // leverage flattens when developing
  for (const pid of playerIds) {
    for (const pos of POSITIONS) {
      const lev = 1 + (LEVERAGE[pos] - 1) * damp;
      base[pid][pos] = base[pid][pos] * lev;
    }
  }
  return base;
}

/** Free text like "SS, P" → position tokens (the aspirations field). */
export function aspiringTokens(desired: string | null | undefined): Position[] {
  return (desired ?? "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t): t is Position => (POSITIONS as readonly string[]).includes(t));
}

/** Shape DB rows into the per-player role lookup (pure — client-safe). */
export function rolesByPlayerFrom(
  rows: readonly {
    playerId: string;
    position: Position;
    role: PositionRoleKind;
  }[],
): RolesByPlayer {
  const out: RolesByPlayer = {};
  for (const r of rows) {
    (out[r.playerId] ??= {})[r.position] = r.role;
  }
  return out;
}

export const ROLE_LABEL: Record<PositionRoleKind, string> = {
  primary: "primary",
  secondary: "secondary",
  develop: "develop",
  emergency: "emergency",
  never: "never",
};

/** Cycle order for the tap grid: blank → P → S → D → E → N → blank. */
export const ROLE_CYCLE: (PositionRoleKind | null)[] = [
  null,
  "primary",
  "secondary",
  "develop",
  "emergency",
  "never",
];

export function nextRole(
  current: PositionRoleKind | null | undefined,
): PositionRoleKind | null {
  const i = ROLE_CYCLE.indexOf(current ?? null);
  return ROLE_CYCLE[(i + 1) % ROLE_CYCLE.length];
}
