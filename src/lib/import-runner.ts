import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import type { Db } from "@/db";
import * as tables from "@/db/schema";
import { parseRosterCsv } from "@/lib/importers/roster";
import {
  matchPlayerByName,
  parseAvailabilityGridCsv,
} from "@/lib/importers/grid";
import { parseMatrixSheets, type MatrixSheet } from "@/lib/importers/matrix";
import { insertRatingIfChanged } from "@/lib/matrix";

// Core import logic, shared by the coach-facing upload actions and the
// local scripts/import-real.ts runner. No auth here — callers gate access.

export interface RunnerResult {
  summary: string[];
  warnings: string[];
  credentials?: { email: string; tempPassword: string }[];
}

function tempPassword(): string {
  return randomBytes(5).toString("base64url").replace(/[-_]/g, "x");
}

export async function runRosterImport(
  db: Db,
  teamId: string,
  seasonId: string,
  seasonYear: number,
  csv: string,
): Promise<RunnerResult> {
  const { rows, warnings } = parseRosterCsv(csv, seasonYear);
  let playersCreated = 0;
  let playersMatched = 0;
  let guardiansCreated = 0;
  let accountsCreated = 0;
  const credentials: { email: string; tempPassword: string }[] = [];

  for (const row of rows) {
    const existing = await db
      .select()
      .from(tables.players)
      .where(eq(tables.players.teamId, teamId));
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
          teamId,
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
          eq(tables.rosterEntries.seasonId, seasonId),
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
        seasonId,
        playerId,
        jerseyNumber: row.jerseyNumber,
        status: "full",
      });
    }

    for (const g of row.guardians) {
      const guardianRows = await db
        .select()
        .from(tables.guardians)
        .where(eq(tables.guardians.teamId, teamId));
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
            teamId,
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

  return {
    summary: [
      `${playersCreated} players created, ${playersMatched} already existed.`,
      `${guardiansCreated} guardians added.`,
      `${accountsCreated} parent accounts created (temp passwords below — share them once).`,
    ],
    warnings,
    credentials,
  };
}

export async function runPracticeGridImport(
  db: Db,
  seasonId: string,
  seasonYear: number,
  csv: string,
): Promise<RunnerResult> {
  const { columns, players, warnings } = parseAvailabilityGridCsv(csv, seasonYear);
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
          eq(tables.events.seasonId, seasonId),
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
          seasonId,
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
        await db.insert(tables.rsvps).values({ eventId, playerId, status: answer });
      }
      rsvpsWritten++;
    }
  }

  return {
    summary: [
      `${eventsCreated} practice events created (${columns.length} columns found).`,
      `${rsvpsWritten} RSVPs imported for ${players.length} players.`,
      "Parent helper signups aren't imported — add them on each event's page.",
    ],
    warnings,
  };
}

export async function runTournamentGridImport(
  db: Db,
  seasonId: string,
  seasonYear: number,
  csv: string,
): Promise<RunnerResult> {
  const { columns, players, warnings } = parseAvailabilityGridCsv(csv, seasonYear);
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
            eq(tables.availabilityDays.seasonId, seasonId),
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
          seasonId,
          playerId,
          day,
          status: answer,
        });
      }
      written++;
    }
  }

  return {
    summary: [`${written} availability answers imported across ${columns.length} dates.`],
    warnings,
  };
}

export async function runMatrixImport(
  db: Db,
  seasonId: string,
  sheets: MatrixSheet[],
  createdByUserId?: string,
): Promise<RunnerResult> {
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);
  const { sheets: parsed, warnings } = parseMatrixSheets(sheets, roster);
  let written = 0;
  let skippedUnchanged = 0;
  for (const sheet of parsed) {
    for (const r of sheet.ratings) {
      const changed = await insertRatingIfChanged({
        seasonId,
        playerId: r.playerId!,
        position: r.position,
        rating: r.rating,
        rater: sheet.rater,
        createdByUserId,
      });
      if (changed) written++;
      else skippedUnchanged++;
    }
  }
  return {
    summary: [
      `${parsed.length} coach sheet${parsed.length === 1 ? "" : "s"} imported (${parsed
        .map((s) => s.rater)
        .join(", ")}).`,
      `${written} ratings recorded, ${skippedUnchanged} unchanged.`,
    ],
    warnings,
  };
}

/**
 * Import the Sheet's pitching "Player | Tendency | Thoughts/Cues" tab as
 * coach-only development notes. Accepts bare first names and unambiguous
 * first-name prefixes ("Dev" -> Devan).
 */
export async function runCuesImport(db: Db, csv: string): Promise<RunnerResult> {
  const warnings: string[] = [];
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);

  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  let imported = 0;
  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 3) continue;
    const [name, tendency, cue] = cells;
    if (!name || !tendency || !cue) continue;
    if (/^player$/i.test(name)) continue;
    let playerId = matchPlayerByName(name, roster);
    if (!playerId) {
      const prefixHits = roster.filter((p) =>
        p.firstName.toLowerCase().startsWith(name.toLowerCase()),
      );
      if (prefixHits.length === 1) playerId = prefixHits[0].id;
    }
    if (!playerId) {
      warnings.push(`No roster match for "${name}" — cue skipped.`);
      continue;
    }
    const existing = await db
      .select()
      .from(tables.devNotes)
      .where(eq(tables.devNotes.playerId, playerId));
    if (existing.some((n) => n.tendency === tendency && n.cue === cue)) continue;
    await db.insert(tables.devNotes).values({
      playerId,
      category: "pitching",
      tendency,
      cue,
      shared: false,
    });
    imported++;
  }
  return {
    summary: [`${imported} pitching tendency→cue notes imported (coach-only).`],
    warnings,
  };
}

/** Apply roster-status overrides by "First Last" name. */
export async function applyStatusOverrides(
  db: Db,
  seasonId: string,
  overrides: { practice?: string[]; hopeful?: string[] },
): Promise<RunnerResult> {
  const warnings: string[] = [];
  const roster = await db
    .select({
      id: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players);
  let applied = 0;
  for (const [status, names] of [
    ["practice", overrides.practice ?? []],
    ["hopeful", overrides.hopeful ?? []],
  ] as const) {
    for (const name of names) {
      const playerId = matchPlayerByName(name, roster);
      if (!playerId) {
        warnings.push(`Status override: no match for "${name}".`);
        continue;
      }
      await db
        .update(tables.rosterEntries)
        .set({ status })
        .where(
          and(
            eq(tables.rosterEntries.seasonId, seasonId),
            eq(tables.rosterEntries.playerId, playerId),
          ),
        );
      applied++;
    }
  }
  return { summary: [`${applied} roster-status overrides applied.`], warnings };
}
