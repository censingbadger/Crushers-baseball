import { describe, expect, it } from "vitest";
import { computeSeasonUsage, countedInnings } from "./usage";
import { BENCH } from "./gameday";

const TODAY = "2026-07-20";
const G1 = { id: "g1", status: "final", currentInning: 6, innings: 6, gameDate: "2026-07-18" };
const G2 = { id: "g2", status: "live", currentInning: 3, innings: 6, gameDate: TODAY };

describe("countedInnings", () => {
  it("counts every inning of a final game, completed innings of a live one", () => {
    expect(countedInnings(G1, TODAY)).toBe(6);
    expect(countedInnings(G2, TODAY)).toBe(2);
    expect(
      countedInnings(
        { id: "g", status: "setup", currentInning: 1, innings: 6, gameDate: TODAY },
        TODAY,
      ),
    ).toBe(0);
  });

  it("counts the full planned game when the stepper was never used", () => {
    // The dugout doesn't force ceremony: a final game still on inning 1
    // happened — credit the planned innings, not 1.
    expect(
      countedInnings(
        { id: "g", status: "final", currentInning: 1, innings: 6, gameDate: TODAY },
        TODAY,
      ),
    ).toBe(6);
    // Same for a past-date game never marked final.
    expect(
      countedInnings(
        { id: "g", status: "setup", currentInning: 1, innings: 6, gameDate: "2026-07-12" },
        TODAY,
      ),
    ).toBe(6);
  });

  it("trusts the stepper when it was used, even on a final game", () => {
    // Ended early at the time limit: stepper says 4, that's the record.
    expect(
      countedInnings(
        { id: "g", status: "final", currentInning: 4, innings: 6, gameDate: "2026-07-18" },
        TODAY,
      ),
    ).toBe(4);
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
    const usage = computeSeasonUsage([G1, G2], rows, TODAY);
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

  it("counts an untouched-stepper final game in full", () => {
    const g = { id: "g1", status: "final", currentInning: 1, innings: 6, gameDate: "2026-07-19" };
    const usage = computeSeasonUsage([g], rows, TODAY);
    expect(usage.get("b")!.fieldInnings).toBe(6);
  });

  it("omits players with no appearances", () => {
    const usage = computeSeasonUsage([G1], rows, TODAY);
    expect(usage.has("ghost")).toBe(false);
  });
});
