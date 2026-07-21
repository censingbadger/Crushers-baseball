import { describe, expect, it } from "vitest";
import type { BarsCell, BarsKey } from "./bars";
import {
  drillsFor,
  playerGaps,
  searchCatalog,
  suggestForPlayer,
  teamGaps,
  type HomeworkDrill,
} from "./homework";

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

const drill = (
  key: string,
  dimension: BarsKey,
  extra: Partial<HomeworkDrill> = {},
): HomeworkDrill => ({
  key,
  title: key,
  dimension,
  minutes: 8,
  equipment: "glove",
  partner: false,
  cue: "cue",
  fixes: "fixes",
  steps: ["step"],
  reps: "3x",
  source: { name: "s", url: "u" },
  ...extra,
});

describe("position-aware ordering", () => {
  const catalog = [
    drill("infield", "d3", { positions: ["SS", "2B"] }),
    drill("universal", "d3"),
    drill("outfield", "d3", { positions: ["LF", "CF", "RF"] }),
  ];

  it("floats matching-position drills ahead of universal, mismatches last", () => {
    expect(drillsFor("d3", catalog, 3, ["CF"]).map((d) => d.key)).toEqual([
      "outfield",
      "universal",
      "infield",
    ]);
  });

  it("keeps catalog order when the player's positions are unknown", () => {
    expect(drillsFor("d3", catalog, 3, []).map((d) => d.key)).toEqual([
      "infield",
      "universal",
      "outfield",
    ]);
  });
});

describe("suggestForPlayer", () => {
  const catalog = [
    drill("field-a", "d3"),
    drill("field-b", "d3"),
    drill("focus-a", "d8"),
  ];
  const cellsOf = (entries: [BarsKey, number][]) =>
    new Map<BarsKey, BarsCell>(entries.map(([k, m]) => [k, cell(m)]));
  const noRoles = { pitcher: false, catcher: false };

  it("pairs each top gap with its best unassigned drill", () => {
    const s = suggestForPlayer(
      cellsOf([
        ["d3", 2],
        ["d8", 1],
      ]),
      noRoles,
      [],
      new Set(),
      catalog,
    );
    expect(s.map((x) => [x.gap.dimension, x.drill.key])).toEqual([
      ["d8", "focus-a"],
      ["d3", "field-a"],
    ]);
  });

  it("skips drills already assigned and never doubles up", () => {
    const s = suggestForPlayer(
      cellsOf([["d3", 2]]),
      noRoles,
      [],
      new Set(["field-a"]),
      catalog,
    );
    expect(s.map((x) => x.drill.key)).toEqual(["field-b"]);
  });

  it("suggests nothing for unrated players", () => {
    expect(suggestForPlayer(undefined, noRoles, [], new Set(), catalog)).toEqual([]);
  });
});

describe("teamGaps", () => {
  const summaries = new Map<string, Map<BarsKey, BarsCell>>([
    ["p1", new Map([["d2", cell(2)], ["d8", cell(2)]])],
    ["p2", new Map([["d2", cell(1)], ["d8", cell(4)]])],
    ["p3", new Map([["d2", cell(2)], ["d1", cell(2)]])],
  ]);

  it("counts players below standard per dimension, biggest first", () => {
    const gaps = teamGaps(summaries);
    expect(gaps[0]).toMatchObject({ dimension: "d2", below: 3, rated: 3 });
  });

  it("needs at least two kids below — one kid is his own homework", () => {
    expect(teamGaps(summaries).map((g) => g.dimension)).not.toContain("d8");
    expect(teamGaps(summaries).map((g) => g.dimension)).not.toContain("d1");
  });
});

describe("searchCatalog", () => {
  const catalog = [
    drill("wall", "d3", { title: "Wall ball", fixes: "glove work off a wall" }),
    drill("tee", "d1", { title: "Tee work", cue: "drive it up the middle" }),
    drill("breath", "d8", { title: "Reset breath", steps: ["breathe out slowly"] }),
  ];

  it("matches by title, dimension label, cue, and steps", () => {
    expect(searchCatalog("wall", catalog).map((d) => d.key)).toEqual(["wall"]);
    expect(searchCatalog("focus", catalog).map((d) => d.key)).toEqual(["breath"]);
    expect(searchCatalog("middle", catalog).map((d) => d.key)).toEqual(["tee"]);
  });

  it("requires every token and ignores case", () => {
    expect(searchCatalog("WALL glove", catalog).map((d) => d.key)).toEqual(["wall"]);
    expect(searchCatalog("wall middle", catalog)).toEqual([]);
    expect(searchCatalog("   ", catalog)).toEqual([]);
  });
});
