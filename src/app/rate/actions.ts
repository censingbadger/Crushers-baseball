"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { BARS_KEYS } from "@/lib/bars";
import { initialsOf } from "@/lib/format";

const cellSchema = z.object({
  playerId: z.string().uuid(),
  dimension: z.enum(BARS_KEYS),
  // 1–5, or 0 = "not observed" — an honest first-class value.
  level: z.number().int().min(0).max(5),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * One tap in the BARS flow. Append-only: every rating is kept (trends and
 * rater history stay auditable); display uses each rater's latest observed
 * level. The rater comes from the signed-in coach — no way to file under
 * someone else's initials.
 */
export async function saveBarsRating(
  playerId: string,
  dimension: string,
  level: number,
  day: string,
): Promise<{ ok: boolean }> {
  const user = await requireCoach();
  const parsed = cellSchema.safeParse({ playerId, dimension, level, day });
  if (!parsed.success) return { ok: false };
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return { ok: false };
  await db.insert(tables.barsRatings).values({
    seasonId: season.id,
    playerId: parsed.data.playerId,
    dimension: parsed.data.dimension,
    rater: initialsOf(user.displayName),
    level: parsed.data.level,
    day: parsed.data.day,
    createdByUserId: user.id,
  });
  revalidatePath(`/rate/${parsed.data.dimension}`);
  revalidatePath("/rate");
  revalidatePath("/roster");
  return { ok: true };
}
