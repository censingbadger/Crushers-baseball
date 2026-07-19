"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { POSITIONS } from "@/db/schema";
import { requireCoach } from "@/lib/auth";
import { getRoster, getRsvpsForEvents } from "@/lib/data";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import { solveLineup, type LineupCandidate } from "@/lib/lineup";
import { BENCH, planMove, type Slot } from "@/lib/gameday";
import { pitchEligibility, type DayPitches } from "@/lib/pitchsmart";

function isoDateOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const createSchema = z.object({
  // Empty string = "quick game": we create a schedule event on the fly so
  // the dugout works even when no game is on the calendar yet.
  eventId: z.string().uuid().or(z.literal("")),
  label: z.string().trim().min(1).max(60),
  opponent: z.string().trim().max(80).optional(),
  innings: z.coerce.number().int().min(1).max(9),
});

export async function createGame(formData: FormData): Promise<void> {
  await requireCoach();
  const parsed = createSchema.safeParse({
    eventId: formData.get("eventId") ?? "",
    label: formData.get("label"),
    opponent: formData.get("opponent") || undefined,
    innings: formData.get("innings"),
  });
  if (!parsed.success) redirect("/games?error=1");
  const { label, opponent, innings } = parsed.data;
  let { eventId } = parsed.data;

  const db = await getDb();
  if (eventId === "") {
    const [season] = await db
      .select()
      .from(tables.seasons)
      .where(eq(tables.seasons.isActive, true))
      .limit(1);
    if (!season) redirect("/games?error=1");
    const [quickEvent] = await db
      .insert(tables.events)
      .values({
        seasonId: season.id,
        type: "game",
        title: label,
        startsAt: new Date(),
        opponent: opponent || null,
      })
      .returning();
    eventId = quickEvent.id;
  }
  const [event] = await db
    .select()
    .from(tables.events)
    .where(eq(tables.events.id, eventId))
    .limit(1);
  if (!event) redirect("/games?error=1");

  // Seed the lineup from the solver over RSVP'd full-time players.
  const roster = await getRoster(event.seasonId);
  const rsvps = (await getRsvpsForEvents([event.id])).get(event.id);
  const pool = roster.filter(
    (p) => p.status === "full" && rsvps?.get(p.playerId) !== "no",
  );
  const ratings = await getCurrentRatings(event.seasonId);
  const blended = blendedLookup(ratings);
  const candidates: LineupCandidate[] = pool.map((p) => ({
    playerId: p.playerId,
    name: `${p.firstName} ${p.lastName}`,
    ratings: blended.get(p.playerId) ?? new Map(),
  }));
  const solution = solveLineup(candidates);

  const [game] = await db
    .insert(tables.liveGames)
    .values({
      seasonId: event.seasonId,
      eventId,
      label,
      opponent: opponent || event.opponent || null,
      innings,
      gameDate: isoDateOf(event.startsAt),
    })
    .returning();

  const assigned = new Map<string, string>();
  for (const pos of POSITIONS) {
    const a = solution.assignments[pos];
    if (a) assigned.set(a.playerId, pos);
  }
  for (const p of pool) {
    const slot = assigned.get(p.playerId) ?? BENCH;
    for (let inning = 1; inning <= innings; inning++) {
      await db.insert(tables.gameAssignments).values({
        gameId: game.id,
        inning,
        playerId: p.playerId,
        position: slot,
      });
    }
  }

  // Batting order seeded by overall blended strength, strongest first.
  const overall = (playerId: string) => {
    const m = blended.get(playerId);
    if (!m || m.size === 0) return 0;
    let sum = 0;
    for (const v of m.values()) sum += v;
    return sum / m.size;
  };
  const ordered = [...pool].sort((a, b) => overall(b.playerId) - overall(a.playerId));
  for (let i = 0; i < ordered.length; i++) {
    await db.insert(tables.battingOrders).values({
      gameId: game.id,
      playerId: ordered[i].playerId,
      spot: i + 1,
    });
  }

  revalidatePath("/games");
  redirect(`/game/${game.id}`);
}

async function loadGame(gameId: string) {
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.id, gameId))
    .limit(1);
  return game ?? null;
}

