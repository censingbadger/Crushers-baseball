import { describe, expect, it } from "vitest";
import { barPct, effortSummary, weekAnchor } from "./effort";
import { buildWorkout, type WorkoutDrill } from "./drills";

describe("weekAnchor", () => {
  it("anchors any day to its Monday", () => {
    expect(weekAnchor("2026-07-19")).toBe("2026-07-13"); // Sunday
    expect(weekAnchor("2026-07-13")).toBe("2026-07-13"); // Monday
    expect(weekAnchor("2026-07-18")).toBe("2026-07-13"); // Saturday
    expect(weekAnchor("2026-08-01")).toBe("2026-07-27"); // month crossing
  });
});

describe("effortSummary", () => {
  const today = "2026-07-19"; // Sunday, week of Jul 13
  it("counts week and month sessions", () => {
    const s = effortSummary(
      [
        { day: "2026-07-14", totalMinutes: 20 },
        { day: "2026-07-18", totalMinutes: 15 },
        { day: "2026-07-05", totalMinutes: 30 }, // earlier in July
        { day: "2026-06-30", totalMinutes: 30 }, // June — month excluded
      ],
      today,
    );
    expect(s.weekSessions).toBe(2);
    expect(s.weekMinutes).toBe(35);
    expect(s.monthSessions).toBe(3);
    expect(s.monthMinutes).toBe(65);
  });

  it("builds streaks across consecutive weeks", () => {
    const s = effortSummary(
      [
        { day: "2026-07-14", totalMinutes: 10 }, // this week
        { day: "2026-07-08", totalMinutes: 10 }, // last week
        { day: "2026-07-01", totalMinutes: 10 }, // two weeks back
        { day: "2026-06-10", totalMinutes: 10 }, // gap — not in streak
      ],
      today,
    );
    expect(s.streakWeeks).toBe(3);
  });

  it("forgives a quiet current week", () => {
    const s = effortSummary(
      [
        { day: "2026-07-08", totalMinutes: 10 },
        { day: "2026-07-01", totalMinutes: 10 },
      ],
      today,
    );
    expect(s.streakWeeks).toBe(2);
  });

  it("clamps bars to 0-100", () => {
    expect(barPct(2, 3)).toBe(67);
    expect(barPct(5, 3)).toBe(100);
    expect(barPct(0, 3)).toBe(0);
  });
});

describe("buildWorkout", () => {
  const drills: WorkoutDrill[] = [
    { title: "Long toss", category: "throwing", minutes: 10, cue: "Hit the chest" },
    { title: "Tee work", category: "hitting", minutes: 10, cue: "Up the middle" },
    { title: "Wall ball", category: "fielding", minutes: 8, cue: "Quick glove" },
    { title: "Shadow pen", category: "pitching", minutes: 8, cue: "Balance point" },
    { title: "Sprints", category: "speed", minutes: 6, cue: "First three steps" },
  ];

  it("always warms up throwing, then hits", () => {
    const plan = buildWorkout(30, drills);
    expect(plan[0].category).toBe("throwing");
    expect(plan[1].category).toBe("hitting");
  });

  it("adds up exactly to the requested time", () => {
    for (const minutes of [10, 20, 30, 45]) {
      const plan = buildWorkout(minutes, drills);
      const total = plan.reduce((sum, s) => sum + s.minutes, 0);
      expect(total).toBe(minutes);
    }
  });

  it("prioritizes pitching for a kid who wants to pitch", () => {
    const wants = buildWorkout(28, drills, { desiredPositions: "SS, P" });
    const cats = wants.map((s) => s.category);
    expect(cats.indexOf("pitching")).toBeGreaterThan(-1);
    expect(cats.indexOf("pitching")).toBeLessThan(
      cats.indexOf("fielding") === -1 ? 99 : cats.indexOf("fielding"),
    );
  });

  it("still plans something for a tiny window", () => {
    const plan = buildWorkout(2, drills);
    expect(plan).toHaveLength(1);
    expect(plan[0].minutes).toBe(2);
  });

  it("varies with the seed but stays deterministic", () => {
    const more: WorkoutDrill[] = [
      ...drills,
      { title: "Soft toss", category: "hitting", minutes: 10, cue: "Stay back" },
    ];
    const a = buildWorkout(20, more, { seed: 0 });
    const b = buildWorkout(20, more, { seed: 1 });
    const a2 = buildWorkout(20, more, { seed: 0 });
    expect(a).toEqual(a2);
    expect(a.find((s) => s.category === "hitting")?.title).not.toBe(
      b.find((s) => s.category === "hitting")?.title,
    );
  });
});
