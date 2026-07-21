"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach, type CurrentUser } from "@/lib/auth";
import { getPositionRoles, getRoster } from "@/lib/data";
import { initialsOf } from "@/lib/format";
import { barsSummary, type BarsKey } from "@/lib/bars";
import { drillByKey, suggestForPlayer } from "@/lib/homework";

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

/** Everything the suggesters need about a season, loaded once. */
async function seasonContext(seasonId: string) {
  const db = await getDb();
  const [roster, roleRows, barsRows, open] = await Promise.all([
    getRoster(seasonId),
    getPositionRoles(seasonId),
    db
      .select()
      .from(tables.barsRatings)
      .where(eq(tables.barsRatings.seasonId, seasonId)),
    db
      .select()
      .from(tables.homeworkAssignments)
      .where(
        and(
          eq(tables.homeworkAssignments.seasonId, seasonId),
          eq(tables.homeworkAssignments.status, "assigned"),
        ),
      ),
  ]);
  const summary = barsSummary(barsRows);
  const roleFlags = new Map<string, { pitcher: boolean; catcher: boolean }>();
  const positionsByPlayer = new Map<string, string[]>();
  for (const r of roleRows) {
    if (!["primary", "secondary", "develop"].includes(r.role)) continue;
    const f = roleFlags.get(r.playerId) ?? { pitcher: false, catcher: false };
    if (r.position === "P") f.pitcher = true;
    if (r.position === "C") f.catcher = true;
    roleFlags.set(r.playerId, f);
    if (r.role !== "develop") {
      const list = positionsByPlayer.get(r.playerId) ?? [];
      list.push(r.position);
      positionsByPlayer.set(r.playerId, list);
    }
  }
  const openKeysByPlayer = new Map<string, Set<string>>();
  for (const a of open) {
    const set = openKeysByPlayer.get(a.playerId) ?? new Set<string>();
    set.add(a.drillKey);
    openKeysByPlayer.set(a.playerId, set);
  }
  return { roster, summary, roleFlags, positionsByPlayer, openKeysByPlayer };
}

async function insertSuggestions(
  seasonId: string,
  playerId: string,
  ctx: Awaited<ReturnType<typeof seasonContext>>,
  user: CurrentUser,
  maxSuggestions: number,
): Promise<number> {
  const db = await getDb();
  const suggestions = suggestForPlayer(
    ctx.summary.get(playerId),
    ctx.roleFlags.get(playerId) ?? { pitcher: false, catcher: false },
    ctx.positionsByPlayer.get(playerId) ?? [],
    ctx.openKeysByPlayer.get(playerId) ?? new Set(),
    undefined,
    maxSuggestions,
  );
  for (const s of suggestions) {
    await db.insert(tables.homeworkAssignments).values({
      seasonId,
      playerId,
      dimension: s.gap.dimension,
      drillKey: s.drill.key,
      assignedBy: initialsOf(user.displayName),
      createdByUserId: user.id,
    });
  }
  return suggestions.length;
}

/** ⚡ One player: write his top gap-matched drills in one tap. */
export async function autoAssignPlayer(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const seasonId = String(formData.get("seasonId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  if (!seasonId || !playerId) return;
  const ctx = await seasonContext(seasonId);
  await insertSuggestions(seasonId, playerId, ctx, user, 2);
  revalidatePath("/homework");
}

/** ⚡ Whole team: every rated player gets his top suggestion. */
export async function autoAssignTeam(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) return;
  const ctx = await seasonContext(seasonId);
  for (const p of ctx.roster) {
    await insertSuggestions(seasonId, p.playerId, ctx, user, 1);
  }
  revalidatePath("/homework");
}

/**
 * Assign one drill to the whole team (a team-gap theme). Role-module
 * drills only reach the kids who fill the role; open duplicates skip.
 */
export async function assignDrillToTeam(formData: FormData): Promise<void> {
  const user = await requireCoach();
  const seasonId = String(formData.get("seasonId") ?? "");
  const drillKey = String(formData.get("drillKey") ?? "");
  const drill = drillByKey(drillKey);
  if (!seasonId || !drill) return;
  const ctx = await seasonContext(seasonId);
  const db = await getDb();
  for (const p of ctx.roster) {
    if (drill.dimension === "pitching" && !ctx.roleFlags.get(p.playerId)?.pitcher) continue;
    if (drill.dimension === "catching" && !ctx.roleFlags.get(p.playerId)?.catcher) continue;
    if (ctx.openKeysByPlayer.get(p.playerId)?.has(drillKey)) continue;
    await db.insert(tables.homeworkAssignments).values({
      seasonId,
      playerId: p.playerId,
      dimension: drill.dimension,
      drillKey,
      assignedBy: initialsOf(user.displayName),
      createdByUserId: user.id,
    });
  }
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
