"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { POSITIONS } from "@/db/schema";
import { requireCoach } from "@/lib/auth";
import { insertRatingIfChanged } from "@/lib/matrix";
import { runMatrixImport } from "@/lib/import-runner";
import type { MatrixSheet } from "@/lib/importers/matrix";
import type { ImportResult } from "@/app/import/actions";

const saveRowSchema = z.object({
  playerId: z.string().uuid(),
  rater: z.string().trim().min(1).max(40),
});

/** Save one player's row of ratings for one rater. Blank inputs are skipped. */
export async function saveMatrixRow(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const parsed = saveRowSchema.safeParse({
    playerId: formData.get("playerId"),
    rater: formData.get("rater"),
  });
  if (!parsed.success) return;
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return;

  for (const position of POSITIONS) {
    const raw = String(formData.get(`pos_${position}`) ?? "").trim();
    if (!raw) continue;
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) continue;
    await insertRatingIfChanged({
      seasonId: season.id,
      playerId: parsed.data.playerId,
      position,
      rating,
      rater: parsed.data.rater,
      createdByUserId: user.id,
    });
  }
  revalidatePath("/matrix");
}

/**
 * Delete every rating one rater holds for one player this season — history
 * included. For rows that were wrong at birth (a departed player's imported
 * numbers landing on a same-named teammate), superseding isn't enough: the
 * bogus history would still read as real. The cleared row shows blank until
 * someone rates the player again.
 */
export async function clearMatrixRow(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = saveRowSchema.safeParse({
    playerId: formData.get("playerId"),
    rater: formData.get("rater"),
  });
  if (!parsed.success) return;
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return;
  await db
    .delete(tables.positionRatings)
    .where(
      and(
        eq(tables.positionRatings.seasonId, season.id),
        eq(tables.positionRatings.playerId, parsed.data.playerId),
        eq(tables.positionRatings.rater, parsed.data.rater),
      ),
    );
  revalidatePath("/matrix");
}

export async function importMatrixXlsx(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  const user = await requireCoach();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, summary: [], warnings: ["Choose an .xlsx file first."] };
  }

  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }

  let sheets: MatrixSheet[];
  try {
    const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    sheets = wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json<(string | number | null)[]>(wb.Sheets[name], {
        header: 1,
        defval: null,
      }),
    }));
  } catch {
    return { ok: false, summary: [], warnings: ["Could not read that file as .xlsx."] };
  }

  const result = await runMatrixImport(db, season.id, sheets, user.id);
  revalidatePath("/matrix");
  return { ok: true, ...result };
}
