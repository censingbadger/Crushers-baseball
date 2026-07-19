// USA Baseball Pitch Smart rules for ages 11–12. Limits live here (not
// scattered through the UI) so a league variation is a one-place change;
// a config table can replace these constants later without touching call
// sites.

export interface PitchSmartConfig {
  dailyMax: number;
  /** Rest tiers: pitching `min..max` pitches in a day requires `restDays`. */
  restTiers: { min: number; max: number; restDays: number }[];
}

export const PITCH_SMART_11_12: PitchSmartConfig = {
  dailyMax: 85,
  restTiers: [
    { min: 1, max: 20, restDays: 0 },
    { min: 21, max: 35, restDays: 1 },
    { min: 36, max: 50, restDays: 2 },
    { min: 51, max: 65, restDays: 3 },
    { min: 66, max: Infinity, restDays: 4 },
  ],
};

export function restDaysRequired(
  pitchesInDay: number,
  config: PitchSmartConfig = PITCH_SMART_11_12,
): number {
  if (pitchesInDay <= 0) return 0;
  for (const tier of config.restTiers) {
    if (pitchesInDay >= tier.min && pitchesInDay <= tier.max) return tier.restDays;
  }
  return config.restTiers[config.restTiers.length - 1].restDays;
}

export interface DayPitches {
  /** ISO date "YYYY-MM-DD" */
  day: string;
  pitches: number;
}

export interface Eligibility {
  eligible: boolean;
  pitchesRemainingToday: number;
  reason: string | null;
  /** ISO date the player may pitch again (when resting). */
  nextEligibleDay: string | null;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Eligibility to pitch on `today` given pitch history (any order, may
 * include today). Rest days from a prior outing must fully elapse; the
 * daily cap bounds what's left today.
 */
export function pitchEligibility(
  history: DayPitches[],
  today: string,
  config: PitchSmartConfig = PITCH_SMART_11_12,
): Eligibility {
  let todayPitches = 0;
  let blockedUntil: string | null = null;
  let blockingReason: string | null = null;

  for (const h of history) {
    if (h.pitches <= 0) continue;
    if (h.day === today) {
      todayPitches += h.pitches;
      continue;
    }
    if (h.day > today) continue;
    const rest = restDaysRequired(h.pitches, config);
    if (rest === 0) continue;
    const eligibleAgain = addDays(h.day, rest + 1);
    if (eligibleAgain > today && (!blockedUntil || eligibleAgain > blockedUntil)) {
      blockedUntil = eligibleAgain;
      blockingReason = `${h.pitches} pitches on ${h.day} requires ${rest} rest day${rest === 1 ? "" : "s"}`;
    }
  }

  if (blockedUntil) {
    return {
      eligible: false,
      pitchesRemainingToday: 0,
      reason: blockingReason,
      nextEligibleDay: blockedUntil,
    };
  }
  const remaining = Math.max(0, config.dailyMax - todayPitches);
  if (remaining === 0) {
    return {
      eligible: false,
      pitchesRemainingToday: 0,
      reason: `at the daily cap of ${config.dailyMax}`,
      nextEligibleDay: null,
    };
  }
  return {
    eligible: true,
    pitchesRemainingToday: remaining,
    reason: null,
    nextEligibleDay: null,
  };
}
