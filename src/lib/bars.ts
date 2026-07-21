// The BARS instrument: Behaviorally Anchored Rating Scales for 11U player
// development, adapted from the staff's measurement spec. The scale is
// criterion-referenced — a 3 means "meets the standard for a competitive
// 11U player", never "average for our team" — and the five levels differ
// on four things only: prompting-dependence → consistency → condition
// difficulty → transfer. Anchors describe what the player DOES, never how
// good he is. No composite score exists anywhere, by design.

export const BARS_KEYS = [
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "d8",
  "d9",
  "pitching",
  "catching",
] as const;
export type BarsKey = (typeof BARS_KEYS)[number];

/** Stored level 0 means "not observed" — first-class, never defaulted. */
export const NOT_OBSERVED = 0;

export type BarsCluster =
  | "technical"
  | "tactical"
  | "self-regulation"
  | "team"
  | "role";

export const BARS_LEVEL_LOGIC: { level: number; label: string; logic: string }[] = [
  { level: 1, label: "Not yet present", logic: "Does not do it even when prompted, or does the opposite. Requires adult intervention." },
  { level: 2, label: "Emerging / prompted", logic: "Does it when directly told, inconsistently, in easy conditions only. Does not retain it." },
  { level: 3, label: "At the 11U standard", logic: "Does it reliably in routine conditions without prompting. This is the target." },
  { level: 4, label: "Above standard", logic: "Holds up in harder conditions and under game pressure. Self-corrects." },
  { level: 5, label: "Exceptional", logic: "All of level 4, plus his best in the highest-leverage moments, and he can explain his own execution. Rare — expect 0–2 players per dimension." },
];

export interface BarsDimensionDef {
  key: BarsKey;
  code: string;
  label: string;
  sub: string;
  cluster: BarsCluster;
  /** How often this cluster is meant to be rated. */
  cadence: string;
  anchors: Record<1 | 2 | 3 | 4 | 5, string>;
  /** Interpretation guardrail shown to raters and echoed in reports. */
  guardrail?: string;
  /** Role modules are rated only for players who actually fill the role. */
  roleModule?: boolean;
}

