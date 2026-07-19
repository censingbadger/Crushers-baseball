import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getGuardiansByPlayer } from "@/lib/data";
import { deletePlayer, removeFromSeason, updatePlayer } from "@/app/roster/actions";

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
