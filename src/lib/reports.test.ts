import { describe, expect, it } from "vitest";
import {
  buildReportPrompt,
  monthLabel,
  templateDraft,
  type ReportContext,
} from "./reports";

const ctx: ReportContext = {
  firstName: "Milo",
  monthLabel: "July 2026",
  seasonName: "Crushers Blue 2026 Summer",
  seasonGoals: "Make the summer all-star team",
  desiredPositions: "SS, P",
  topPositions: [
    { position: "SS", rating: 8.5 },
    { position: "2B", rating: 8 },
  ],
  barsLines: [
    {
      code: "D1",
      label: "Hitting",
      level: 4,
      anchorNow: "Works counts.",
      nextTarget: "Takes a plan to the plate and executes it.",
    },
    {
      code: "D3",
      label: "Fielding",
      level: 3,
      anchorNow: "Consistent ready position and pre-pitch move.",
      nextTarget: "Range past three steps.",
    },
  ],
  sharedCues: [
    {
      category: "pitching",
      tendency: "Rushes the windup with runners on",
      cue: "Breathe, balance point, then go",
    },
    {
      category: "fielding",
      tendency: "Drops glove on backhand",
      cue: "Quick glove to the dirt",
    },
  ],
  battingLine: "12-for-30 (.400 AVG, .950 OPS), 10 runs, 8 RBI, 5 walks",
  pitchingLine: "10.2 innings pitched, 14 strikeouts, 2.53 ERA",
  fieldingLine: "24 chances, 2 errors (.917 fielding pct)",
  catchingLine: null,
  playingTimeLine: "6 games, 28 innings in the field (mostly SS, 2B)",
};

describe("monthLabel", () => {
  it("formats ISO months", () => {
    expect(monthLabel("2026-07")).toBe("July 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
    expect(monthLabel("2026-12")).toBe("December 2026");
  });

  it("passes through unparseable input", () => {
    expect(monthLabel("garbage")).toBe("garbage");
  });
});

describe("templateDraft", () => {
  const letter = templateDraft(ctx);

  it("follows the staff letter structure", () => {
    expect(letter).toContain("Dear Milo's family,");
    expect(letter).toContain(
      "Major areas that we intend to focus on during the summer include:",
    );
    expect(letter).toContain("Pitching focus:");
    expect(letter).toMatch(/With gratitude,\nThe Crushers Coaching Staff$/);
    // Sections arrive in order.
    expect(letter.indexOf("Major areas")).toBeLessThan(
      letter.indexOf("Pitching focus:"),
    );
    expect(letter.indexOf("Pitching focus:")).toBeLessThan(
      letter.indexOf("two-way conversation"),
    );
  });

  it("uses the data it was given", () => {
    expect(letter).toContain("Breathe, balance point, then go");
    expect(letter).toContain(".400 AVG");
    expect(letter).toContain("SS");
    expect(letter).toContain("Make the summer all-star team");
    // The next-level anchor is the named focus, and the scale explanation ships.
    expect(letter).toContain("Range past three steps.");
    expect(letter).toContain("How to read our development levels:");
    expect(letter).toContain("a team full of 3s is a successful 11U team");
  });

  it("omits the pitching section without pitching cues", () => {
    const noPitch = templateDraft({ ...ctx, sharedCues: [], pitchingLine: null });
    expect(noPitch).not.toContain("Pitching focus:");
    expect(noPitch).toContain("With gratitude,");
  });

  it("survives an empty context", () => {
    const bare = templateDraft({
      firstName: "Sky",
      monthLabel: "August 2026",
      seasonName: "Crushers Blue 2026 Summer",
      seasonGoals: null,
      desiredPositions: null,
      topPositions: [],
      barsLines: [],
      sharedCues: [],
      battingLine: null,
      pitchingLine: null,
      fieldingLine: null,
      catchingLine: null,
      playingTimeLine: null,
    });
    expect(bare).toContain("Dear Sky's family,");
    expect(bare).toContain("Major areas");
    expect(bare).toMatch(/With gratitude,\nThe Crushers Coaching Staff$/);
  });
});

describe("buildReportPrompt", () => {
  const { system, user } = buildReportPrompt(ctx);

  it("encodes the letter structure and guardrails", () => {
    expect(system).toContain("Major areas that we intend to");
    expect(system).toContain("With gratitude,");
    expect(system).toContain("never rank");
    expect(system).toContain("How to read our development");
    expect(system).toContain("11-year-old");
  });

  it("carries only family-shareable data", () => {
    expect(user).toContain("Milo");
    expect(user).toContain("July 2026");
    expect(user).toContain("Rushes the windup");
    expect(user).toContain(".400 AVG");
  });

  it("has no fields for contacts, medical, or last names", () => {
    // The compile-time shape is the real guard; this documents it at runtime.
    const keys = Object.keys(ctx);
    for (const banned of [
      "lastName",
      "email",
      "phone",
      "emergencyContact",
      "medicalNotes",
      "guardians",
    ]) {
      expect(keys).not.toContain(banned);
    }
  });
});
