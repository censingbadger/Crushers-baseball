"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, tables } from "@/db";
import { POSITIONS, type GameEditSection } from "@/db/schema";
import { requireCoach, type CurrentUser } from "@/lib/auth";
import { getPositionRoles, getRoster, getRsvpsForEvents } from "@/lib/data";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import { barsSummary } from "@/lib/bars";
import {
  aspiringTokens,
  rolesByPlayerFrom,
  solverWeights,
  type LineupMode,
} from "@/lib/depth";
import { solveLineup, type LineupCandidate } from "@/lib/lineup";
import { BENCH, duplicateOccupants, planMove, type Slot } from "@/lib/gameday";
import { shouldCoalesce } from "@/lib/gamelog";
import { initialsOf } from "@/lib/format";
import { pitchEligibility, type DayPitches } from "@/lib/pitchsmart";
import { suggestBattingOrder, type BatterInput } from "@/lib/batting";
import { getSeasonBattingByPlayer } from "@/lib/performance";

function isoDateOf(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function ratingsRecordOf(
  playerIds: readonly string[],
  blended: Map<string, Map<string, number>>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const pid of playerIds) {
    out[pid] = Object.fromEntries(blended.get(pid) ?? new Map());
  }
  return out;
}

/** "Milo Vance" → "Milo V." — how the trail and the chips name players. */
async function shortNameOf(playerId: string): Promise<string> {
  const db = await getDb();
  const [p] = await db
    .select({
      firstName: tables.players.firstName,
      lastName: tables.players.lastName,
    })
    .from(tables.players)
    .where(eq(tables.players.id, playerId))
    .limit(1);
  return p ? `${p.firstName} ${p.lastName.charAt(0)}.` : "?";
}

/**
 * Write to the shared-editing trail (game_edits) — several coaches run
 * the same dugout at once, and each screen shows who changed what last.
 * With a coalesceKey, a rapid burst by the same coach (pitch taps, order
 * arrows, inning steps) updates its latest row instead of flooding the
 * feed; anyone else's edit in between breaks the run (shouldCoalesce).
 */
async function logGameEdit(edit: {
  gameId: string;
  section: GameEditSection;
  summary: string;
  user: CurrentUser;
  coalesceKey?: string;
}): Promise<void> {
  const db = await getDb();
  const actor = initialsOf(edit.user.displayName);
  const [latest] = await db
    .select()
    .from(tables.gameEdits)
    .where(eq(tables.gameEdits.gameId, edit.gameId))
    .orderBy(desc(tables.gameEdits.at))
    .limit(1);
  if (
    latest &&
    shouldCoalesce(
      { actor: latest.actor, coalesceKey: latest.coalesceKey, atMs: latest.at.getTime() },
      { actor, coalesceKey: edit.coalesceKey ?? null },
      Date.now(),
    )
  ) {
    await db
      .update(tables.gameEdits)
      .set({ summary: edit.summary, at: new Date() })
      .where(eq(tables.gameEdits.id, latest.id));
    return;
  }
  await db.insert(tables.gameEdits).values({
    gameId: edit.gameId,
    section: edit.section,
    summary: edit.summary,
    actor,
    createdByUserId: edit.user.id,
    coalesceKey: edit.coalesceKey ?? null,
  });
}

/**
 * Two screens writing at once can double-book a position (each field
 * write is per-player, and serverless Postgres-over-HTTP has no
 * transactions to prevent the interleave). After any field write, sweep
 * the innings it touched: the newest write keeps a double-held slot and
 * the earlier occupant returns to the bench — last tap wins, visibly,
 * instead of a player silently vanishing from the diamond. Idempotent,
 * so every device heals to the same answer. Returns the names benched.
 */
