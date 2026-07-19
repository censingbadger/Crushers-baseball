"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import type { AvatarKind } from "@/db/schema";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import {
  AVATAR_OPTIONS,
  BG_CHOICES,
  BORDER_CHOICES,
  WALLPAPERS,
} from "@/lib/playerpage";

const ids = <T extends { id: string }>(list: readonly T[]) =>
  list.map((x) => x.id) as [string, ...string[]];

const pageSchema = z.object({
  playerId: z.string().uuid(),
  skin: z.enum(ids(AVATAR_OPTIONS.skin)),
  hairStyle: z.enum(ids(AVATAR_OPTIONS.hairStyle)),
  hairColor: z.enum(ids(AVATAR_OPTIONS.hairColor)),
  cap: z.enum(ids(AVATAR_OPTIONS.cap)),
  eyes: z.enum(ids(AVATAR_OPTIONS.eyes)),
  extra: z.enum(ids(AVATAR_OPTIONS.extra)),
  bgColor: z.enum(ids(BG_CHOICES)),
  borderColor: z.enum(ids(BORDER_CHOICES)),
  font: z.enum(["sporty", "classic", "fun"]),
  wallpaper: z.enum(ids(WALLPAPERS)),
});

async function guard(playerId: string) {
  const user = await requireUser();
  const allowed = await editablePlayerIds(user);
  if (!allowed.includes(playerId)) return null;
  return user;
}

export async function savePlayerPage(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = pageSchema.safeParse({
    playerId: formData.get("playerId"),
    skin: formData.get("skin"),
    hairStyle: formData.get("hairStyle"),
    hairColor: formData.get("hairColor"),
    cap: formData.get("cap"),
    eyes: formData.get("eyes"),
    extra: formData.get("extra"),
    bgColor: formData.get("bgColor"),
    borderColor: formData.get("borderColor"),
    font: formData.get("font"),
    wallpaper: formData.get("wallpaper"),
  });
  if (!parsed.success) return { ok: false, error: "Something looked off — try again." };
  const user = await guard(parsed.data.playerId);
  if (!user) return { ok: false, error: "You can only edit your own player's page." };

  // Optional photo — the browser resizes and re-encodes it to a small JPEG
  // data URI before submitting, so any phone photo (HEIC included) works.
  let photoDataUrl: string | null | undefined = undefined;
  const photoField = formData.get("photoDataUrl");
  if (typeof photoField === "string" && photoField.length > 0) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(photoField)) {
      return { ok: false, error: "That photo couldn't be read — try another one." };
    }
    if (photoField.length > 1_400_000) {
      return { ok: false, error: "That photo is too large even after resizing." };
    }
    photoDataUrl = photoField;
  }
  if (formData.get("removePhoto") === "1") photoDataUrl = null;
  // A fresh photo switches the page to photo mode; removing it switches
  // back to the builder. Otherwise the stored kind stands.
  const avatarKind: AvatarKind | undefined =
    photoDataUrl === null ? "builder" : photoDataUrl ? "photo" : undefined;

  const { playerId, bgColor, borderColor, font, wallpaper, ...avatar } = parsed.data;
  const avatarConfig = JSON.stringify(avatar);

  const db = await getDb();
  const [existing] = await db
    .select({ id: tables.playerPages.id })
    .from(tables.playerPages)
    .where(eq(tables.playerPages.playerId, playerId))
    .limit(1);
  const values = {
    avatarConfig,
    bgColor,
    borderColor,
    font,
    wallpaper,
    ...(avatarKind !== undefined ? { avatarKind } : {}),
    ...(photoDataUrl !== undefined ? { photoDataUrl } : {}),
    updatedAt: new Date(),
  };
  if (existing) {
    await db
      .update(tables.playerPages)
      .set(values)
      .where(eq(tables.playerPages.id, existing.id));
  } else {
    await db.insert(tables.playerPages).values({ playerId, ...values });
  }
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  return { ok: true };
}

const segmentSchema = z.object({
  title: z.string().min(1).max(120),
  category: z.enum(["hitting", "fielding", "throwing", "pitching", "speed", "fun"]),
  minutes: z.number().int().min(1).max(120),
  cue: z.string().max(200).optional(),
});

const workoutSchema = z.object({
  playerId: z.string().uuid(),
  totalMinutes: z.number().int().min(1).max(180),
  source: z.enum(["guided", "manual"]),
  note: z.string().max(300).optional(),
  segments: z.array(segmentSchema).max(12).optional(),
});

/** Called by the workout runner on completion, and by the manual log form. */
export async function logWorkout(input: {
  playerId: string;
  totalMinutes: number;
  source: "guided" | "manual";
  note?: string;
  segments?: { title: string; category: string; minutes: number; cue?: string }[];
}): Promise<{ ok: boolean }> {
  const parsed = workoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const user = await guard(parsed.data.playerId);
  if (!user) return { ok: false };

  const db = await getDb();
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await db.insert(tables.workoutLogs).values({
    playerId: parsed.data.playerId,
    day,
    totalMinutes: parsed.data.totalMinutes,
    segments: parsed.data.segments ? JSON.stringify(parsed.data.segments) : null,
    source: parsed.data.source,
    note: parsed.data.note ?? null,
    createdByUserId: user.id,
  });
  revalidatePath(`/players/${parsed.data.playerId}`);
  revalidatePath("/players");
  return { ok: true };
}

export async function logManualWorkout(formData: FormData): Promise<void> {
  const minutes = Number(formData.get("minutes"));
  await logWorkout({
    playerId: String(formData.get("playerId") ?? ""),
    totalMinutes: Number.isFinite(minutes) ? Math.round(minutes) : 0,
    source: "manual",
    note: String(formData.get("note") ?? "").trim() || undefined,
  });
}
