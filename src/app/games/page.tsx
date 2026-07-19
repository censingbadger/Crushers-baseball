import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getSeasonEvents } from "@/lib/data";
import { EVENT_TYPE_LABEL, formatEventDate } from "@/lib/format";
import { createGame, removeGame } from "@/app/game/actions";

export default async function GamesPage() {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const db = await getDb();
  const games = await db
    .select()
    .from(tables.liveGames)
    .where(eq(tables.liveGames.seasonId, season.id))
    .orderBy(desc(tables.liveGames.createdAt));
  const events = (await getSeasonEvents(season.id)).filter(
    (e) => e.type !== "practice",
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Game day</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Start a game and the dugout dashboard seeds itself with the
          strongest lineup from today's RSVPs and the matrix.
        </p>
      </div>

      <form action={createGame} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="eventId">Event</label>
          <select className="field" id="eventId" name="eventId" required>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatEventDate(e.startsAt)} · {e.title ?? EVENT_TYPE_LABEL[e.type]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="label">Game label</label>
          <input className="field" id="label" name="label" defaultValue="Game 1" required />
        </div>
        <div>
          <label className="label" htmlFor="opponent">Opponent</label>
          <input className="field" id="opponent" name="opponent" placeholder="(from event)" />
        </div>
        <div>
          <label className="label" htmlFor="innings">Innings</label>
          <input className="field w-20" id="innings" name="innings" type="number" min={1} max={9} defaultValue={6} />
        </div>
        <button className="btn btn-primary" type="submit">
          Create game
        </button>
      </form>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">Games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-neutral-600">None yet.</p>
        ) : (
          <ul className="divide-y-2 divide-ink/10">
            {games.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <span
                  className={`rounded border-2 border-ink px-1.5 py-0.5 text-xs font-bold uppercase ${
                    g.status === "live"
                      ? "bg-green-600 text-white"
                      : g.status === "final"
                        ? "bg-ink text-paper"
                        : "bg-team-blue-light"
                  }`}
                >
                  {g.status}
                </span>
                <Link href={`/game/${g.id}`} className="min-w-0 flex-1 basis-52 font-semibold underline-offset-2 hover:underline">
                  {g.label}
                  {g.opponent && <span className="text-neutral-600"> vs {g.opponent}</span>}
                  <span className="ml-2 text-xs text-neutral-500">{g.gameDate}</span>
                </Link>
                <form action={removeGame}>
                  <input type="hidden" name="gameId" value={g.id} />
                  <button className="text-xs text-red-700 underline" type="submit">
                    delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
