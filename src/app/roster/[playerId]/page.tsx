import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getGuardiansByPlayer } from "@/lib/data";
import { deletePlayer, removeFromSeason, updatePlayer } from "@/app/roster/actions";
import {
  addDevNote,
  deleteDevNote,
  saveAspirations,
  toggleNoteShared,
} from "@/app/roster/development-actions";
import { BARS_DIMENSIONS, NOT_OBSERVED } from "@/lib/bars";
import { dimensionTrend } from "@/lib/development";
import { POSITIONS } from "@/db/schema";
import {
  getBlendedRatingsByPlayer,
  getSeasonBattingByPlayer,
  getSeasonPitchingByPlayer,
} from "@/lib/performance";
import { battingRates, formatIp, pitchingRates } from "@/lib/stats";

const TREND_ARROW = { up: "↗", down: "↘", flat: "→" } as const;

export default async function PlayerEditPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  await requireCoach();
  const { playerId } = await params;
  const db = await getDb();
  const [player] = await db
    .select()
    .from(tables.players)
    .where(eq(tables.players.id, playerId))
    .limit(1);
  if (!player) notFound();

  const season = await getActiveSeason();
  let entry = null;
  if (season) {
    const rows = await db
      .select()
      .from(tables.rosterEntries)
      .where(eq(tables.rosterEntries.playerId, playerId));
    entry = rows.find((r) => r.seasonId === season.id) ?? null;
  }
  const guardians = (await getGuardiansByPlayer([playerId])).get(playerId) ?? [];

  const ratingRows = season
    ? await db
        .select()
        .from(tables.barsRatings)
        .where(
          and(
            eq(tables.barsRatings.seasonId, season.id),
            eq(tables.barsRatings.playerId, playerId),
          ),
        )
    : [];
  const trends = BARS_DIMENSIONS.map((dim) => ({
    dim,
    trend: dimensionTrend(
      ratingRows
        .filter((r) => r.dimension === dim.key && r.level !== NOT_OBSERVED)
        .map((r) => ({ rating: r.level, createdAt: r.createdAt })),
    ),
  }));
  const hasRatings = trends.some((t) => t.trend.latest !== null);

  const [aspiration] = season
    ? await db
        .select()
        .from(tables.aspirations)
        .where(
          and(
            eq(tables.aspirations.seasonId, season.id),
            eq(tables.aspirations.playerId, playerId),
          ),
        )
        .limit(1)
    : [];

  const notes = await db
    .select()
    .from(tables.devNotes)
    .where(eq(tables.devNotes.playerId, playerId))
    .orderBy(asc(tables.devNotes.createdAt));

  // One-stop performance: blended matrix ratings + GameChanger season line.
  const [matrix, battingTotals, pitchingTotals] = season
    ? await Promise.all([
        getBlendedRatingsByPlayer(season.id).then((m) => m.get(playerId)),
        getSeasonBattingByPlayer(season.id).then((m) => m.get(playerId)),
        getSeasonPitchingByPlayer(season.id).then((m) => m.get(playerId)),
      ])
    : [undefined, undefined, undefined];
  const bat = battingTotals ? battingRates(battingTotals) : null;
  const arm = pitchingTotals ? pitchingRates(pitchingTotals) : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-extrabold">
        Edit {player.firstName} {player.lastName}
      </h1>

      <div className="card p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-bold">Performance at a glance</h2>
          <span className="text-xs text-neutral-500">
            <Link className="underline" href="/matrix">matrix</Link>
            {" · "}
            <Link className="underline" href="/stats">stats</Link>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {matrix ? (
            POSITIONS.map((pos) => {
              const r = matrix.get(pos);
              return (
                <span
                  key={pos}
                  className={`rounded border border-line px-1.5 py-0.5 text-xs font-bold ${
                    r === undefined
                      ? "text-neutral-400"
                      : r >= 8
                        ? "bg-team-orange text-ink"
                        : r >= 6
                          ? "bg-team-blue"
                          : r >= 4
                            ? "bg-team-blue-light"
                            : ""
                  }`}
                >
                  {pos} {r ?? "·"}
                </span>
              );
            })
          ) : (
            <span className="text-sm text-neutral-500">
              No matrix ratings yet — rate on the matrix page.
            </span>
          )}
        </div>
        <p className="mt-2 text-sm">
          {battingTotals && bat ? (
            <>
              <b>Batting</b>: {bat.avg !== null ? bat.avg.toFixed(3).replace(/^0/, "") : "—"} avg
              {bat.ops !== null && <> · {bat.ops.toFixed(3).replace(/^0/, "")} ops</>}
              {" · "}
              {battingTotals.h} H / {battingTotals.ab} AB · {battingTotals.rbi} RBI
            </>
          ) : (
            <span className="text-neutral-500">No batting stats imported yet.</span>
          )}
        </p>
        {pitchingTotals && arm && pitchingTotals.outs > 0 && (
          <p className="text-sm">
            <b>Pitching</b>: {formatIp(pitchingTotals.outs)} IP · {pitchingTotals.k} K ·{" "}
            {arm.era !== null ? `${arm.era.toFixed(2)} ERA` : ""}
            {arm.whip !== null && <> · {arm.whip.toFixed(2)} WHIP</>}
          </p>
        )}
      </div>

      <form action={updatePlayer} className="card space-y-3 p-4">
        <input type="hidden" name="playerId" value={player.id} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input className="field" id="firstName" name="firstName" defaultValue={player.firstName} required />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Last name</label>
            <input className="field" id="lastName" name="lastName" defaultValue={player.lastName} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="jerseyNumber">Jersey #</label>
            <input
              className="field"
              id="jerseyNumber"
              name="jerseyNumber"
              type="number"
              min={0}
              max={99}
              defaultValue={entry?.jerseyNumber ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="birthdate">Birthdate</label>
            <input
              className="field"
              id="birthdate"
              name="birthdate"
              type="date"
              defaultValue={player.birthdate ?? ""}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="school">School</label>
          <input className="field" id="school" name="school" defaultValue={player.school ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="status">Roster status</label>
            <select className="field" id="status" name="status" defaultValue={entry?.status ?? "full"}>
              <option value="full">Full-time</option>
              <option value="practice">Practice player</option>
              <option value="hopeful">Hopeful</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="positions">Positions</label>
            <input
              className="field"
              id="positions"
              name="positions"
              defaultValue={entry?.positions ?? ""}
              placeholder="e.g. P, SS, CF"
            />
          </div>
        </div>
        <button className="btn btn-primary w-full" type="submit">
          Save changes
        </button>
      </form>

      {guardians.length > 0 && (
        <div className="card p-4 text-sm">
          <h2 className="mb-1 font-bold">Parents / guardians</h2>
          {guardians.map((g, i) => (
            <p key={i}>
              <span className="font-semibold">{g.firstName} {g.lastName}</span>
              {g.email && <> · {g.email}</>}
              {g.phone && <> · {g.phone}</>}
            </p>
          ))}
        </div>
      )}

      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Development ratings</h2>
          <Link className="btn btn-blue px-2 py-1 text-xs" href={`/rate/${player.id}`}>
            Rate now
          </Link>
        </div>
        {hasRatings ? (
          <table className="w-full text-sm">
            <tbody>
              {trends.map(({ dim, trend }) =>
                trend.latest === null ? null : (
                  <tr key={dim.key} className="border-b border-line">
                    <td className="py-1 pr-2">{dim.label}</td>
                    <td className="py-1 pr-2 text-right font-bold">
                      {trend.latest}
                      {trend.direction && (
                        <span
                          className={
                            trend.direction === "up"
                              ? "ml-1 text-green-700"
                              : trend.direction === "down"
                                ? "ml-1 text-red-700"
                                : "ml-1 text-neutral-500"
                          }
                        >
                          {TREND_ARROW[trend.direction]}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right text-xs text-neutral-500">
                      {trend.points.join(" · ")}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-600">No ratings yet.</p>
        )}
      </div>

      <form action={saveAspirations} className="card space-y-3 p-4">
        <h2 className="font-bold">Aspirational goals</h2>
        <input type="hidden" name="playerId" value={player.id} />
        <div>
          <label className="label" htmlFor="desiredPositions">Wants to play</label>
          <input
            className="field"
            id="desiredPositions"
            name="desiredPositions"
            defaultValue={aspiration?.desiredPositions ?? ""}
            placeholder="e.g. C, SS"
          />
        </div>
        <div>
          <label className="label" htmlFor="seasonGoals">
            Season goals <span className="normal-case text-neutral-500">(shared with family)</span>
          </label>
          <textarea
            className="field"
            id="seasonGoals"
            name="seasonGoals"
            rows={2}
            defaultValue={aspiration?.seasonGoals ?? ""}
          />
        </div>
        <div>
          <label className="label" htmlFor="coachNotes">
            Coach-only notes
          </label>
          <textarea
            className="field"
            id="coachNotes"
            name="coachNotes"
            rows={2}
            defaultValue={aspiration?.coachNotes ?? ""}
          />
        </div>
        <button className="btn btn-primary" type="submit">Save goals</button>
      </form>

      <div className="card space-y-3 p-4">
        <h2 className="font-bold">Development notes (tendency → cue)</h2>
        {notes.length > 0 && (
          <ul className="space-y-2 text-sm">
            {notes.map((n) => (
              <li key={n.id} className="rounded border border-line/20 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded border border-line bg-team-blue-light px-1 text-[10px] font-bold uppercase">
                      {n.category}
                    </span>{" "}
                    <span className="text-neutral-700">{n.tendency}</span>
                    <div className="font-semibold">→ {n.cue}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={toggleNoteShared}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        className={`rounded border border-line px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          n.shared ? "bg-green-600 text-white" : "bg-paper"
                        }`}
                        type="submit"
                        title={n.shared ? "Shared with family — click to make coach-only" : "Coach-only — click to share"}
                      >
                        {n.shared ? "Shared" : "Coach-only"}
                      </button>
                    </form>
                    <form action={deleteDevNote}>
                      <input type="hidden" name="id" value={n.id} />
                      <button className="text-xs text-red-700 underline" type="submit">
                        ✕
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {/* Keyed by note count so every field (incl. the shared checkbox)
            resets after an add — uncontrolled inputs survive re-renders. */}
        <form
          key={notes.length}
          action={addDevNote}
          className="space-y-2 border-t border-line/20 pt-2"
        >
          <input type="hidden" name="playerId" value={player.id} />
          <div className="grid grid-cols-2 gap-2">
            <select className="field" name="category" defaultValue="general">
              <option value="pitching">Pitching</option>
              <option value="hitting">Hitting</option>
              <option value="fielding">Fielding</option>
              <option value="general">General</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="shared" className="h-4 w-4 accent-team-orange" />
              Share with family
            </label>
          </div>
          <input className="field" name="tendency" placeholder="Tendency — e.g. lets arm get in front of body" required />
          <input className="field" name="cue" placeholder="Cue — e.g. let the arm be pulled by the body" required />
          <button className="btn btn-blue text-sm" type="submit">Add note</button>
        </form>
      </div>

      <div className="card space-y-3 border-red-700 p-4">
        <h2 className="font-bold text-red-700">Careful zone</h2>
        <form action={removeFromSeason} className="flex items-center justify-between gap-2 text-sm">
          <input type="hidden" name="playerId" value={player.id} />
          <span>Take off this season's roster (keeps the player and their history).</span>
          <button className="btn shrink-0 text-xs" type="submit">Remove from season</button>
        </form>
        <form action={deletePlayer} className="flex items-center justify-between gap-2 text-sm">
          <input type="hidden" name="playerId" value={player.id} />
          <span>Delete permanently — removes ratings, RSVPs, and availability too.</span>
          <button className="btn shrink-0 bg-red-700 text-xs text-paper" type="submit">
            Delete player
          </button>
        </form>
      </div>
    </div>
  );
}