async function healDoubleBookings(
  gameId: string,
  fromInning: number,
  actor: string,
): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(tables.gameAssignments)
    .where(
      and(
        eq(tables.gameAssignments.gameId, gameId),
        gte(tables.gameAssignments.inning, fromInning),
      ),
    );
  const byInning = new Map<number, typeof rows>();
  for (const r of rows) {
    const list = byInning.get(r.inning) ?? [];
    list.push(r);
    byInning.set(r.inning, list);
  }
  const benched = new Set<string>();
  for (const [inning, list] of byInning) {
    const losers = duplicateOccupants(
      list.map((r) => ({
        playerId: r.playerId,
        position: r.position,
        updatedAtMs: r.updatedAt.getTime(),
      })),
    );
    for (const pid of losers) {
      await db
        .update(tables.gameAssignments)
        .set({ position: BENCH, updatedBy: actor, updatedAt: new Date() })
        .where(
          and(
            eq(tables.gameAssignments.gameId, gameId),
            eq(tables.gameAssignments.inning, inning),
            eq(tables.gameAssignments.playerId, pid),
          ),
        );
      benched.add(pid);
    }
  }
  return Promise.all([...benched].map(shortNameOf));
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
  const user = await requireCoach();
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

  // Seed the lineup from the solver. Full-squad and hopeful players are
  // in by default; the PRACTICE squad is not (Mike: "Ben and Owen should
  // not be brought in by default ever") — they stay one tap away via the
  // dugout's add-player chips for the rare day they suit up. An explicit
  // RSVP "no" also keeps a player out of the seed.
  const roster = await getRoster(event.seasonId);
  const rsvps = (await getRsvpsForEvents([event.id])).get(event.id);
  const pool = roster.filter(
    (p) => p.status !== "practice" && rsvps?.get(p.playerId) !== "no",
  );
  const ratings = await getCurrentRatings(event.seasonId);
  const blended = blendedLookup(ratings);
  const candidates: LineupCandidate[] = pool.map((p) => ({
    playerId: p.playerId,
    name: `${p.firstName} ${p.lastName}`,
    ratings: blended.get(p.playerId) ?? new Map(),
  }));
  const poolIds = pool.map((p) => p.playerId);
  const weights = solverWeights(
    poolIds,
    ratingsRecordOf(poolIds, blended),
    rolesByPlayerFrom(await getPositionRoles(event.seasonId)),
    "compete",
  );
  const solution = solveLineup(candidates, {}, weights);

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

  await logGameEdit({
    gameId: game.id,
    section: "game",
    summary: "created the game (seeded lineup & batting order)",
    user,
  });
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
  const user = await requireCoach();
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ status: "live", startedAt: new Date() })
    .where(eq(tables.liveGames.id, gameId));
  await logGameEdit({ gameId, section: "game", summary: "started the game", user });
  revalidatePath(`/game/${gameId}`);
}

export async function finishGame(gameId: string): Promise<void> {
  const user = await requireCoach();
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ status: "final" })
    .where(eq(tables.liveGames.id, gameId));
  await logGameEdit({ gameId, section: "game", summary: "marked the game final", user });
  revalidatePath(`/game/${gameId}`);
  revalidatePath("/games");
}

export async function setInning(gameId: string, inning: number): Promise<void> {
  const user = await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const clamped = Math.max(1, Math.min(9, Math.round(inning)));
  const db = await getDb();

  // Extra innings: entering an inning that was never seeded (beyond the
  // configured length) carries the previous alignment forward, so the
  // field never silently empties.
  const [hasAssignments] = await db
    .select({ id: tables.gameAssignments.id })
    .from(tables.gameAssignments)
    .where(
      and(
        eq(tables.gameAssignments.gameId, gameId),
        eq(tables.gameAssignments.inning, clamped),
      ),
    )
    .limit(1);
  if (!hasAssignments && clamped > 1) {
    const previous = await db
      .select()
      .from(tables.gameAssignments)
      .where(
        and(
          eq(tables.gameAssignments.gameId, gameId),
          eq(tables.gameAssignments.inning, clamped - 1),
        ),
      );
    if (previous.length > 0) {
      await db.insert(tables.gameAssignments).values(
        previous.map((a) => ({
          gameId,
          inning: clamped,
          playerId: a.playerId,
          position: a.position,
          updatedBy: initialsOf(user.displayName),
        })),
      );
    }
  }

  await db
    .update(tables.liveGames)
    .set({ currentInning: clamped, outs: 0 })
    .where(eq(tables.liveGames.id, gameId));
  // The inning is shared state — stepping it turns every screen's page.
  await logGameEdit({
    gameId,
    section: "game",
    summary: `turned to inning ${clamped}`,
    user,
    coalesceKey: "inning",
  });
  revalidatePath(`/game/${gameId}`);
}

