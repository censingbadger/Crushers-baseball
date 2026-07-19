"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";

const createPlayerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  jerseyNumber: z.coerce.number().int().min(0).max(99).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  school: z.string().trim().max(120).optional(),
  status: z.enum(["full", "practice", "hopeful"]),
  positions: z.string().trim().max(120).optional(),
});

export async function createPlayer(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = createPlayerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    jerseyNumber: formData.get("jerseyNumber") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    school: formData.get("school") || undefined,
    status: formData.get("status"),
    positions: formData.get("positions") || undefined,
  });
  if (!parsed.success) redirect("/roster/new?error=1");
  const input = parsed.data;

  const db = await getDb();
  const [team] = await db.select().from(tables.teams).limit(1);
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!team || !season) redirect("/roster?error=no-season");

  const [player] = await db
    .insert(tables.players)
    .values({
      teamId: team.id,
      firstName: input.firstName,
      lastName: input.lastName,
      birthdate: input.birthdate || null,
      school: input.school || null,
    })
    .returning();
  await db.insert(tables.rosterEntries).values({
    seasonId: season.id,
    playerId: player.id,
    jerseyNumber: input.jerseyNumber ?? null,
    status: input.status,
    positions: input.positions || null,
  });
  revalidatePath("/roster");
  redirect("/roster");
}

const updatePlayerSchema = createPlayerSchema.extend({
  playerId: z.string().uuid(),
});

export async function updatePlayer(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = updatePlayerSchema.safeParse({
    playerId: formData.get("playerId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    jerseyNumber: formData.get("jerseyNumber") || undefined,
    birthdate: formData.get("birthdate") || undefined,
    school: formData.get("school") || undefined,
    status: formData.get("status"),
    positions: formData.get("positions") || undefined,
  });
  if (!parsed.success) redirect("/roster?error=1");
  const input = parsed.data;

  const db = await getDb();
  await db
    .update(tables.players)
    .set({
      firstName: input.firstName,
      lastName: input.lastName,
      birthdate: input.birthdate || null,
      school: input.school || null,
    })
    .where(eq(tables.players.id, input.playerId));

  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (season) {
    const [entry] = await db
      .select()
      .from(tables.rosterEntries)
      .where(
        and(
          eq(tables.rosterEntries.seasonId, season.id),
          eq(tables.rosterEntries.playerId, input.playerId),
        ),
      )
      .limit(1);
    const values = {
      jerseyNumber: input.jerseyNumber ?? null,
      status: input.status,
      positions: input.positions || null,
    };
    if (entry) {
      await db
        .update(tables.rosterEntries)
        .set(values)
        .where(eq(tables.rosterEntries.id, entry.id));
    } else {
      await db.insert(tables.rosterEntries).values({
        seasonId: season.id,
        playerId: input.playerId,
        ...values,
      });
    }
  }
  revalidatePath("/roster");
  revalidatePath("/matrix");
  redirect("/roster");
}

/** Take a player off the active season's roster; keeps the player record and history. */
export async function removeFromSeason(formData: FormData): Promise<void> {
  await requireCoach();
  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return;
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return;
  await db
    .delete(tables.rosterEntries)
    .where(
      and(
        eq(tables.rosterEntries.seasonId, season.id),
        eq(tables.rosterEntries.playerId, playerId),
      ),
    );
  revalidatePath("/roster");
  revalidatePath("/matrix");
  revalidatePath("/availability");
  redirect("/roster");
}

/** Permanently delete a player and their dependent rows. */
export async function deletePlayer(formData: FormData): Promise<void> {
  await requireCoach();
  const playerId = String(formData.get("playerId") ?? "");
  if (!playerId) return;
  const db = await getDb();
  await db.delete(tables.positionRatings).where(eq(tables.positionRatings.playerId, playerId));
  await db.delete(tables.rsvps).where(eq(tables.rsvps.playerId, playerId));
  await db
    .delete(tables.availabilityDays)
    .where(eq(tables.availabilityDays.playerId, playerId));
  await db
    .delete(tables.playerGuardians)
    .where(eq(tables.playerGuardians.playerId, playerId));
  await db.delete(tables.rosterEntries).where(eq(tables.rosterEntries.playerId, playerId));
  await db.delete(tables.players).where(eq(tables.players.id, playerId));
  revalidatePath("/roster");
  revalidatePath("/matrix");
  revalidatePath("/availability");
  revalidatePath("/schedule");
  redirect("/roster");
}
