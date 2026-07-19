"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { POSITIONS, type Position } from "@/db/schema";
import { requireCoach } from "@/lib/auth";

const setupSchema = z.object({
  eventId: z.string().uuid(),
  games: z.coerce.number().int().min(1).max(10),
  inningsPerGame: z.coerce.number().int().min(1).max(9),
});

export async function upsertPlan(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = setupSchema.safeParse({
    eventId: formData.get("eventId"),
    games: formData.get("games"),
    inningsPerGame: formData.get("inningsPerGame"),
  });
  if (!parsed.success) return;
  const { eventId, games, inningsPerGame } = parsed.data;

  const db = await getDb();
  const [existing] = await db
    .select()
    .from(tables.weekendPlans)
    .where(eq(tables.weekendPlans.eventId, eventId))
    .limit(1);
  if (existing) {
    await db
      .update(tables.weekendPlans)
      .set({ games, inningsPerGame })
      .where(eq(tables.weekendPlans.id, existing.id));
  } else {
    await db.insert(tables.weekendPlans).values({ eventId, games, inningsPerGame });
  }
  revalidatePath("/weekend");
  redirect(`/weekend?event=${eventId}`);
}

function positionOrNull(v: FormDataEntryValue | null): Position | null {
  const s = String(v ?? "").trim();
  return (POSITIONS as readonly string[]).includes(s) ? (s as Position) : null;
}

function innings(v: FormDataEntryValue | null, max: number): number {
  const n = Number(String(v ?? "").trim());
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(n, max);
}

export async function saveAllLines(formData: FormData): Promise<void> {
  await requireCoach();
  const planId = String(formData.get("planId") ?? "");
  if (!planId) return;
  const db = await getDb();
  const [plan] = await db
    .select()
    .from(tables.weekendPlans)
    .where(eq(tables.weekendPlans.id, planId))
    .limit(1);
  if (!plan) return;
  const maxInnings = plan.games * plan.inningsPerGame;

  const playerIds = formData.getAll("playerId").map(String);
  for (const playerId of playerIds) {
    const values = {
      posA: positionOrNull(formData.get(`posA_${playerId}`)),
      inningsA: innings(formData.get(`inningsA_${playerId}`), maxInnings),
      posB: positionOrNull(formData.get(`posB_${playerId}`)),
      inningsB: innings(formData.get(`inningsB_${playerId}`), maxInnings),
      pitchInnings: innings(formData.get(`pitch_${playerId}`), maxInnings),
      pitchMaxPerGame:
        innings(formData.get(`pitchMax_${playerId}`), plan.inningsPerGame) || null,
      pitchGames: String(formData.get(`pitchGames_${playerId}`) ?? "").trim() || null,
      updatedAt: new Date(),
    };
    const [existing] = await db
      .select({ id: tables.weekendPlanLines.id })
      .from(tables.weekendPlanLines)
      .where(
        and(
          eq(tables.weekendPlanLines.planId, planId),
          eq(tables.weekendPlanLines.playerId, playerId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(tables.weekendPlanLines)
        .set(values)
        .where(eq(tables.weekendPlanLines.id, existing.id));
    } else {
      await db.insert(tables.weekendPlanLines).values({
        planId,
        playerId,
        ...values,
      });
    }
  }
  revalidatePath("/weekend");
  redirect(`/weekend?event=${plan.eventId}`);
}
