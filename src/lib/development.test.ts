import { describe, expect, it } from "vitest";
import { dimensionTrend, initialsOf } from "./development";

describe("initialsOf", () => {
  it("takes first letters of words", () => {
    expect(initialsOf("Mike Christian")).toBe("MC");
    expect(initialsOf("Coach Demo")).toBe("CD");
  });
  it("handles single names and empties", () => {
    expect(initialsOf("Coach")).toBe("CO");
    expect(initialsOf("  ")).toBe("??");
  });
});

describe("dimensionTrend", () => {
  const at = (d: number) => new Date(2026, 0, d);

  it("returns nulls with no data", () => {
    expect(dimensionTrend([])).toEqual({ latest: null, direction: null, points: [] });
  });

  it("sorts by date and compares the two latest", () => {
    const t = dimensionTrend([
      { rating: 4, createdAt: at(10) },
      { rating: 2, createdAt: at(1) },
      { rating: 3, createdAt: at(5) },
    ]);
    expect(t.points).toEqual([2, 3, 4]);
    expect(t.latest).toBe(4);
    expect(t.direction).toBe("up");
  });

  it("reports down and flat", () => {
    expect(
      dimensionTrend([
        { rating: 5, createdAt: at(1) },
        { rating: 3, createdAt: at(2) },
      ]).direction,
    ).toBe("down");
    expect(
      dimensionTrend([
        { rating: 3, createdAt: at(1) },
        { rating: 3, createdAt: at(2) },
      ]).direction,
    ).toBe("flat");
  });

  it("caps the point list", () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      rating: i + 1,
      createdAt: at(i + 1),
    }));
    expect(dimensionTrend(rows, 4).points).toEqual([7, 8, 9, 10]);
  });
});
