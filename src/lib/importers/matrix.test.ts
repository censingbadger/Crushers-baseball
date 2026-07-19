import { describe, expect, it } from "vitest";
import {
  parseMatrixSheets,
  raterFromSheetName,
  type MatrixSheet,
} from "./matrix";

// Synthetic fixture mirroring the real workbook's shape: one sheet per
// coach, lowercase position headers, "First L" player names. Fictional names.
const ROSTER = [
  { id: "a", firstName: "Milo", lastName: "Vance" },
  { id: "b", firstName: "Theo", lastName: "Ramos" },
  { id: "c", firstName: "RJ", lastName: "Marsh" },
  { id: "d", firstName: "Owen", lastName: "Field" },
];

const SHEETS: MatrixSheet[] = [
  {
    name: "Position Matrix_AB",
    rows: [
      [null, "p", "c", "1b", "2b", "ss", "3b", "lf", "cf", "rf"],
      ["Milo V", 8, 1, 6, 1, 1, 6, 4, 1, 1],
      ["Theo R", 3, 9, 1, 4, 2, 1, 1, 8, 1],
      ["RJ", 5, 1, 1, 5, 4, 3, 5, 1, 4],
      ["Zeke Q", 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ],
  },
  {
    name: "Position Matrix_CD",
    rows: [
      [null, "p", "c", "1b", "2b", "ss", "3b", "lf", "cf", "rf"],
      ["Milo V", 7, 1, 6, 1, 2, 6, 3, 1, 2],
      ["Owen ", 2, 1, 1, 7, 5, 3, 4, 4, 4],
      ["Theo R", 2, 8, 1, 4, 2, 1, 4, 9, "11"],
    ],
  },
];

describe("raterFromSheetName", () => {
  it("takes the label after the last underscore", () => {
    expect(raterFromSheetName("Position Matrix_MC")).toBe("MC");
    expect(raterFromSheetName("Matrix")).toBe("Matrix");
  });
});

describe("parseMatrixSheets", () => {
  const result = parseMatrixSheets(SHEETS, ROSTER);

  it("parses one entry per coach sheet", () => {
    expect(result.sheets.map((s) => s.rater)).toEqual(["AB", "CD"]);
  });

  it("matches First-L and bare/trailing-space names", () => {
    const ab = result.sheets[0];
    expect(ab.ratings.filter((r) => r.playerId === "a")).toHaveLength(9);
    expect(ab.ratings.filter((r) => r.playerId === "c")).toHaveLength(9);
    const cd = result.sheets[1];
    expect(cd.ratings.some((r) => r.playerId === "d")).toBe(true);
  });

  it("reads ratings by position", () => {
    const ab = result.sheets[0];
    const miloP = ab.ratings.find((r) => r.playerId === "a" && r.position === "P");
    expect(miloP?.rating).toBe(8);
    const theoCf = ab.ratings.find((r) => r.playerId === "b" && r.position === "CF");
    expect(theoCf?.rating).toBe(8);
  });

  it("skips unmatched players with a warning (departed players)", () => {
    expect(result.sheets[0].ratings.some((r) => r.playerName === "Zeke Q")).toBe(false);
    expect(result.warnings.some((w) => w.includes("Zeke Q"))).toBe(true);
  });

  it("rejects out-of-range ratings with a warning", () => {
    const cd = result.sheets[1];
    expect(cd.ratings.some((r) => r.playerId === "b" && r.position === "RF")).toBe(false);
    expect(result.warnings.some((w) => w.includes("out of 1–10"))).toBe(true);
  });
});
