"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, tables } from "@/db";
import {
  encodeSession,
  SESSION_COOKIE,
  SESSION_TTL_MS,
} from "@/lib/session";

export async function issueSession(userId: string, epoch = 0): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession({
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    epoch,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?error=missing");

  const db = await getDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.email, email))
    .limit(1);
  if (!user?.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    redirect("/login?error=invalid");
  }

  await issueSession(user.id, user.sessionEpoch);
  redirect("/");
}

/**
 * First-run bootstrap: on a brand-new deployment the database has no
 * users, so the login page offers to create the founding coach account.
 * Server-guarded — the moment any user exists, this action refuses.
 */
export async function createFirstCoach(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!name || !email.includes("@") || password.length < 8) {
    redirect("/login?error=setup");
  }

  const db = await getDb();
  const existing = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .limit(1);
  if (existing.length > 0) redirect("/login");

  const [user] = await db
    .insert(tables.users)
    .values({
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      displayName: name,
      role: "coach",
    })
    .returning({ id: tables.users.id });

  await issueSession(user.id);
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