// Fairness boost per credited inning, added to every cell of a player
// who has spent innings off a regular field spot. See solveInningsRange.
const FAIRNESS = 0.5;

/**
 * The per-inning engine behind both the pitching plan and Auto-arrange:
 * for each inning in [from, to], solve the eight non-pitching positions
 * around that inning's pinned arm, then write the assignments. Fairness
 * credit accrues for innings NOT spent at a regular field spot — bench
 * innings AND pitched innings alike. Without the pitching credit, a
 * relieved arm competed at zero against boosted sitters and rode the
 * bench for the rest of the game; with it, he returns to his best
 * available position and a rested fielder takes the seat instead. Pins
 * always win (the coach declared that arm, even a resting one — the
 * picker labels it); where an inning has no pin, Pitch Smart keeps
 * resting arms off the mound. Bench falls out of the solve.
 */
async function solveInningsRange(
  game: { id: string; seasonId: string; gameDate: string },
  playerIds: string[],
  from: number,
  to: number,
  pinnedP: (inning: number) => string | null,
  sat: Record<string, number>,
  mode: LineupMode,
  actor: string | null,
): Promise<void> {
  const db = await getDb();
  const pool = new Set(playerIds);

  const roster = await getRoster(game.seasonId);
  const blended = blendedLookup(await getCurrentRatings(game.seasonId));
  const nameOf = new Map(roster.map((p) => [p.playerId, `${p.firstName} ${p.lastName}`]));
  const candidates: LineupCandidate[] = playerIds.map((id) => ({
    playerId: id,
    name: nameOf.get(id) ?? "?",
    ratings: blended.get(id) ?? new Map(),
  }));

  const aspRows = await db
    .select({
      playerId: tables.aspirations.playerId,
      desiredPositions: tables.aspirations.desiredPositions,
    })
    .from(tables.aspirations)
    .where(eq(tables.aspirations.seasonId, game.seasonId));
  const aspiringByPlayer: Record<string, string[]> = {};
  for (const row of aspRows) {
    const tokens = aspiringTokens(row.desiredPositions);
    if (tokens.length > 0) aspiringByPlayer[row.playerId] = tokens;
  }
  const roles = rolesByPlayerFrom(await getPositionRoles(game.seasonId));

  const resting = new Set<string>();
  for (const pid of playerIds) {
    const e = pitchEligibility(await pitchHistory(pid), game.gameDate);
    if (!e.eligible) resting.add(pid);
  }

  for (let inning = from; inning <= to; inning++) {
    const weights = solverWeights(
      playerIds,
      ratingsRecordOf(playerIds, blended),
      roles,
      mode,
      aspiringByPlayer,
    );
    for (const pid of resting) weights[pid].P = 0;
    for (const pid of playerIds) {
      if (sat[pid] === 0) continue;
      for (const pos of POSITIONS) {
        if (weights[pid][pos] > 0) weights[pid][pos] += FAIRNESS * sat[pid];
      }
    }
    const declared = pinnedP(inning);
    const pins = declared && pool.has(declared) ? { P: declared } : {};
    const solution = solveLineup(candidates, pins, weights);

    const assigned = new Map<string, string>();
    for (const pos of POSITIONS) {
      const a = solution.assignments[pos];
      if (a) assigned.set(a.playerId, pos);
    }
    for (const pid of playerIds) {
      const position = assigned.get(pid) ?? BENCH;
      await db
        .delete(tables.gameAssignments)
        .where(
          and(
            eq(tables.gameAssignments.gameId, game.id),
            eq(tables.gameAssignments.inning, inning),
            eq(tables.gameAssignments.playerId, pid),
          ),
        );
      await db
        .insert(tables.gameAssignments)
        .values({ gameId: game.id, inning, playerId: pid, position, updatedBy: actor });
      if (position === BENCH || position === "P") sat[pid] += 1;
    }
  }
}

/**
 * The pitching-first game plan: the coach declares who pitches each
 * inning, and the solver arranges the other eight positions around each
 * arm for the WHOLE game in one pass. The batting order is never
 * touched: it holds for the game (usually the tournament).
 */
