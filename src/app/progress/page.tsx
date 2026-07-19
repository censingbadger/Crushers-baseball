import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { DIMENSIONS, dimensionTrend } from "@/lib/development";
import { monthLabel } from "@/lib/reports";

const TREND_ARROW = { up: "↗", down: "↘", flat: "→" } as const;

export default async function ProgressPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const roster = await getRoster(season.id);
  const mine = new Set(await editablePlayerIds(user));
  const players =
    user.role === "coach" ? roster : roster.filter((p) => mine.has(p.playerId));
  if (players.length === 0) {
    return (
      <p className="card p-6 text-sm">
        No players are linked to your account yet — ask a coach to connect
        your family.
      </p>
    );
  }
  const ids = players.map((p) => p.playerId);

  const db = await getDb();
  const [ratingRows, aspirationRows, noteRows, reportRows] = await Promise.all([
    db
      .select()
      .from(tables.playerRatings)
      .where(
        and(
          eq(tables.playerRatings.seasonId, season.id),
          inArray(tables.playerRatings.playerId, ids),
        ),
      ),
    db
      .select()
      .from(tables.aspirations)
      .where(
        and(
          eq(tables.aspirations.seasonId, season.id),
          inArray(tables.aspirations.playerId, ids),
        ),
      ),
    db
      .select()
      .from(tables.devNotes)
      .where(
        and(
          inArray(tables.devNotes.playerId, ids),
          eq(tables.devNotes.shared, true),
        ),
      )
      .orderBy(asc(tables.devNotes.createdAt)),
    // Only published reports ever leave the coaches' desk.
    db
      .select()
      .from(tables.reports)
      .where(
        and(
          eq(tables.reports.seasonId, season.id),
          inArray(tables.reports.playerId, ids),
          eq(tables.reports.status, "published"),
        ),
      )
      .orderBy(desc(tables.reports.month)),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Player progress</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Season goals, the cues the coaches want remembered at home
          practice, and how each area is trending.
        </p>
      </div>

      {players.map((p) => {
        const aspiration = aspirationRows.find((a) => a.playerId === p.playerId);
        const cues = noteRows.filter((n) => n.playerId === p.playerId);
        const reports = reportRows.filter((r) => r.playerId === p.playerId);
        const trends = DIMENSIONS.map((dim) => ({
          dim,
          trend: dimensionTrend(
            ratingRows
              .filter((r) => r.playerId === p.playerId && r.dimension === dim.key)
              .map((r) => ({ rating: r.rating, createdAt: r.createdAt })),
          ),
        })).filter((t) => t.trend.latest !== null);

        return (
          <section key={p.playerId} className="card space-y-3 p-4">
            <h2 className="text-lg font-extrabold">
              {p.firstName} {p.lastName}
              {p.jerseyNumber != null && (
                <span className="ml-2 text-team-blue-dark">#{p.jerseyNumber}</span>
              )}
            </h2>

            {(aspiration?.seasonGoals || aspiration?.desiredPositions) && (
              <div className="rounded border border-line bg-team-blue-light p-2 text-sm">
                <span className="font-bold">This season:</span>{" "}
                {aspiration.seasonGoals}
                {aspiration.desiredPositions && (
                  <span className="text-neutral-700">
                    {aspiration.seasonGoals ? " · " : ""}wants to play{" "}
                    {aspiration.desiredPositions}
                  </span>
                )}
              </div>
            )}

            {cues.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-team-orange-dark">
                  Remember these cues
                </h3>
                <ul className="space-y-1 text-sm">
                  {cues.map((n) => (
                    <li key={n.id} className="rounded border border-line bg-paper p-2">
                      <span className="rounded border border-line bg-team-blue-light px-1 text-[10px] font-bold uppercase">
                        {n.category}
                      </span>{" "}
                      <span className="font-semibold">{n.cue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {trends.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {trends.map(({ dim, trend }) => (
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
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-neutral-600">No ratings yet this season.</p>
            )}

            {reports.length > 0 && (
              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-team-orange-dark">
                  Monthly reports from the coaching staff
                </h3>
                <div className="space-y-2">
                  {reports.map((r) => (
                    <details key={r.id} className="rounded border border-line bg-paper">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-bold">
                        {monthLabel(r.month)}
                      </summary>
                      <div className="whitespace-pre-wrap border-t border-line/10 px-3 py-2 text-sm leading-relaxed">
                        {r.finalText ?? r.draftText}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
