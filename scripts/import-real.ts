/*
 * Loads the real team into the local database from files the coach places
 * in .data/imports/ (gitignored — real names and contacts never enter the
 * repository):
 *
 *   roster.csv       — the organizing Sheet's Roster tab (CSV export)
 *   practice.csv     — Practice RSVP tab
 *   tournament.csv   — Tournament Availability tab
 *   cues.csv         — pitching "Player,Tendency,Cue" rows (no header needed)
 *   matrix.xlsx      — position matrix workbook (one sheet per coach)
 *   config.json      — { "teamName", "seasonYear", "seasonTerm", "ageGroup",
 *                        "coachName", "coachEmail",
 *                        "statusOverrides": { "practice": [names], "hopeful": [names] } }
 *
 * Missing files are skipped. Parent/coach temp passwords are written to
 * .data/imports/credentials.txt, never to the repo or stdout.
 *
 * Run: npx tsx scripts/import-real.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { getDb, tables } from "../src/db";
import {
  applyStatusOverrides,
  runCuesImport,
  runMatrixImport,
  runPracticeGridImport,
  runRosterImport,
  runTournamentGridImport,
  type RunnerResult,
} from "../src/lib/import-runner";
import type { MatrixSheet } from "../src/lib/importers/matrix";
import type { SeasonTerm } from "../src/db/schema";

const IMPORT_DIR = path.join(process.cwd(), ".data", "imports");

interface Config {
  teamName?: string;
  seasonYear?: number;
  seasonTerm?: SeasonTerm;
  ageGroup?: string;
  coachName?: string;
  coachEmail?: string;
  statusOverrides?: { practice?: string[]; hopeful?: string[] };
}

function read(name: string): string | null {
  const p = path.join(IMPORT_DIR, name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function report(label: string, result: RunnerResult) {
  console.log(`\n== ${label} ==`);
  for (const s of result.summary) console.log(`  ${s}`);
  for (const w of result.warnings) console.log(`  ⚠ ${w}`);
}

async function main() {
  const config: Config = JSON.parse(read("config.json") ?? "{}");
  const db = await getDb();
  const credentialLines: string[] = [];

  // Team + season (idempotent).
  let [team] = await db.select().from(tables.teams).limit(1);
  if (!team) {
    [team] = await db
      .insert(tables.teams)
      .values({
        name: config.teamName ?? "Crushers Blue",
        slug: "crushers-blue",
      })
      .returning();
    console.log(`Created team ${team.name}.`);
  }
  const year = config.seasonYear ?? new Date().getFullYear();
  const term: SeasonTerm = config.seasonTerm ?? "summer";
  let [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.teamId, team.id));
  if (!season) {
    [season] = await db
      .insert(tables.seasons)
      .values({
        teamId: team.id,
        year,
        term,
        ageGroup: config.ageGroup ?? "11U",
        name: `${team.name} ${year} ${term[0].toUpperCase()}${term.slice(1)}`,
        isActive: true,
      })
      .returning();
    console.log(`Created season ${season.name}.`);
  }

  // Coach account.
  if (config.coachEmail) {
    const email = config.coachEmail.toLowerCase();
    const [existing] = await db
      .select()
      .from(tables.users)
      .where(eq(tables.users.email, email))
      .limit(1);
    if (!existing) {
      const pw = randomBytes(5).toString("base64url").replace(/[-_]/g, "x");
      await db.insert(tables.users).values({
        email,
        passwordHash: bcrypt.hashSync(pw, 10),
        displayName: config.coachName ?? "Coach",
        role: "coach",
      });
      credentialLines.push(`COACH  ${email}  ${pw}`);
      console.log(`Created coach account for ${email}.`);
    }
  }

  const roster = read("roster.csv");
  if (roster) {
    const result = await runRosterImport(db, team.id, season.id, season.year, roster);
    report("Roster", result);
    for (const c of result.credentials ?? []) {
      credentialLines.push(`PARENT ${c.email}  ${c.tempPassword}`);
    }
  } else {
    console.log("(no roster.csv — skipped)");
  }

  const practice = read("practice.csv");
  if (practice) {
    report("Practice RSVPs", await runPracticeGridImport(db, season.id, season.year, practice));
  }

  const tournament = read("tournament.csv");
  if (tournament) {
    report(
      "Tournament availability",
      await runTournamentGridImport(db, season.id, season.year, tournament),
    );
  }

  const cues = read("cues.csv");
  if (cues) {
    report("Pitching cues", await runCuesImport(db, cues));
  }

  const matrixPath = path.join(IMPORT_DIR, "matrix.xlsx");
  if (existsSync(matrixPath)) {
    const wb = XLSX.read(readFileSync(matrixPath), { type: "buffer" });
    const sheets: MatrixSheet[] = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], {
        header: 1,
        defval: null,
      }),
    }));
    report("Position matrix", await runMatrixImport(db, season.id, sheets));
  }

  if (config.statusOverrides) {
    report(
      "Status overrides",
      await applyStatusOverrides(db, season.id, config.statusOverrides),
    );
  }

  if (credentialLines.length > 0) {
    const credPath = path.join(IMPORT_DIR, "credentials.txt");
    writeFileSync(credPath, credentialLines.join("\n") + "\n");
    console.log(
      `\n${credentialLines.length} account credentials written to ${credPath} (gitignored).`,
    );
  }
  console.log("\nDone.");
}

main().then(() => process.exit(0));
