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

  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession({
    userId: user.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  redirect("/");
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect("/login");
}
