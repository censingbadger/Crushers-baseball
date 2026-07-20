"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { detectGcKind, parseGameChangerCsv, type GcKind } from "@/lib/importers/gamechanger";
import { parseIpToOuts } from "@/lib/stats";
import type { ImportResult } from "@/app/import/actions";

const GC_LABEL = "GameChanger season totals";

async function activeSeason() {
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  return { db, season: season ?? null };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type GcLines = ReturnType<typeof parseGameChangerCsv>["lines"];

/** Write one kind's season snapshot: replaceable, one GC stat game. */
async function writeGcSnapshot(
  db: Awaited<ReturnType<typeof getDb>>,
  seasonId: string,
  kind: GcKind,
  lines: GcLines,
): Promise<string> {
  // One replaceable snapshot game holds the GC season totals.
  let [gcGame] = await db
    .select()
    .from(tables.statGames)
    .where(
      and(eq(tables.statGames.seasonId, seasonId), eq(tables.statGames.source, "gc")),
    )
    .limit(1);
  if (!gcGame) {
    [gcGame] = await db
      .insert(tables.statGames)
      .values({
        seasonId,
        source: "gc",
        label: GC_LABEL,
        gameDate: todayIso(),
      })
      .returning();
  }

  if (kind === "batting") {
    await db
      .delete(tables.battingLines)
      .where(eq(tables.battingLines.statGameId, gcGame.id));
    for (const line of lines) {
      await db.insert(tables.battingLines).values({
        statGameId: gcGame.id,
        playerId: line.playerId!,
        ab: line.stats.ab ?? 0,
        r: line.stats.r ?? 0,
        h: line.stats.h ?? 0,
        doubles: line.stats.doubles ?? 0,
        triples: line.stats.triples ?? 0,
        hr: line.stats.hr ?? 0,
        rbi: line.stats.rbi ?? 0,
        bb: line.stats.bb ?? 0,
        k: line.stats.k ?? 0,
        sb: line.stats.sb ?? 0,
        hbp: line.stats.hbp ?? 0,
        sf: line.stats.sf ?? 0,
      });
    }
  } else if (kind === "pitching") {
    await db
      .delete(tables.pitchingLines)
      .where(eq(tables.pitchingLines.statGameId, gcGame.id));
    for (const line of lines) {
      await db.insert(tables.pitchingLines).values({
        statGameId: gcGame.id,
        playerId: line.playerId!,
        outs: line.stats.outs ?? 0,
        bf: line.stats.bf ?? 0,
        pitches: line.stats.pitches ?? 0,
        h: line.stats.h ?? 0,
        r: line.stats.r ?? 0,
        er: line.stats.er ?? 0,
        bb: line.stats.bb ?? 0,
        k: line.stats.k ?? 0,
      });
    }
  } else if (kind === "fielding") {
    await db
      .delete(tables.fieldingLines)
      .where(eq(tables.fieldingLines.statGameId, gcGame.id));
    for (const line of lines) {
      await db.insert(tables.fieldingLines).values({
        statGameId: gcGame.id,
        playerId: line.playerId!,
        po: line.stats.po ?? 0,
        a: line.stats.a ?? 0,
        e: line.stats.e ?? 0,
        dp: line.stats.dp ?? 0,
      });
    }
  } else {
    await db
      .delete(tables.catchingLines)
      .where(eq(tables.catchingLines.statGameId, gcGame.id));
    for (const line of lines) {
      await db.insert(tables.catchingLines).values({
        statGameId: gcGame.id,
        playerId: line.playerId!,
        outs: line.stats.outs ?? 0,
        pb: line.stats.pb ?? 0,
        sbAllowed: line.stats.sbAllowed ?? 0,
        cs: line.stats.cs ?? 0,
      });
    }
  }

  return `${lines.length} ${kind} lines imported into "${GC_LABEL}" (re-importing replaces them).`;
}

/**
 * The drop-zone portal: any mix of GameChanger CSVs at once. Each file is
 * parsed both ways and lands as whichever kind actually matches its
 * headers — the coach never has to know which export is which.
 */
export async function importGcAuto(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { ok: false, summary: [], warnings: ["Drop at least one GameChanger CSV."] };
  }
  const { db, season } = await activeSeason();
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season."] };
  }
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);

  const summary: string[] = [];
  const warnings: string[] = [];
  let imported = 0;
  for (const file of files) {
    const text = await file.text();
    const kind: GcKind | null = detectGcKind(text);
    if (!kind) {
      warnings.push(
        `${file.name}: couldn't tell if this is a batting or pitching export — headers didn't match either.`,
      );
      continue;
    }
    const parsed = parseGameChangerCsv(text, kind, roster);
    if (parsed.lines.length === 0) {
      warnings.push(`${file.name}: recognized as ${kind} but no roster rows matched.`);
      warnings.push(...parsed.warnings);
      continue;
    }
    const line = await writeGcSnapshot(db, season.id, kind, parsed.lines);
    summary.push(`${file.name}: ${line}`);
    warnings.push(...parsed.warnings);
    imported++;
  }
  if (imported > 0) revalidatePath("/stats");
  return { ok: imported > 0, summary, warnings };
}

