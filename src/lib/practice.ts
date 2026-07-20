import { POSITIONS, type Position } from "@/db/schema";
import type { RolesByPlayer } from "@/lib/depth";
import { hungarianMin } from "@/lib/lineup";

// Positional-practice sorter: split the roster across the nine stations
// for position work. Three transparent signals decide who goes where —
// the staff's depth-chart intent, the kid's own ask, and where he
// actually plays — plus a small ability tie-break. Every pick carries
// its reasons as chips, so the plan reads like a coach's whiteboard,
// not a black box.

export interface PracticeInputs {
  players: { playerId: string; name: string }[];
  /** Blended ability per player × position (missing = unrated). */
  ratings: Record<string, Record<string, number> | undefined>;
  roles: RolesByPlayer;
  /** playerId -> positions the kid's aspirations name. */
  aspiring: Record<string, string[]>;
  /** playerId -> positions with logged game innings (season usage). */
  playedPositions: Record<string, string[]>;
}

export interface StationPick {
  playerId: string;
  /** Why he's at this station — ordered, already human-readable. */
  reasons: string[];
  score: number;
}

export interface PracticePlan {
  /** Station -> assigned kids (1–2 each with a full house). */
  stations: Record<Position, StationPick[]>;
  /** Station -> next-best unassigned candidates for quick swaps. */
  alternatives: Record<Position, StationPick[]>;
}

const NEEDS_WORK_BAR = 6;

/**
 * One kid's practice value at one station, with reasons. Null = the staff
 * marked him never there; the sorter won't station a kid where he'll
 * never play.
 */
export function practiceScore(
  playerId: string,
  pos: Position,
  inputs: PracticeInputs,
): StationPick | null {
  const role = inputs.roles[playerId]?.[pos];
  if (role === "never") return null;
  const ability = inputs.ratings[playerId]?.[pos];
  const reasons: string[] = [];
  let score = 0;
  if (role === "develop") {
    score += 3;
    reasons.push("develop spot");
  } else if (role === "primary" && (ability ?? 0) < NEEDS_WORK_BAR) {
    // His spot, but the skill lags the job — practice goes here first.
    score += 3;
    reasons.push("needs work");
  }
  if ((inputs.aspiring[playerId] ?? []).includes(pos)) {
    score += 2;
    reasons.push("★ wants it");
  }
  if ((inputs.playedPositions[playerId] ?? []).includes(pos)) {
    score += 2;
    reasons.push("plays here");
  }
  score += (ability ?? 1) * 0.1; // tie-break toward the capable
  return { playerId, reasons, score };
}

/**
 * The suggested split: solve one-kid-per-station for the best total
 * practice value (same assignment engine as the lineup), then send each
 * leftover kid to his own best remaining station as a double.
 */
export function suggestStations(inputs: PracticeInputs): PracticePlan {
  const picks = new Map<string, Map<Position, StationPick>>();
  for (const p of inputs.players) {
    const row = new Map<Position, StationPick>();
    for (const pos of POSITIONS) {
      const pick = practiceScore(p.playerId, pos, inputs);
      if (pick) row.set(pos, pick);
    }
    picks.set(p.playerId, row);
  }

  const stations = {} as Record<Position, StationPick[]>;
  for (const pos of POSITIONS) stations[pos] = [];

  // Cost matrix: rows = stations, columns = players (padded with dummies
  // so a short roster leaves stations open instead of forcing a fit).
  // A never-cell costs more than a dummy — same stance as the lineup.
  const BASE = 20;
  const n = inputs.players.length;
  const cols = n + POSITIONS.length;
  const cost = POSITIONS.map((pos) =>
    Array.from({ length: cols }, (_, j) => {
      if (j >= n) return BASE;
      const pick = picks.get(inputs.players[j].playerId)?.get(pos);
      return pick ? BASE - pick.score : 1000;
    }),
  );
  const result = hungarianMin(cost);
  const assigned = new Set<string>();
  result.forEach((j, r) => {
    if (j < 0 || j >= n) return;
    const pos = POSITIONS[r];
    const pick = picks.get(inputs.players[j].playerId)?.get(pos);
    if (!pick) return;
    stations[pos].push(pick);
    assigned.add(pick.playerId);
  });

  // Doubles: each unassigned kid joins his own best station.
  for (const p of inputs.players) {
    if (assigned.has(p.playerId)) continue;
    let best: { pos: Position; pick: StationPick } | null = null;
    for (const pos of POSITIONS) {
      const pick = picks.get(p.playerId)?.get(pos);
      if (pick && (!best || pick.score > best.pick.score)) {
        best = { pos, pick };
      }
    }
    if (best) {
      stations[best.pos].push(best.pick);
      assigned.add(p.playerId);
    }
  }

  // Alternatives: the next two candidates per station who aren't already
  // standing there — the coach's quick-swap list.
  const alternatives = {} as Record<Position, StationPick[]>;
  for (const pos of POSITIONS) {
    const here = new Set(stations[pos].map((s) => s.playerId));
    alternatives[pos] = inputs.players
      .map((p) => picks.get(p.playerId)?.get(pos))
      .filter((pick): pick is StationPick => Boolean(pick && !here.has(pick.playerId)))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }

  return { stations, alternatives };
}
