import { describe, expect, it } from "vitest";
import { POSITIONS } from "@/db/schema";
import { practiceScore, suggestStations, type PracticeInputs } from "@/lib/practice";

function inputs(over: Partial<PracticeInputs> = {}): PracticeInputs {
  return {
    players: [],
    ratings: {},
    roles: {},
    aspiring: {},
    playedPositions: {},
    ...over,
  };
}

describe("practiceScore", () => {
  it("stacks the three signals with readable reasons", () => {
    const pick = practiceScore("kid", "C", inputs({
      players: [{ playerId: "kid", name: "Kid" }],
      ratings: { kid: { C: 4 } },
      roles: { kid: { C: "develop" } },
      aspiring: { kid: ["C"] },
      playedPositions: { kid: ["C"] },
    }));
    expect(pick?.reasons).toEqual(["develop spot", "★ wants it", "plays here"]);
    expect(pick?.score).toBeCloseTo(3 + 2 + 2 + 0.4);
  });

  it("flags a primary spot with lagging skill as needs work", () => {
    const low = practiceScore("kid", "SS", inputs({
      ratings: { kid: { SS: 4 } },
      roles: { kid: { SS: "primary" } },
    }));
    expect(low?.reasons).toContain("needs work");
    // At or above the bar the primary is just fine — no chip.
    const fine = practiceScore("kid", "SS", inputs({
      ratings: { kid: { SS: 8 } },
      roles: { kid: { SS: "primary" } },
    }));
    expect(fine?.reasons).toEqual([]);
  });

  it("returns null where the staff said never", () => {
    const pick = practiceScore("kid", "LF", inputs({
      roles: { kid: { LF: "never" } },
    }));
    expect(pick).toBeNull();
  });
});

describe("suggestStations", () => {
  const eleven = Array.from({ length: 11 }, (_, i) => ({
    playerId: `p${i}`,
    name: `P${i}`,
  }));

  it("covers all nine stations and doubles the extras", () => {
    const plan = suggestStations(inputs({ players: eleven }));
    const total = POSITIONS.reduce((s, pos) => s + plan.stations[pos].length, 0);
    expect(total).toBe(11); // everyone stands somewhere
    for (const pos of POSITIONS) {
      expect(plan.stations[pos].length).toBeGreaterThanOrEqual(1);
    }
  });

  it("sends the develop-spot kid to that station", () => {
    const plan = suggestStations(inputs({
      players: eleven,
      roles: { p3: { C: "develop" } },
      ratings: { p3: { C: 5 } },
    }));
    expect(plan.stations.C.some((s) => s.playerId === "p3")).toBe(true);
    expect(plan.stations.C.find((s) => s.playerId === "p3")?.reasons).toContain(
      "develop spot",
    );
  });

  it("leaves stations open rather than stationing a never", () => {
    // Two kids, both never at C: C stays empty, both stand elsewhere.
    const two = [
      { playerId: "a", name: "A" },
      { playerId: "b", name: "B" },
    ];
    const plan = suggestStations(inputs({
      players: two,
      roles: { a: { C: "never" }, b: { C: "never" } },
    }));
    expect(plan.stations.C).toHaveLength(0);
    const total = POSITIONS.reduce((s, pos) => s + plan.stations[pos].length, 0);
    expect(total).toBe(2);
  });

  it("offers non-assigned alternatives per station", () => {
    const plan = suggestStations(inputs({
      players: eleven,
      aspiring: { p9: ["C"], p10: ["C"] },
    }));
    const here = new Set(plan.stations.C.map((s) => s.playerId));
    for (const alt of plan.alternatives.C) {
      expect(here.has(alt.playerId)).toBe(false);
    }
    expect(plan.alternatives.C.length).toBeLessThanOrEqual(2);
  });
});
