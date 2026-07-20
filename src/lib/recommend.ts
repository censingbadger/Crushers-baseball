import { POSITIONS } from "@/db/schema";
import { BENCH } from "@/lib/gameday";

// The dugout configurator: pure functions over the current inning's
// assignment map and the blended matrix ratings. Everything returns MOVES
// (playerId → target) that the dashboard can apply through the existing
// moveGamePlayer action, so suggestions and manual coaching share one code
// path. Unrated (player, position) pairs count as 1 — the floor — so the
// engine never talks a coach into an unknown.

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
  /** The fill's weakest new link — what ranking cares about. */
  minRating: number;
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
): FillOption[] {
  const options: FillOption[] = [];

  for (const pid of benchIdsOf(current)) {
    const r = ratingOf(ratings, pid, gap);
    options.push({
      kind: "bench",
      moves: [{ playerId: pid, target: gap }],
      minRating: r,
      primaryId: pid,
      primaryRating: r,
    });
  }

  for (const [pid, slot] of fieldedEntries(current)) {
    if (slot === gap) continue;
    const rShift = ratingOf(ratings, pid, gap);
    let best: { pid: string; r: number } | null = null;
    for (const b of benchIdsOf(current)) {
      const rB = ratingOf(ratings, b, slot);
      if (!best || rB > best.r) best = { pid: b, r: rB };
    }
    if (!best) continue;
    options.push({
      kind: "shift",
      moves: [
        { playerId: pid, target: gap },
        { playerId: best.pid, target: slot },
      ],
      minRating: Math.min(rShift, best.r),
      primaryId: pid,
      primaryRating: rShift,
      backfillId: best.pid,
      backfillSlot: slot,
      backfillRating: best.r,
    });
  }

  // Simplicity bonus: one move beats two unless the two are clearly better.
  return options
    .sort(
      (a, b) =>
        b.minRating + (b.kind === "bench" ? 0.5 : 0) -
        (a.minRating + (a.kind === "bench" ? 0.5 : 0)),
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
}

/**
 * The depth chart for one position: the current holder pinned first, then
 * everyone else ranked by their rating there (a small nudge for kids who
 * asked for the spot — coaches weigh that too).
 */
export function positionDepth(
  slot: string,
  current: Assignments,
  ratings: Ratings,
  aspiringByPlayer: Record<string, string[]> = {},
  count = 4,
): DepthEntry[] {
  const entries: DepthEntry[] = Object.entries(current).map(([pid, where]) => ({
    playerId: pid,
    rating: ratingOf(ratings, pid, slot),
    where,
    holder: where === slot,
    aspiring: (aspiringByPlayer[pid] ?? []).includes(slot),
  }));
  const score = (e: DepthEntry) =>
    (e.holder ? 1000 : 0) + e.rating + (e.aspiring ? 0.25 : 0);
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
): AuditSuggestion[] {
  const out: AuditSuggestion[] = [];
  const filled = new Map<string, string>(); // slot -> pid
  for (const [pid, slot] of fieldedEntries(current)) filled.set(slot, pid);

  for (const pos of POSITIONS) {
    if (filled.has(pos)) continue;
    const [best] = gapFillOptions(pos, current, ratings);
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
    const r = ratingOf(ratings, pid, slot);
    if (r > 4) continue;
    let best: { pid: string; r: number } | null = null;
    for (const b of bench) {
      const rB = ratingOf(ratings, b, slot);
      if (!best || rB > best.r) best = { pid: b, r: rB };
    }
    if (best && best.r >= r + 2) {
      out.push({
        kind: "upgrade",
        slot,
        // Bench player onto the occupied slot: the move action swaps the
        // current fielder to the mover's old spot — the bench.
        moves: [{ playerId: best.pid, target: slot }],
        gain: best.r - r,
        detail: { aId: pid, aSlot: slot, aRating: r, bId: best.pid, bRating: best.r },
      });
    }
  }

  const fielded = fieldedEntries(current);
  for (let i = 0; i < fielded.length; i++) {
    for (let j = i + 1; j < fielded.length; j++) {
      const [aId, aSlot] = fielded[i];
      const [bId, bSlot] = fielded[j];
      const now = Math.min(ratingOf(ratings, aId, aSlot), ratingOf(ratings, bId, bSlot));
      const swapped = Math.min(ratingOf(ratings, aId, bSlot), ratingOf(ratings, bId, aSlot));
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
