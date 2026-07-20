import { describe, expect, it } from "vitest";
import { auditLineup, gapFillOptions } from "./recommend";
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
