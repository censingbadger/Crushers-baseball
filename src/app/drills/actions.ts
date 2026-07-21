"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { STARTER_DRILLS } from "@/lib/drills";

const drillSchema = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum([
    "hitting",
    "fielding",
    "throwing",
    "pitching",
    "speed",
    "mental",
    "fun",
  ]),
  minutes: z.coerce.number().int().min(1).max(60),
  cue: z.string().trim().min(1).max(200),
  description: z.string().trim().max(600).optional(),
});

export async function addDrill(formData: FormData): Promise<void> {
  const coach = await requireCoach();
  const parsed = drillSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    minutes: formData.get("minutes"),
    cue: formData.get("cue"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return;
  const db = await getDb();
  await db.insert(tables.drills).values({
    ...parsed.data,
    description: parsed.data.description ?? null,
    createdByUserId: coach.id,
  });
  revalidatePath("/drills");
}

export async function toggleDrill(formData: FormData): Promise<void> {
  await requireCoach();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = await getDb();
  const [drill] = await db
    .select({ active: tables.drills.active })
    .from(tables.drills)
    .where(eq(tables.drills.id, id))
    .limit(1);
  if (!drill) return;
  await db
    .update(tables.drills)
    .set({ active: !drill.active })
    .where(eq(tables.drills.id, id));
  revalidatePath("/drills");
}

/** One-click load of the curated starter set (skips titles already present). */
export async function loadStarterDrills(): Promise<void> {
  const coach = await requireCoach();
  const db = await getDb();
  const existing = await db
    .select({ title: tables.drills.title })
    .from(tables.drills);
  const have = new Set(existing.map((d) => d.title));
  for (const drill of STARTER_DRILLS) {
    if (have.has(drill.title)) continue;
    await db.insert(tables.drills).values({
      ...drill,
      createdByUserId: coach.id,
    });
  }
  revalidatePath("/drills");
  revalidatePath("/players");
}
