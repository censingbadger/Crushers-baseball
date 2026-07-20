import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";

export default async function RateIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const { done } = await searchParams;
  const roster = await getRoster(season.id);

  const db = await getDb();
  const recent = await db
    .select({
      playerId: tables.playerRatings.playerId,
      createdAt: tables.playerRatings.createdAt,
    })
    .from(tables.playerRatings)
    .where(eq(tables.playerRatings.seasonId, season.id))
    .orderBy(desc(tables.playerRatings.createdAt));
  const lastRated = new Map<string, Date>();
  for (const r of recent) {
    if (!lastRated.has(r.playerId)) lastRated.set(r.playerId, r.createdAt);
  }
  const donePlayer = roster.find((p) => p.playerId === done);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Player feedback</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Tap a player, score the nine dimensions in under a minute, save.
          Every snapshot is kept, so trends build over the season.
        </p>
      </div>
      {donePlayer && (
        <p className="rounded border border-line bg-green-600 px-3 py-2 text-sm font-semibold text-white">
          ✓ Saved ratings for {donePlayer.firstName} {donePlayer.lastName}. Next player?
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {roster.map((p) => {
          const last = lastRated.get(p.playerId);
          return (
            <Link
              key={p.playerId}
              href={`/rate/${p.playerId}`}
              className="card p-3 font-semibold hover:bg-team-blue-light"
            >
              {p.firstName} {p.lastName}
              <span className="mt-1 block text-xs font-normal text-neutral-500">
                {last
                  ? `last rated ${last.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}`
                  : "never rated"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
