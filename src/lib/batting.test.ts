import { describe, expect, it } from "vitest";
import { suggestBattingOrder, type BatterInput } from "./batting";
import { EMPTY_BATTING } from "./stats";

const bat = (
  playerId: string,
  over: Partial<typeof EMPTY_BATTING>,
  hittingRating: number | null = null,
): BatterInput => ({
  playerId,
  batting: { ...EMPTY_BATTING, ...over },
  hittingRating,
});

describe("suggestBattingOrder", () => {
  it("assigns the classic roles from stats", () => {
    const { order, reasons } = suggestBattingOrder([
      // onbase: 6/10 with walks and steals — leadoff material.
      bat("onbase", { ab: 10, h: 4, bb: 4, sb: 5, k: 1 }),
      // contact: rarely strikes out.
      bat("contact", { ab: 12, h: 5, k: 0 }),
      // slugger: home-run power.
      bat("slugger", { ab: 12, h: 5, hr: 3, doubles: 2, k: 4 }),
      // allround: best combined line.
      bat("allround", { ab: 12, h: 7, doubles: 3, bb: 3, k: 1 }),
      bat("mid1", { ab: 10, h: 3, k: 3 }),
      bat("mid2", { ab: 10, h: 2, k: 4 }),
    ]);
    expect(order[0]).toBe("onbase");
    expect(reasons.onbase).toContain("leadoff");
    // Best bat third, biggest slug fourth (allround out-hits slugger overall).
    expect(order[2]).toBe("allround");
    expect(order[3]).toBe("slugger");
  });

  it("puts a second leadoff at the bottom of a full order", () => {
    const batters: BatterInput[] = Array.from({ length: 9 }, (_, i) =>
      bat(`p${i}`, { ab: 10, h: 3, k: 2 }),
    );
    // p8 is a speedy on-base type who isn't top-4 overall.
    batters[8] = bat("p8", { ab: 10, h: 3, bb: 5, sb: 6, k: 1 });
    const { order, reasons } = suggestBattingOrder(batters);
    const lastId = order[order.length - 1];
    // The strongest OBP+speed profile went leadoff; the runner-up turns
    // the lineup over from the last spot.
    expect(reasons[order[0]]).toContain("leadoff");
    expect(reasons[lastId]).toContain("second leadoff");
  });

  it("falls back to coach hitting ratings when nobody has stats", () => {
    const { order } = suggestBattingOrder([
      { playerId: "weak", batting: null, hittingRating: 2 },
      { playerId: "ace", batting: null, hittingRating: 5 },
      { playerId: "ok", batting: null, hittingRating: 3 },
    ]);
    // Best rating bats third in a 3-player order; order is stable & sane.
    expect(order).toHaveLength(3);
    expect(order[2]).toBe("ace");
  });

  it("is deterministic for identical inputs", () => {
    const batters = Array.from({ length: 9 }, (_, i) => bat(`p${i}`, { ab: 8, h: 2 }));
    const a = suggestBattingOrder(batters).order.join(",");
    const b = suggestBattingOrder(batters).order.join(",");
    expect(a).toBe(b);
  });

  it("handles empty and single-player groups", () => {
    expect(suggestBattingOrder([]).order).toEqual([]);
    expect(suggestBattingOrder([bat("solo", { ab: 5, h: 2 })]).order).toEqual(["solo"]);
  });
});