export async function startGame(gameId: string): Promise<void> {
  await requireCoach();
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ status: "live", startedAt: new Date() })
    .where(eq(tables.liveGames.id, gameId));
  revalidatePath(`/game/${gameId}`);
}

export async function finishGame(gameId: string): Promise<void> {
  await requireCoach();
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ status: "final" })
    .where(eq(tables.liveGames.id, gameId));
  revalidatePath(`/game/${gameId}`);
  revalidatePath("/games");
}

export async function setInning(gameId: string, inning: number): Promise<void> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const clamped = Math.max(1, Math.min(9, Math.round(inning)));
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ currentInning: clamped, outs: 0 })
    .where(eq(tables.liveGames.id, gameId));
  revalidatePath(`/game/${gameId}`);
}

export async function cycleOuts(gameId: string): Promise<void> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ outs: (game.outs + 1) % 3 })
    .where(eq(tables.liveGames.id, gameId));
  revalidatePath(`/game/${gameId}`);
}

export async function addRun(
  gameId: string,
  side: "us" | "them",
  delta: number,
): Promise<void> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(tables.scoreLines)
    .where(
      and(
        eq(tables.scoreLines.gameId, gameId),
        eq(tables.scoreLines.inning, game.currentInning),
        eq(tables.scoreLines.side, side),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(tables.scoreLines)
      .set({ runs: Math.max(0, existing.runs + delta) })
      .where(eq(tables.scoreLines.id, existing.id));
  } else if (delta > 0) {
    await db.insert(tables.scoreLines).values({
      gameId,
      inning: game.currentInning,
      side,
      runs: delta,
    });
  }
  revalidatePath(`/game/${gameId}`);
}

export async function addPitches(
  gameId: string,
  playerId: string,
  delta: number,
): Promise<void> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(tables.pitchCounts)
    .where(
      and(
        eq(tables.pitchCounts.gameId, gameId),
        eq(tables.pitchCounts.playerId, playerId),
        eq(tables.pitchCounts.inning, game.currentInning),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(tables.pitchCounts)
      .set({ pitches: Math.max(0, existing.pitches + delta), updatedAt: new Date() })
      .where(eq(tables.pitchCounts.id, existing.id));
  } else if (delta > 0) {
    await db.insert(tables.pitchCounts).values({
      gameId,
      playerId,
      inning: game.currentInning,
      pitches: delta,
    });
  }
  revalidatePath(`/game/${gameId}`);
}

/** Pitch history (day totals) for a player across all games. */
async function pitchHistory(playerId: string): Promise<DayPitches[]> {
  const db = await getDb();
  const rows = await db
    .select({
      pitches: tables.pitchCounts.pitches,
      day: tables.liveGames.gameDate,
    })
    .from(tables.pitchCounts)
    .innerJoin(tables.liveGames, eq(tables.pitchCounts.gameId, tables.liveGames.id))
    .where(eq(tables.pitchCounts.playerId, playerId));
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.pitches);
  }
  return [...byDay.entries()].map(([day, pitches]) => ({ day, pitches }));
}

export interface MoveResult {
  ok: boolean;
  warning: string | null;
}

