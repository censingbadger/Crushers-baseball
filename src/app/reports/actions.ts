"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { draftReport, gatherReportContext } from "@/lib/reports";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function generateReport(formData: FormData): Promise<void> {
  const coach = await requireCoach();
  const playerId = String(formData.get("playerId") ?? "");
  const month = String(formData.get("month") ?? "");
  if (!playerId || !MONTH_RE.test(month)) redirect("/reports");

  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) redirect("/reports");

  const [existing] = await db
    .select()
    .from(tables.reports)
    .where(
      and(
        eq(tables.reports.seasonId, season.id),
        eq(tables.reports.playerId, playerId),
        eq(tables.reports.month, month),
      ),
    )
    .limit(1);
  // Published reports are what families already saw — regenerating them
  // must go through an explicit unpublish first.
  if (existing?.status === "published") redirect(`/reports/${existing.id}`);

  const ctx = await gatherReportContext(season.id, playerId, month);
  if (!ctx) redirect("/reports");

  let text: string;
  let draftedBy: string;
  try {
    ({ text, draftedBy } = await draftReport(ctx));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "draft failed";
    redirect(`/reports?month=${month}&error=${encodeURIComponent(msg)}`);
  }

  let reportId: string;
  if (existing) {
    await db
      .update(tables.reports)
      .set({ draftText: text, finalText: null, draftedBy, updatedAt: new Date() })
      .where(eq(tables.reports.id, existing.id));
    reportId = existing.id;
  } else {
    const [inserted] = await db
      .insert(tables.reports)
      .values({
        seasonId: season.id,
        playerId,
        month,
        draftText: text,
        draftedBy,
        createdByUserId: coach.id,
      })
      .returning({ id: tables.reports.id });
    reportId = inserted.id;
  }
  revalidatePath("/reports");
  redirect(`/reports/${reportId}`);
}

export async function saveReportText(formData: FormData): Promise<void> {
  await requireCoach();
  const reportId = String(formData.get("reportId") ?? "");
  const finalText = String(formData.get("finalText") ?? "").trim();
  if (!reportId || !finalText) redirect("/reports");
  const db = await getDb();
  await db
    .update(tables.reports)
    .set({ finalText, updatedAt: new Date() })
    .where(eq(tables.reports.id, reportId));
  revalidatePath(`/reports/${reportId}`);
  redirect(`/reports/${reportId}?saved=1`);
}

export async function publishReport(formData: FormData): Promise<void> {
  const coach = await requireCoach();
  const reportId = String(formData.get("reportId") ?? "");
  // Publishing uses exactly what is in the form so the coach approves the
  // text they are looking at, edits included.
  const finalText = String(formData.get("finalText") ?? "").trim();
  if (!reportId || !finalText) redirect("/reports");
  const db = await getDb();
  await db
    .update(tables.reports)
    .set({
      finalText,
      status: "published",
      approvedByUserId: coach.id,
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tables.reports.id, reportId));
  revalidatePath("/reports");
  revalidatePath("/progress");
  redirect(`/reports/${reportId}?published=1`);
}

export async function unpublishReport(formData: FormData): Promise<void> {
  await requireCoach();
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) redirect("/reports");
  const db = await getDb();
  await db
    .update(tables.reports)
    .set({
      status: "draft",
      approvedByUserId: null,
      publishedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(tables.reports.id, reportId));
  revalidatePath("/reports");
  revalidatePath("/progress");
  redirect(`/reports/${reportId}`);
}

export async function deleteReport(formData: FormData): Promise<void> {
  await requireCoach();
  const reportId = String(formData.get("reportId") ?? "");
  if (!reportId) redirect("/reports");
  const db = await getDb();
  const [report] = await db
    .select({ month: tables.reports.month })
    .from(tables.reports)
    .where(eq(tables.reports.id, reportId))
    .limit(1);
  await db.delete(tables.reports).where(eq(tables.reports.id, reportId));
  revalidatePath("/reports");
  revalidatePath("/progress");
  redirect(`/reports?month=${report?.month ?? ""}`);
}
