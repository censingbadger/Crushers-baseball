import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { decodeSession, SESSION_COOKIE } from "@/lib/session";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: "coach" | "parent";
  guardianId: string | null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const store = await cookies();
  const session = decodeSession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const db = await getDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.id, session.userId))
    .limit(1);
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    guardianId: user.guardianId,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireCoach(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "coach") redirect("/");
  return user;
}

/** Player IDs the current user is allowed to answer RSVPs for. */
export async function editablePlayerIds(user: CurrentUser): Promise<string[]> {
  const db = await getDb();
  if (user.role === "coach") {
    const rows = await db
      .select({ id: tables.players.id })
      .from(tables.players);
    return rows.map((r) => r.id);
  }
  if (!user.guardianId) return [];
  const rows = await db
    .select({ id: tables.playerGuardians.playerId })
    .from(tables.playerGuardians)
    .where(eq(tables.playerGuardians.guardianId, user.guardianId));
  return rows.map((r) => r.id);
}
