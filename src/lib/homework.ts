import { BARS_BY_KEY, type BarsCell, type BarsKey } from "@/lib/bars";
import type { Position } from "@/db/schema";

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
  /**
   * Positions this drill especially serves (e.g. fly-ball work → the
   * outfield). Suggestions float affinity matches to the front for kids
   * whose depth-chart spots match; drills without affinity are for
   * everyone and keep their catalog order.
   */
  positions?: Position[];
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

/**
 * Catalog drills for a dimension: primary matches first, then `also` —
 * and when the player's positions are known, drills with a matching
 * position affinity float to the front of their group (an outfielder's
 * fielding gap leads with fly-ball work, an infielder's with short
 * hops). Drills without affinity serve everyone and keep catalog order.
 */
export function drillsFor(
  dimension: BarsKey,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
  limit = 3,
  positions: readonly string[] = [],
): HomeworkDrill[] {
  const affinityRank = (d: HomeworkDrill): number => {
    if (!d.positions || positions.length === 0) return 1; // universal
    return d.positions.some((p) => positions.includes(p)) ? 0 : 2;
  };
  const byAffinity = (a: HomeworkDrill, b: HomeworkDrill) =>
    affinityRank(a) - affinityRank(b);
  const primary = catalog.filter((d) => d.dimension === dimension).sort(byAffinity);
  const secondary = catalog
    .filter((d) => d.dimension !== dimension && d.also?.includes(dimension))
    .sort(byAffinity);
  return [...primary, ...secondary].slice(0, limit);
}

export interface PlayerSuggestion {
  gap: DimensionGap;
  drill: HomeworkDrill;
}

/**
 * The one-tap answer per player: his top gaps, each paired with its
 * best-fitting drill (position affinity applied), skipping drills
 * already assigned and gaps with no catalog coverage. This is what the
 * ⚡ auto-assign buttons write.
 */
export function suggestForPlayer(
  cells: ReadonlyMap<BarsKey, BarsCell> | undefined,
  roles: { pitcher: boolean; catcher: boolean },
  positions: readonly string[],
  alreadyAssigned: ReadonlySet<string>,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
  maxSuggestions = 2,
): PlayerSuggestion[] {
  const out: PlayerSuggestion[] = [];
  for (const gap of playerGaps(cells, roles)) {
    if (out.length >= maxSuggestions) break;
    const drill = drillsFor(gap.dimension, catalog, 6, positions).find(
      (d) => !alreadyAssigned.has(d.key) && !out.some((s) => s.drill.key === d.key),
    );
    if (drill) out.push({ gap, drill });
  }
  return out;
}

export interface TeamGap {
  dimension: BarsKey;
  /** Players whose observed median sits below the 11U standard. */
  below: number;
  /** Players with any observed rating on this dimension. */
  rated: number;
}

/**
 * Where the TEAM is short: for each dimension, how many rated players
 * sit below the 11U standard. Sorted by head count (then share), only
 * dimensions where at least two kids are below — one kid is his own
 * homework, not a team theme. Counts only; no player list, no ranking.
 *
 * The pitching/catching role modules only count kids who actually fill
 * the role (matching per-player gaps and who the team-assign would reach)
 * — pass `roleByPlayer` to gate them; without it, every dimension counts.
 */
export function teamGaps(
  summaries: ReadonlyMap<string, ReadonlyMap<BarsKey, BarsCell>>,
  roleByPlayer?: ReadonlyMap<string, { pitcher: boolean; catcher: boolean }>,
  limit = 3,
): TeamGap[] {
  const tally = new Map<BarsKey, { below: number; rated: number }>();
  for (const [playerId, cells] of summaries) {
    const roles = roleByPlayer?.get(playerId);
    for (const [dim, cell] of cells) {
      if (roleByPlayer) {
        if (dim === "pitching" && !roles?.pitcher) continue;
        if (dim === "catching" && !roles?.catcher) continue;
      }
      const t = tally.get(dim) ?? { below: 0, rated: 0 };
      t.rated += 1;
      if (cell.median < 3) t.below += 1;
      tally.set(dim, t);
    }
  }
  return [...tally.entries()]
    .filter(([, t]) => t.below >= 2)
    .map(([dimension, t]) => ({ dimension, ...t }))
    .sort((a, b) => b.below - a.below || b.below / b.rated - a.below / a.rated)
    .slice(0, limit);
}

/**
 * Free-text catalog search: "wall", "focus", "throwing accuracy", a
 * dimension name, a goal word — every query token must land somewhere
 * in the drill's text (title, what it fixes, cue, steps, equipment,
 * dimension name). Case-insensitive.
 */
