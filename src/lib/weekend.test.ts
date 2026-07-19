import { describe, expect, it } from "vitest";
import type { Position } from "@/db/schema";
import { computeWeekendBalance, type PlanLineInput } from "./weekend";

function line(
  playerId: string,
  posA: Position | null,
  inningsA: number,
  posB: Position | null = null,
  inningsB = 0,
  pitchInnings = 0,
): PlanLineInput {
  return { playerId, posA, inningsA, posB, inningsB, pitchInnings };
}

describe("computeWeekendBalance", () => {
  it("passes a fully balanced 10-player, 4x6 weekend", () => {
    // 10 players x 24 innings = 240 = 9 positions x 24 + 24 bench.
    const lines: PlanLineInput[] = [
      line("p1", "C", 20, "1B", 0, 4), // 24
      line("p2", "3B", 12, "C", 4, 8), // 24
      line("p3", "SS", 20, "3B", 0, 4), // 24
      line("p4", "3B", 12, "1B", 8, 4), // 24
      line("p5", "2B", 16, "SS", 4, 4), // 24
      line("p6", "LF", 16, "CF", 8, 0), // 24
      line("p7", "LF", 8, "RF", 16, 0), // 24
      line("p8", "2B", 8, "RF", 8, 0), // 16 + 8 bench
      line("p9", "1B", 16, "CF", 8, 0), // 24
      line("p10", "CF", 8, null, 0, 0), // 8 + 16 bench
    ];
    const b = computeWeekendBalance(lines, 4, 6);
    expect(b.totalPerPlayer).toBe(24);
    expect(b.positions.filter((p) => !p.ok)).toEqual([]);
    expect(b.benchNeeded).toBe(24);
    expect(b.benchSupplied).toBe(24);
    expect(b.warnings).toEqual([]);
    expect(b.allOk).toBe(true);
  });

  it("flags an over-allocated player", () => {
    const lines = [line("p1", "C", 20, "1B", 4, 4)]; // 28 > 24
    const b = computeWeekendBalance(lines, 4, 6);
    expect(b.players[0].ok).toBe(false);
    expect(b.players[0].bench).toBe(-4);
    expect(b.allOk).toBe(false);
  });

  it("counts pitching toward P coverage and the player total", () => {
    const lines = [line("p1", null, 0, null, 0, 24)];
    const b = computeWeekendBalance(lines, 4, 6);
    const p = b.positions.find((x) => x.position === "P")!;
    expect(p.supplied).toBe(24);
    expect(p.ok).toBe(true);
    expect(b.players[0].bench).toBe(0);
  });

  it("reports under-covered positions", () => {
    const lines = [line("p1", "C", 10)];
    const b = computeWeekendBalance(lines, 4, 6);
    const c = b.positions.find((x) => x.position === "C")!;
    expect(c.supplied).toBe(10);
    expect(c.ok).toBe(false);
    expect(b.allOk).toBe(false);
  });

  it("warns when P is used as a field slot", () => {
    const lines = [line("p1", "P", 10)];
    const b = computeWeekendBalance(lines, 4, 6);
    expect(b.warnings.some((w) => w.includes("Pitch column"))).toBe(true);
    expect(b.allOk).toBe(false);
  });
});
