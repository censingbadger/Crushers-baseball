import { describe, expect, it } from "vitest";
import {
  anchorSaturday,
  nextStatus,
  weekendRollup,
  type AvailabilityRow,
} from "./availability";

describe("anchorSaturday", () => {
  it("keeps Saturdays", () => {
    expect(anchorSaturday("2026-08-08")).toBe("2026-08-08"); // Sat
  });
  it("pulls Sundays back to their Saturday", () => {
    expect(anchorSaturday("2026-08-09")).toBe("2026-08-08");
  });
  it("pushes Friday pool-play forward to the same weekend", () => {
    expect(anchorSaturday("2026-08-07")).toBe("2026-08-08");
  });
  it("crosses month boundaries", () => {
    expect(anchorSaturday("2026-08-31")).toBe("2026-09-05"); // Mon → next Sat
  });
});

describe("nextStatus", () => {
  it("cycles unanswered → yes → maybe → no → yes", () => {
    expect(nextStatus(undefined)).toBe("yes");
    expect(nextStatus("unknown")).toBe("yes");
    expect(nextStatus("yes")).toBe("maybe");
    expect(nextStatus("maybe")).toBe("no");
    expect(nextStatus("no")).toBe("yes");
  });
});

describe("weekendRollup", () => {
  const full = new Set(["a", "b", "c"]);
  const rows: AvailabilityRow[] = [
    // Weekend of Aug 8-9 (Fri 7th is pool play).
    { playerId: "a", day: "2026-08-07", status: "no" },
    { playerId: "a", day: "2026-08-08", status: "yes" },
    { playerId: "b", day: "2026-08-08", status: "yes" },
    { playerId: "c", day: "2026-08-08", status: "maybe" },
    { playerId: "a", day: "2026-08-09", status: "yes" },
    { playerId: "b", day: "2026-08-09", status: "yes" },
    { playerId: "c", day: "2026-08-09", status: "yes" },
    // Weekend of Aug 15-16 — everyone in.
    { playerId: "a", day: "2026-08-15", status: "yes" },
    { playerId: "b", day: "2026-08-15", status: "yes" },
    { playerId: "c", day: "2026-08-15", status: "yes" },
    // Practice player answers must not count.
    { playerId: "practice-kid", day: "2026-08-15", status: "no" },
    // Unknown answers count nowhere.
    { playerId: "b", day: "2026-08-16", status: "unknown" },
  ];
  const rollup = weekendRollup(rows, full);

  it("groups Friday into the Sat anchor and keeps days sorted", () => {
    const aug8 = rollup.find((w) => w.anchor === "2026-08-08")!;
    expect(aug8.days.map((d) => d.day)).toEqual([
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("scores by the worst Sat/Sun, ignoring Friday", () => {
    const aug8 = rollup.find((w) => w.anchor === "2026-08-08")!;
    // Sat has 2 yes, Sun has 3 — Friday's 0 yes must not drag it down.
    expect(aug8.minYes).toBe(2);
  });

  it("only counts full-roster players", () => {
    const aug15 = rollup.find((w) => w.anchor === "2026-08-15")!;
    const sat = aug15.days.find((d) => d.day === "2026-08-15")!;
    expect(sat.yes).toBe(3);
    expect(sat.no).toBe(0);
  });

  it("treats an unanswered core day as unplayable until families answer", () => {
    // Aug 16 only has an "unknown" row, so that Sunday scores 0 yes and
    // the whole weekend ranks below Aug 8-9 despite a perfect Saturday.
    const aug15 = rollup.find((w) => w.anchor === "2026-08-15")!;
    expect(aug15.minYes).toBe(0);
    expect(rollup[0].anchor).toBe("2026-08-08");
  });
});
