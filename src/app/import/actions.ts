"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { parseRosterCsv } from "@/lib/importers/roster";
import {
  matchPlayerByName,
  parseAvailabilityGridCsv,
} from "@/lib/importers/grid";

export interface ImportResult {
  ok: boolean;
  summary: string[];
  warnings: string[];
  credentials?: { email: string; tempPassword: string }[];
}

async function readCsv(formData: FormData): Promise<string | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return file.text();
}

function tempPassword(): string {
  return randomBytes(5).toString("base64url").replace(/[-_]/g, "x");
}

async function activeSeasonOrNull() {
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  return season ?? null;
}

export async function importRoster(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };

  const db = await getDb();
  const season = await activeSeasonOrNull();
  const [team] = await db.select().from(tables.teams).limit(1);
  if (!season || !team) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }

  const { rows, warnings } = parseRosterCsv(csv, season.year);
  let playersCreated = 0;
  let playersMatched = 0;
  let guardiansCreated = 0;
  let accountsCreated = 0;
  const credentials: { email: string; tempPassword: string }[] = [];

  for (const row of rows) {
    // Match existing player by name (case-insensitive) within the team.
    const existing = await db
      .select()
      .from(tables.players)
      .where(eq(tables.players.teamId, team.id));
    const match = existing.find(
      (p) =>
        p.firstName.trim().toLowerCase() === row.firstName.trim().toLowerCase() &&
        p.lastName.trim().toLowerCase() === row.lastName.trim().toLowerCase(),
    );
    let playerId: string;
    if (match) {
      playerId = match.id;
      playersMatched++;
      await db
        .update(tables.players)
        .set({
          birthdate: row.birthdate ?? match.birthdate,
          school: row.school ?? match.school,
        })
        .where(eq(tables.players.id, playerId));
    } else {
      const [created] = await db
        .insert(tables.players)
        .values({
          teamId: team.id,
          firstName: row.firstName,
          lastName: row.lastName,
          birthdate: row.birthdate,
          school: row.school,
        })
        .returning();
      playerId = created.id;
      playersCreated++;
    }

    const [entry] = await db
      .select()
      .from(tables.rosterEntries)
      .where(
        and(
          eq(tables.rosterEntries.seasonId, season.id),
          eq(tables.rosterEntries.playerId, playerId),
        ),
      )
      .limit(1);
    if (entry) {
      await db
        .update(tables.rosterEntries)
        .set({ jerseyNumber: row.jerseyNumber ?? entry.jerseyNumber })
        .where(eq(tables.rosterEntries.id, entry.id));
    } else {
      await db.insert(tables.rosterEntries).values({
        seasonId: season.id,
        playerId,
        jerseyNumber: row.jerseyNumber,
        status: "full",
      });
    }

    for (const g of row.guardians) {
      // Dedupe guardians by email when present, else by name.
      const guardianRows = await db
        .select()
        .from(tables.guardians)
        .where(eq(tables.guardians.teamId, team.id));
      let guardian = g.email
        ? guardianRows.find((x) => x.email?.toLowerCase() === g.email)
        : guardianRows.find(
            (x) =>
              x.firstName.toLowerCase() === g.firstName.toLowerCase() &&
              x.lastName.toLowerCase() === g.lastName.toLowerCase(),
          );
      if (!guardian) {
        [guardian] = await db
          .insert(tables.guardians)
          .values({
            teamId: team.id,
            firstName: g.firstName,
            lastName: g.lastName,
            email: g.email,
            phone: g.phone,
          })
          .returning();
        guardiansCreated++;
      }
      const [link] = await db
        .select()
        .from(tables.playerGuardians)
        .where(
          and(
            eq(tables.playerGuardians.playerId, playerId),
            eq(tables.playerGuardians.guardianId, guardian.id),
          ),
        )
        .limit(1);
      if (!link) {
        await db.insert(tables.playerGuardians).values({
          playerId,
          guardianId: guardian.id,
        });
      }

      if (g.email) {
        const [existingUser] = await db
          .select()
          .from(tables.users)
          .where(eq(tables.users.email, g.email))
          .limit(1);
        if (!existingUser) {
          const pw = tempPassword();
          await db.insert(tables.users).values({
            email: g.email,
            passwordHash: bcrypt.hashSync(pw, 10),
            displayName: `${g.firstName} ${g.lastName}`.trim(),
            role: "parent",
            guardianId: guardian.id,
          });
          accountsCreated++;
          credentials.push({ email: g.email, tempPassword: pw });
        }
      }
    }
  }

  revalidatePath("/roster");
  revalidatePath("/");
  return {
    ok: true,
    summary: [
      `${playersCreated} players created, ${playersMatched} already existed.`,
      `${guardiansCreated} guardians added.`,
      `${accountsCreated} parent accounts created (temp passwords below — share them once).`,
    ],
    warnings,
    credentials,
  };
}