export const BARS_DIMENSIONS: BarsDimensionDef[] = [
  {
    key: "d1",
    code: "D1",
    label: "Hitting",
    sub: "Swing decisions and contact quality",
    cluster: "technical",
    cadence: "3× a season",
    anchors: {
      1: "Swings at nearly everything or takes nearly everything. Timing is late or early with no adjustment inside the at-bat. Steps out or bails against velocity. Setup and swing shape change from at-bat to at-bat.",
      2: "Makes contact on fastballs in the middle of the zone. Chases out of the zone on roughly half his swings. No two-strike adjustment. Contact is mostly weak — topped grounders and popups. Needs a between-pitch cue to reset.",
      3: "Takes obvious balls and swings at strikes. Repeatable setup and load; front foot down on time against average velocity. Shortens up with two strikes when reminded. Hard contact on hittable pitches over the middle.",
      4: "Works counts. Lays off borderline pitches. Adjusts timing within the at-bat after seeing the pitcher once. Shortens up with two strikes unprompted. Drives the ball the other way when pitched away.",
      5: "Takes a plan to the plate and executes it. Adjusts to an unfamiliar pitcher inside two pitches. At-bat quality is the same in a one-run game as in a blowout. Can state afterward what he was trying to do and why.",
    },
  },
  {
    key: "d2",
    code: "D2",
    label: "Throwing",
    sub: "Arm action, accuracy, and exchange",
    cluster: "technical",
    cadence: "3× a season",
    anchors: {
      1: "Throws off-balance from a stationary base with no lower half. Throws sail or bounce short more often than they arrive. Grabs the ball however it comes out of the glove. Short-arms or throws across his body.",
      2: "Reaches the target from short distance; accuracy fades at position distance. Aligns feet to target when reminded. Four-seam grip on some transfers, not most. Throws arrive high, wide, or on a hop.",
      3: "Consistent arm slot. Aligns feet and shoulders without prompting. Four-seam grip on most transfers. Accurate chest-height throws at his position's distances. Completes routine plays on time.",
      4: "Quick, clean transfer under time pressure. Accurate on the move — on the run, from the hole, through a cutoff. Picks the right throw for the situation. Throws stay catchable when rushed.",
      5: "On line and on time on the hardest routine plays for his position. Completes the arm-care and warm-up program without being told, and reports soreness rather than hiding it.",
    },
  },
  {
    key: "d3",
    code: "D3",
    label: "Fielding",
    sub: "Glove work, footwork, and range",
    cluster: "technical",
    cadence: "3× a season",
    anchors: {
      1: "Waits flat-footed. Rarely gets his body behind the ball. Glove drops or turns over. Throwing hand away from the body. Turns his head on hard-hit balls.",
      2: "Fields routine grounders hit right at him with two hands. Can't move laterally to field. Backhands go through. Charges slow rollers late or not at all. Misjudges fly balls needing a first step back.",
      3: "Consistent ready position and pre-pitch move. Works through the ball inside a two-to-three step range. Makes the backhand play to the glove side. Charges and fields a slow roller with a correct approach. Correct first step on routine fly balls.",
      4: "Range past three steps. Reads hops and adjusts stride. Clean on the backhand; bare-hands the slow roller when the play requires it. Fields on the run. Recovers to finish the play after a bobble.",
      5: "Same technique on the difficult play under game pressure as in practice. Adjusts his own positioning by hitter and count without instruction. Converts outs most 11U fielders don't reach.",
    },
  },
  {
    key: "d4",
    code: "D4",
    label: "Baserunning",
    sub: "Reads, technique, and aggression",
    cluster: "technical",
    cadence: "3× a season",
    anchors: {
      1: "Watches the ball instead of running. Stops at first without rounding. Leaves late or not at all. Runs into outs on balls in the air. Never looks for the base coach.",
      2: "Runs hard when reminded. Takes a lead but returns late or gets picked. Runs on contact regardless of ground ball or fly. Finds the base coach only when shouted at.",
      3: "Runs hard out of the box every time. Appropriate primary lead, secondary on the pitch. Freezes on liners, tags on flies, advances on grounders. Finds the base coach at the right moment. Slides correctly.",
      4: "Reads the pitcher's move and goes on his own read. First-to-third on a single to right without being sent. Takes the extra base when the defense invites it. Forces mistakes.",
      5: "Calibrates aggression to score, inning, and outs — pushes when it's right, holds when it isn't. The runner you want on base in a one-run game.",
    },
  },
  {
    key: "d5",
    code: "D5",
    label: "Situational awareness",
    sub: "Game decisions",
    cluster: "tactical",
    cadence: "3× a season",
    anchors: {
      1: "Can't state outs, count, or score mid-inning. Stands still on balls hit elsewhere. No backup responsibilities. Freezes with the ball or throws to the wrong base repeatedly.",
      2: "Knows the situation once a coach announces it. Moves to the right spot when someone yells. Handles the routine throw to first; misplays situations needing a different base.",
      3: "Knows outs, count, and score without being told. States where the ball is going before the pitch. Executes backups and cutoffs on routine plays. Calls for pop-ups in his zone.",
      4: "Correct in the less-common spots: corners, infield in, bunt coverage, first-and-third. Adjusts positioning by hitter and count. Talks the situation to teammates before the pitch. Recovers when the first play breaks down.",
      5: "Anticipates two plays ahead — trails the runner, moves to where a play may develop. Correct high-leverage decision under time pressure. Teammates use him as the on-field reference.",
    },
  },
  {
    key: "d6",
    code: "D6",
    label: "Response to failure",
    sub: "Reset after mistakes",
    cluster: "self-regulation",
    cadence: "after each tournament",
    anchors: {
      1: "The next play or at-bat is visibly worse. Throws equipment, cries, sulks, argues, or shuts down. Recovery needs an adult and may not happen within the game.",
      2: "Recovers within an inning, not within a play. Head down between. Needs coach reassurance to re-engage. Avoids further exposure — stops swinging aggressively, hides from the ball.",
      3: "Brief frustration, then resets before the next pitch. Body language back to neutral without adult help. Effort unchanged. Wants the next opportunity.",
      4: "Resets immediately and can name what went wrong and what he'll do differently. Performance after a mistake is unchanged. Doesn't carry an at-bat to the field.",
      5: "Competes at his best in the innings and at-bats that matter most. Steadies teammates after their mistakes. Treats a tough opponent or a bad call as information.",
    },
    guardrail:
      "A low score here is a coaching and support problem, not a character verdict. Emotional regulation at 11 is developmentally variable and confounded with life outside baseball. Communicate this as a skill being taught, with the specific next behavior named.",
  },
  {
    key: "d7",
    code: "D7",
    label: "Coachability",
    sub: "Response to correction and practice quality",
    cluster: "self-regulation",
    cadence: "after each tournament",
    anchors: {
      1: "Argues, makes excuses, or disengages when corrected. Repeats the same error after the same correction across sessions. Low intent in drills. Needs repeated redirection.",
      2: "Accepts correction without arguing but doesn't change the next rep. Reduced intent when unobserved. Needs the same correction every session.",
      3: "Attempts the correction on the very next rep. Asks when he doesn't understand. Works at game intent through the drill. Retains the correction to the next practice.",
      4: "Seeks feedback rather than waiting. Self-corrects mid-drill. Holds the correction under game conditions. Brings evidence of work done between practices.",
      5: "Sets his own development targets and tracks them. Transfers a correction to a related skill. Asks why the change works, not only what to change.",
    },
  },
  {
    key: "d8",
    code: "D8",
    label: "Focus",
    sub: "Attentional control",
    cluster: "self-regulation",
    cadence: "after each tournament",
    anchors: {
      1: "Attention elsewhere most of the inning: dirt, next field, crowd. Misses signs repeatedly. Called by name several times per inning. Regularly not ready on his turn.",
      2: "Locks in for a pitch or two, then drifts. Misses a sign about once a game. Needs one prompt per inning. Noticeably worse in the second game of the day.",
      3: "Same pre-pitch preparation on every pitch: ready position, situation check. Picks up signs the first time. On deck with helmet and bat. Attention holds for a full game.",
      4: "Holds through long innings and doubleheaders. Recovers within one pitch after a distraction. Narrows to the ball and widens to the field at the right moments unprompted.",
      5: "Uses a repeatable self-directed routine (breath, step-out, cue word). Attention unchanged by score, weather, or crowd. Can describe what he focuses on and when.",
    },
    guardrail:
      "Sustained attention at 11 is developmentally variable. Treat a persistent 1 or 2 as a signal to redesign the environment — shorter task blocks, assigned dugout jobs, external-focus cues — before treating it as effort. This is never a diagnosis.",
  },
  {
    key: "d9",
    code: "D9",
    label: "Dugout & teammate",
    sub: "Conduct and contribution",
    cluster: "team",
    cadence: "after each tournament",
    anchors: {
      1: "Disrupts: horseplay with equipment, leaving the dugout, needling teammates or opponents, complaining about the lineup. Consumes adult attention that should be on the game.",
      2: "Not disruptive, not contributing. Sits and watches or talks about other things. Does a dugout job only when named. Goes quiet or sulks when not playing.",
      3: "Does the dugout jobs without being named: foul balls, warm-up catch, helmets and gear. Hustles on and off. Tracks the game and cheers teammates. Leaves the dugout clean.",
      4: "Supports the teammate who just made an error or struck out. Brings energy others pick up. Takes the jobs nobody wants. Respects umpires and opponents in tight games.",
      5: "Sets the standard others follow — newer players learn expectations by watching him. Holds teammates to it in a way they accept. Same in a blowout loss as a close win.",
    },
  },
  {
    key: "pitching",
    code: "P",
    label: "Pitching",
    sub: "Role module — rate pitchers only",
    cluster: "role",
    cadence: "3× a season",
    roleModule: true,
    anchors: {
      1: "Cannot repeat a delivery; walks dominate outings; visible arm pain or fatigue goes unreported.",
      2: "Throws strikes from the stretch or windup but not both; loses the zone for a whole inning after a walk or error; mechanics change under fatigue.",
      3: "Repeatable delivery; first-pitch strikes at least half the time; fields his position and covers first; holds mechanics through a normal outing.",
      4: "Two pitches he can throw for strikes; changes speeds on purpose; controls the running game; holds mechanics deep into an outing.",
      5: "Pitches to the situation and the count; the same with runners on as bases empty; self-reports fatigue accurately.",
    },
    guardrail:
      "Pitch counts against Pitch Smart limits (85/day at 11–12) are tracked as hard data in the dugout, separate from this rating.",
  },
  {
    key: "catching",
    code: "C",
    label: "Catching",
    sub: "Role module — rate catchers only",
    cluster: "role",
    cadence: "3× a season",
    roleModule: true,
    anchors: {
      1: "Blocks nothing; receives with a stiff or turned glove; cannot throw from a crouch.",
      2: "Catches the pitch in the zone; anything off the plate goes to the backstop; throws to second need a full stand-up.",
      3: "Blocks balls in the dirt at him; quiet glove; accurate throw to second from a functional exchange; controls the ball with runners on.",
      4: "Blocks and recovers laterally; frames borderline pitches; leads communication on bunts and pop-ups; times up the running game.",
      5: "Manages the pitcher's tempo and confidence; anticipates situations; the defense visibly plays better with him behind the plate.",
    },
  },
];

