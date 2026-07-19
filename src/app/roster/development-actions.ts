"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";

const aspirationSchema = z.object({
  playerId: z.string().uuid(),
  desiredPositions: z.string().trim().max(120).optional(),
  seasonGoals: z.string().trim().max(1000).optional(),
  coachNotes: z.string().trim().max(1000).optional(),
});

export async function saveAspirations(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = aspirationSchema.safeParse({
    playerId: formData.get("playerId"),
    desiredPositions: formData.get("desiredPositions") || undefined,
    seasonGoals: formData.get("seasonGoals") || undefined,
    coachNotes: formData.get("coachNotes") || undefined,
  });
  if (!parsed.success) return;
  const { playerId, desiredPositions, seasonGoals, coachNotes } = parsed.data;

  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return;

  const values = {
    desiredPositions: desiredPositions || null,
    seasonGoals: seasonGoals || null,
    coachNotes: coachNotes || null,
    updatedAt: new Date(),
  };
  const [existing] = await db
    .select({ id: tables.aspirations.id })
    .from(tables.aspirations)
    .where(
      and(
        eq(tables.aspirations.seasonId, season.id),
        eq(tables.aspirations.playerId, playerId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(tables.aspirations)
      .set(values)
      .where(eq(tables.aspirations.id, existing.id));
  } else {
    await db.insert(tables.aspirations).values({
      seasonId: season.id,
      playerId,
      ...values,
    });
  }
  revalidatePath(`/roster/${playerId}`);
  revalidatePath("/progress");
  revalidatePath(`/rate/${playerId}`);
}

const noteSchema = z.object({
  playerId: z.string().uuid(),
  category: z.enum(["pitching", "hitting", "fielding", "general"]),
  tendency: z.string().trim().min(1).max(500),
  cue: z.string().trim().min(1).max(500),
  shared: z.boolean(),
});

export async function addDevNote(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const parsed = noteSchema.safeParse({
    playerId: formData.get("playerId"),
    category: formData.get("category"),
    tendency: formData.get("tendency"),
    cue: formData.get("cue"),
    shared: formData.get("shared") === "on",
  });
  if (!parsed.success) return;
  const db = await getDb();
  await db.insert(tables.devNotes).values({
    playerId: parsed.data.playerId,
    category: parsed.data.category,
    tendency: parsed.data.tendency,
    cue: parsed.data.cue,
    shared: parsed.data.shared,
    createdByUserId: user.id,
  });
  revalidatePath(`/roster/${parsed.data.playerId}`);
  revalidatePath("/progress");
}

export async function toggleNoteShared(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  const [note] = await db
    .select()
    .from(tables.devNotes)
    .where(eq(tables.devNotes.id, id))
    .limit(1);
  if (!note) return;
  await db
    .update(tables.devNotes)
    .set({ shared: !note.shared })
    .where(eq(tables.devNotes.id, id));
  revalidatePath(`/roster/${note.playerId}`);
  revalidatePath("/progress");
}

export async function deleteDevNote(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  const [note] = await db
    .select()
    .from(tables.devNotes)
    .where(eq(tables.devNotes.id, id))
    .limit(1);
  if (!note) return;
  await db.delete(tables.devNotes).where(eq(tables.devNotes.id, id));
  revalidatePath(`/roster/${note.playerId}`);
  revalidatePath("/progress");
}
