"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import {
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
  const { db, season, team } = await activeContext();
  if (!season || !team) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }
  const result = await runRosterImport(db, team.id, season.id, season.year, csv);
  revalidatePath("/roster");
  revalidatePath("/");
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
