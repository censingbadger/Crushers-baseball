import { describe, expect, it } from "vitest";
import { computeSeasonUsage, countedInnings } from "./usage";
import { BENCH } from "./gameday";

const G1 = { id: "g1", status: "final", currentInning: 6, innings: 6 };
const G2 = { id: "g2", status: "live", currentInning: 3, innings: 6 };

describe("countedInnings", () => {
  it("counts every inning of a final game, completed innings of a live one", () => {
    expect(countedInnings(G1)).toBe(6);
    expect(countedInnings(G2)).toBe(2);
    expect(countedInnings({ id: "g", status: "setup", currentInning: 1, innings: 6 })).toBe(0);
  });
});

describe("computeSeasonUsage", () => {
  const rows = [
    // g1: six innings — four at C, two on the bench.
    ...Array.from({ length: 4 }, (_, i) => ({ gameId: "g1", inning: i + 1, playerId: "a", position: "C" })),
    { gameId: "g1", inning: 5, playerId: "a", position: BENCH },
    { gameId: "g1", inning: 6, playerId: "a", position: BENCH },
    // g2 (live, 2 completed): both at 1B; inning 3 in progress must not count.
    { gameId: "g2", inning: 1, playerId: "a", position: "1B" },
    { gameId: "g2", inning: 2, playerId: "a", position: "1B" },
    { gameId: "g2", inning: 3, playerId: "a", position: "1B" },
    // b only appears in g1, never benched.
    ...Array.from({ length: 6 }, (_, i) => ({ gameId: "g1", inning: i + 1, playerId: "b", position: "SS" })),
  ];

  it("rolls up innings, sit share, and position mix across games", () => {
    const usage = computeSeasonUsage([G1, G2], rows);
    const a = usage.get("a")!;
    expect(a.games).toBe(2);
    expect(a.fieldInnings).toBe(6); // 4 at C + 2 at 1B
    expect(a.benchInnings).toBe(2);
    expect(a.satShare).toBeCloseTo(0.25);
    expect(a.positions).toEqual([
      ["C", 4],
      ["1B", 2],
    ]);
    const b = usage.get("b")!;
    expect(b.games).toBe(1);
    expect(b.benchInnings).toBe(0);
    expect(b.satShare).toBe(0);
  });

  it("omits players with no appearances", () => {
    const usage = computeSeasonUsage([G1], rows);
    expect(usage.has("ghost")).toBe(false);
  });
});
