import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import type { RsvpStatus } from "@/db/schema";

export async function getActiveSeason() {
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  return season ?? null;
}

export async function getTeam() {
  const db = await getDb();
  const [team] = await db.select().from(tables.teams).limit(1);
  return team ?? null;
}

export interface RosterPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  status: "full" | "practice";
  positions: string | null;
  school: string | null;
  birthdate: string | null;
}

export async function getRoster(seasonId: string): Promise<RosterPlayer[]> {
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.players.id,
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
      jerseyNumber: tables.rosterEntries.jerseyNumber,
      status: tables.rosterEntries.status,
      positions: tables.rosterEntries.positions,
      school: tables.players.school,
      birthdate: tables.players.birthdate,
    })
    .from(tables.rosterEntries)
    .innerJoin(
      tables.players,
      eq(tables.rosterEntries.playerId, tables.players.id),
    )
    .where(eq(tables.rosterEntries.seasonId, seasonId))
    .orderBy(asc(tables.players.lastName), asc(tables.players.firstName));
  return rows;
}

export async function getGuardiansByPlayer(playerIds: string[]) {
  if (playerIds.length === 0) {
    return new Map<
      string,
      { firstName: string; lastName: string; email: string | null; phone: string | null }[]
    >();
  }
  const db = await getDb();
  const rows = await db
    .select({
      playerId: tables.playerGuardians.playerId,
      firstName: tables.guardians.firstName,
      lastName: tables.guardians.lastName,
      email: tables.guardians.email,
      phone: tables.guardians.phone,
    })
    .from(tables.playerGuardians)
    .innerJoin(
      tables.guardians,
      eq(tables.playerGuardians.guardianId, tables.guardians.id),
    )
    .where(inArray(tables.playerGuardians.playerId, playerIds));
  const map = new Map<string, { firstName: string; lastName: string; email: string | null; phone: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.playerId) ?? [];
    list.push({
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
    });
    map.set(r.playerId, list);
  }
  return map;
}

export async function getSeasonEvents(seasonId: string) {
  const db = await getDb();
  return db
    .select()
    .from(tables.events)
    .where(eq(tables.events.seasonId, seasonId))
    .orderBy(asc(tables.events.startsAt));
}

export type RsvpsByEvent = Map<string, Map<string, RsvpStatus>>;

export async function getRsvpsForEvents(eventIds: string[]): Promise<RsvpsByEvent> {
  const map: RsvpsByEvent = new Map();
  if (eventIds.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .select()
    .from(tables.rsvps)
    .where(inArray(tables.rsvps.eventId, eventIds));
  for (const r of rows) {
    const inner = map.get(r.eventId) ?? new Map<string, RsvpStatus>();
    inner.set(r.playerId, r.status);
    map.set(r.eventId, inner);
  }
  return map;
}

export function headcount(rsvps: Map<string, RsvpStatus> | undefined) {
  let yes = 0;
  let no = 0;
  let maybe = 0;
  if (rsvps) {
    for (const status of rsvps.values()) {
      if (status === "yes") yes++;
      else if (status === "no") no++;
      else maybe++;
    }
  }
  return { yes, no, maybe };
}

export async function getAvailabilityDays(seasonId: string) {
  const db = await getDb();
  return db
    .select()
    .from(tables.availabilityDays)
    .where(eq(tables.availabilityDays.seasonId, seasonId))
    .orderBy(asc(tables.availabilityDays.day));
}

export async function getSignupsForEvent(eventId: string) {
  const db = await getDb();
  return db
    .select()
    .from(tables.signups)
    .where(eq(tables.signups.eventId, eventId))
    .orderBy(asc(tables.signups.createdAt));
}

export async function getEvent(eventId: string) {
  const db = await getDb();
  const [event] = await db
    .select()
    .from(tables.events)
    .where(and(eq(tables.events.id, eventId)))
    .limit(1);
  return event ?? null;
}
