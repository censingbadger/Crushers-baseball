"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { generatePassword } from "@/lib/passwords";

export interface IssuedCredential {
  family: string;
  email: string;
  players: string;
  password: string;
}

/**
 * Create login accounts for every guardian who has an email address but
 * no user yet. Passwords are returned to the coach exactly once — only
 * bcrypt hashes are stored.
 */
export async function generateFamilyLogins(): Promise<IssuedCredential[]> {
  await requireCoach();
  const db = await getDb();

  const guardians = await db
    .select()
    .from(tables.guardians)
    .where(isNotNull(tables.guardians.email));
  const users = await db.select({ email: tables.users.email }).from(tables.users);
  const taken = new Set(users.map((u) => u.email.toLowerCase()));

  const links = guardians.length
    ? await db
        .select({
          guardianId: tables.playerGuardians.guardianId,
          firstName: tables.players.firstName,
          lastName: tables.players.lastName,
        })
        .from(tables.playerGuardians)
        .innerJoin(tables.players, eq(tables.playerGuardians.playerId, tables.players.id))
        .where(inArray(tables.playerGuardians.guardianId, guardians.map((g) => g.id)))
    : [];
  const playersOf = (guardianId: string) =>
    links
      .filter((l) => l.guardianId === guardianId)
      .map((l) => `${l.firstName} ${l.lastName}`)
      .join(", ");

  const issued: IssuedCredential[] = [];
  for (const g of guardians) {
    const email = g.email!.trim().toLowerCase();
    if (!email || taken.has(email)) continue;
    const password = generatePassword();
    await db.insert(tables.users).values({
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      displayName: `${g.firstName} ${g.lastName}`,
      role: "parent",
      guardianId: g.id,
    });
    taken.add(email);
    issued.push({
      family: `${g.firstName} ${g.lastName}`,
      email,
      players: playersOf(g.id),
      password,
    });
  }
  revalidatePath("/families");
  return issued;
}

/** Reset one family's password; the new one is shown to the coach once. */
export async function resetFamilyPassword(userId: string): Promise<IssuedCredential | null> {
  await requireCoach();
  const db = await getDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);
  if (!user || user.role !== "parent") return null;
  const password = generatePassword();
  await db
    .update(tables.users)
    .set({
      passwordHash: bcrypt.hashSync(password, 10),
      sessionEpoch: sql`${tables.users.sessionEpoch} + 1`,
    })
    .where(eq(tables.users.id, userId));
  return {
    family: user.displayName,
    email: user.email,
    players: "",
    password,
  };
}

/**
 * Add a family member by hand: guardian record, optional player link, and
 * a login right away. The password comes back to the coach exactly once.
 */
export async function addFamilyMember(
  formData: FormData,
): Promise<IssuedCredential | null> {
  await requireCoach();
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const playerId = String(formData.get("playerId") ?? "");
  if (!firstName || !lastName || !email.includes("@")) return null;

  const db = await getDb();
  const [team] = await db.select().from(tables.teams).limit(1);
  if (!team) return null;
  const [emailTaken] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  if (emailTaken) return null;

  const [guardian] = await db
    .insert(tables.guardians)
    .values({ teamId: team.id, firstName, lastName, email })
    .returning();
  let players = "";
  if (playerId) {
    const [player] = await db
      .select({ firstName: tables.players.firstName, lastName: tables.players.lastName })
      .from(tables.players)
      .where(eq(tables.players.id, playerId))
      .limit(1);
    if (player) {
      await db
        .insert(tables.playerGuardians)
        .values({ playerId, guardianId: guardian.id });
      players = `${player.firstName} ${player.lastName}`;
    }
  }
  const password = generatePassword();
  await db.insert(tables.users).values({
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    displayName: `${firstName} ${lastName}`,
    role: "parent",
    guardianId: guardian.id,
  });
  revalidatePath("/families");
  return { family: `${firstName} ${lastName}`, email, players, password };
}

/**
 * Revoke a family login without deleting anything: the account keeps its
 * history but can no longer sign in. "Reset password" restores access.
 */
export async function revokeLogin(formData: FormData): Promise<void> {
  await requireCoach();
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return;
  const db = await getDb();
  const [user] = await db
    .select({ role: tables.users.role })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);
  if (!user || user.role !== "parent") return; // coaches can't lock each other out here
  await db
    .update(tables.users)
    .set({
      passwordHash: null,
      sessionEpoch: sql`${tables.users.sessionEpoch} + 1`,
    })
    .where(eq(tables.users.id, userId));
  revalidatePath("/families");
}

/** Remove a guardian entirely — only when they never had a login. */
export async function removeGuardian(formData: FormData): Promise<void> {
  await requireCoach();
  const guardianId = String(formData.get("guardianId") ?? "");
  if (!guardianId) return;
  const db = await getDb();
  const [account] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.guardianId, guardianId))
    .limit(1);
  if (account) return; // has an account — revoke its login instead
  await db
    .delete(tables.playerGuardians)
    .where(eq(tables.playerGuardians.guardianId, guardianId));
  await db.delete(tables.guardians).where(eq(tables.guardians.id, guardianId));
  revalidatePath("/families");
}

/** Link or unlink a guardian and a player (multi-kid families). */
export async function linkGuardianPlayer(formData: FormData): Promise<void> {
  await requireCoach();
  const guardianId = String(formData.get("guardianId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  if (!guardianId || !playerId) return;
  const db = await getDb();
  const [existing] = await db
    .select({ id: tables.playerGuardians.id })
    .from(tables.playerGuardians)
    .where(
      and(
        eq(tables.playerGuardians.guardianId, guardianId),
        eq(tables.playerGuardians.playerId, playerId),
      ),
    )
    .limit(1);
  if (!existing) {
    await db.insert(tables.playerGuardians).values({ guardianId, playerId });
  }
  revalidatePath("/families");
}

export async function unlinkGuardianPlayer(formData: FormData): Promise<void> {
  await requireCoach();
  const guardianId = String(formData.get("guardianId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  if (!guardianId || !playerId) return;
  const db = await getDb();
  await db
    .delete(tables.playerGuardians)
    .where(
      and(
        eq(tables.playerGuardians.guardianId, guardianId),
        eq(tables.playerGuardians.playerId, playerId),
      ),
    );
  revalidatePath("/families");
}

/**
 * Promote a parent to coach or demote a coach to parent. The last
 * remaining coach can never be demoted — someone must hold the keys.
 */
export async function setUserRole(formData: FormData): Promise<void> {
  await requireCoach();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!userId || (role !== "coach" && role !== "parent")) return;
  const db = await getDb();
  const [target] = await db
    .select({ id: tables.users.id, role: tables.users.role })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .limit(1);
  if (!target || target.role === role) return;
  if (target.role === "coach" && role === "parent") {
    const coaches = await db
      .select({ id: tables.users.id })
      .from(tables.users)
      .where(eq(tables.users.role, "coach"));
    if (coaches.length <= 1) return; // never demote the last coach
  }
  await db
    .update(tables.users)
    .set({ role })
    .where(eq(tables.users.id, userId));
  revalidatePath("/families");
}

/** Add another coach account (e.g. the second coach's sheet MB/MC). */
export async function addCoach(formData: FormData): Promise<IssuedCredential | null> {
  await requireCoach();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!name || !email.includes("@")) return null;
  const db = await getDb();
  const [existing] = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  if (existing) return null;
  const password = generatePassword();
  await db.insert(tables.users).values({
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    displayName: name,
    role: "coach",
  });
  revalidatePath("/families");
  return { family: name, email, players: "(coach)", password };
}
