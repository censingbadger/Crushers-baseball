import type { DrillCategory } from "@/db/schema";
import type { BarsKey } from "@/lib/bars";
import { HOMEWORK_CATALOG } from "@/lib/homework";

// The starter set for the editable drill library — loadable from the
// Drills page, then editable like any other drill. Since the homework
// build it derives from the researched homework catalog (src/lib/
// homework.ts), so the guided workouts draw from the same sourced drills
// the homework tab assigns. Cues are the one thought to hold, shown big
// during guided workouts.
export interface StarterDrill {
  title: string;
  category: DrillCategory;
  minutes: number;
  cue: string;
  description: string;
}

const CATEGORY_BY_DIMENSION: Record<BarsKey, DrillCategory> = {
  d1: "hitting",
  d2: "throwing",
  d3: "fielding",
  d4: "speed",
  d5: "mental",
  d6: "mental",
  d7: "mental",
  d8: "mental",
  d9: "fun",
  pitching: "pitching",
  catching: "fielding",
};

export const STARTER_DRILLS: StarterDrill[] = HOMEWORK_CATALOG.map((d) => ({
  title: d.title,
  category: CATEGORY_BY_DIMENSION[d.dimension],
  minutes: d.minutes,
  cue: d.cue,
  description: `${d.fixes} (${d.reps}. Source: ${d.source.name}.)`.slice(0, 590),
}));

export interface WorkoutDrill {
  id?: string;
  title: string;
  category: DrillCategory;
  minutes: number;
  cue: string;
}

export interface WorkoutSegment {
  title: string;
  category: DrillCategory;
  minutes: number;
  cue: string;
}

const MIN_SEGMENT = 3;
const MAX_SEGMENT = 15;

/**
 * Build a guided workout for "I have X minutes": always warm up throwing,
 * always hit, lean toward the positions the player wants (P → pitching),
 * finish with speed/fun if time allows. `seed` rotates drill choice within
 * each category so the plan varies day to day but stays deterministic.
 */
export function buildWorkout(
  totalMinutes: number,
  drills: WorkoutDrill[],
  opts: { desiredPositions?: string | null; seed?: number } = {},
): WorkoutSegment[] {
  const active = drills.filter((d) => d.minutes > 0);
  if (active.length === 0 || totalMinutes <= 0) return [];
  const seed = opts.seed ?? 0;
  const wantsPitching = /(^|[,\s])P([,\s]|$)/i.test(opts.desiredPositions ?? "");

  const byCategory = new Map<DrillCategory, WorkoutDrill[]>();
  for (const d of active) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }
  const pick = (cat: DrillCategory): WorkoutDrill | undefined => {
    const list = byCategory.get(cat);
    if (!list || list.length === 0) return undefined;
    return list[seed % list.length];
  };

  const order: DrillCategory[] = wantsPitching
    ? ["throwing", "hitting", "pitching", "fielding", "speed", "fun"]
    : ["throwing", "hitting", "fielding", "speed", "pitching", "fun"];

  const segments: WorkoutSegment[] = [];
  let remaining = totalMinutes;
  for (const cat of order) {
    if (remaining < MIN_SEGMENT) break;
    const drill = pick(cat);
    if (!drill) continue;
    const minutes = Math.min(drill.minutes, MAX_SEGMENT, remaining);
    if (minutes < MIN_SEGMENT) continue;
    segments.push({
      title: drill.title,
      category: drill.category,
      minutes,
      cue: drill.cue,
    });
    remaining -= minutes;
  }

  // Tiny windows still deserve a plan: spend it all on the first drill.
  if (segments.length === 0) {
    const drill = pick(order.find((c) => byCategory.has(c)) ?? active[0].category)!;
    return [
      {
        title: drill.title,
        category: drill.category,
        minutes: totalMinutes,
        cue: drill.cue,
      },
    ];
  }

  // Leftover minutes ride on the last segment so the plan adds up.
  if (remaining > 0 && segments.length > 0) {
    segments[segments.length - 1].minutes += remaining;
  }
  return segments;
}
