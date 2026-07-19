import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason } from "@/lib/data";
import { DIMENSIONS, initialsOf } from "@/lib/development";
import { saveRatings } from "@/app/rate/actions";

const SCALE = [1, 2, 3, 4, 5];

export default async function RatePlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const user = await requireCoach();
  const { playerId } = await params;
  const db = await getDb();
  const [player] = await db
    .select()
    .from(tables.players)
    .where(eq(tables.players.id, playerId))
    .limit(1);
  if (!player) notFound();
  const season = await getActiveSeason();
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

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">
          Rate {player.firstName} {player.lastName}
        </h1>
        {(aspiration?.seasonGoals || aspiration?.desiredPositions) && (
          <div className="mt-2 rounded border border-line bg-team-blue-light p-2 text-sm">
            <span className="font-bold">Working toward:</span>{" "}
            {aspiration.seasonGoals}
            {aspiration.desiredPositions && (
              <span className="text-neutral-700">
                {aspiration.seasonGoals ? " · " : ""}wants to play{" "}
                {aspiration.desiredPositions}
              </span>
            )}
          </div>
        )}
      </div>

      <form action={saveRatings} className="card space-y-4 p-4">
        <input type="hidden" name="playerId" value={player.id} />
        {DIMENSIONS.map((dim, i) => (
          <div key={dim.key}>
            {i === 5 && (
              <p className="mb-2 border-t border-line/20 pt-3 text-xs font-bold uppercase tracking-wide text-team-orange-dark">
                The intangibles
              </p>
            )}
            <span className="label">{dim.label}</span>
            <div className="flex gap-1">
              {SCALE.map((v) => (
                <label key={v} className="flex-1">
                  <input
                    type="radio"
                    name={`dim_${dim.key}`}
                    value={v}
                    className="peer sr-only"
                  />
                  <span className="block cursor-pointer rounded border border-line py-1.5 text-center font-bold peer-checked:bg-team-orange peer-checked:text-paper hover:bg-team-blue-light">
                    {v}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="grid grid-cols-2 gap-3 border-t border-line/20 pt-3">
          <div>
            <label className="label" htmlFor="context">Context</label>
            <select className="field" id="context" name="context" defaultValue="practice">
              <option value="practice">Practice</option>
              <option value="game">Game</option>
              <option value="general">General</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="rater">Coach</label>
            <input
              className="field"
              id="rater"
              name="rater"
              defaultValue={initialsOf(user.displayName)}
              maxLength={20}
              required
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="note">Note (optional)</label>
          <input className="field" id="note" name="note" placeholder="e.g. locked in behind the plate today" />
        </div>
        <button className="btn btn-primary w-full" type="submit">
          Save ratings
        </button>
        <p className="text-center text-xs text-neutral-500">
          Skip any dimension you didn't observe — blanks aren't recorded.
        </p>
      </form>
    </div>
  );
}
