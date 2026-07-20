import { POSITIONS, type Position } from "@/db/schema";
import { BENCH } from "@/lib/gameday";
import type { RolesByPlayer } from "@/lib/depth";

// The dugout configurator: pure functions over the current inning's
// assignment map and the blended matrix ratings. Everything returns MOVES
// (playerId → target) that the dashboard can apply through the existing
// moveGamePlayer action, so suggestions and manual coaching share one code
// path. Unrated (player, position) pairs count as 1 — the floor — so the
// engine never talks a coach into an unknown.
//
// With the optional `weights` map (depth-chart roles × game mode, from
// lib/depth), RANKING runs on weights while every displayed number stays
// the raw ability rating. Weight 0 means blocked (a "never" cell) — the
// engine will not suggest a blocked player into that slot, ever; coaches
// can still drag anyone anywhere by hand.

export type Ratings = Record<string, Record<string, number> | undefined>;
export type Assignments = Record<string, string>; // playerId -> slot | BENCH

export interface Move {
  playerId: string;
  target: string;
}

export interface FillOption {
  kind: "bench" | "shift";
  /** Apply in order: a shift first moves the fielder, then backfills. */
  moves: Move[];
  /** The fill's weakest new link — raw rating, what the UI shows. */
  minRating: number;
  /** The weakest new link on the decision scale — what ranking uses. */
  weight: number;
  primaryId: string;
  primaryRating: number;
  /** Shift only: who backfills the shifted player's old slot. */
  backfillId?: string;
  backfillSlot?: string;
  backfillRating?: number;
}

const ratingOf = (ratings: Ratings, pid: string, slot: string): number =>
  ratings[pid]?.[slot] ?? 1;

const fieldedEntries = (current: Assignments): [string, string][] =>
  Object.entries(current).filter(([, slot]) => slot !== BENCH);

const benchIdsOf = (current: Assignments): string[] =>
  Object.entries(current)
    .filter(([, slot]) => slot === BENCH)
    .map(([pid]) => pid);

/** Decision value: the weight when provided, the raw rating otherwise. */
const rankOf = (
  ratings: Ratings,
  weights: Ratings | undefined,
  pid: string,
  slot: string,
): number =>
  weights ? (weights[pid]?.[slot] ?? ratingOf(ratings, pid, slot)) : ratingOf(ratings, pid, slot);

/** Blocked pairs exist only in weights mode: never-cells weigh 0. */
const blocked = (
  ratings: Ratings,
  weights: Ratings | undefined,
  pid: string,
  slot: string,
): boolean => rankOf(ratings, weights, pid, slot) <= 0;

/**
 * Ways to fill one empty slot, best first. Direct bench moves are the
 * "simplest" and win ties; a two-move shift (fielder covers the gap, bench
 * covers the fielder) only outranks a bench fill when its weakest new
 * rating is genuinely higher.
 */
export function gapFillOptions(
  gap: string,
  current: Assignments,
  ratings: Ratings,
  weights?: Ratings,
): FillOption[] {
  const options: FillOption[] = [];

  for (const pid of benchIdsOf(current)) {
    if (blocked(ratings, weights, pid, gap)) continue;
    options.push({
      kind: "bench",
      moves: [{ playerId: pid, target: gap }],
      minRating: ratingOf(ratings, pid, gap),
      weight: rankOf(ratings, weights, pid, gap),
      primaryId: pid,
      primaryRating: ratingOf(ratings, pid, gap),
    });
  }

  for (const [pid, slot] of fieldedEntries(current)) {
    if (slot === gap) continue;
    if (blocked(ratings, weights, pid, gap)) continue;
    let best: { pid: string; w: number } | null = null;
    for (const b of benchIdsOf(current)) {
      if (blocked(ratings, weights, b, slot)) continue;
      const wB = rankOf(ratings, weights, b, slot);
      if (!best || wB > best.w) best = { pid: b, w: wB };
    }
    if (!best) continue;
    options.push({
      kind: "shift",
      moves: [
        { playerId: pid, target: gap },
        { playerId: best.pid, target: slot },
      ],
      minRating: Math.min(
        ratingOf(ratings, pid, gap),
        ratingOf(ratings, best.pid, slot),
      ),
      weight: Math.min(
        rankOf(ratings, weights, pid, gap),
        rankOf(ratings, weights, best.pid, slot),
      ),
      primaryId: pid,
      primaryRating: ratingOf(ratings, pid, gap),
      backfillId: best.pid,
      backfillSlot: slot,
      backfillRating: ratingOf(ratings, best.pid, slot),
    });
  }

  // Simplicity bonus: one move beats two unless the two are clearly better.
  return options
    .sort(
      (a, b) =>
        b.weight + (b.kind === "bench" ? 0.5 : 0) -
        (a.weight + (a.kind === "bench" ? 0.5 : 0)),
    )
    .slice(0, 3);
}

export interface DepthEntry {
  playerId: string;
  rating: number;
  /** Where they are right now: this slot, another slot, or BENCH. */
  where: string;
  holder: boolean;
  /** The player's own aspirations list this position. */
  aspiring: boolean;
  /** The staff's depth-chart role here, when one is set. */
  role?: string;
}