const createGameSchema = z.object({
  label: z.string().trim().min(1).max(80),
  opponent: z.string().trim().max(80).optional(),
  gameDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createStatGame(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = createGameSchema.safeParse({
    label: formData.get("label"),
    opponent: formData.get("opponent") || undefined,
    gameDate: formData.get("gameDate"),
  });
  if (!parsed.success) redirect("/stats?error=1");
  const { db, season } = await activeSeason();
  if (!season) redirect("/stats?error=1");
  const [game] = await db
    .insert(tables.statGames)
    .values({
      seasonId: season.id,
      source: "manual",
      label: parsed.data.label,
      opponent: parsed.data.opponent || null,
      gameDate: parsed.data.gameDate,
    })
    .returning();
  revalidatePath("/stats");
  redirect(`/stats/game/${game.id}`);
}

function intField(formData: FormData, name: string): number {
  const n = Number(String(formData.get(name) ?? "").trim());
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function saveStatLines(formData: FormData): Promise<void> {
  await requireCoach();
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return;
  const db = await getDb();
  const playerIds = formData.getAll("playerId").map(String);

  for (const pid of playerIds) {
    const batting = {
      ab: intField(formData, `ab_${pid}`),
      r: intField(formData, `r_${pid}`),
      h: intField(formData, `h_${pid}`),
      doubles: intField(formData, `doubles_${pid}`),
      triples: intField(formData, `triples_${pid}`),
      hr: intField(formData, `hr_${pid}`),
      rbi: intField(formData, `rbi_${pid}`),
      bb: intField(formData, `bb_${pid}`),
      k: intField(formData, `k_${pid}`),
      sb: intField(formData, `sb_${pid}`),
      hbp: intField(formData, `hbp_${pid}`),
      sf: intField(formData, `sf_${pid}`),
    };
    const hasBatting = Object.values(batting).some((v) => v > 0);
    const [existingB] = await db
      .select({ id: tables.battingLines.id })
      .from(tables.battingLines)
      .where(
        and(
          eq(tables.battingLines.statGameId, gameId),
          eq(tables.battingLines.playerId, pid),
        ),
      )
      .limit(1);
    if (hasBatting) {
      if (existingB) {
        await db
          .update(tables.battingLines)
          .set(batting)
          .where(eq(tables.battingLines.id, existingB.id));
      } else {
        await db
          .insert(tables.battingLines)
          .values({ statGameId: gameId, playerId: pid, ...batting });
      }
    } else if (existingB) {
      await db.delete(tables.battingLines).where(eq(tables.battingLines.id, existingB.id));
    }

    const outs = parseIpToOuts(String(formData.get(`ip_${pid}`) ?? "")) ?? 0;
    const pitching = {
      outs,
      bf: intField(formData, `bf_${pid}`),
      pitches: intField(formData, `pitches_${pid}`),
      h: intField(formData, `ph_${pid}`),
      r: intField(formData, `pr_${pid}`),
      er: intField(formData, `er_${pid}`),
      bb: intField(formData, `pbb_${pid}`),
      k: intField(formData, `pk_${pid}`),
    };
    const hasPitching = Object.values(pitching).some((v) => v > 0);
    const [existingP] = await db
      .select({ id: tables.pitchingLines.id })
      .from(tables.pitchingLines)
      .where(
        and(
          eq(tables.pitchingLines.statGameId, gameId),
          eq(tables.pitchingLines.playerId, pid),
        ),
      )
      .limit(1);
    if (hasPitching) {
      if (existingP) {
        await db
          .update(tables.pitchingLines)
          .set(pitching)
          .where(eq(tables.pitchingLines.id, existingP.id));
      } else {
        await db
          .insert(tables.pitchingLines)
          .values({ statGameId: gameId, playerId: pid, ...pitching });
      }
    } else if (existingP) {
      await db
        .delete(tables.pitchingLines)
        .where(eq(tables.pitchingLines.id, existingP.id));
    }
  }
  revalidatePath("/stats");
  revalidatePath(`/stats/game/${gameId}`);
  redirect(`/stats/game/${gameId}?saved=1`);
}

export async function deleteStatGame(formData: FormData): Promise<void> {
  await requireCoach();
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return;
  const db = await getDb();
  await db.delete(tables.battingLines).where(eq(tables.battingLines.statGameId, gameId));
  await db
    .delete(tables.pitchingLines)
    .where(eq(tables.pitchingLines.statGameId, gameId));
  await db.delete(tables.statGames).where(eq(tables.statGames.id, gameId));
  revalidatePath("/stats");
  redirect("/stats");
}
