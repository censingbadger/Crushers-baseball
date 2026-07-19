import { describe, expect, it } from "vitest";
import { pitchEligibility, restDaysRequired } from "./pitchsmart";

describe("restDaysRequired (11-12)", () => {
  it("maps the tier boundaries", () => {
    expect(restDaysRequired(0)).toBe(0);
    expect(restDaysRequired(1)).toBe(0);
    expect(restDaysRequired(20)).toBe(0);
    expect(restDaysRequired(21)).toBe(1);
    expect(restDaysRequired(35)).toBe(1);
    expect(restDaysRequired(36)).toBe(2);
    expect(restDaysRequired(50)).toBe(2);
    expect(restDaysRequired(51)).toBe(3);
    expect(restDaysRequired(65)).toBe(3);
    expect(restDaysRequired(66)).toBe(4);
    expect(restDaysRequired(85)).toBe(4);
  });
});

describe("pitchEligibility", () => {
  it("is fully available with no history", () => {
    const e = pitchEligibility([], "2026-07-19");
    expect(e.eligible).toBe(true);
    expect(e.pitchesRemainingToday).toBe(85);
  });

  it("subtracts today's pitches from the cap", () => {
    const e = pitchEligibility([{ day: "2026-07-19", pitches: 60 }], "2026-07-19");
    expect(e.eligible).toBe(true);
    expect(e.pitchesRemainingToday).toBe(25);
  });

  it("blocks at the daily cap", () => {
    const e = pitchEligibility([{ day: "2026-07-19", pitches: 85 }], "2026-07-19");
    expect(e.eligible).toBe(false);
    expect(e.reason).toContain("daily cap");
  });

  it("enforces rest days: 30 pitches Saturday -> can pitch Monday, not Sunday", () => {
    const sat = [{ day: "2026-07-18", pitches: 30 }];
    const sun = pitchEligibility(sat, "2026-07-19");
    expect(sun.eligible).toBe(false);
    expect(sun.nextEligibleDay).toBe("2026-07-20");
    const mon = pitchEligibility(sat, "2026-07-20");
    expect(mon.eligible).toBe(true);
  });

  it("20 pitches Saturday allows Sunday (0 rest days)", () => {
    const e = pitchEligibility([{ day: "2026-07-18", pitches: 20 }], "2026-07-19");
    expect(e.eligible).toBe(true);
  });

  it("66+ pitches requires four rest days", () => {
    const hist = [{ day: "2026-07-14", pitches: 70 }];
    expect(pitchEligibility(hist, "2026-07-18").eligible).toBe(false);
    expect(pitchEligibility(hist, "2026-07-19").eligible).toBe(true);
  });

  it("uses the most restrictive prior outing", () => {
    const hist = [
      { day: "2026-07-17", pitches: 10 },
      { day: "2026-07-16", pitches: 60 },
    ];
    const e = pitchEligibility(hist, "2026-07-18");
    expect(e.eligible).toBe(false);
    expect(e.nextEligibleDay).toBe("2026-07-20");
  });
});
