import Papa from "papaparse";
import { matchPlayerByName } from "./grid";
import { parseIpToOuts } from "@/lib/stats";

// Parses GameChanger's season-stats CSV exports (one file for batting, one
// for pitching). GC identifies players with "Last, First" columns or a
// single name column; stat headers vary slightly by GC version, so columns
// are matched case- and punctuation-insensitively against known aliases.

export type GcKind = "batting" | "pitching" | "fielding" | "catching";

const BATTING_COLUMNS: Record<string, string[]> = {
  ab: ["ab"],
  r: ["r", "runs"],
  h: ["h", "hits"],
  doubles: ["2b"],
  triples: ["3b"],
  hr: ["hr"],
  rbi: ["rbi"],
  bb: ["bb", "walks"],
  k: ["so", "k", "ks"],
  sb: ["sb"],
  hbp: ["hbp"],
  sf: ["sf"],
};

// Columns prefixed "_" are detection-only: they help identify the export
// (GC always includes them) but aren't stored.
const PITCHING_COLUMNS: Record<string, string[]> = {
  ip: ["ip", "inn", "innings"],
  bf: ["bf", "tbf", "battersfaced"],
  pitches: ["#p", "p", "pitches", "pc", "np"],
  h: ["h", "hits"],
  r: ["r", "runs"],
  er: ["er"],
  bb: ["bb", "walks"],
  k: ["so", "k", "ks"],
  _era: ["era"],
  _whip: ["whip"],
  _gp: ["gp", "app", "g"],
};

const FIELDING_COLUMNS: Record<string, string[]> = {
  po: ["po", "putouts"],
  a: ["a", "assists"],
  e: ["e", "errors"],
  dp: ["dp"],
  _tc: ["tc", "chances"],
  _fpct: ["fpct", "fld%", "fldpct"],
};

const CATCHING_COLUMNS: Record<string, string[]> = {
  ip: ["inn", "ip", "innings"],
  pb: ["pb", "passedballs"],
  sbAllowed: ["sb", "sba"],
  cs: ["cs"],
  _cspct: ["cs%", "cspct"],
};

const SPEC_BY_KIND: Record<GcKind, Record<string, string[]>> = {
  batting: BATTING_COLUMNS,
  pitching: PITCHING_COLUMNS,
  fielding: FIELDING_COLUMNS,
  catching: CATCHING_COLUMNS,
};

export interface GcLine {
  playerName: string;
  playerId: string | null;
  stats: Record<string, number>;
}

export interface GcParseResult {
  kind: GcKind;
  lines: GcLine[];
  warnings: string[];
}

function norm(h: string): string {
  return h.replace(/[^a-z0-9#%]/gi, "").toLowerCase();
}

function toNumber(v: string): number {
  const s = v.trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function bestHeaderMatch(grid: string[][], spec: Record<string, string[]>): number {
  let best = 0;
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const cells = grid[i].map(norm);
    let n = 0;
    for (const aliases of Object.values(spec)) {
      if (cells.some((c) => aliases.includes(c))) n++;
    }
    best = Math.max(best, n);
  }
  return best;
}

/**
 * Which export is this file? The kinds share columns (H/R/BB/K between
 * batting and pitching, SB between batting and catching), so the reliable
 * signal is which spec matches MORE header columns — IP/BF/ER/ERA pull
 * pitching, AB/2B/HR/RBI pull batting, PO/A/E pull fielding, PB/CS pull
 * catching. Ties and thin matches return null rather than a guess.
 */
export function detectGcKind(csv: string): GcKind | null {
  const grid = Papa.parse<string[]>(csv.replace(/^﻿/, "").trim(), {
    skipEmptyLines: true,
  }).data;
  const scores = (Object.keys(SPEC_BY_KIND) as GcKind[]).map((kind) => ({
    kind,
    score: bestHeaderMatch(grid, SPEC_BY_KIND[kind]),
  }));
  scores.sort((a, b) => b.score - a.score);
  const [best, second] = scores;
  if (best.score < 3 || best.score === second.score) return null;
  return best.kind;
}

export function parseGameChangerCsv(
  csv: string,
  kind: GcKind,
  roster: { id: string; firstName: string; lastName: string }[],
): GcParseResult {
  const warnings: string[] = [];
  const parsed = Papa.parse<string[]>(csv.replace(/^﻿/, "").trim(), {
    skipEmptyLines: true,
  });
  const grid = parsed.data;
  const spec = SPEC_BY_KIND[kind];

  // Header row: the first row that matches at least three known stat columns.
  let headerIdx = -1;
  let colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 5); i++) {
    const cells = grid[i].map(norm);
    const map: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(spec)) {
      const idx = cells.findIndex((c) => aliases.includes(c));
      if (idx >= 0) map[key] = idx;
    }
    if (Object.keys(map).length >= 3) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      kind,
      lines: [],
      warnings: [`Couldn't find a ${kind} header row (looked for ${Object.values(spec).map((a) => a[0].toUpperCase()).join(", ")}).`],
    };
  }
  const header = grid[headerIdx].map(norm);
  const missing = Object.keys(spec).filter(
    (k) => !k.startsWith("_") && !(k in colMap),
  );
  if (missing.length > 0) {
    warnings.push(`Columns not found (imported as 0): ${missing.join(", ")}.`);
  }

  // Name columns: "Last" + "First", or a single name-ish column.
  const lastIdx = header.findIndex((c) => c === "last" || c === "lastname");
  const firstIdx = header.findIndex((c) => c === "first" || c === "firstname");
  const nameIdx = header.findIndex(
    (c) => c === "name" || c === "player" || c === "playername",
  );

  const lines: GcLine[] = [];
  for (const row of grid.slice(headerIdx + 1)) {
    let playerName = "";
    if (lastIdx >= 0 && firstIdx >= 0) {
      const first = (row[firstIdx] ?? "").trim();
      const last = (row[lastIdx] ?? "").trim();
      playerName = `${first} ${last}`.trim();
    } else if (nameIdx >= 0) {
      playerName = (row[nameIdx] ?? "").trim();
      if (playerName.includes(",")) {
        const [last, first] = playerName.split(",").map((s) => s.trim());
        playerName = `${first} ${last}`.trim();
      }
    }
    if (!playerName) continue;
    if (/^(totals?|team)$/i.test(playerName)) continue;

    const playerId = matchPlayerByName(playerName, roster);
    if (!playerId) {
      warnings.push(`No roster match for "${playerName}" — row skipped.`);
      continue;
    }

    const stats: Record<string, number> = {};
    for (const [key, idx] of Object.entries(colMap)) {
      if (key.startsWith("_")) continue; // detection-only column
      const raw = row[idx] ?? "";
      if (key === "ip") {
        stats.outs = parseIpToOuts(raw) ?? 0;
      } else {
        stats[key] = toNumber(raw);
      }
    }
    lines.push({ playerName, playerId, stats });
  }

  return { kind, lines, warnings };
}
