import { describe, expect, it } from "vitest";
import {
  BARS_BY_KEY,
  BARS_DIMENSIONS,
  barsSummary,
  median,
  NOT_OBSERVED,
  youngestQuartile,
  type BarsRow,
} from "@/lib/bars";

const at = (n: number) => new Date(2026, 6, n);
const row = (over: Partial<BarsRow>): BarsRow => ({
  playerId: "a",
  dimension: "d1",
  rater: "MC",
  level: 3,
  day: "2026-07-01",
  createdAt: at(1),
  ...over,
});

describe("the instrument", () => {
  it("defines all eleven dimensions with five complete anchors each", () => {
    expect(BARS_DIMENSIONS).toHaveLength(11);
    for (const d of BARS_DIMENSIONS) {
      for (const lvl of [1, 2, 3, 4, 5] as const) {
        expect(d.anchors[lvl].length).toBeGreaterThan(20);
      }
    }
    expect(BARS_BY_KEY.d6.guardrail).toBeTruthy();
    expect(BARS_BY_KEY.d8.guardrail).toBeTruthy();
  });
});

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([3])).toBe(3);
    expect(median([2, 4])).toBe(3);
    expect(median([1, 3, 5])).toBe(3);
  });
});

describe("barsSummary", () => {
  it("takes each rater's latest observed level and medians across raters", () => {
    const rows = [
      row({ rater: "MC", level: 2, createdAt: at(1) }),
      row({ rater: "MC", level: 4, createdAt: at(5), day: "2026-07-05" }),
      row({ rater: "MB", level: 3, createdAt: at(4), day: "2026-07-04" }),
    ];
    const cell = barsSummary(rows).get("a")!.get("d1")!;
    expect(cell.median).toBe(3.5); // median(4, 3)
    expect(cell.raters).toBe(2);
    expect(cell.latestDay).toBe("2026-07-05");
  });

  it("never counts not-observed as data", () => {
    const rows = [
      row({ rater: "MC", level: NOT_OBSERVED }),
      row({ rater: "MB", level: 4, createdAt: at(2) }),
    ];
    const cell = barsSummary(rows).get("a")!.get("d1")!;
    expect(cell.median).toBe(4);
    expect(cell.raters).toBe(1);
  });

  it("flags a two-level split instead of averaging it away", () => {
    const rows = [
      row({ rater: "MC", level: 2 }),
      row({ rater: "MB", level: 4, createdAt: at(2) }),
    ];
    const cell = barsSummary(rows).get("a")!.get("d1")!;
    expect(cell.flagged).toBe(true);
    expect(cell.spread).toBe(2);
  });

  it("reports direction from each rater's previous level", () => {
    const rows = [
      row({ rater: "MC", level: 3, createdAt: at(1) }),
      row({ rater: "MC", level: 4, createdAt: at(9), day: "2026-07-09" }),
    ];
    expect(barsSummary(rows).get("a")!.get("d1")!.direction).toBe("up");
  });

  it("keeps two coaches who share initials distinct (no supersede)", () => {
    // Mike Christian and Maria Cruz both file under "MC" — different users.
    const rows = [
      row({ rater: "MC", createdByUserId: "u-mike", level: 2, createdAt: at(1) }),
      row({ rater: "MC", createdByUserId: "u-maria", level: 4, createdAt: at(2) }),
    ];
    const cell = barsSummary(rows).get("a")!.get("d1")!;
    expect(cell.raters).toBe(2); // two distinct observers, not one
    expect(cell.median).toBe(3); // median(2, 4)
    expect(cell.flagged).toBe(true); // their disagreement is surfaced
  });

  it("still collapses one coach's repeated ratings (same user)", () => {
    const rows = [
      row({ rater: "MC", createdByUserId: "u-mike", level: 2, createdAt: at(1) }),
      row({ rater: "MC", createdByUserId: "u-mike", level: 5, createdAt: at(3) }),
    ];
    const cell = barsSummary(rows).get("a")!.get("d1")!;
    expect(cell.raters).toBe(1);
    expect(cell.median).toBe(5); // latest wins
  });
});

describe("youngestQuartile", () => {
  it("flags the youngest quarter of a dated roster", () => {
    const players = Array.from({ length: 8 }, (_, i) => ({
      playerId: `p${i}`,
      birthdate: `2015-0${i + 1}-01`, // p7 latest birthdate = youngest
    }));
    const set = youngestQuartile(players);
    expect(set.size).toBe(2);
    expect(set.has("p7")).toBe(true);
    expect(set.has("p6")).toBe(true);
  });

  it("stays empty on tiny or undated rosters", () => {
    expect(youngestQuartile([{ playerId: "a", birthdate: null }]).size).toBe(0);
  });
});
