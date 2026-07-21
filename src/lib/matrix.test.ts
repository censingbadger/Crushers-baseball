import { describe, expect, it } from "vitest";
import {
  blendedLookup,
  dedupeCurrentRatings,
  raterIdentity,
  type CurrentRating,
} from "@/lib/matrix";

const at = (n: number) => new Date(2026, 6, n);
const r = (over: Partial<CurrentRating>): CurrentRating => ({
  playerId: "a",
  position: "SS",
  rater: "MC",
  rating: 5,
  createdAt: at(1),
  createdByUserId: null,
  ...over,
});

describe("raterIdentity", () => {
  it("separates same-initials coaches by user", () => {
    expect(raterIdentity({ rater: "MC", createdByUserId: "u1" })).not.toBe(
      raterIdentity({ rater: "MC", createdByUserId: "u2" }),
    );
  });
  it("keeps one coach's different typed labels distinct", () => {
    expect(raterIdentity({ rater: "AB", createdByUserId: "u1" })).not.toBe(
      raterIdentity({ rater: "CD", createdByUserId: "u1" }),
    );
  });
  it("collapses null-user rows by label (seed/import)", () => {
    expect(raterIdentity({ rater: "AB", createdByUserId: null })).toBe(
      raterIdentity({ rater: "AB", createdByUserId: null }),
    );
  });
});

describe("dedupeCurrentRatings", () => {
  it("keeps two same-initials coaches instead of superseding (data loss fix)", () => {
    // Newest-first, as getCurrentRatings orders them.
    const rows = [
      r({ rater: "MC", createdByUserId: "u-maria", rating: 8, createdAt: at(3) }),
      r({ rater: "MC", createdByUserId: "u-mike", rating: 4, createdAt: at(2) }),
    ];
    const current = dedupeCurrentRatings(rows);
    expect(current).toHaveLength(2);
    // Both survive and both feed the blend.
    expect(blendedLookup(current).get("a")!.get("SS")).toBe(6); // mean(8,4)
  });

  it("keeps only the latest per (player, position, coach)", () => {
    const rows = [
      r({ createdByUserId: "u-mike", rating: 9, createdAt: at(5) }),
      r({ createdByUserId: "u-mike", rating: 3, createdAt: at(1) }),
    ];
    const current = dedupeCurrentRatings(rows);
    expect(current).toHaveLength(1);
    expect(current[0].rating).toBe(9);
  });

  it("preserves the manual matrix — one coach, several rater columns", () => {
    const rows = [
      r({ rater: "AB", createdByUserId: "u-mike", rating: 7, createdAt: at(2) }),
      r({ rater: "CD", createdByUserId: "u-mike", rating: 5, createdAt: at(2) }),
    ];
    expect(dedupeCurrentRatings(rows)).toHaveLength(2);
  });

  it("separates positions and players", () => {
    const rows = [
      r({ position: "SS", createdByUserId: "u1", rating: 6 }),
      r({ position: "2B", createdByUserId: "u1", rating: 4 }),
      r({ playerId: "b", position: "SS", createdByUserId: "u1", rating: 3 }),
    ];
    expect(dedupeCurrentRatings(rows)).toHaveLength(3);
  });
});