export async function moveGamePlayer(
  gameId: string,
  playerId: string,
  target: Slot,
  force = false,
): Promise<MoveResult> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return { ok: false, warning: "Game not found." };

  if (target === "P" && !force) {
    const history = await pitchHistory(playerId);
    const eligibility = pitchEligibility(history, game.gameDate);
    if (!eligibility.eligible) {
      return {
        ok: false,
        warning: `Pitch Smart: this player is ${eligibility.reason}${
          eligibility.nextEligibleDay
            ? ` — eligible again ${eligibility.nextEligibleDay}`
            : ""
        }.`,
      };
    }
  }

  const db = await getDb();
  const rows = await db
    .select()
    .from(tables.gameAssignments)
    .where(
      and(
        eq(tables.gameAssignments.gameId, gameId),
        eq(tables.gameAssignments.inning, game.currentInning),
      ),
    );
  const current = new Map(rows.map((r) => [r.playerId, r.position]));
  if (!current.has(playerId)) return { ok: false, warning: "Player not in this game." };

  const plan = planMove(current, playerId, target, game.currentInning, game.innings);
  for (const s of plan.set) {
    const [existing] = await db
      .select({ id: tables.gameAssignments.id })
      .from(tables.gameAssignments)
      .where(
        and(
          eq(tables.gameAssignments.gameId, gameId),
          eq(tables.gameAssignments.inning, s.inning),
          eq(tables.gameAssignments.playerId, s.playerId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(tables.gameAssignments)
        .set({ position: s.position })
        .where(eq(tables.gameAssignments.id, existing.id));
    } else {
      await db.insert(tables.gameAssignments).values({
        gameId,
        inning: s.inning,
        playerId: s.playerId,
        position: s.position,
      });
    }
  }
  revalidatePath(`/game/${gameId}`);
  return { ok: true, warning: null };
}

export async function swapBattingSpot(
  gameId: string,
  playerId: string,
  direction: "up" | "down",
): Promise<void> {
  await requireCoach();
  const db = await getDb();
  const order = await db
    .select()
    .from(tables.battingOrders)
    .where(eq(tables.battingOrders.gameId, gameId));
  const sorted = order.sort((a, b) => a.spot - b.spot);
  const idx = sorted.findIndex((o) => o.playerId === playerId);
  if (idx === -1) return;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= sorted.length) return;
  const a = sorted[idx];
  const b = sorted[swapWith];
  await db
    .update(tables.battingOrders)
    .set({ spot: b.spot })
    .where(eq(tables.battingOrders.id, a.id));
  await db
    .update(tables.battingOrders)
    .set({ spot: a.spot })
    .where(eq(tables.battingOrders.id, b.id));
  revalidatePath(`/game/${gameId}`);
}

export async function removeGame(formData: FormData): Promise<void> {
  await requireCoach();
  const gameId = String(formData.get("gameId") ?? "");
  if (!gameId) return;
  const db = await getDb();
  for (const table of [
    tables.gameAssignments,
    tables.battingOrders,
    tables.scoreLines,
    tables.pitchCounts,
  ]) {
    await db.delete(table).where(eq(table.gameId, gameId));
  }
  await db.delete(tables.liveGames).where(eq(tables.liveGames.id, gameId));
  revalidatePath("/games");
  redirect("/games");
}

/** Everything the dashboard needs, in one serializable bundle. */
export async function gameSnapshot(gameId: string) {
  const game = await loadGame(gameId);
  if (!game) return null;
  const db = await getDb();
  const [assignmentRows, orderRows, scoreRows, pitchRows] = await Promise.all([
    db
      .select()
      .from(tables.gameAssignments)
      .where(eq(tables.gameAssignments.gameId, gameId)),
    db
      .select()
      .from(tables.battingOrders)
      .where(eq(tables.battingOrders.gameId, gameId)),
    db.select().from(tables.scoreLines).where(eq(tables.scoreLines.gameId, gameId)),
    db.select().from(tables.pitchCounts).where(eq(tables.pitchCounts.gameId, gameId)),
  ]);
  const playerIds = [...new Set(assignmentRows.map((r) => r.playerId))];
  const players = playerIds.length
    ? await db
        .select({
          id: tables.players.id,
          firstName: tables.players.firstName,
          lastName: tables.players.lastName,
        })
        .from(tables.players)
        .where(inArray(tables.players.id, playerIds))
    : [];

  // Eligibility for everyone (bench chips warn before a bad move is tried).
  const eligibility: Record<
    string,
    { eligible: boolean; remaining: number; reason: string | null }
  > = {};
  for (const pid of playerIds) {
    const history = await pitchHistory(pid);
    const e = pitchEligibility(history, game.gameDate);
    eligibility[pid] = {
      eligible: e.eligible,
      remaining: e.pitchesRemainingToday,
      reason: e.reason,
    };
  }

  const ratings = await getCurrentRatings(game.seasonId);
  const blended = blendedLookup(ratings);
  const ratingsByPlayer: Record<string, Record<string, number>> = {};
  for (const pid of playerIds) {
    ratingsByPlayer[pid] = Object.fromEntries(blended.get(pid) ?? new Map());
  }

  return {
    game,
    assignmentRows,
    orderRows: orderRows.sort((a, b) => a.spot - b.spot),
    scoreRows,
    pitchRows,
    players,
    eligibility,
    ratingsByPlayer,
  };
}
