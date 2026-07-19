"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";

const createPlayerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  jerseyNumber: z.coerce.number().int().min(0).max(99).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  school: z.string().trim().max(120).optional(),
  status: z.enum(["full", "practice"]),
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
