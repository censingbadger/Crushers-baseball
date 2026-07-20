import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { POSITIONS } from "@/db/schema";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getPositionRoles, getRoster } from "@/lib/data";
import { aspiringTokens, rolesByPlayerFrom } from "@/lib/depth";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import { suggestStations } from "@/lib/practice";
import { computeSeasonUsage } from "@/lib/usage";

export default async function PracticeStationsPage() {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const db = await getDb();
  const [roster, roleRows, ratings, aspRows, seasonGames] = await Promise.all([
    getRoster(season.id),
    getPositionRoles(season.id),
    getCurrentRatings(season.id),
    db
      .select({
        playerId: tables.aspirations.playerId,
        desiredPositions: tables.aspirations.desiredPositions,
      })
      .from(tables.aspirations)
      .where(eq(tables.aspirations.seasonId, season.id)),
    db
      .select()
      .from(tables.liveGames)
      .where(eq(tables.liveGames.seasonId, season.id)),
  ]);
  const seasonAssignments = seasonGames.length
    ? await db
        .select()
        .from(tables.gameAssignments)
        .where(
          inArray(
            tables.gameAssignments.gameId,
            seasonGames.map((g) => g.id),
          ),
        )
    : [];

  const blended = blendedLookup(ratings);
  const ratingsByPlayer: Record<string, Record<string, number>> = {};
  for (const p of roster) {
    ratingsByPlayer[p.playerId] = Object.fromEntries(
      blended.get(p.playerId) ?? new Map(),
    );
  }
  const aspiring: Record<string, string[]> = {};
  for (const row of aspRows) {
    const tokens = aspiringTokens(row.desiredPositions);
    if (tokens.length > 0) aspiring[row.playerId] = tokens;
  }
  const usage = computeSeasonUsage(seasonGames, seasonAssignments);
  const playedPositions: Record<string, string[]> = {};
  for (const [pid, u] of usage) {
    playedPositions[pid] = u.positions.map(([pos]) => pos);
  }

  const plan = suggestStations({
    players: roster.map((p) => ({
      playerId: p.playerId,
      name: `${p.firstName} ${p.lastName}`,
    })),
    ratings: ratingsByPlayer,
    roles: rolesByPlayerFrom(roleRows),
    aspiring,
    playedPositions,
  });
  const nameOf = new Map(
    roster.map((p) => [p.playerId, `${p.firstName} ${p.lastName.charAt(0)}.`]),
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold">Practice stations</h1>
          <Link className="text-sm font-semibold underline" href="/depth">
            Depth chart →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          A suggested split for positional practice — everyone stands
          somewhere, and each pick says why: the staff&apos;s{" "}
          <Link className="underline" href="/depth">depth chart</Link> intent
          (develop spots, primaries that need work), what the kid asked for
          (★), and where he actually plays. Doubles land at the second name.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {POSITIONS.map((pos) => (
          <div key={pos} className="card p-3">
            <p className="text-lg font-extrabold">{pos}</p>
            {plan.stations[pos].length === 0 && (
              <p className="mt-1 text-sm text-neutral-500">
                No one to station here.
              </p>
            )}
            {plan.stations[pos].map((s) => (
              <p key={s.playerId} className="mt-1 text-sm font-bold">
                {nameOf.get(s.playerId) ?? "?"}
                {s.reasons.map((r) => (
                  <span
                    key={r}
                    className={`ml-1 rounded border border-line px-1 py-0.5 text-[10px] font-bold ${
                      r === "develop spot"
                        ? "bg-team-blue-light"
                        : r === "needs work"
                          ? "bg-amber-100"
                          : r === "★ wants it"
                            ? "bg-amber-300"
                            : "bg-paper"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </p>
            ))}
            {plan.alternatives[pos].length > 0 && (
              <p className="mt-1.5 border-t border-line pt-1.5 text-xs text-neutral-600">
                also:{" "}
                {plan.alternatives[pos]
                  .map((a) => nameOf.get(a.playerId) ?? "?")
                  .join(", ")}
              </p>
            )}
          </div>
        ))}
      </section>

      <p className="text-xs text-neutral-500">
        The mix updates as the depth chart, ratings, aspirations, and game
        records change — reload before practice for the current read.
      </p>
    </div>
  );
}
