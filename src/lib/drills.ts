import type { DrillCategory } from "@/db/schema";

// The coach-curated starter set for the drill library — loadable from the
// Drills page, then editable like any other drill. Cues are the one
// thought to hold, shown big during guided workouts.
export interface StarterDrill {
  title: string;
  category: DrillCategory;
  minutes: number;
  cue: string;
  description: string;
}

export const STARTER_DRILLS: StarterDrill[] = [
  {
    title: "Long toss",
    category: "throwing",
    minutes: 10,
    cue: "Hit the chest — every throw has a target",
    description:
      "Start close, stretch it out five steps at a time. Crow-hop, full arm circle, follow your throw.",
  },
  {
    title: "Wall ball quick hands",
    category: "fielding",
    minutes: 8,
    cue: "Quick glove to the dirt, chest over the ball",
    description:
      "Tennis ball against a wall: 20 forehands, 20 backhands, 10 short hops. Soft hands, feet always moving.",
  },
  {
    title: "Tee work — middle of the field",
    category: "hitting",
    minutes: 10,
    cue: "See the ball deep, drive it back up the middle",
    description:
      "25 swings off the tee aiming at an imaginary center fielder. Balance at the finish on every swing.",
  },
  {
    title: "Dry swings with a focus word",
    category: "hitting",
    minutes: 5,
    cue: "Load early, short stride, explode",
    description:
      "15 slow-motion swings feeling each phase, then 15 game-speed swings saying your focus word out loud.",
  },
  {
    title: "Bullpen shadow work",
    category: "pitching",
    minutes: 8,
    cue: "Breathe, balance point, then go",
    description:
      "No ball needed: 20 full deliveries in front of a mirror or shadow. Stick the balance point for a full second.",
  },
  {
    title: "Target throws",
    category: "pitching",
    minutes: 10,
    cue: "Small target, smooth tempo",
    description:
      "Pick a strike-zone-size target on a wall or net. 30 throws at game tempo, reset fully between each.",
  },
  {
    title: "Sprint ladder",
    category: "speed",
    minutes: 6,
    cue: "First three steps win the base",
    description:
      "Home-to-first sprints: 6 at 80%, 4 at full speed. Focus on the burst, run through the bag every time.",
  },
  {
    title: "Backyard home run derby",
    category: "fun",
    minutes: 8,
    cue: "Have a blast — swing free",
    description:
      "Wiffle balls, imaginary stadium, call your shots. Baseball is supposed to be fun.",
  },
];

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
