import { describe, expect, it } from "vitest";
import {
  BENCH,
  benchInnings,
  emptyPositions,
  fieldInnings,
  planMove,
  type AssignmentRow,
} from "./gameday";

const rows: AssignmentRow[] = [
  { inning: 1, playerId: "a", position: "C" },
  { inning: 1, playerId: "b", position: BENCH },
  { inning: 2, playerId: "a", position: "C" },
  { inning: 2, playerId: "b", position: BENCH },
  { inning: 3, playerId: "a", position: BENCH },
  { inning: 3, playerId: "b", position: "C" },
];

describe("bench and field innings", () => {
  it("counts through an inning", () => {
    expect(benchInnings(rows, "b", 2)).toBe(2);
    expect(benchInnings(rows, "b", 3)).toBe(2);
    expect(benchInnings(rows, "a", 3)).toBe(1);
    expect(fieldInnings(rows, "a", 3)).toBe(2);
  });
});

describe("planMove", () => {
  const current = new Map([
    ["a", "C"],
    ["b", "1B"],
    ["c", BENCH],
  ]);

  it("swaps with the occupant when the target is filled", () => {
    const plan = planMove(current, "a", "1B", 4, 6);
    const inning4 = plan.set.filter((s) => s.inning === 4);
    expect(inning4).toContainEqual({ inning: 4, playerId: "a", position: "1B" });
    expect(inning4).toContainEqual({ inning: 4, playerId: "b", position: "C" });
    expect(plan.set.filter((s) => s.playerId === "a")).toHaveLength(3); // innings 4-6
  });

  it("bench to position swaps the occupant onto the bench", () => {
    const plan = planMove(current, "c", "C", 2, 3);
    expect(plan.set).toContainEqual({ inning: 2, playerId: "c", position: "C" });
    expect(plan.set).toContainEqual({ inning: 2, playerId: "a", position: BENCH });
  });

  it("moving to the bench vacates the position", () => {
    const plan = planMove(current, "a", BENCH, 5, 6);
    expect(plan.set).toEqual([
      { inning: 5, playerId: "a", position: BENCH },
      { inning: 6, playerId: "a", position: BENCH },
    ]);
  });

  it("no-op when target equals current slot", () => {
    expect(planMove(current, "a", "C", 1, 6).set).toEqual([]);
  });
});

describe("emptyPositions", () => {
  it("lists unfilled field slots", () => {
    const current = new Map([
      ["a", "C"],
      ["b", BENCH],
    ]);
    const empty = emptyPositions(current);
    expect(empty).toContain("P");
    expect(empty).toContain("1B");
    expect(empty).not.toContain("C");
    expect(empty).toHaveLength(8);
  });
});
