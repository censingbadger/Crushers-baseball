import { describe, expect, it } from "vitest";
import type { BarsCell, BarsKey } from "./bars";
import { drillsFor, playerGaps, type HomeworkDrill } from "./homework";

const cell = (median: number, flagged = false): BarsCell => ({
  median,
  raters: 1,
  spread: 0,
  flagged,
  direction: null,
  latestDay: "2026-07-01",
});

const cells = (entries: [BarsKey, BarsCell][]) => new Map<BarsKey, BarsCell>(entries);

describe("playerGaps", () => {
  it("returns every observed dimension below the 11U standard, worst first", () => {
    const gaps = playerGaps(
      cells([
        ["d1", cell(4)],
        ["d3", cell(2.5)],
        ["d8", cell(2)],
        ["d6", cell(1)],
      ]),
    );
    expect(gaps.map((g) => g.dimension)).toEqual(["d6", "d8", "d3"]);
    expect(gaps.every((g) => g.kind === "below")).toBe(true);
  });

  it("includes the self-regulation cluster (focus, attitude) like any skill", () => {
    const gaps = playerGaps(cells([["d8", cell(2)]]));
    expect(gaps[0].dimension).toBe("d8");
    // The target is the next level's anchor — the work in front of us.
    expect(gaps[0].target).toContain("pre-pitch preparation");
  });

  it("rounds out to two with level-up picks when below-standard gaps are scarce", () => {
    const gaps = playerGaps(
      cells([
        ["d1", cell(4)],
        ["d2", cell(3)],
        ["d5", cell(2)],
      ]),
    );
    expect(gaps.map((g) => [g.dimension, g.kind])).toEqual([
      ["d5", "below"],
      ["d2", "level-up"],
    ]);
  });

  it("suggests level-ups even for a player at standard everywhere", () => {
    const gaps = playerGaps(
      cells([
        ["d1", cell(3)],
        ["d4", cell(4)],
      ]),
    );
    expect(gaps.map((g) => g.kind)).toEqual(["level-up", "level-up"]);
    expect(gaps[0].dimension).toBe("d1");
  });

  it("targets the next level, capped at 5, and handles half medians", () => {
    const gaps = playerGaps(cells([["d1", cell(2.5)], ["d2", cell(1)]]));
    const d1 = gaps.find((g) => g.dimension === "d1")!;
    expect(d1.target).toContain("Takes obvious balls"); // level 3 anchor
    const top = playerGaps(cells([["d1", cell(5)]]));
    expect(top[0].target).toContain("Takes a plan to the plate"); // stays at 5
  });

  it("counts role modules only for players who fill the role", () => {
    const withPitching = cells([["pitching", cell(2)], ["d1", cell(3)]]);
    expect(
      playerGaps(withPitching, { pitcher: false, catcher: false }).map((g) => g.dimension),
    ).not.toContain("pitching");
    expect(
      playerGaps(withPitching, { pitcher: true, catcher: false })[0].dimension,
    ).toBe("pitching");
  });

  it("never invents gaps for unrated players or unobserved dimensions", () => {
    expect(playerGaps(undefined)).toEqual([]);
    expect(playerGaps(cells([]))).toEqual([]);
  });

  it("carries the rater-split flag through", () => {
    const gaps = playerGaps(cells([["d6", cell(2, true)]]));
    expect(gaps[0].flagged).toBe(true);
  });
});

describe("drillsFor", () => {
  const catalog: HomeworkDrill[] = [
    {
      key: "a",
      title: "A",
      dimension: "d3",
      minutes: 8,
      equipment: "",
      partner: false,
      cue: "",
      fixes: "",
      steps: [],
      reps: "",
      source: { name: "s", url: "u" },
    },
    {
      key: "b",
      title: "B",
      dimension: "d2",
      also: ["d3"],
      minutes: 8,
      equipment: "",
      partner: false,
      cue: "",
      fixes: "",
      steps: [],
      reps: "",
      source: { name: "s", url: "u" },
    },
    {
      key: "c",
      title: "C",
      dimension: "d1",
      minutes: 8,
      equipment: "",
      partner: false,
      cue: "",
      fixes: "",
      steps: [],
      reps: "",
      source: { name: "s", url: "u" },
    },
  ];

  it("puts primary-dimension drills before secondary matches", () => {
    expect(drillsFor("d3", catalog).map((d) => d.key)).toEqual(["a", "b"]);
  });

  it("respects the limit", () => {
    expect(drillsFor("d3", catalog, 1).map((d) => d.key)).toEqual(["a"]);
  });
});
