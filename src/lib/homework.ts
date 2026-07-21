import { BARS_BY_KEY, type BarsCell, type BarsKey } from "@/lib/bars";

// Homework: turn feedback gaps into between-practice work. The drill
// catalog lives here in code (like the BARS instrument itself) — a
// researched, sourced set the coach assigns from, keyed per BARS
// dimension so what we rate is what we practice. The editable /drills
// library (guided workouts) stays separate and coach-curated.

/** Diagram identifiers rendered by src/components/DrillDiagram.tsx. */
export type DiagramKind =
  | "tee-zones"
  | "wall-ball"
  | "short-hop"
  | "throwing-lane"
  | "rounding-first"
  | "towel-drill"
  | "catcher-block"
  | "routine-loop";

export interface HomeworkDrill {
  /** Stable key stored on assignments — never rename once shipped. */
  key: string;
  title: string;
  /** The BARS dimension this drill primarily develops. */
  dimension: BarsKey;
  /** Other dimensions it meaningfully touches. */
  also?: BarsKey[];
  minutes: number;
  equipment: string;
  /** Needs a thrower/partner (usually a parent). */
  partner: boolean;
  /** The ONE thought to hold while doing it. */
  cue: string;
  /** The specific fault or gap it fixes — anchor language, not vibes. */
  fixes: string;
  steps: string[];
  reps: string;
  safety?: string;
  source: { name: string; url: string };
  diagram?: DiagramKind;
  /** Widely-used classic — shown with a ★ in the picker. */
  staple?: boolean;
}

export interface DimensionGap {
  dimension: BarsKey;
  /** Observed median (each rater's latest, medianed — see bars.ts). */
  median: number;
  /** Raters split ≥2 levels — read the room before assigning. */
  flagged: boolean;
  /** below = under the 11U standard; level-up = lowest observed, sharpen. */
  kind: "below" | "level-up";
  /** The next level's anchor text — the work in front of us. */
  target: string;
}

const CORE_DIMS: BarsKey[] = [
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "d8",
  "d9",
];

function toGap(dimension: BarsKey, cell: BarsCell, kind: DimensionGap["kind"]): DimensionGap {
  const next = Math.min(5, Math.floor(cell.median) + 1) as 1 | 2 | 3 | 4 | 5;
  return {
    dimension,
    median: cell.median,
    flagged: cell.flagged,
    kind,
    target: BARS_BY_KEY[dimension].anchors[next],
  };
}

/**
 * A player's homework-worthy gaps, from his BARS summary cells. Every
 * observed dimension below the 11U standard (median < 3) is a gap,
 * worst first — including the self-regulation cluster (focus, response
 * to failure, coachability), which is homework-able like anything else.
 * When fewer than two exist, the lowest observed dimensions at or above
 * standard round the list out as "level-up" suggestions, so every rated
 * player gets something to work on. Unobserved dimensions are never
 * gaps (0 is "not observed", not a score), and the role modules count
 * only for players who actually fill the role. No composite, no
 * cross-player ranking — per-player, per-dimension only, by design.
 */
export function playerGaps(
  cells: ReadonlyMap<BarsKey, BarsCell> | undefined,
  roles: { pitcher: boolean; catcher: boolean } = { pitcher: false, catcher: false },
): DimensionGap[] {
  if (!cells || cells.size === 0) return [];
  const dims = [...CORE_DIMS];
  if (roles.pitcher) dims.push("pitching");
  if (roles.catcher) dims.push("catching");
  const observed = dims.flatMap((d) => {
    const cell = cells.get(d);
    return cell ? [{ d, cell }] : [];
  });
  const gaps = observed
    .filter((x) => x.cell.median < 3)
    .sort((a, b) => a.cell.median - b.cell.median)
    .map((x) => toGap(x.d, x.cell, "below"));
  if (gaps.length < 2) {
    const rest = observed
      .filter((x) => x.cell.median >= 3)
      .sort((a, b) => a.cell.median - b.cell.median);
    for (const x of rest) {
      if (gaps.length >= 2) break;
      gaps.push(toGap(x.d, x.cell, "level-up"));
    }
  }
  return gaps;
}

/** Catalog drills for a dimension: primary matches first, then `also`. */
export function drillsFor(
  dimension: BarsKey,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
  limit = 3,
): HomeworkDrill[] {
  const primary = catalog.filter((d) => d.dimension === dimension);
  const secondary = catalog.filter(
    (d) => d.dimension !== dimension && d.also?.includes(dimension),
  );
  return [...primary, ...secondary].slice(0, limit);
}

export function drillByKey(
  key: string,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
): HomeworkDrill | undefined {
  return catalog.find((d) => d.key === key);
}

// The researched catalog itself is appended below by the curation pass —
// every drill traces to a named public source; instructions are written
// in our own words for an 11U parent-and-player audience.
export const HOMEWORK_CATALOG: HomeworkDrill[] = [];
