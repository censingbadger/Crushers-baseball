import { describe, expect, it } from "vitest";
import { POSITIONS, type Position } from "@/db/schema";
import { hungarianMin, solveLineup, type LineupCandidate } from "./lineup";

function candidate(
  playerId: string,
  ratings: Partial<Record<Position, number>>,
): LineupCandidate {
  return {
    playerId,
    name: playerId,
    ratings: new Map(Object.entries(ratings) as [Position, number][]),
  };
}

describe("hungarianMin", () => {
  it("solves a case where greedy fails", () => {
    // Greedy would take (0,0)=1 then be forced into 10+10; optimum is 2+2+2.
    const cost = [
      [1, 2, 10],
      [2, 10, 10],
      [10, 2, 2],
    ];
    const assign = hungarianMin(cost);
    const total = assign.reduce((s, j, i) => s + cost[i][j], 0);
    expect(total).toBe(6);
    expect(new Set(assign).size).toBe(3);
  });

  it("handles rectangular matrices (more cols than rows)", () => {
    const cost = [
      [5, 1, 9],
      [9, 9, 1],
    ];
    const assign = hungarianMin(cost);
    expect(assign[0]).toBe(1);
    expect(assign[1]).toBe(2);
  });
});

describe("solveLineup", () => {
  it("finds the assignment maximizing total rating", () => {
    // Ace is great everywhere but can only take one spot; the solver puts
    // Ace where the *marginal* gain is highest, not just their best cell.
    const pool = [
      candidate("ace", { P: 10, C: 9, "1B": 9, "2B": 9, SS: 9, "3B": 9, LF: 9, CF: 9, RF: 9 }),
      candidate("pitcher2", { P: 9 }),
      ...POSITIONS.filter((p) => p !== "P").map((pos, i) =>
        candidate(`p${i}`, { [pos]: 5 } as Partial<Record<Position, number>>),
      ),
    ];
    const { assignments, total, warnings } = solveLineup(pool);
    expect(warnings).toEqual([]);
    // Ace should NOT pitch (pitcher2 covers P at 9; ace adds more elsewhere).
    expect(assignments.P?.playerId).toBe("pitcher2");
    expect(
      Object.values(assignments).some((a) => a?.playerId === "ace"),
    ).toBe(true);
    // 9 (pitcher2) + 9 (ace somewhere) + 7 specialists x5 = 53
    expect(total).toBe(53);
  });

  it("honors pins and re-optimizes around them", () => {
    const pool = [
      candidate("a", { P: 9, C: 2 }),
      candidate("b", { P: 8, C: 8 }),
    ];
    const free = solveLineup(pool);
    expect(free.assignments.P?.playerId).toBe("a");
    expect(free.assignments.C?.playerId).toBe("b");

    const pinned = solveLineup(pool, { P: "b" });
    expect(pinned.assignments.P?.playerId).toBe("b");
    expect(pinned.assignments.P?.pinned).toBe(true);
    expect(pinned.assignments.C?.playerId).toBe("a");
  });

  it("reports short-handed lineups", () => {
    const pool = [candidate("a", { P: 5 }), candidate("b", { C: 5 })];
    const { assignments, warnings } = solveLineup(pool);
    const filled = Object.values(assignments).filter(Boolean);
    expect(filled).toHaveLength(2);
    expect(warnings.some((w) => w.includes("Short-handed"))).toBe(true);
  });

  it("warns when a pinned player is not available", () => {
    const pool = [candidate("a", { P: 5 })];
    const { warnings, assignments } = solveLineup(pool, { C: "ghost" });
    expect(assignments.C).toBeNull();
    expect(warnings.some((w) => w.includes("not in the available pool"))).toBe(true);
  });

  it("defaults unrated positions to 1 and still fills the field", () => {
    const pool = Array.from({ length: 9 }, (_, i) => candidate(`x${i}`, {}));
    const { assignments, total } = solveLineup(pool);
    expect(Object.values(assignments).every(Boolean)).toBe(true);
    expect(total).toBe(9);
  });

  it("with weights, keeps the star out of a never spot even when ability says otherwise", () => {
    // On raw ability the total is maximized with the star in LF (10 + 8 = 18
    // beats 9 + 4 = 13). The depth chart says LF is a never for the star —
    // the weighted solve sends them to SS instead.
    const pool = [
      candidate("star", { SS: 9, LF: 10 }),
      candidate("kid", { SS: 8, LF: 4 }),
    ];
    const ability = solveLineup(pool);
    expect(ability.assignments.LF?.playerId).toBe("star");

    const weights = {
      star: { SS: 9, LF: 0 }, // never in left
      kid: { SS: 8, LF: 4 },
    };
    const roled = solveLineup(pool, {}, weights);
    expect(roled.assignments.SS?.playerId).toBe("star");
    expect(roled.assignments.LF?.playerId).toBe("kid");
    // Reported ratings stay raw ability.
    expect(roled.assignments.SS?.rating).toBe(9);
  });

  it("with weights, prefers an open slot over a blocked fill", () => {
    // Both players are blocked at C (weight 0): the solver leaves C open
    // rather than forcing one of them behind the plate.
    const pool = [
      candidate("a", { C: 9, P: 5 }),
      candidate("b", { C: 8, "1B": 5 }),
    ];
    const weights = {
      a: { C: 0, P: 5 },
      b: { C: 0, "1B": 5 },
    };
    const { assignments } = solveLineup(pool, {}, weights);
    expect(assignments.C).toBeNull();
    expect(assignments.P?.playerId).toBe("a");
    expect(assignments["1B"]?.playerId).toBe("b");
  });
});
