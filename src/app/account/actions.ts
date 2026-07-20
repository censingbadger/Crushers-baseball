"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import { issueSession } from "@/app/auth-actions";

export async function changeOwnPassword(formData: FormData): Promise<void> {
  const user = await requireUser();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8 || next !== confirm) {
    redirect("/account?error=password");
  }
  const db = await getDb();
  const [row] = await db
    .select({ passwordHash: tables.users.passwordHash })
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .limit(1);
  if (!row?.passwordHash || !bcrypt.compareSync(current, row.passwordHash)) {
    redirect("/account?error=current");
  }
  // Bumping the epoch kills every other session for this account; the
  // fresh cookie keeps the person who changed the password signed in.
  const [updated] = await db
    .update(tables.users)
    .set({
      passwordHash: bcrypt.hashSync(next, 10),
      sessionEpoch: sql`${tables.users.sessionEpoch} + 1`,
    })
    .where(eq(tables.users.id, user.id))
    .returning({ sessionEpoch: tables.users.sessionEpoch });
  await issueSession(user.id, updated.sessionEpoch);
  redirect("/account?saved=password");
}

export async function changeOwnEmail(formData: FormData): Promise<void> {
  const user = await requireUser();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const current = String(formData.get("current") ?? "");
  if (!email.includes("@")) redirect("/account?error=email");
  const db = await getDb();
  const [row] = await db
    .select({ passwordHash: tables.users.passwordHash })
    .from(tables.users)
    .where(eq(tables.users.id, user.id))
    .limit(1);
  if (!row?.passwordHash || !bcrypt.compareSync(current, row.passwordHash)) {
    redirect("/account?error=current");
  }
  const [taken] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  if (taken && taken.id !== user.id) redirect("/account?error=email");
  await db
    .update(tables.users)
    .set({ email })
    .where(eq(tables.users.id, user.id));
  redirect("/account?saved=email");
}

/**
 * Families keep their own player's details current — name, birthday,
 * school, handedness, and the emergency/medical info they are the source
 * of. Guarded by the same ownership rule as everything else.
 */
export async function updateOwnPlayer(formData: FormData): Promise<void> {
  const user = await requireUser();
  const playerId = String(formData.get("playerId") ?? "");
  const allowed = await editablePlayerIds(user);
  if (!playerId || !allowed.includes(playerId)) redirect("/account");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  if (!firstName || !lastName) redirect("/account?error=player");
  const str = (key: string) => String(formData.get(key) ?? "").trim() || null;
  const db = await getDb();
  await db
    .update(tables.players)
    .set({
      firstName,
      lastName,
      birthdate: str("birthdate"),
      school: str("school"),
      bats: str("bats"),
      throws: str("throws"),
      emergencyContact: str("emergencyContact"),
      medicalNotes: str("medicalNotes"),
    })
    .where(eq(tables.players.id, playerId));
  revalidatePath("/account");
  revalidatePath("/roster");
  redirect("/account?saved=player");
}
