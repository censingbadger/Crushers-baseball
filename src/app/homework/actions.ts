"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { initialsOf } from "@/lib/format";
import { drillByKey } from "@/lib/homework";
import type { BarsKey } from "@/lib/bars";

export async function assignHomework(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const seasonId = String(formData.get("seasonId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const drillKey = String(formData.get("drillKey") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 300);
  const drill = drillByKey(drillKey);
  if (!seasonId || !playerId || !drill) return;

  const db = await getDb();
  // One open assignment per player+drill — assigning twice is a no-op.
  const [open] = await db
    .select({ id: tables.homeworkAssignments.id })
    .from(tables.homeworkAssignments)
    .where(
      and(
        eq(tables.homeworkAssignments.seasonId, seasonId),
        eq(tables.homeworkAssignments.playerId, playerId),
        eq(tables.homeworkAssignments.drillKey, drillKey),
        eq(tables.homeworkAssignments.status, "assigned"),
      ),
    )
    .limit(1);
  if (open) return;

  await db.insert(tables.homeworkAssignments).values({
    seasonId,
    playerId,
    dimension: drill.dimension as BarsKey,
    drillKey,
    note: note || null,
    assignedBy: initialsOf(user.displayName),
    createdByUserId: user.id,
  });
  revalidatePath("/homework");
}

export async function toggleHomework(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(tables.homeworkAssignments)
    .where(eq(tables.homeworkAssignments.id, id))
    .limit(1);
  if (!row) return;
  const done = row.status === "assigned";
  await db
    .update(tables.homeworkAssignments)
    .set({ status: done ? "done" : "assigned", completedAt: done ? new Date() : null })
    .where(eq(tables.homeworkAssignments.id, id));
  revalidatePath("/homework");
}

export async function removeHomework(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  await db
    .delete(tables.homeworkAssignments)
    .where(eq(tables.homeworkAssignments.id, id));
  revalidatePath("/homework");
}
