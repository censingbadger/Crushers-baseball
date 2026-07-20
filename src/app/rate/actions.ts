"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { DIMENSIONS } from "@/lib/development";

const metaSchema = z.object({
  playerId: z.string().uuid(),
  rater: z.string().trim().min(1).max(20),
  context: z.enum(["practice", "game", "general"]),
  note: z.string().trim().max(500).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function saveRatings(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const parsed = metaSchema.safeParse({
    playerId: formData.get("playerId"),
    rater: formData.get("rater"),
    context: formData.get("context"),
    note: formData.get("note") || undefined,
    day: formData.get("day") || undefined,
  });
  if (!parsed.success) return;
  const { playerId, rater, context, note, day } = parsed.data;

  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return;

  let wrote = false;
  for (const dim of DIMENSIONS) {
    const raw = String(formData.get(`dim_${dim.key}`) ?? "").trim();
    if (!raw) continue;
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) continue;
    await db.insert(tables.playerRatings).values({
      seasonId: season.id,
      playerId,
      dimension: dim.key,
      rating,
      context,
      note: wrote ? null : (note ?? null), // attach the note once, not 9 times
      day: day ?? null,
      rater,
      createdByUserId: user.id,
    });
    wrote = true;
  }
  revalidatePath("/rate");
  revalidatePath("/progress");
  redirect(`/rate?done=${playerId}`);
}
