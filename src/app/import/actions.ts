"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import {
  runCuesImport,
  runPracticeGridImport,
  runRosterImport,
  runTournamentGridImport,
  type RunnerResult,
} from "@/lib/import-runner";

export interface ImportResult extends RunnerResult {
  ok: boolean;
}

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return file.text();
}

async function activeContext() {
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  const [team] = await db.select().from(tables.teams).limit(1);
  return { db, season: season ?? null, team: team ?? null };
}

export async function importRoster(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };
  let { db, season, team } = await activeContext();
  // First import on a fresh deployment: create the team and season so a
  // new coach can go from empty database to full roster in one upload.
  if (!team) {
    [team] = await db
      .insert(tables.teams)
      .values({ name: "Crushers Blue", slug: "crushers-blue" })
      .returning();
  }
  if (!season) {
    const year = new Date().getFullYear();
    [season] = await db
      .insert(tables.seasons)
      .values({
        teamId: team.id,
        year,
        term: "summer",
        ageGroup: "11U",
        name: `${team.name} ${year} Summer`,
        isActive: true,
      })
      .returning();
  }
  const result = await runRosterImport(db, team.id, season.id, season.year, csv);
  revalidatePath("/roster");
  revalidatePath("/");
  return { ok: true, ...result };
}

export async function importCues(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };
  const { db } = await activeContext();
  const result = await runCuesImport(db, csv);
  revalidatePath("/progress");
  return { ok: true, ...result };
}

export async function importPracticeGrid(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };
  const { db, season } = await activeContext();
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }
  const result = await runPracticeGridImport(db, season.id, season.year, csv);
  revalidatePath("/schedule");
  revalidatePath("/availability");
  revalidatePath("/");
  return { ok: true, ...result };
}

export async function importTournamentGrid(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };
  const { db, season } = await activeContext();
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }
  const result = await runTournamentGridImport(db, season.id, season.year, csv);
  revalidatePath("/availability");
  return { ok: true, ...result };
}