/**
 * The depth chart for one position: the current holder pinned first, then
 * everyone else ranked by their standing there (a small nudge for kids who
 * asked for the spot — coaches weigh that too).
 */
export function positionDepth(
  slot: string,
  current: Assignments,
  ratings: Ratings,
  aspiringByPlayer: Record<string, string[]> = {},
  count = 4,
  weights?: Ratings,
  rolesByPlayer: RolesByPlayer = {},
): DepthEntry[] {
  const entries: DepthEntry[] = Object.entries(current).map(([pid, where]) => ({
    playerId: pid,
    rating: ratingOf(ratings, pid, slot),
    where,
    holder: where === slot,
    aspiring: (aspiringByPlayer[pid] ?? []).includes(slot),
    role: rolesByPlayer[pid]?.[slot as Position],
  }));
  const score = (e: DepthEntry) =>
    (e.holder ? 1000 : 0) +
    rankOf(ratings, weights, e.playerId, slot) +
    (e.aspiring ? 0.25 : 0);
  return entries
    .sort((a, b) => score(b) - score(a))
    .slice(0, count + 1); // holder + the next `count`
}

export interface AuditSuggestion {
  kind: "gap" | "upgrade" | "swap" | "rest";
  slot?: string;
  /** Empty for informational notes (rest). */
  moves: Move[];
  /** Rating change this buys, for ordering. */
  gain: number;
  /** Structured pieces the UI labels with player names. */
  detail: {
    aId?: string;
    aSlot?: string;
    aRating?: number;
    bId?: string;
    bSlot?: string;
    bRating?: number;
    option?: FillOption;
    benchInnings?: number;
  };
}

/**
 * Post-move lineup review: empty slots, weak fits with clearly better
 * bench options, two-player swaps that raise the weaker rating, and bench
 * players who've sat long enough to plan around. Capped and ordered by
 * impact so it reads like a coach's margin notes, not a report.
 */
export function auditLineup(
  current: Assignments,
  ratings: Ratings,
  benchInningsByPlayer: Record<string, number> = {},
  weights?: Ratings,
): AuditSuggestion[] {
  const out: AuditSuggestion[] = [];
  const filled = new Map<string, string>(); // slot -> pid
  for (const [pid, slot] of fieldedEntries(current)) filled.set(slot, pid);

  for (const pos of POSITIONS) {
    if (filled.has(pos)) continue;
    const [best] = gapFillOptions(pos, current, ratings, weights);
    out.push({
      kind: "gap",
      slot: pos,
      moves: best?.moves ?? [],
      gain: 10, // holes always outrank tuning
      detail: { option: best },
    });
  }

  const bench = benchIdsOf(current);
  for (const [slot, pid] of filled) {
    const w = rankOf(ratings, weights, pid, slot);
    if (w > 4) continue;
    let best: { pid: string; w: number } | null = null;
    for (const b of bench) {
      if (blocked(ratings, weights, b, slot)) continue;
      const wB = rankOf(ratings, weights, b, slot);
      if (!best || wB > best.w) best = { pid: b, w: wB };
    }
    if (best && best.w >= w + 2) {
      out.push({
        kind: "upgrade",
        slot,
        // Bench player onto the occupied slot: the move action swaps the
        // current fielder to the mover's old spot — the bench.
        moves: [{ playerId: best.pid, target: slot }],
        gain: best.w - w,
        detail: {
          aId: pid,
          aSlot: slot,
          aRating: ratingOf(ratings, pid, slot),
          bId: best.pid,
          bRating: ratingOf(ratings, best.pid, slot),
        },
      });
    }
  }

  const fielded = fieldedEntries(current);
  for (let i = 0; i < fielded.length; i++) {
    for (let j = i + 1; j < fielded.length; j++) {
      const [aId, aSlot] = fielded[i];
      const [bId, bSlot] = fielded[j];
      if (
        blocked(ratings, weights, aId, bSlot) ||
        blocked(ratings, weights, bId, aSlot)
      ) {
        continue;
      }
      const now = Math.min(
        rankOf(ratings, weights, aId, aSlot),
        rankOf(ratings, weights, bId, bSlot),
      );
      const swapped = Math.min(
        rankOf(ratings, weights, aId, bSlot),
        rankOf(ratings, weights, bId, aSlot),
      );
      if (swapped >= now + 2) {
        out.push({
          kind: "swap",
          moves: [{ playerId: aId, target: bSlot }], // move action swaps b back
          gain: swapped - now,
          detail: {
            aId,
            aSlot,
            aRating: ratingOf(ratings, aId, bSlot),
            bId,
            bSlot,
            bRating: ratingOf(ratings, bId, aSlot),
          },
        });
      }
    }
  }

  for (const pid of bench) {
    const sat = benchInningsByPlayer[pid] ?? 0;
    if (sat >= 2) {
      out.push({ kind: "rest", moves: [], gain: 0, detail: { aId: pid, benchInnings: sat } });
    }
  }

  return out
    .sort((a, b) => b.gain - a.gain)
    .slice(0, 4);
}
