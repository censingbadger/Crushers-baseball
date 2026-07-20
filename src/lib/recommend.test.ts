import { describe, expect, it } from "vitest";
import { auditLineup, gapFillOptions, positionDepth } from "./recommend";
import { BENCH } from "./gameday";

// A tiny world: a1..a9 fielded, b1/b2 on the bench.
const FIELD: Record<string, string> = {
  a1: "P", a2: "C", a3: "1B", a4: "2B", a5: "SS", a6: "3B", a7: "LF", a8: "CF", a9: "RF",
  b1: BENCH, b2: BENCH,
};

describe("gapFillOptions", () => {
  it("prefers the simplest fill: a strong bench player, one move", () => {
    const current = { ...FIELD, a8: BENCH }; // CF empty (a8 benched)
    const ratings = { a8: { CF: 9 }, b1: { CF: 8 }, b2: { CF: 3 } };
    const [best] = gapFillOptions("CF", current, ratings);
    expect(best.kind).toBe("bench");
    // a8 just came out but is on the bench now — highest CF rating wins.
    expect(best.primaryId).toBe("a8");
    expect(best.moves).toEqual([{ playerId: "a8", target: "CF" }]);
  });

  it("offers a two-move shift when it clearly beats every bench fill", () => {
    const current = { ...FIELD, a8: BENCH };
    delete (current as Record<string, string>).a8;
    // Bench players are weak in CF, but the RF (a9) rates 9 there and b1
    // covers RF at 8 — the shift's weakest link (8) beats bench CF (3).
    const ratings = {
      b1: { CF: 3, RF: 8 },
      b2: { CF: 2 },
      a9: { CF: 9, RF: 6 },
    };
    const [best] = gapFillOptions("CF", { ...current, b1: BENCH, b2: BENCH }, ratings);
    expect(best.kind).toBe("shift");
    expect(best.moves).toEqual([
      { playerId: "a9", target: "CF" },
      { playerId: "b1", target: "RF" },
    ]);
    expect(best.minRating).toBe(8);
  });

  it("treats unrated players as rating 1, never above", () => {
    const current = { ...FIELD, a8: BENCH };
    const [best] = gapFillOptions("CF", current, {});
    expect(best.minRating).toBe(1);
  });
});

describe("positionDepth", () => {
  it("pins the holder first, then ranks everyone by rating there", () => {
    const ratings = { a2: { C: 5 }, b1: { C: 8 }, a3: { C: 7 } };
    const depth = positionDepth("C", FIELD, ratings);
    expect(depth[0]).toMatchObject({ playerId: "a2", holder: true });
    expect(depth[1]).toMatchObject({ playerId: "b1", where: BENCH, rating: 8 });
    expect(depth[2]).toMatchObject({ playerId: "a3", where: "1B", rating: 7 });
  });

  it("flags and slightly favors aspiring players at equal rating", () => {
    const ratings = { b1: { C: 6 }, b2: { C: 6 } };
    const depth = positionDepth("C", FIELD, ratings, { b2: ["C", "SS"] });
    const b2 = depth.find((d) => d.playerId === "b2");
    const b1 = depth.find((d) => d.playerId === "b1");
    expect(b2?.aspiring).toBe(true);
    expect(depth.indexOf(b2!)).toBeLessThan(depth.indexOf(b1!));
  });
});