export async function planFullGame(
  gameId: string,
  pitchers: (string | null)[],
  mode: LineupMode = "compete",
): Promise<{ ok: boolean }> {
  const user = await requireCoach();
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.id, gameId))
    .limit(1);
  if (!game) return { ok: false };

  const assignmentRows = await db
    .select()
    .from(tables.gameAssignments)
    .where(eq(tables.gameAssignments.gameId, gameId));
  const playerIds = [...new Set(assignmentRows.map((r) => r.playerId))];
  if (playerIds.length === 0) return { ok: false };

  const actor = initialsOf(user.displayName);
  const sat: Record<string, number> = {};
  for (const pid of playerIds) sat[pid] = 0;
  await solveInningsRange(
    game,
    playerIds,
    1,
    game.innings,
    (inning) => pitchers[inning - 1] ?? null,
    sat,
    mode,
    actor,
  );
  await healDoubleBookings(gameId, 1, actor);
  await logGameEdit({
    gameId,
    section: "plan",
    summary: `planned all ${game.innings} innings around the declared arms (${
      mode === "develop" ? "up big" : "close game"
    })`,
    user,
  });
  revalidatePath(`/game/${gameId}`);
  return { ok: true };
}

/**
 * Bring a roster player into a game the seed left out (practice squad,
 * or a late arrival after an RSVP "no"): bench rows for every inning
 * plus the last batting spot — from there he drags like anyone else.
 */
export async function addPlayerToGame(
  gameId: string,
  playerId: string,
): Promise<{ ok: boolean }> {
  const user = await requireCoach();
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.id, gameId))
    .limit(1);
  if (!game) return { ok: false };
  const roster = await getRoster(game.seasonId);
  if (!roster.some((p) => p.playerId === playerId)) return { ok: false };

  const existing = await db
    .select()
    .from(tables.gameAssignments)
    .where(
      and(
        eq(tables.gameAssignments.gameId, gameId),
        eq(tables.gameAssignments.playerId, playerId),
      ),
    );
  if (existing.length > 0) return { ok: true }; // already in

  for (let inning = 1; inning <= game.innings; inning++) {
    await db
      .insert(tables.gameAssignments)
      .values({
        gameId,
        inning,
        playerId,
        position: BENCH,
        updatedBy: initialsOf(user.displayName),
      });
  }
  const orderRows = await db
    .select()
    .from(tables.battingOrders)
    .where(eq(tables.battingOrders.gameId, gameId));
  const nextSpot = orderRows.reduce((m, r) => Math.max(m, r.spot), 0) + 1;
  await db
    .insert(tables.battingOrders)
    .values({ gameId, playerId, spot: nextSpot });
  await logGameEdit({
    gameId,
    section: "field",
    summary: `added ${await shortNameOf(playerId)} to the game`,
    user,
  });
  revalidatePath(`/game/${gameId}`);
  return { ok: true };
}

/** The dugout board's "who's up" marker — tap a batter, everyone syncs. */
export async function setUpSpot(gameId: string, spot: number): Promise<void> {
  await requireCoach();
  if (!Number.isInteger(spot) || spot < 1 || spot > 30) return;
  const db = await getDb();
  await db
    .update(tables.liveGames)
    .set({ upSpot: spot })
    .where(eq(tables.liveGames.id, gameId));
  revalidatePath(`/game/${gameId}`);
}