export async function importPracticeGrid(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };

  const db = await getDb();
  const season = await activeSeasonOrNull();
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }

  const { columns, players, warnings } = parseAvailabilityGridCsv(csv, season.year);
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);

  let eventsCreated = 0;
  let rsvpsWritten = 0;
  const eventIdByColumn = new Map<number, string>();

  for (const col of columns) {
    if (!col.startsAt) {
      warnings.push(`Column ${col.isoDate} has no time — skipped event creation.`);
      continue;
    }
    const existing = await db
      .select()
      .from(tables.events)
      .where(
        and(
          eq(tables.events.seasonId, season.id),
          eq(tables.events.type, "practice"),
          eq(tables.events.startsAt, col.startsAt),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      eventIdByColumn.set(col.index, existing[0].id);
    } else {
      const [created] = await db
        .insert(tables.events)
        .values({
          seasonId: season.id,
          type: "practice",
          startsAt: col.startsAt,
          endsAt: col.endsAt,
          location: col.location,
        })
        .returning();
      eventIdByColumn.set(col.index, created.id);
      eventsCreated++;
    }
  }

  for (const row of players) {
    const playerId = matchPlayerByName(row.name, roster);
    if (!playerId) {
      warnings.push(`No roster match for "${row.name}" — row skipped.`);
      continue;
    }
    for (let i = 0; i < columns.length; i++) {
      const answer = row.answers[i];
      const eventId = eventIdByColumn.get(columns[i].index);
      if (!answer || !eventId) continue;
      const [existing] = await db
        .select({ id: tables.rsvps.id })
        .from(tables.rsvps)
        .where(
          and(eq(tables.rsvps.eventId, eventId), eq(tables.rsvps.playerId, playerId)),
        )
        .limit(1);
      if (existing) {
        await db
          .update(tables.rsvps)
          .set({ status: answer, updatedAt: new Date() })
          .where(eq(tables.rsvps.id, existing.id));
      } else {
        await db.insert(tables.rsvps).values({
          eventId,
          playerId,
          status: answer,
        });
      }
      rsvpsWritten++;
    }
  }

  revalidatePath("/schedule");
  revalidatePath("/availability");
  revalidatePath("/");
  return {
    ok: true,
    summary: [
      `${eventsCreated} practice events created (${columns.length} columns found).`,
      `${rsvpsWritten} RSVPs imported for ${players.length} players.`,
      "Parent helper signups aren't imported — add them on each event's page.",
    ],
    warnings,
  };
}

export async function importTournamentGrid(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireCoach();
  const csv = await readCsv(formData);
  if (!csv) return { ok: false, summary: [], warnings: ["Choose a CSV file first."] };

  const db = await getDb();
  const season = await activeSeasonOrNull();
  if (!season) {
    return { ok: false, summary: [], warnings: ["No active season — seed the app first."] };
  }

  const { columns, players, warnings } = parseAvailabilityGridCsv(csv, season.year);
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);

  let written = 0;
  for (const row of players) {
    const playerId = matchPlayerByName(row.name, roster);
    if (!playerId) {
      warnings.push(`No roster match for "${row.name}" — row skipped.`);
      continue;
    }
    for (let i = 0; i < columns.length; i++) {
      const answer = row.answers[i];
      if (!answer) continue;
      const day = columns[i].isoDate;
      const [existing] = await db
        .select({ id: tables.availabilityDays.id })
        .from(tables.availabilityDays)
        .where(
          and(
            eq(tables.availabilityDays.seasonId, season.id),
            eq(tables.availabilityDays.playerId, playerId),
            eq(tables.availabilityDays.day, day),
          ),
        )
        .limit(1);
      if (existing) {
        await db
          .update(tables.availabilityDays)
          .set({ status: answer, updatedAt: new Date() })
          .where(eq(tables.availabilityDays.id, existing.id));
      } else {
        await db.insert(tables.availabilityDays).values({
          seasonId: season.id,
          playerId,
          day,
          status: answer,
        });
      }
      written++;
    }
  }

  revalidatePath("/availability");
  return {
    ok: true,
    summary: [
      `${written} availability answers imported across ${columns.length} dates.`,
    ],
    warnings,
  };
}