export const BARS_BY_KEY: Record<BarsKey, BarsDimensionDef> = Object.fromEntries(
  BARS_DIMENSIONS.map((d) => [d.key, d]),
) as Record<BarsKey, BarsDimensionDef>;

/** Parent-facing explanation — goes out with every report, verbatim. */
export const BARS_SCALE_EXPLANATION =
  "How to read our development levels: we rate against a fixed standard for " +
  "a competitive 11U player, not against our own roster. Level 3 means " +
  '"does it reliably, without prompting, in routine game conditions" — that ' +
  "is the target, and a team full of 3s is a successful 11U team. Levels 4 " +
  "and 5 add harder conditions, pressure, and self-direction; a 5 is rare " +
  "at this age by design. Levels 1 and 2 mean the skill is still being " +
  "built and tell us exactly what to teach next. The level always comes " +
  "with the behavior it describes, and the next level's description is the " +
  "work in front of us — there is no overall score, and no comparison to " +
  "any other player, on purpose.";

// ---- pure aggregation helpers ----

export interface BarsRow {
  playerId: string;
  dimension: string;
  rater: string;
  level: number; // 1-5, or 0 = not observed
  day: string; // ISO date
  createdAt: Date;
  /** The coach who left the rating, when known. Two staff can share
   * initials (e.g. two "MC"); grouping by (rater, user) instead of the
   * initials alone keeps their observations distinct so the median and
   * the "raters split" flag stay honest. Omitted → grouped by rater only
   * (unchanged behavior for callers that don't load it). */
  createdByUserId?: string | null;
}