export async function cycleOuts(gameId: string): Promise<void> {
  await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const db = await getDb();
  // 0 → 1 → 2 → 3 (shown) → 0: the third out is visible, not swallowed.
  await db
    .update(tables.liveGames)
    .set({ outs: (game.outs + 1) % 4 })
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
  const user = await requireCoach();
  const game = await loadGame(gameId);
  if (!game) return;
  const db = await getDb();
  // One atomic statement, not read-then-write: when two coaches tap at
  // the same moment, both taps count — the database adds, we don't.
  const [row] = await db
    .insert(tables.pitchCounts)
    .values({
      gameId,
      playerId,
      inning: game.currentInning,
      pitches: Math.max(0, delta),
    })
    .onConflictDoUpdate({
      target: [
        tables.pitchCounts.gameId,
        tables.pitchCounts.playerId,
        tables.pitchCounts.inning,
      ],
      set: {
        pitches: sql`GREATEST(0, ${tables.pitchCounts.pitches} + ${delta})`,
        updatedAt: new Date(),
      },
    })
    .returning({ pitches: tables.pitchCounts.pitches });
  await logGameEdit({
    gameId,
    section: "pitches",
    summary: `pitch count: ${await shortNameOf(playerId)} at ${
      row?.pitches ?? "?"
    } in inning ${game.currentInning}`,
    user,
    coalesceKey: `pitches:${playerId}:${game.currentInning}`,
  });
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
  const user = await requireCoach();
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

  const actor = initialsOf(user.displayName);
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
        .set({ position: s.position, updatedBy: actor, updatedAt: new Date() })
        .where(eq(tables.gameAssignments.id, existing.id));
    } else {
      await db.insert(tables.gameAssignments).values({
        gameId,
        inning: s.inning,
        playerId: s.playerId,
        position: s.position,
        updatedBy: actor,
      });
    }
  }
  // If another screen's move crossed with this one, resolve any
  // double-booked slot now — newest write keeps it, visibly.
  const healed = await healDoubleBookings(gameId, game.currentInning, actor);
  await logGameEdit({
    gameId,
    section: "field",
    summary:
      `moved ${await shortNameOf(playerId)} to ${target === BENCH ? "the bench" : target}` +
      (healed.length > 0
        ? ` · auto-benched ${healed.join(", ")} (double-booked at that spot)`
        : ""),
    user,
  });
  revalidatePath(`/game/${gameId}`);
  return { ok: true, warning: null };
}

export async function swapBattingSpot(
  gameId: string,
  playerId: string,
  direction: "up" | "down",
): Promise<void> {
  const user = await requireCoach();
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
  // Arrow taps from two screens can cross and leave duplicate spots.
  // Renumber 1..n deterministically so every device converges on one
  // valid order (each write ends with this sweep — the last one wins).
  const after = await db
    .select()
    .from(tables.battingOrders)
    .where(eq(tables.battingOrders.gameId, gameId));
  const normalized = after.sort(
    (x, y) => x.spot - y.spot || x.playerId.localeCompare(y.playerId),
  );
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i].spot !== i + 1) {
      await db
        .update(tables.battingOrders)
        .set({ spot: i + 1 })
        .where(eq(tables.battingOrders.id, normalized[i].id));
    }
  }
  await logGameEdit({
    gameId,
    section: "order",
    summary: `moved ${await shortNameOf(playerId)} ${direction} in the batting order`,
    user,
    coalesceKey: "order",
  });
  revalidatePath(`/game/${gameId}`);
}

/**
 * The Lineup lab, absorbed: re-solve the strongest defensive alignment
 * for every inning from the current one onward. The pitching plan
 * outranks the solver — an arm already written into an inning stays on
 * the mound there and the other eight spots arrange around him; only
 * innings with no planned arm get one picked (best eligible). Innings
 * already played seed the fairness credit, so early sitters and relieved
 * arms come off the bench late instead of riding it.
 */
export async function autoArrangeField(
  gameId: string,
  mode: LineupMode = "compete",
): Promise<{ ok: boolean }> {
  const user = await requireCoach();
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.id, gameId))
    .limit(1);
  if (!game) return { ok: false };

  const assignmentRows = await db
    .select()
    .from(tables.gameAssignments)
    .where(eq(tables.gameAssignments.gameId, gameId));
  const playerIds = [
    ...new Set(
      assignmentRows
        .filter((r) => r.inning === game.currentInning)
        .map((r) => r.playerId),
    ),
  ];
  if (playerIds.length === 0) return { ok: false };

  const pitcherByInning: Record<number, string> = {};
  const sat: Record<string, number> = {};
  for (const pid of playerIds) sat[pid] = 0;
  for (const r of assignmentRows) {
    if (r.position === "P") pitcherByInning[r.inning] = r.playerId;
    if (
      r.inning < game.currentInning &&
      (r.position === BENCH || r.position === "P") &&
      sat[r.playerId] !== undefined
    ) {
      sat[r.playerId] += 1;
    }
  }

  const actor = initialsOf(user.displayName);
  await solveInningsRange(
    game,
    playerIds,
    game.currentInning,
    game.innings,
    (inning) => pitcherByInning[inning] ?? null,
    sat,
    mode,
    actor,
  );
  await healDoubleBookings(gameId, game.currentInning, actor);
  await logGameEdit({
    gameId,
    section: "plan",
    summary: `auto-arranged innings ${game.currentInning}–${game.innings} (${
      mode === "develop" ? "up big" : "close game"
    })`,
    user,
  });
  revalidatePath(`/game/${gameId}`);
  return { ok: true };
}

