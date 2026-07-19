import Papa from "papaparse";
import {
  dateAtMinutes,
  parseSheetDate,
  parseTimeRange,
  toIsoDate,
} from "./dates";

// Parses the Practice RSVP and Tournament Availability tabs of the
// organizing Google Sheet (CSV export). Both share a shape:
//
//   <instruction row(s)>
//   Day,Thurs,Tues,...
//   Date,6/11,6/16,...
//   Time (pm),5:30 - 7:00,...        (may be blank on the tournament tab)
//   Location,White Cross,...          (may be blank)
//   <player name>,Yes,No,TBD,...      (one row per player)
//   ...
//   Total Players Available,...       (computed row — ignored)
//   <optional extra sections: parent helpers, practice players, notes>

export type GridAnswer = "yes" | "no" | "maybe";

export interface GridColumn {
  index: number;
  date: { year: number; month: number; day: number };
  isoDate: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string | null;
}

export interface GridPlayerRow {
  name: string;
  answers: (GridAnswer | null)[]; // aligned with columns
}

export interface GridImportResult {
  columns: GridColumn[];
  players: GridPlayerRow[];
  warnings: string[];
}

function normalize(cell: string | undefined): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

function parseAnswer(cell: string): GridAnswer | null {
  const v = normalize(cell).toLowerCase();
  if (v === "yes" || v === "y") return "yes";
  if (v === "no" || v === "n") return "no";
  if (v === "tbd" || v === "maybe" || v === "?") return "maybe";
  return null;
}

const STOP_ROW_RE =
  /^(total players available|parents:|note:|this is just|please add your name)/i;

export function parseAvailabilityGridCsv(
  csv: string,
  defaultYear: number,
): GridImportResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, ""), {
    skipEmptyLines: false,
  });
  const grid = parsed.data.map((row) => row.map((c) => c ?? ""));

  const dateRowIdx = grid.findIndex(
    (row) => normalize(row[0]).toLowerCase() === "date",
  );
  if (dateRowIdx === -1) {
    return {
      columns: [],
      players: [],
      warnings: ["Could not find a 'Date' row."],
    };
  }
  const dateRow = grid[dateRowIdx];

  const timeRow = grid.find((row) =>
    normalize(row[0]).toLowerCase().startsWith("time"),
  );
  const assumePm = timeRow
    ? normalize(timeRow[0]).toLowerCase().includes("pm")
    : true;
  const locationRow = grid.find(
    (row) => normalize(row[0]).toLowerCase() === "location",
  );

  const columns: GridColumn[] = [];
  for (let i = 1; i < dateRow.length; i++) {
    const raw = normalize(dateRow[i]);
    if (!raw) continue;
    const date = parseSheetDate(raw, defaultYear);
    if (!date) {
      warnings.push(`Ignored unparseable date column "${raw}".`);
      continue;
    }
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    const timeRaw = timeRow ? normalize(timeRow[i]) : "";
    if (timeRaw) {
      const range = parseTimeRange(timeRaw, assumePm);
      if (range) {
        startsAt = dateAtMinutes(date, range.startMinutes);
        endsAt = dateAtMinutes(date, range.endMinutes);
      } else {
        warnings.push(`Ignored unparseable time "${timeRaw}" for ${raw}.`);
      }
    }
    const location = locationRow ? normalize(locationRow[i]) || null : null;
    columns.push({
      index: i,
      date,
      isoDate: toIsoDate(date),
      startsAt,
      endsAt,
      location,
    });
  }
  if (columns.length === 0) {
    warnings.push("No date columns found.");
  }

  // Player rows: below the header block, until a stop row. Sections like
  // "Practice Players" contain more player rows, so only obvious non-player
  // rows stop or get skipped.
  const players: GridPlayerRow[] = [];
  let started = false;
  for (let r = dateRowIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    const label = normalize(row[0]);
    const lower = label.toLowerCase();
    if (!label) continue;
    if (lower === "day" || lower.startsWith("time") || lower === "location") {
      // A second header block (e.g. the parent-helper section) — stop here
      // once we've already collected players.
      if (started) break;
      continue;
    }
    if (STOP_ROW_RE.test(label)) {
      if (lower.startsWith("total players available")) continue;
      if (lower === "practice players") continue; // section divider, rows follow
      break;
    }
    if (lower === "practice players") continue;
    // Heuristic: a player row has a name in column 0 and answers elsewhere.
    const answers = columns.map((c) => parseAnswer(row[c.index] ?? ""));
    const hasAnswers = answers.some((a) => a !== null);
    const looksLikeName = /^[a-z' .-]+$/i.test(label) && label.length <= 60;
    if (!looksLikeName) {
      if (started) break;
      continue;
    }
    if (!hasAnswers && !started) continue;
    players.push({ name: label, answers });
    started = true;
  }

  return { columns, players, warnings };
}

/**
 * Case/whitespace-insensitive player-name matcher. Accepts "First Last",
 * "First L" (last-initial, as the matrix workbook uses), and a bare first
 * name when unambiguous.
 */
export function matchPlayerByName(
  name: string,
  roster: { id: string; firstName: string; lastName: string }[],
): string | null {
  const target = name.replace(/\s+/g, " ").trim().toLowerCase();
  if (!target) return null;
  for (const p of roster) {
    const full = `${p.firstName} ${p.lastName}`.replace(/\s+/g, " ").trim().toLowerCase();
    if (full === target) return p.id;
  }
  // "First L" — first name plus last-initial (with or without a period).
  const initialMatch = target.match(/^(.+?) ([a-z])\.?$/);
  if (initialMatch) {
    const [, first, initial] = initialMatch;
    const hits = roster.filter(
      (p) =>
        p.firstName.trim().toLowerCase() === first &&
        p.lastName.trim().toLowerCase().startsWith(initial),
    );
    if (hits.length === 1) return hits[0].id;
  }
  // Bare first name when unambiguous.
  const firstMatches = roster.filter(
    (p) => p.firstName.trim().toLowerCase() === target,
  );
  if (firstMatches.length === 1) return firstMatches[0].id;
  return null;
}