/** Identity of a rater within an aggregation: the coach when known, else
 * the label. See BarsRow.createdByUserId. */
function raterIdentity(r: { rater: string; createdByUserId?: string | null }): string {
  return `${r.rater}|${r.createdByUserId ?? ""}`;
}

export interface BarsCell {
  /** Median of each rater's latest observed level. */
  median: number;
  /** Raters contributing an observed level. */
  raters: number;
  /** Max - min across contributing raters. */
  spread: number;
  /** Raters split by ≥2 levels — surface, don't average away. */
  flagged: boolean;
  /** Direction vs each rater's previous observed level, when one exists. */
  direction: "up" | "down" | "flat" | null;
  latestDay: string;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Roll raw rating rows up per player × dimension: each rater's latest
 * observed level (not-observed rows never count), median across raters,
 * disagreement flagged at a spread of two or more.
 */
export function barsSummary(
  rows: readonly BarsRow[],
): Map<string, Map<BarsKey, BarsCell>> {
  // player -> dimension -> rater-identity -> observed rows, newest last.
  const nested = new Map<string, Map<string, Map<string, BarsRow[]>>>();
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  for (const r of sorted) {
    if (r.level === NOT_OBSERVED) continue;
    const byDim = nested.get(r.playerId) ?? new Map();
    const byRater = byDim.get(r.dimension) ?? new Map();
    const id = raterIdentity(r);
    const list = byRater.get(id) ?? [];
    list.push(r);
    byRater.set(id, list);
    byDim.set(r.dimension, byRater);
    nested.set(r.playerId, byDim);
  }

  const out = new Map<string, Map<BarsKey, BarsCell>>();
  for (const [playerId, byDim] of nested) {
    const cells = new Map<BarsKey, BarsCell>();
    for (const [dim, byRater] of byDim) {
      const latest: number[] = [];
      const prev: number[] = [];
      let latestDay = "";
      for (const list of byRater.values()) {
        const last = list[list.length - 1];
        latest.push(last.level);
        if (last.day > latestDay) latestDay = last.day;
        if (list.length > 1) prev.push(list[list.length - 2].level);
      }
      const med = median(latest);
      const spread = Math.max(...latest) - Math.min(...latest);
      let direction: BarsCell["direction"] = null;
      if (prev.length > 0) {
        const prevMed = median(prev);
        direction = med > prevMed ? "up" : med < prevMed ? "down" : "flat";
      }
      cells.set(dim as BarsKey, {
        median: med,
        raters: latest.length,
        spread,
        flagged: spread >= 2,
        direction,
        latestDay,
      });
    }
    out.set(playerId, cells);
  }
  return out;
}

/**
 * Relative-age guardrail: players in the roster's youngest birth quartile.
 * Technical ratings for these players carry a maturity flag — within one
 * 11U roster the oldest and youngest can be a year of age and up to three
 * biological years apart.
 */
export function youngestQuartile(
  players: readonly { playerId: string; birthdate: string | null }[],
): Set<string> {
  const dated = players.filter((p) => p.birthdate);
  if (dated.length < 4) return new Set();
  const sorted = [...dated].sort((a, b) =>
    (b.birthdate as string).localeCompare(a.birthdate as string),
  ); // youngest (latest birthdate) first
  const n = Math.floor(sorted.length / 4);
  return new Set(sorted.slice(0, n).map((p) => p.playerId));
}
