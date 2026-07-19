import { POSITIONS, type Position } from "@/db/schema";
import { matchPlayerByName } from "./grid";

// Parses the position-matrix workbook: one sheet per rating coach, each
// shaped as
//
//   ,p,c,1b,2b,ss,3b,lf,cf,rf
//   Jack B,8,1,6,1,1,6,4,1,1
//   ...
//
// Sheet names like "Position Matrix_MC" carry the coach label after the
// final underscore ("MC"). Ratings are 1–10 integers.

export interface MatrixSheet {
  name: string;
  rows: (string | number | null)[][];
}

export interface ParsedMatrixRating {
  playerName: string;
  playerId: string | null;
  position: Position;
  rating: number;
}

export interface ParsedMatrixSheet {
  rater: string;
  ratings: ParsedMatrixRating[];
}

export interface MatrixParseResult {
  sheets: ParsedMatrixSheet[];
  warnings: string[];
}

export function raterFromSheetName(name: string): string {
  const trimmed = name.trim();
  const underscore = trimmed.lastIndexOf("_");
  if (underscore >= 0 && underscore < trimmed.length - 1) {
    return trimmed.slice(underscore + 1).trim();
  }
  return trimmed;
}

export function parseMatrixSheets(
  sheets: MatrixSheet[],
  roster: { id: string; firstName: string; lastName: string }[],
): MatrixParseResult {
  const warnings: string[] = [];
  const parsed: ParsedMatrixSheet[] = [];

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (rows.length === 0) {
      warnings.push(`Sheet "${sheet.name}" is empty — skipped.`);
      continue;
    }
    // Header row: first row containing "p" and "c" style position labels.
    const headerIdx = rows.findIndex((row) =>
      row.some(
        (cell) =>
          typeof cell === "string" &&
          POSITIONS.includes(cell.trim().toUpperCase() as Position),
      ),
    );
    if (headerIdx === -1) {
      warnings.push(`Sheet "${sheet.name}": no position header row — skipped.`);
      continue;
    }
    const header = rows[headerIdx];
    const positionCols: { col: number; position: Position }[] = [];
    for (let c = 0; c < header.length; c++) {
      const cell = header[c];
      if (typeof cell !== "string") continue;
      const upper = cell.trim().toUpperCase();
      if (POSITIONS.includes(upper as Position)) {
        positionCols.push({ col: c, position: upper as Position });
      }
    }
    if (positionCols.length < POSITIONS.length) {
      warnings.push(
        `Sheet "${sheet.name}": found ${positionCols.length}/${POSITIONS.length} position columns.`,
      );
    }

    const rater = raterFromSheetName(sheet.name);
    const ratings: ParsedMatrixRating[] = [];
    for (const row of rows.slice(headerIdx + 1)) {
      const nameCell = row[0];
      if (typeof nameCell !== "string" || !nameCell.trim()) continue;
      const playerName = nameCell.replace(/\s+/g, " ").trim();
      const playerId = matchPlayerByName(playerName, roster);
      if (!playerId) {
        warnings.push(
          `Sheet "${sheet.name}": no roster match for "${playerName}" — row skipped.`,
        );
        continue;
      }
      for (const { col, position } of positionCols) {
        const v = row[col];
        const num = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
        if (!Number.isFinite(num)) continue;
        const rating = Math.round(num);
        if (rating < 1 || rating > 10) {
          warnings.push(
            `Sheet "${sheet.name}": ${playerName} ${position} rating ${rating} out of 1–10 — skipped.`,
          );
          continue;
        }
        ratings.push({ playerName, playerId, position, rating });
      }
    }
    parsed.push({ rater, ratings });
  }

  return { sheets: parsed, warnings };
}
