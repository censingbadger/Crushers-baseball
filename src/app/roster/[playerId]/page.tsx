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
import { DIMENSIONS, dimensionTrend } from "@/lib/development";

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
        .from(tables.playerRatings)
        .where(
          and(
            eq(tables.playerRatings.seasonId, season.id),
            eq(tables.playerRatings.playerId, playerId),
          ),
        )
    : [];
  const trends = DIMENSIONS.map((dim) => ({
    dim,
    trend: dimensionTrend(
      ratingRows
        .filter((r) => r.dimension === dim.key)
        .map((r) => ({ rating: r.rating, createdAt: r.createdAt })),
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

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-extrabold">
        Edit {player.firstName} {player.lastName}
      </h1>

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
                  <tr key={dim.key} className="border-b border-ink/10">
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
              <li key={n.id} className="rounded border-2 border-ink/20 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="rounded border border-ink bg-team-blue-light px-1 text-[10px] font-bold uppercase">
                      {n.category}
                    </span>{" "}
                    <span className="text-neutral-700">{n.tendency}</span>
                    <div className="font-semibold">→ {n.cue}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={toggleNoteShared}>
                      <input type="hidden" name="id" value={n.id} />
                      <button
                        className={`rounded border border-ink px-1.5 py-0.5 text-[10px] font-bold uppercase ${
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
        <form action={addDevNote} className="space-y-2 border-t-2 border-ink/20 pt-2">
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
