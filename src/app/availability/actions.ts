"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireCoach, requireUser } from "@/lib/auth";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function activeSeasonId(): Promise<string | null> {
  const db = await getDb();
  const [season] = await db
    .select({ id: tables.seasons.id })
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  return season?.id ?? null;
}

const cellSchema = z.object({
  playerId: z.string().uuid(),
  day: z.string().regex(DAY_RE),
  status: z.enum(["yes", "no", "maybe"]),
});

/**
 * One tap on a tournament-grid cell. The button carries
 * "playerId|day|nextStatus" so the whole grid shares a single form.
 */
export async function setAvailabilityDay(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = String(formData.get("cell") ?? "");
  const [playerId, day, status] = raw.split("|");
  const parsed = cellSchema.safeParse({ playerId, day, status });
  if (!parsed.success) return;

  const allowed = await editablePlayerIds(user);
  if (!allowed.includes(parsed.data.playerId)) return;
  const seasonId = await activeSeasonId();
  if (!seasonId) return;

  const db = await getDb();
  const [existing] = await db
    .select({ id: tables.availabilityDays.id })
    .from(tables.availabilityDays)
    .where(
      and(
        eq(tables.availabilityDays.seasonId, seasonId),
        eq(tables.availabilityDays.playerId, parsed.data.playerId),
        eq(tables.availabilityDays.day, parsed.data.day),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(tables.availabilityDays)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(tables.availabilityDays.id, existing.id));
  } else {
    await db.insert(tables.availabilityDays).values({
      seasonId,
      playerId: parsed.data.playerId,
      day: parsed.data.day,
      status: parsed.data.status,
    });
  }
  revalidatePath("/availability");
}

/**
 * Coach adds a candidate tournament day: every rostered player gets an
 * "unknown" row so the column appears and families can answer.
 */
export async function addAvailabilityDay(formData: FormData): Promise<void> {
  await requireCoach();
  const day = String(formData.get("day") ?? "");
  if (!DAY_RE.test(day)) return;
  const seasonId = await activeSeasonId();
  if (!seasonId) return;

  const db = await getDb();
  const roster = await db
    .select({ playerId: tables.rosterEntries.playerId })
    .from(tables.rosterEntries)
    .where(eq(tables.rosterEntries.seasonId, seasonId));
  const existing = await db
    .select({ playerId: tables.availabilityDays.playerId })
    .from(tables.availabilityDays)
    .where(
      and(
        eq(tables.availabilityDays.seasonId, seasonId),
        eq(tables.availabilityDays.day, day),
      ),
    );
  const have = new Set(existing.map((r) => r.playerId));
  for (const { playerId } of roster) {
    if (have.has(playerId)) continue;
    await db.insert(tables.availabilityDays).values({
      seasonId,
      playerId,
      day,
      status: "unknown",
    });
  }
  revalidatePath("/availability");
}

/**
 * Coach removes a candidate day (all answers for it). The day arrives as a
 * bound argument because this runs from a formAction button inside the
 * grid form, where a button's own name/value is reserved by React.
 */
export async function removeAvailabilityDay(day: string): Promise<void> {
  await requireCoach();
  if (!DAY_RE.test(day)) return;
  const seasonId = await activeSeasonId();
  if (!seasonId) return;
  const db = await getDb();
  await db
    .delete(tables.availabilityDays)
    .where(
      and(
        eq(tables.availabilityDays.seasonId, seasonId),
        eq(tables.availabilityDays.day, day),
      ),
    );
  revalidatePath("/availability");
}