describe("auditLineup", () => {
  it("puts holes above everything and proposes the best fill", () => {
    const current = { ...FIELD };
    delete (current as Record<string, string>).a8; // CF empty, a8 gone
    const ratings = { b1: { CF: 7 } };
    const [first] = auditLineup(current, ratings);
    expect(first.kind).toBe("gap");
    expect(first.slot).toBe("CF");
    expect(first.moves).toEqual([{ playerId: "b1", target: "CF" }]);
  });

  it("suggests subbing a clearly better bench player for a weak fit", () => {
    const ratings = { a2: { C: 2 }, b1: { C: 6 } };
    const upgrades = auditLineup(FIELD, ratings).filter((s) => s.kind === "upgrade");
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].moves).toEqual([{ playerId: "b1", target: "C" }]);
    expect(upgrades[0].gain).toBe(4);
  });

  it("finds a swap that raises the weaker of two fielded ratings", () => {
    // a7 (LF) is the natural CF and a8 (CF) the natural LF.
    const ratings = {
      a7: { LF: 3, CF: 8 },
      a8: { CF: 3, LF: 8 },
    };
    const swaps = auditLineup(FIELD, ratings).filter((s) => s.kind === "swap");
    expect(swaps.length).toBeGreaterThan(0);
    const ids = [swaps[0].detail.aId, swaps[0].detail.bId].sort();
    expect(ids).toEqual(["a7", "a8"]);
  });

  it("notes long-benched players and stays quiet otherwise", () => {
    const rest = auditLineup(FIELD, {}, { b1: 3 }).filter((s) => s.kind === "rest");
    expect(rest).toHaveLength(1);
    expect(rest[0].detail.aId).toBe("b1");
    expect(rest[0].moves).toHaveLength(0);

    const clean = auditLineup(FIELD, {}, {});
    expect(clean.filter((s) => s.kind !== "rest")).toHaveLength(0);
  });
});

describe("role weights (depth chart)", () => {
  it("never suggests a blocked player into a gap, whatever their ability", () => {
    const current = { ...FIELD, a8: BENCH }; // CF empty
    const ratings = { a8: { CF: 9 }, b1: { CF: 5 } };
    // a8 is a "never" in CF (weight 0); b1 is unmarked.
    const weights = { a8: { CF: 0 }, b1: { CF: 5 } };
    const options = gapFillOptions("CF", current, ratings, weights);
    expect(options.some((o) => o.primaryId === "a8")).toBe(false);
    expect(options[0]?.primaryId).toBe("b1");
    // Displayed numbers stay raw ability.
    expect(options[0]?.primaryRating).toBe(5);
  });

  it("ranks a primary-role kid over a higher-ability unmarked kid", () => {
    const current = { ...FIELD, a8: BENCH };
    const ratings = { a8: { CF: 8 }, b1: { CF: 7 } };
    // Compete multipliers: b1 primary (7 × 1.25 = 8.75) beats a8 blank (8).
    const weights = { a8: { CF: 8 }, b1: { CF: 8.75 } };
    const [best] = gapFillOptions("CF", current, ratings, weights);
    expect(best.primaryId).toBe("b1");
    expect(best.primaryRating).toBe(7);
  });

  it("audit upgrades rank on weights but report raw ratings", () => {
    const ratings = { a2: { C: 4 }, b1: { C: 5 } };
    // Roles make the gap decisive: holder a2 is emergency-only at C
    // (4 × 0.3 = 1.2), bench b1 is the primary (5 × 1.25 = 6.25).
    const weights = { a2: { C: 1.2 }, b1: { C: 6.25 } };
    const upgrades = auditLineup(FIELD, ratings, {}, weights).filter(
      (s) => s.kind === "upgrade",
    );
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].moves).toEqual([{ playerId: "b1", target: "C" }]);
    expect(upgrades[0].detail.aRating).toBe(4);
    expect(upgrades[0].detail.bRating).toBe(5);

    // Without weights the same ratings are quiet (5 < 4 + 2).
    const plain = auditLineup(FIELD, ratings).filter((s) => s.kind === "upgrade");
    expect(plain).toHaveLength(0);
  });

  it("depth entries carry the staff's role for the chip", () => {
    const ratings = { a2: { C: 5 }, b1: { C: 8 } };
    const depth = positionDepth("C", FIELD, ratings, {}, 4, undefined, {
      b1: { C: "never" },
    });
    const b1 = depth.find((d) => d.playerId === "b1");
    expect(b1?.role).toBe("never");
  });
});
