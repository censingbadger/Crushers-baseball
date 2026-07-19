"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireCoach, requireUser } from "@/lib/auth";

const createEventSchema = z.object({
  type: z.enum(["practice", "game", "tournament"]),
  title: z.string().trim().max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional()
    .or(z.literal("")),
  location: z.string().trim().max(200).optional(),
  opponent: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function localDate(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export async function createEvent(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = createEventSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title") || undefined,
    date: formData.get("date"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime") || undefined,
    location: formData.get("location") || undefined,
    opponent: formData.get("opponent") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) redirect("/schedule/new?error=1");
  const input = parsed.data;

  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) redirect("/schedule?error=no-season");

  await db.insert(tables.events).values({
    seasonId: season.id,
    type: input.type,
    title: input.title || null,
    startsAt: localDate(input.date, input.startTime),
    endsAt: input.endTime ? localDate(input.date, input.endTime) : null,
    location: input.location || null,
    opponent: input.opponent || null,
    notes: input.notes || null,
  });
  revalidatePath("/schedule");
  redirect("/schedule");
}

const rsvpSchema = z.object({
  eventId: z.string().uuid(),
  playerId: z.string().uuid(),
  status: z.enum(["yes", "no", "maybe"]),
});

export async function setRsvp(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = rsvpSchema.safeParse({
    eventId: formData.get("eventId"),
    playerId: formData.get("playerId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return;
  const { eventId, playerId, status } = parsed.data;

  const allowed = await editablePlayerIds(user);
  if (!allowed.includes(playerId)) return;

  const db = await getDb();
  const existing = await db
    .select({ id: tables.rsvps.id })
    .from(tables.rsvps)
    .where(
      and(eq(tables.rsvps.eventId, eventId), eq(tables.rsvps.playerId, playerId)),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(tables.rsvps)
      .set({ status, updatedByUserId: user.id, updatedAt: new Date() })
      .where(eq(tables.rsvps.id, existing[0].id));
  } else {
    await db.insert(tables.rsvps).values({
      eventId,
      playerId,
      status,
      updatedByUserId: user.id,
    });
  }
  revalidatePath(`/schedule/${eventId}`);
  revalidatePath("/schedule");
  revalidatePath("/availability");
  revalidatePath("/");
}

/**
 * Grid-cell variant of setRsvp: the availability grid shares one form and
 * each button carries "eventId|playerId|status".
 */
export async function setRsvpCell(formData: FormData): Promise<void> {
  const raw = String(formData.get("cell") ?? "");
  const [eventId, playerId, status] = raw.split("|");
  const fd = new FormData();
  fd.set("eventId", eventId ?? "");
  fd.set("playerId", playerId ?? "");
  fd.set("status", status ?? "");
  return setRsvp(fd);
}

const signupSchema = z.object({
  eventId: z.string().uuid(),
  kind: z.enum(["helper", "snacks", "drinks"]),
  guardianName: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).optional(),
});

export async function addSignup(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = signupSchema.safeParse({
    eventId: formData.get("eventId"),
    kind: formData.get("kind"),
    guardianName: formData.get("guardianName"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return;
  const db = await getDb();
  await db.insert(tables.signups).values({
    eventId: parsed.data.eventId,
    kind: parsed.data.kind,
    guardianName: parsed.data.guardianName,
    note: parsed.data.note ?? null,
    createdByUserId: user.id,
  });
  revalidatePath(`/schedule/${parsed.data.eventId}`);
}

export async function removeSignup(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(tables.signups)
    .where(eq(tables.signups.id, id))
    .limit(1);
  if (!row) return;
  if (user.role !== "coach" && row.createdByUserId !== user.id) return;
  await db.delete(tables.signups).where(eq(tables.signups.id, id));
  revalidatePath(`/schedule/${row.eventId}`);
}