/**
 * Generate and apply a batting order for this game's batters: GameChanger
 * season rates blended with the coaches' hitting ratings, arranged in the
 * classic construction. Returns per-slot reasoning for the dashboard.
 */
export async function applySuggestedBattingOrder(
  gameId: string,
): Promise<{ ok: boolean; notes: string[] }> {
  const user = await requireCoach();
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.id, gameId))
    .limit(1);
  if (!game) return { ok: false, notes: ["Game not found."] };

  const orderRows = await db
    .select()
    .from(tables.battingOrders)
    .where(eq(tables.battingOrders.gameId, gameId));
  if (orderRows.length === 0) return { ok: false, notes: ["No batters in this game yet."] };
  const batterIds = orderRows.map((o) => o.playerId);

  const [battingByPlayer, barsRows, legacyRows, players] = await Promise.all([
    getSeasonBattingByPlayer(game.seasonId),
    db
      .select()
      .from(tables.barsRatings)
      .where(
        and(
          eq(tables.barsRatings.seasonId, game.seasonId),
          eq(tables.barsRatings.dimension, "d1"),
        ),
      ),
    db
      .select({
        playerId: tables.playerRatings.playerId,
        rating: tables.playerRatings.rating,
        createdAt: tables.playerRatings.createdAt,
      })
      .from(tables.playerRatings)
      .where(
        and(
          eq(tables.playerRatings.seasonId, game.seasonId),
          eq(tables.playerRatings.dimension, "hitting"),
        ),
      ),
    db
      .select({
        id: tables.players.id,
        firstName: tables.players.firstName,
        lastName: tables.players.lastName,
      })
      .from(tables.players)
      .where(inArray(tables.players.id, batterIds)),
  ]);

  // Coach hitting quality: BARS D1 medians once the staff has any (the
  // current instrument), the legacy 1–10 hitting rows otherwise. Season-
  // wide switch, never per-player — the blend normalizes within the team,
  // and mixing a 1–5 median with a 1–10 rating in one solve would skew it.
  const hittingByPlayer = new Map<string, number>();
  if (barsRows.length > 0) {
    for (const [pid, cells] of barsSummary(barsRows)) {
      const d1 = cells.get("d1");
      if (d1) hittingByPlayer.set(pid, d1.median);
    }
  } else {
    for (const r of legacyRows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      hittingByPlayer.set(r.playerId, r.rating);
    }
  }

  const inputs: BatterInput[] = batterIds.map((pid) => ({
    playerId: pid,
    batting: battingByPlayer.get(pid) ?? null,
    hittingRating: hittingByPlayer.get(pid) ?? null,
  }));
  const { order, reasons } = suggestBattingOrder(inputs);

  for (let i = 0; i < order.length; i++) {
    await db
      .update(tables.battingOrders)
      .set({ spot: i + 1 })
      .where(
        and(
          eq(tables.battingOrders.gameId, gameId),
          eq(tables.battingOrders.playerId, order[i]),
        ),
      );
  }
  await logGameEdit({
    gameId,
    section: "order",
    summary: "applied a generated batting order",
    user,
  });
  revalidatePath(`/game/${gameId}`);

  const nameOf = new Map(players.map((p) => [p.id, `${p.firstName} ${p.lastName.charAt(0)}.`]));
  const notes = order.map(
    (pid, i) => `${i + 1}. ${nameOf.get(pid) ?? "?"} — ${reasons[pid] ?? ""}`,
  );
  return { ok: true, notes };
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
    tables.gameEdits,
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
  const [assignmentRows, orderRows, scoreRows, pitchRows, editRows] = await Promise.all([
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
    db
      .select()
      .from(tables.gameEdits)
      .where(eq(tables.gameEdits.gameId, gameId))
      .orderBy(desc(tables.gameEdits.at))
      .limit(12),
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
    // The shared-editing trail, newest first — who touched what, when.
    recentEdits: editRows.map((e) => ({
      id: e.id,
      section: e.section,
      summary: e.summary,
      actor: e.actor,
      atMs: e.at.getTime(),
    })),
  };
}
