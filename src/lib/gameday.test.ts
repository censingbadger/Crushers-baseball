import { describe, expect, it } from "vitest";
import {
  BENCH,
  benchInnings,
  duplicateOccupants,
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
  const base = new Map([
    ["a", "C"],
    ["b", "1B"],
    ["c", BENCH],
  ]);
  // Same alignment in a range of innings (a fresh, unplanned game).
  const spread = (from: number, to: number, map = base) => {
    const byInning = new Map<number, Map<string, string>>();
    for (let i = from; i <= to; i++) byInning.set(i, new Map(map));
    return byInning;
  };

  it("swaps with the occupant when the target is filled", () => {
    const plan = planMove(spread(4, 6), "a", "1B", 4, 6);
    const inning4 = plan.set.filter((s) => s.inning === 4);
    expect(inning4).toContainEqual({ inning: 4, playerId: "a", position: "1B" });
    expect(inning4).toContainEqual({ inning: 4, playerId: "b", position: "C" });
    expect(plan.set.filter((s) => s.playerId === "a")).toHaveLength(3); // innings 4-6
  });

  it("bench to position swaps the occupant onto the bench", () => {
    const plan = planMove(spread(2, 3), "c", "C", 2, 3);
    expect(plan.set).toContainEqual({ inning: 2, playerId: "c", position: "C" });
    expect(plan.set).toContainEqual({ inning: 2, playerId: "a", position: BENCH });
  });

  it("moving to the bench vacates the position", () => {
    const plan = planMove(spread(5, 6), "a", BENCH, 5, 6);
    expect(plan.set).toEqual([
      { inning: 5, playerId: "a", position: BENCH },
      { inning: 6, playerId: "a", position: BENCH },
    ]);
  });

  it("no-op when target equals current slot", () => {
    expect(planMove(spread(1, 6), "a", "C", 1, 6).set).toEqual([]);
  });

  it("writes an extra inning when from==to beyond regulation", () => {
    // The dugout bounds moves by max(currentInning, innings), so a move in
    // inning 7 of a 6-inning game must still emit rows (was a silent no-op).
    const plan = planMove(spread(7, 7), "c", "C", 7, 7);
    expect(plan.set).toContainEqual({ inning: 7, playerId: "c", position: "C" });
    expect(plan.set).toContainEqual({ inning: 7, playerId: "a", position: BENCH });
  });

  it("resolves each inning against ITS OWN lineup (planned game)", () => {
    // Inning 1: a=C, b=1B. Inning 5: a=C but the 1B is d (b is pitching).
    // Dragging a→1B from inning 1 must swap a with b in inning 1 and with
    // d in inning 5 — never touch b's inning-5 P assignment.
    const byInning = new Map<number, Map<string, string>>([
      [1, new Map([["a", "C"], ["b", "1B"], ["d", "LF"]])],
      [5, new Map([["a", "C"], ["b", "P"], ["d", "1B"]])],
    ]);
    const plan = planMove(byInning, "a", "1B", 1, 5);
    // Inning 1: a→1B, b (the inning-1 1B) →C.
    expect(plan.set).toContainEqual({ inning: 1, playerId: "a", position: "1B" });
    expect(plan.set).toContainEqual({ inning: 1, playerId: "b", position: "C" });
    // Inning 5: a→1B, d (the inning-5 1B) →C. b stays at P (never written).
    expect(plan.set).toContainEqual({ inning: 5, playerId: "a", position: "1B" });
    expect(plan.set).toContainEqual({ inning: 5, playerId: "d", position: "C" });
    expect(plan.set.some((s) => s.playerId === "b" && s.inning === 5)).toBe(false);
  });

  it("skips innings that already have the player at the target", () => {
    const byInning = new Map<number, Map<string, string>>([
      [3, new Map([["a", "SS"]])], // already at SS — untouched
      [4, new Map([["a", "2B"]])], // moves to SS
    ]);
    const plan = planMove(byInning, "a", "SS", 3, 4);
    expect(plan.set).toEqual([{ inning: 4, playerId: "a", position: "SS" }]);
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

describe("duplicateOccupants", () => {
  it("returns nothing for a clean inning", () => {
    expect(
      duplicateOccupants([
        { playerId: "a", position: "SS", updatedAtMs: 100 },
        { playerId: "b", position: "C", updatedAtMs: 200 },
        { playerId: "c", position: BENCH, updatedAtMs: 300 },
      ]),
    ).toEqual([]);
  });

  it("benches the older write when two coaches land on one slot", () => {
    expect(
      duplicateOccupants([
        { playerId: "old", position: "SS", updatedAtMs: 100 },
        { playerId: "new", position: "SS", updatedAtMs: 200 },
      ]),
    ).toEqual(["old"]);
  });

  it("keeps exactly one player per slot with three-way pileups", () => {
    const losers = duplicateOccupants([
      { playerId: "a", position: "1B", updatedAtMs: 100 },
      { playerId: "b", position: "1B", updatedAtMs: 300 },
      { playerId: "c", position: "1B", updatedAtMs: 200 },
    ]);
    expect(losers.sort()).toEqual(["a", "c"]);
  });

  it("breaks timestamp ties deterministically (by playerId)", () => {
    expect(
      duplicateOccupants([
        { playerId: "zed", position: "CF", updatedAtMs: 100 },
        { playerId: "amy", position: "CF", updatedAtMs: 100 },
      ]),
    ).toEqual(["zed"]);
  });

  it("never dedupes the bench — any number can sit", () => {
    expect(
      duplicateOccupants([
        { playerId: "a", position: BENCH, updatedAtMs: 100 },
        { playerId: "b", position: BENCH, updatedAtMs: 100 },
        { playerId: "c", position: BENCH, updatedAtMs: 100 },
      ]),
    ).toEqual([]);
  });
});