export function searchCatalog(
  query: string,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
): HomeworkDrill[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return catalog.filter((d) => {
    const dim = BARS_BY_KEY[d.dimension];
    const haystack = [
      d.title,
      d.fixes,
      d.cue,
      d.equipment,
      d.steps.join(" "),
      dim.label,
      dim.sub,
      ...(d.also ?? []).map((k) => BARS_BY_KEY[k].label),
    ]
      .join(" ")
      .toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
}

export function drillByKey(
  key: string,
  catalog: readonly HomeworkDrill[] = HOMEWORK_CATALOG,
): HomeworkDrill | undefined {
  return catalog.find((d) => d.key === key);
}

// The researched catalog. Every drill traces to a named public source
// (deep-research pass, 2026-07-21); instructions are written in our own
// words for an 11U parent-and-player audience — summarized from the
// source's method, never copied. Keys are stable forever: assignments
// reference them. Pitch Smart numbers (11–12): 85 pitches/day max;
// rest — 1–20 pitches = 0 days, 21–35 = 1, 36–50 = 2, 51–65 = 3,
// 66+ = 4; fastball + changeup only; 4 months/year off from throwing.

const PITCH_SMART_NOTE =
  "Counts toward the arm's workload. Follow Pitch Smart: no throwing on " +
  "required rest days after pitching, stop at any soreness, and remember " +
  "the 11–12 limits (85 pitches/day; fastball and changeup only).";

export const HOMEWORK_CATALOG: HomeworkDrill[] = [
  // ---- D1 · Hitting -------------------------------------------------
  {
    key: "tee-three-zones",
    title: "Tee work — three contact points",
    dimension: "d1",
    minutes: 10,
    equipment: "tee, a bucket of balls, net or open space",
    partner: false,
    cue: "Inside out front, away deep — meet the ball where it wants to be met",
    fixes:
      "One swing for every pitch location. The tee guarantees a strike every rep, so the swing gets grooved instead of the chase.",
    steps: [
      "Set the tee even with your front hip, middle of the plate: 8 swings back up the middle.",
      "Move it up on the plate and toward you (inside pitch): 8 swings, meeting the ball out in front — it should go to your pull side.",
      "Move it deeper and away: 8 swings letting the ball travel — drive it to the opposite field.",
      "Finish balanced on every swing. If you pop the ball up, set the tee higher and hit the top half until line drives come back.",
    ],
    reps: "3 rounds of 8 swings (one location per round)",
    source: {
      name: "Little League University — Hitting Drill Progression (Darren Fenster / USA Baseball)",
      url: "https://www.littleleague.org/university/articles/hitting-drill-progression/",
    },
    diagram: "tee-zones",
    staple: true,
  },
  {
    key: "high-low-tee",
    title: "High tee / low tee",
    dimension: "d1",
    minutes: 8,
    equipment: "tee, balls, net or open space",
    partner: false,
    cue: "Line drives off both heights — stay on top of the high one",
    fixes:
      "A one-height swing. Popping up the low pitch or rolling over the high one means the path only works in one spot.",
    steps: [
      "Set the tee belt-high: 10 swings. The win is a line drive, not a fly ball.",
      "Drop it knee-high: 10 swings. Keep your posture down through contact — no standing up out of it.",
      "If the low tee turns into ground balls, you're pulling off; slow down and finish the swing out through the ball.",
    ],
    reps: "10 swings high + 10 low, twice through",
    source: {
      name: "WIN Reality — 30 Baseball Hitting Drills for Youth Hitters",
      url: "https://winreality.com/blog/30-baseball-hitting-drills-for-coaches-to-build-better-youth-hitters/",
    },
  },
  {
    key: "soft-toss-ll",
    title: "Soft toss",
    dimension: "d1",
    minutes: 10,
    equipment: "balls, bat, helmet, net or open space — and a tosser",
    partner: true,
    cue: "See it, let it get to your zone, drive it",
    fixes:
      "Timing a moving ball with a real load and stride — the bridge between tee swings and live pitching.",
    steps: [
      "Tosser kneels off to the side, at a 45° angle a few feet away — never straight across from outside pitches.",
      "Underhand tosses into the strike zone, one at a time, with a small backswing so the hitter can time the load.",
      "Hitter takes his full swing and drives the ball into the net or open space.",
      "Call the location before each toss (in, middle, away) and meet it at the right depth.",
    ],
    reps: "3 rounds of 8–10 tosses",
    safety: "Batting helmet on the hitter, always — that's the Little League rule for this drill at home too.",
    source: {
      name: "Little League University — Backyard Tip: Soft Toss",
      url: "https://www.littleleague.org/university/articles/backyard-tip-soft-toss/",
    },
    staple: true,
  },
  {
    key: "yes-yes-no",
    title: "Yes-yes-no toss",
    dimension: "d1",
    also: ["d5"],
    minutes: 8,
    equipment: "wiffle or soft balls, bat, helmet, a tosser",
    partner: true,
    cue: "Load 'yes' on every pitch — only shut it down on a clear ball",
    fixes:
      "Indecision at the plate: taking hittable pitches because the swing never got ready, or chasing because the decision came too late.",
    steps: [
      "Tosser mixes strikes and clear balls (high, low, wide) from a short, safe angle.",
      "The hitter loads and strides saying 'yes… yes…' on EVERY toss, ready to fire.",
      "Swing through strikes; on a clear ball, hold the swing and finish 'no' — balanced, not bailing.",
      "Score it: a swing at a ball or a take of a fat strike costs a point; ten clean decisions wins.",
    ],
    reps: "2 rounds of 10 tosses",
    source: {
      name: "WIN Reality — Yes-Yes-No Drill",
      url: "https://winreality.com/blog/30-baseball-hitting-drills-for-coaches-to-build-better-youth-hitters/",
    },
  },
  {
    key: "fence-drill",
    title: "Fence drill",
    dimension: "d1",
    minutes: 5,
    equipment: "bat and any fence or wall",
    partner: false,
    cue: "Short to it, long through it",
    fixes:
      "Casting — a long, looping swing that starts away from the body and drags the barrel through the zone late.",
    steps: [
      "Stand a bat-length from the fence, facing it like it's the pitcher.",
      "Take slow swings without touching the fence: hands stay inside, barrel turns tight.",
      "Speed up gradually. If the bat scrapes, the swing is casting — reset and go slower.",
    ],
    reps: "15 slow swings, then 10 at game speed",
    safety: "Check your swing arc for space before the first cut.",
    source: {
      name: "WIN Reality — Fence Drill",
      url: "https://winreality.com/blog/30-baseball-hitting-drills-for-coaches-to-build-better-youth-hitters/",
    },
  },
  {
    key: "controlled-fall",
    title: "Controlled fall (stride timing)",
    dimension: "d1",
    minutes: 5,
    equipment: "just a bat — bedroom-friendly",
    partner: false,
    cue: "Hands back while the body goes forward",
    fixes:
      "Stride and load out of sync — lunging at the ball with the hands drifting forward, so there's nothing left to swing with.",
    steps: [
      "Set up in your stance, weight into the back leg.",
      "Balance there a beat, then let yourself 'fall' slowly into your stride foot.",
      "As the body moves forward, move the hands BACK toward the catcher — land in a loaded launch position.",
      "Hold the landing for a two-count. Add a slow-motion swing to the last five reps.",
    ],
    reps: "15 falls, the last 5 with a swing",
    source: {
      name: "The Hitting Vault — Youth Hitting Drills (Matt Lisle)",
      url: "https://thehittingvault.com/baseball-hitting-drills-for-youth-players/",
    },
  },

  // ---- D2 · Throwing ------------------------------------------------
  {
    key: "game-of-21",
    title: "Game of 21 (accuracy catch)",
    dimension: "d2",
    minutes: 10,
    equipment: "two gloves, a ball, a partner",
    partner: true,
    cue: "Feet and shoulders point at the target before the ball leaves",
    fixes:
      "Throws that sail or tail because the body never lined up — accuracy becomes a game you can win instead of a lecture.",
    steps: [
      "Stand about 10 big steps apart. The receiver shows a two-hand target at the chest.",
      "Score every throw: 3 points for hitting the two-hand target at chest height, 2 just off it, 1 well outside.",
      "Set your feet sideways to the target and step at it on every single throw.",
      "First to 21 wins. Play best of three.",
    ],
    reps: "First to 21, 2–3 games",
    safety: PITCH_SMART_NOTE,
    source: {
      name: "Little League University — Backyard Tip: Game of 21",
      url: "https://www.littleleague.org/university/articles/backyard-tip-game-21/",
    },
    diagram: "throwing-lane",
    staple: true,
  },
  {
    key: "four-seam-toss",
    title: "Four-seam exchange toss",
    dimension: "d2",
    also: ["d3"],
    minutes: 6,
    equipment: "two gloves, a ball, a partner",
    partner: true,
    cue: "Catch with two hands, find the seams without looking",
    fixes:
      "Grabbing the ball however it comes out of the glove — throws tail and sail when the grip is random.",
    steps: [
      "Partner tosses; catch with two hands.",
      "Turn the ball to a four-seam grip (fingers across the horseshoe) as fast as you can — no peeking.",
      "Hold your throw until the partner shows a two-hand target, then return it chest-high.",
      "Speed up the exchange as it gets automatic.",
    ],
    reps: "15–20 throws, 2 rounds",
    safety: PITCH_SMART_NOTE,
    source: {
      name: "Little League University — Backyard Tip: Four-Seam Toss",
      url: "https://www.littleleague.org/university/articles/backyard-tip-four-seam-toss/",
    },
  },
  {
    key: "long-toss",
    title: "Long toss",
    dimension: "d2",
    also: ["pitching"],
    minutes: 12,
    equipment: "gloves, a ball, open space, a partner",
    partner: true,
    cue: "Stretch it out easy — let the ball climb, follow your throw",
    fixes:
      "Arm strength and a full, loose arm action — built gradually, the way the arm likes it.",
    steps: [
      "Warm up close with easy catch until the arm feels loose.",
      "Back up a few steps every several throws, throwing with relaxed effort and a little arc — this is the 'stretching out' phase, not a contest.",
      "Work out only as far as you can throw with loose, on-line throws. Crow-hop and follow the throw with your body.",
      "Walk back in the same way, bringing the arc down as the distance shrinks. Done when the arm says so — never through soreness.",
    ],
    reps: "8–12 minutes total, 2–3 times a week",
    safety:
      "Skip long toss on required rest days after pitching, and any day the arm is sore. " +
      PITCH_SMART_NOTE,
    source: {
      name: "Jaeger Sports — The 2 Phases of Long Toss",
      url: "https://jaegersports.com/2-phases-of-jaeger-sports-long-toss/",
    },
    staple: true,
  },
  {
    key: "band-arm-care",
    title: "Band arm care (J-Bands routine)",
    dimension: "d2",
    also: ["pitching"],
    minutes: 8,
    equipment: "light resistance band (J-Bands Jr or similar), a door anchor or fence",
    partner: false,
    cue: "Small, controlled — the little muscles do the work",
    fixes:
      "A shoulder that only ever throws and never gets strengthened — band work is what keeps young arms durable.",
    steps: [
      "Anchor the band at waist height. Stand tall, elbow soft.",
      "Work through the routine slowly: arms forward/back, up/down, rotations in and out, ending with throwing-motion pulls.",
      "10 controlled reps per exercise — smooth both directions, no yanking.",
      "Do it before throwing days, not instead of them.",
    ],
    reps: "1 slow round of the routine (about 8 minutes)",
    safety:
      "Use the light youth band tension (Jaeger makes a Jr version for 12-and-under). Stop at any pinch or pain.",
    source: {
      name: "Jaeger Sports — J-Bands Exercise Sheet",
      url: "https://jaegersports.com/j-bands-exercise-sheet/",
    },
  },

  // ---- D3 · Fielding ------------------------------------------------
  {
    key: "wall-ball",
    title: "Wall ball",
    dimension: "d3",
    minutes: 10,
    equipment: "tennis ball, glove, any safe wall or garage door",
    partner: false,
    cue: "Soft hands — cradle it in, chest over the ball",
    fixes:
      "Slow hands and a stabbing glove. Ten reps off a wall take the time one fungo ground ball takes.",
    steps: [
      "Stand about 4 big steps from the wall in a low, ready crouch, hands apart.",
      "Throw the ball low off the wall and field the rebound out front — right side backhand, left side forehand.",
      "Throw higher on the wall to make short hops; skip it off the ground first for a line-drive rebound.",
      "Step closer to speed everything up. Count clean reps; beat yesterday's number.",
    ],
    reps: "3 rounds: 20 grounders, 10 backhands, 10 short hops",
    source: {
      name: "Baseball Tutorials — Wall Ball Fielding Drill",
      url: "https://www.baseball-tutorials.com/wall-ball-fielding-drill/4681/",
    },
    diagram: "wall-ball",
    staple: true,
  },
  {
    key: "knees-hands-routine",
    title: "Knees-down hands routine",
    dimension: "d3",
    minutes: 8,
    equipment: "glove, ball, a roller (parent works)",
    partner: true,
    positions: ["SS", "2B", "3B", "1B"],
    cue: "The ball is an egg — catch it like an egg",
    fixes:
      "A flat, turned-over glove and fielding the ball under the body. Taking the legs away isolates the hands completely.",
    steps: [
      "Kneel facing your partner, glove out front — fingers down, palm facing the ball, glove wide open.",
      "Picture a triangle from your knees to a point out front: field every ball at the point, never underneath you.",
      "Partner rolls from 10–20 feet: firm rolls straight on, then to the glove side, then backhands.",
      "Funnel each ball softly up to your belly button, then flip it back.",
    ],
    reps: "3 rounds of 10 rolls (straight / glove side / backhand)",
    source: {
      name: "Little League University — Infield Drill Progression (Darren Fenster / USA Baseball)",
      url: "https://www.littleleague.org/university/articles/infield-drill-progression/",
    },
    diagram: "short-hop",
  },
  {
    key: "alligator-hands",
    title: "Alligator hands rolls",
    dimension: "d3",
    minutes: 8,
    equipment: "glove, ball, a roller (parent works)",
    partner: true,
    positions: ["SS", "2B", "3B", "1B"],
    cue: "Glove down, top hand snaps shut — like an alligator mouth",
    fixes: "One-handed swipes and balls kicking off the heel of a lazy glove.",
    steps: [
      "Athletic fielding position: knees bent, bottom down, glove touching the grass out front.",
      "Partner rolls from 5–15 feet. Field out front with the throwing hand hovering on top — the 'alligator mouth' closes over the ball.",
      "Funnel glove and ball into your stomach and step as if to throw. Reset your feet every rep.",
      "Move to slow rollers you charge for the last round.",
    ],
    reps: "3 rounds of 10 rolls",
    source: {
      name: "Little League University — Backyard Tip: Alligator Hands",
      url: "https://www.littleleague.org/university/articles/backyard-tip-alligator-hands/",
    },
  },

  // ---- D4 · Baserunning ---------------------------------------------
  {
    key: "breakdown-baserunning",
    title: "Breakdown baserunning drill",
    dimension: "d4",
    minutes: 8,
    equipment: "any 60-foot stretch — yard, gym, sidewalk chalk for a 'bag'",
    partner: false,
    cue: "Sprint through it — fast feet, low chop, under control",
    fixes:
      "Slowing into the bag and arriving out of control — the step that turns singles into outs.",
    steps: [
      "Mark a start line ('home') and a bag about 60 feet away.",
      "Sprint at full speed and run THROUGH the bag — never leap at it or slow before it.",
      "Past the bag, break down: short, fast chop steps, knees bent, until you're under control, glancing right like you're checking for an overthrow.",
      "Walk back and repeat. Form first, then race the clock.",
    ],
    reps: "6–8 runs with full recovery between",
    source: {
      name: "Little League University — Breakdown Baserunning Drill (Steve Bernhardt, Baseball Factory)",
      url: "https://www.littleleague.org/university/articles/breakdown-baserunning-drill/",
    },
    staple: true,
  },
  {
    key: "rounding-form-runs",
    title: "Run-through & rounding form runs",
    dimension: "d4",
    minutes: 8,
    equipment: "yard space, two markers for bags",
    partner: false,
    cue: "Swing out early, hit the inside corner, eyes to the next base",
    fixes:
      "The wide, drifting turn that gives away the extra base — rounding is a shape you can practice anywhere.",
    steps: [
      "Set 'home' and 'first' as far apart as the yard allows.",
      "Straight-through reps first: sprint through the bag with a breakdown after (as in the breakdown drill).",
      "Rounding reps: a few steps out of the box, bow out to the right ('banana'), then cut the INSIDE corner of the bag with either foot and push off hard toward an imaginary second.",
      "Alternate: two straight-throughs, two roundings. Finish each rounding with three hard steps toward second.",
    ],
    reps: "8 runs (4 through, 4 rounding)",
    source: {
      name: "Little League University — Backyard Tips: The Basics, Baserunning",
      url: "https://www.littleleague.org/university/backyard-tips/",
    },
    diagram: "rounding-first",
  },

  // ---- D5 · Situational awareness -----------------------------------
  {
    key: "call-the-play",
    title: "Call the play before the pitch",
    dimension: "d5",
    minutes: 15,
    equipment: "any baseball game on a screen (or a sibling's game)",
    partner: false,
    cue: "Outs, count, runners — where's MY play if it's hit to me?",
    fixes:
      "Standing still while the play happens. The pre-pitch question is the whole skill — this builds the habit without a field.",
    steps: [
      "Watch one team's defense for two innings.",
      "Before EVERY pitch say out loud: outs, count, where the runners are.",
      "Pick one fielder each half-inning and answer for him: 'ball's hit to me — my play is ____; ball's hit elsewhere — I back up ____.'",
      "Check yourself against what the fielder actually does. Tally your hits and misses.",
    ],
    reps: "2 innings a session, 2–3 sessions a week",
    source: {
      name: "Veo — The Mental Game in Youth Baseball (U11–U12 guidance)",
      url: "https://www.veo.com/article/baseball-mental-game",
    },
  },
  {
    key: "manager-for-two-innings",
    title: "Manager for two innings",
    dimension: "d5",
    minutes: 20,
    equipment: "a game on a screen, paper and pencil",
    partner: false,
    cue: "Think one pitch ahead of the manager",
    fixes:
      "Game IQ you can only get by watching with a job to do — our take on the game-awareness targets USA Baseball sets for ages 10–12.",
    steps: [
      "Pick a real game. For two innings, YOU are the manager of one team.",
      "Before each at-bat, write your call: infield in or back? Bunt on? Send the runner?",
      "After the play, mark whether the real manager agreed and what actually happened.",
      "Bring the sheet to practice — best 'manager's call' story gets told to the team.",
    ],
    reps: "2 innings, once or twice a week",
    source: {
      name: "USA Baseball — Youth Baseball Skills Matrix, Stage 2: Discover (ages 10–12)",
      url: "https://usabdevelops.com/page/5007/youth-baseball-skills-matrix",
    },
  },

  // ---- D6 · Response to failure -------------------------------------
  {
    key: "flush-it-routine",
    title: "The flush-it routine",
    dimension: "d6",
    also: ["d8"],
    minutes: 5,
    equipment: "none",
    partner: false,
    cue: "Two seconds to be mad, one breath to flush it, next pitch",
    fixes:
      "Carrying a mistake into the next play. The reset is a skill with steps, and it gets practiced like any skill.",
    steps: [
      "Learn the sequence at home, calm: (1) two seconds of frustration — that part is allowed; (2) your flush signal (say 'flush it', tap your helmet, grab dirt); (3) one long exhale; (4) say your cue word; (5) eyes to the next target.",
      "Rehearse it 5 times slowly, then 5 times at game speed.",
      "Now use it inside every homework drill: any bad rep in wall ball or tee work triggers the routine before the next rep.",
      "Report back: which step is hardest when you're actually mad?",
    ],
    reps: "10 rehearsals, then every miss in every drill",
    source: {
      name: "Heads-Up Baseball — Ken Ravizza & Tom Hanson (book)",
      url: "https://www.amazon.com/Heads-Up-Baseball-Playing-Game-Pitch/dp/1570280215",
    },
    staple: true,
  },
  {
    key: "traffic-light-checkin",
    title: "Traffic-light check-in",
    dimension: "d6",
    also: ["d8"],
    minutes: 4,
    equipment: "none",
    partner: false,
    cue: "Green = go. Yellow or red = breathe first",
    fixes:
      "Not noticing you're rattled until three plays later. Naming the state is what makes the reset possible.",
    steps: [
      "Learn the scale: GREEN = calm and ready; YELLOW = rushing, gripping tight, chattering mind; RED = furious or frozen.",
      "During any homework drill, call your color out loud between reps.",
      "On yellow or red: stop, one slow breath, drop the shoulders, then continue. Don't take a rep while red.",
      "After the session, tell a parent one moment you went yellow and what brought you back to green.",
    ],
    reps: "Every drill session this week",
    source: {
      name: "Heads-Up Baseball — Ken Ravizza & Tom Hanson (book)",
      url: "https://www.amazon.com/Heads-Up-Baseball-Playing-Game-Pitch/dp/1570280215",
    },
  },

  // ---- D7 · Coachability --------------------------------------------
  {
    key: "practice-journal",
    title: "Practice journal",
    dimension: "d7",
    also: ["d9"],
    minutes: 5,
    equipment: "notebook and pencil",
    partner: false,
    cue: "What went well, what to adjust — two lines, every time",
    fixes:
      "Corrections that evaporate between practices. Writing them down is how a kid starts owning his own development.",
    steps: [
      "After every practice, game, and homework session, write three short lines:",
      "1) One thing that went well today. 2) One thing to adjust next time (use the coach's words). 3) One way I helped a teammate.",
      "Before the NEXT session, read yesterday's 'adjust' line — that's your focus for the day.",
      "Show the coach your journal once a week; he'll initial it.",
    ],
    reps: "3 lines after every session",
    source: {
      name: "ABCA Inside Pitch — Coaches' Corner: Mind Over Mechanics",
      url: "https://www.abca.org/magazine/magazine/2025-2-March-April/Coaches_Corner_Mind_Over_Mechanics.aspx",
    },
    staple: true,
  },
  {
    key: "one-cue-challenge",
    title: "One-cue challenge",
    dimension: "d7",
    minutes: 6,
    equipment: "whatever the chosen drill needs",
    partner: false,
    cue: "One thought, twenty reps — then and only then, change something",
    fixes:
      "Trying to fix five things per swing. Skills change one cue at a time, held long enough to stick.",
    steps: [
      "Ask the coach (or pick from your journal) ONE cue — e.g. 'short to it, long through it'.",
      "Pick the matching homework drill and do 15–20 reps holding ONLY that thought. Say it before each rep.",
      "Rate each rep just pass/fail on that one cue — ignore everything else.",
      "Next session, keep the same cue until it passes 15 of 20, then ask for the next one.",
    ],
    reps: "15–20 reps per session on one cue",
    source: {
      name: "WIN Reality — the One-Cue Coaching Rule",
      url: "https://winreality.com/blog/30-baseball-hitting-drills-for-coaches-to-build-better-youth-hitters/",
    },
  },

  // ---- D8 · Focus ----------------------------------------------------
  {
    key: "pre-pitch-routine",
    title: "Build your pre-pitch routine",
    dimension: "d8",
    also: ["d6"],
    minutes: 6,
    equipment: "none (add a tee or glove once built)",
    partner: false,
    cue: "Breath — cue word — eyes to a small target. Same loop, every pitch",
    fixes:
      "Attention that drifts between pitches. A routine gives the mind a place to come back to — that's the whole trick.",
    steps: [
      "Build your three-step loop: one belly breath; your cue word ('attack', 'easy', 'now'); eyes narrowing to one small target (a seam, a spot on the glove, the pitcher's cap button).",
      "Rehearse the loop 10 times standing still, saying each step out loud.",
      "Attach it to a drill: run the loop before EVERY rep of tee work or wall ball today.",
      "In games it runs silently — same three beats, every pitch.",
    ],
    reps: "10 rehearsals + every rep of one drill",
    source: {
      name: "Heads-Up Baseball — Ken Ravizza & Tom Hanson (book)",
      url: "https://www.amazon.com/Heads-Up-Baseball-Playing-Game-Pitch/dp/1570280215",
    },
    diagram: "routine-loop",
    staple: true,
  },
  {
    key: "breath-and-dot",
    title: "Breath-and-dot tee round",
    dimension: "d8",
    also: ["d1"],
    minutes: 8,
    equipment: "tee, balls, a marker (draw a dot on each ball)",
    partner: false,
    cue: "One breath, then watch the bat hit the dot",
    fixes:
      "Head pulling off the ball and swings taken before the mind arrived. The dot gives the eyes one job; the breath buys the time.",
    steps: [
      "Draw a coin-sized dot on each ball and set the first on the tee, dot facing you.",
      "Before every swing: one slow breath, eyes lock onto the dot.",
      "Swing and try to SEE the bat hit the dot. If you can't say where the dot went, the head left early — slow down.",
      "15 swings, full routine every time. Quality of attention over speed.",
    ],
    reps: "15 swings, one focused round",
    source: {
      name: "Hitting Performance Lab — Youth Baseball Focus Drills (Joey Myers); dot drill per Little League University",
      url: "https://hittingperformancelab.com/youth-baseball-focus-drills-proven-mental-routines-to-boost-confidence-clarity-at-bat-results/",
    },
  },

  // ---- D9 · Dugout & teammate ---------------------------------------
  {
    key: "teammate-goal-card",
    title: "Teammate goal card",
    dimension: "d9",
    also: ["d7"],
    minutes: 4,
    equipment: "index card and pencil",
    partner: false,
    cue: "Pick your job before the game picks it for you",
    fixes:
      "Being 'not disruptive, not contributing'. Energy and support are choices a kid can plan like any other skill.",
    steps: [
      "Before each game or practice, write one card: my dugout job today (foul balls, gear, cheering the count), and the teammate I'll pick up if he makes an out or an error — and what I'll say.",
      "Do both during the game. Nobody has to ask.",
      "After, add one line to your journal: did I do my card?",
      "New card, new teammate, every game.",
    ],
    reps: "One card per game or practice",
    source: {
      name: "ABCA Inside Pitch — Coaches' Corner: Mind Over Mechanics (journaling protocol, extended to team goals)",
      url: "https://www.abca.org/magazine/magazine/2025-2-March-April/Coaches_Corner_Mind_Over_Mechanics.aspx",
    },
  },

  // ---- P · Pitching (role module) ------------------------------------
  {
    key: "towel-drill",
    title: "Towel drill",
    dimension: "pitching",
    minutes: 8,
    equipment: "hand towel, a target at stride length (chair with a glove works), a spotter helps",
    partner: false,
    cue: "Full delivery — snap the towel DOWN at the target out front",
    fixes:
      "Short-arming and cutting the delivery off early — without adding a single pitch to the arm's count.",
    steps: [
      "Hold a small towel like the ball (pinch the end between your fingers).",
      "Set a target — a glove on a chair — about one stride PAST your normal stride foot landing.",
      "Run your full windup in rhythm: leg lift, stride, and snap the towel down at the target as you finish over the front leg.",
      "The snap sound is the grade: crisp snap at full extension = a finished delivery. 15 from the windup, 10 from the stretch.",
    ],
    reps: "25 deliveries (15 windup, 10 stretch)",
    safety:
      "No ball is thrown, so nothing counts toward pitch limits — but keep effort smooth, and skip it the day after a heavy outing.",
    source: {
      name: "MOJO Sports — 9 Best Baseball Pitching Drills for Kids",
      url: "https://mojo.sport/coachs-corner/9-best-baseball-pitching-drills-for-kids/",
    },
    diagram: "towel-drill",
    staple: true,
  },
  {
    key: "phase-checkpoints",
    title: "Delivery phase checkpoints (shadow bullpen)",
    dimension: "pitching",
    minutes: 8,
    equipment: "a mirror or a phone propped to record — no ball",
    partner: false,
    cue: "Stick each checkpoint for a full second before moving on",
    fixes:
      "A delivery that changes every pitch. Naming the phases — start, pivot, lift, launch — lets a kid check his own mechanics.",
    steps: [
      "Starter: athletic stance on an imaginary rubber, ball hidden in the glove. Freeze — balanced?",
      "Pivot: turn the back foot along the rubber. Freeze.",
      "Lift: knee up to belt height, back leg tall and still. Freeze for a full second — this is the one that wobbles.",
      "Launch: stride out and finish the delivery in slow motion, chest over the front knee. 10 slow reps, then 10 at game rhythm — watch yourself in the mirror or on video.",
    ],
    reps: "20 shadow deliveries",
    safety:
      "Shadow work only — when you DO throw real bullpens, Pitch Smart applies: 85/day max at 11–12, fastball and changeup only, full rest days honored.",
    source: {
      name: "Little League University — Target Skill: Pitching",
      url: "https://www.littleleague.org/university/articles/target-skill-pitching/",
    },
  },

  // ---- C · Catching (role module) ------------------------------------
  {
    key: "barehand-receiving",
    title: "Barehand quiet receiving",
    dimension: "catching",
    minutes: 8,
    equipment: "soft training ball or plastic golf balls, a tosser",
    partner: true,
    cue: "Loose is quick — beat the ball there and stick it",
    fixes:
      "A stiff, stabbing glove hand. Catching soft and quiet starts with the bare hand and a relaxed wrist.",
    steps: [
      "Get in your stance, NO glove. Partner tosses a soft ball from a few steps away.",
      "Catch it as quietly as possible — soft hand, minimal movement after you secure it. Stick each catch for a beat.",
      "Shake the hand loose before every toss (your pre-pitch looseness habit).",
      "Two rounds barehand, then repeat with the glove on from farther away. A stool or bucket under you takes the legs out and isolates the hands.",
    ],
    reps: "3 rounds of 12 catches (2 barehand, 1 gloved)",
    source: {
      name: "Little League University — Catcher Drill Progression (Darren Fenster / USA Baseball)",
      url: "https://www.littleleague.org/university/articles/catcher-drill-progression/",
    },
    staple: true,
  },
  {
    key: "blocking-progression",
    title: "Three-stage blocking",
    dimension: "catching",
    minutes: 10,
    equipment: "soft training balls ONLY, gear, a tosser",
    partner: true,
    cue: "Exhale as it hits — be a pillow, chin tucked",
    fixes:
      "Balls in the dirt reaching the backstop — blocking is taught in stages, softest version first.",
    steps: [
      "Stage 1 — pre-set: knees already down, glove filling the gap between them. Partner tosses short hops into you. Exhale just before impact so the body absorbs instead of deflects; chin tucked, watch the ball hit the chest protector.",
      "Stage 2 — from the stance: glove still pre-set low; on the toss, drive both knees down into that same shape.",
      "Stage 3 — game-like: full stance, react, block, then RECOVER — pop up, find the ball, pick it up ready to throw.",
      "Keep every ball in front of an imaginary circle around you.",
    ],
    reps: "8 tosses per stage",
    safety: "Soft training balls for all blocking work at this age — never hardballs.",
    source: {
      name: "Little League University — Catcher Drill Progression (Darren Fenster / USA Baseball)",
      url: "https://www.littleleague.org/university/articles/catcher-drill-progression/",
    },
    diagram: "catcher-block",
  },
  {
    key: "catch-turn-take",
    title: "Catch-turn-take exchange",
    dimension: "catching",
    also: ["d2"],
    minutes: 6,
    equipment: "glove, ball, a tosser",
    partner: true,
    cue: "Three beats, slow motion first: catch… turn… take",
    fixes:
      "A slow, fumbled exchange on steal throws — speed comes from clean parts, not hurrying.",
    steps: [
      "Partner tosses. Beat one: CATCH — secure the ball.",
      "Beat two: TURN — rotate the glove so its opening faces your bare hand.",
      "Beat three: TAKE — bare hand pulls the ball out with a four-seam grip. Never flip the ball out of the glove.",
      "Ten slow-motion exchanges, then merge the beats and speed up. Add your footwork toward an imaginary second base last.",
    ],
    reps: "10 slow + 15 game-speed exchanges",
    source: {
      name: "Little League University — Catcher Drill Progression (Darren Fenster / USA Baseball)",
      url: "https://www.littleleague.org/university/articles/catcher-drill-progression/",
    },
  },
];
