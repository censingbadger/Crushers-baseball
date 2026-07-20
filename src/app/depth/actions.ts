"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { POSITIONS, POSITION_ROLES } from "@/db/schema";
import { requireCoach } from "@/lib/auth";
import { initialsOf } from "@/lib/format";

const cellSchema = z.object({
  playerId: z.string().uuid(),
  position: z.enum(POSITIONS),
  role: z.enum(POSITION_ROLES).nullable(),
});

/**
 * One tap on the depth chart. The chart is one shared staff decision —
 * whoever taps last wins, and their initials are stamped on the cell.
 * A null role clears the cell back to blank.
 */
export async function savePositionRole(
  playerId: string,
  position: string,
  role: string | null,
): Promise<{ ok: boolean }> {
  const user = await requireCoach();
  const parsed = cellSchema.safeParse({ playerId, position, role });
  if (!parsed.success) return { ok: false };
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return { ok: false };

  if (parsed.data.role === null) {
    await db
      .delete(tables.positionRoles)
      .where(
        and(
          eq(tables.positionRoles.seasonId, season.id),
          eq(tables.positionRoles.playerId, parsed.data.playerId),
          eq(tables.positionRoles.position, parsed.data.position),
        ),
      );
  } else {
    await db
      .insert(tables.positionRoles)
      .values({
        seasonId: season.id,
        playerId: parsed.data.playerId,
        position: parsed.data.position,
        role: parsed.data.role,
        updatedBy: initialsOf(user.displayName),
      })
      .onConflictDoUpdate({
        target: [
          tables.positionRoles.seasonId,
          tables.positionRoles.playerId,
          tables.positionRoles.position,
        ],
        set: {
          role: parsed.data.role,
          updatedBy: initialsOf(user.displayName),
          updatedAt: new Date(),
        },
      });
  }
  revalidatePath("/depth");
  revalidatePath("/games");
  return { ok: true };
}
