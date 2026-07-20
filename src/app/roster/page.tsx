import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveSeason, getGuardiansByPlayer, getRoster } from "@/lib/data";
import { formatIsoDay } from "@/lib/format";
import {
  getBlendedRatingsByPlayer,
  getSeasonBattingByPlayer,
  getSeasonCatchingByPlayer,
  getSeasonFieldingByPlayer,
  getSeasonPitchingByPlayer,
  topPositions,
} from "@/lib/performance";
import {
  battingRates,
  catchingRates,
  fieldingRates,
  formatIp,
  pitchingRates,
} from "@/lib/stats";
import { POSITIONS } from "@/db/schema";
import { DIMENSIONS, dimensionTrend } from "@/lib/development";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";

export default async function RosterPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const roster = await getRoster(season.id);
  const isCoach = user.role === "coach";
  const guardians = isCoach
    ? await getGuardiansByPlayer(roster.map((r) => r.playerId))
    : null;
  // The one-stop data: coach ratings + all GameChanger stats + feedback.
  const [blended, batting, pitching, fielding, catching, feedbackRows] = isCoach
    ? await Promise.all([
        getBlendedRatingsByPlayer(season.id),
        getSeasonBattingByPlayer(season.id),
        getSeasonPitchingByPlayer(season.id),
        getSeasonFieldingByPlayer(season.id),
        getSeasonCatchingByPlayer(season.id),
        (await getDb())
          .select()
          .from(tables.playerRatings)
          .where(eq(tables.playerRatings.seasonId, season.id)),
      ])
    : [null, null, null, null, null, null];

  // Latest feedback score + trend per dimension per player.
  const feedbackByPlayer = new Map<
    string,
    { key: string; label: string; latest: number; arrow: string }[]
  >();
  if (feedbackRows) {
    const byPlayer = new Map<string, typeof feedbackRows>();
    for (const r of feedbackRows) {
      byPlayer.set(r.playerId, [...(byPlayer.get(r.playerId) ?? []), r]);
    }
    const ARROW = { up: "↗", down: "↘", flat: "→" } as const;
    for (const [pid, rows] of byPlayer) {
      const dims = DIMENSIONS.map((dim) => {
        const trend = dimensionTrend(
          rows
            .filter((r) => r.dimension === dim.key)
            .map((r) => ({ rating: r.rating, createdAt: r.createdAt })),
        );
        return trend.latest === null
          ? null
          : {
              key: dim.key,
              label: dim.label,
              latest: trend.latest,
              arrow: trend.direction ? ARROW[trend.direction] : "",
            };
      }).filter((d): d is NonNullable<typeof d> => d !== null);
      if (dims.length > 0) feedbackByPlayer.set(pid, dims);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Roster</h1>
        {isCoach && (
          <Link className="btn btn-primary text-sm" href="/roster/new">
            + Add player
          </Link>
        )}
      </div>
      <div className="card overflow-x-auto p-4">
        <table className="w-full min-w-[560px] text-sm sm:min-w-[840px]">
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2">Status</th>
              <th className="py-1 pr-2">Positions</th>
              {isCoach && <th className="py-1 pr-2">Rated best at</th>}
              {isCoach && <th className="py-1 pr-2">Season bat / arm</th>}
              {isCoach && <th className="py-1 pr-2">Birthdate</th>}
              {isCoach && <th className="py-1 pr-2">School</th>}
              {isCoach && <th className="py-1">Parents / guardians</th>}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => (
              <RosterRow
                key={p.playerId}
                p={p}
                isCoach={isCoach}
                guardians={guardians?.get(p.playerId) ?? []}
                blended={blended?.get(p.playerId)}
                batting={batting?.get(p.playerId)}
                pitching={pitching?.get(p.playerId)}
                fielding={fielding?.get(p.playerId)}
                catching={catching?.get(p.playerId)}
                feedback={feedbackByPlayer.get(p.playerId)}
              />
            ))}
          </tbody>
        </table>
        {!isCoach && (
          <p className="mt-3 text-xs text-neutral-500">
            Contact details are visible to coaches only.
          </p>
        )}
      </div>
    </div>
  );
}

function RosterRow({
  p,
  isCoach,
  guardians,
  blended,
  batting,
  pitching,
  fielding,
  catching,
  feedback,
}: {
  p: Awaited<ReturnType<typeof getRoster>>[number];
  isCoach: boolean;
  guardians: { firstName: string; lastName: string; email: string | null; phone: string | null }[];
  blended: Map<(typeof POSITIONS)[number], number> | undefined;
  batting: Parameters<typeof battingRates>[0] | undefined;
  pitching: Parameters<typeof pitchingRates>[0] | undefined;
  fielding: Parameters<typeof fieldingRates>[0] | undefined;
  catching: Parameters<typeof catchingRates>[0] | undefined;
  feedback: { key: string; label: string; latest: number; arrow: string }[] | undefined;
}) {
  const bat = batting ? battingRates(batting) : null;
  const arm = pitching ? pitchingRates(pitching) : null;
  const glove = fielding ? fieldingRates(fielding) : null;
  const behind = catching ? catchingRates(catching) : null;
  const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(3).replace(/^0/, ""));
  return (
    <>
      <tr className="border-b border-line align-top">
                <td className="py-1.5 pr-2 font-extrabold text-team-blue-dark">
                  {p.jerseyNumber ?? "—"}
                </td>
                <td className="py-1.5 pr-2 font-semibold">
                  {isCoach ? (
                    <Link className="underline-offset-2 hover:underline" href={`/roster/${p.playerId}`}>
                      {p.firstName} {p.lastName}
                    </Link>
                  ) : (
                    <>
                      {p.firstName} {p.lastName}
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-2">
                  {p.status === "practice" ? (
                    <span className="rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-xs font-bold">
                      Practice
                    </span>
                  ) : p.status === "hopeful" ? (
                    <span className="rounded border border-line bg-amber-300 px-1.5 py-0.5 text-xs font-bold">
                      Hopeful
                    </span>
                  ) : (
                    <span className="rounded border border-line bg-team-orange px-1.5 py-0.5 text-xs font-bold text-paper">
                      Full
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-2">{p.positions ?? "—"}</td>
                {isCoach && (
                  <td className="whitespace-nowrap py-1.5 pr-2">
                    {topPositions(blended).map((t) => (
                      <span
                        key={t.position}
                        className="mr-1 rounded border border-line bg-team-blue-light px-1 py-0.5 text-xs font-bold"
                      >
                        {t.position} {t.rating}
                      </span>
                    ))}
                    {topPositions(blended).length === 0 && (
                      <span className="text-xs text-neutral-500">unrated</span>
                    )}
                  </td>
                )}
                {isCoach && (
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs">
                    {bat?.avg !== null && bat?.avg !== undefined
                      ? `${fmt(bat.avg)} avg`
                      : "no ABs"}
                    {pitching && pitching.outs > 0 && (
                      <span className="text-neutral-600"> · {formatIp(pitching.outs)} IP</span>
                    )}
                  </td>
                )}
                {isCoach && (
                  <td className="py-1.5 pr-2">
                    {p.birthdate ? formatIsoDay(p.birthdate) : "—"}
                  </td>
                )}
                {isCoach && <td className="py-1.5 pr-2">{p.school ?? "—"}</td>}
                {isCoach && (
                  <td className="py-1.5 text-xs">
                    {guardians.map((g, i) => (
                      <div key={i}>
                        <span className="font-semibold">
                          {g.firstName} {g.lastName}
                        </span>
                        {g.email && <> · {g.email}</>}
                        {g.phone && <> · {g.phone}</>}
                      </div>
                    ))}
                  </td>
                )}
              </tr>
      {isCoach && (
        <tr className="border-b border-line">
          <td colSpan={9} className="py-0 pl-2">
            <details className="group py-1">
              <summary className="cursor-pointer list-none text-xs font-bold text-team-blue-dark">
                <span className="group-open:hidden">▸ everything on {p.firstName}</span>
                <span className="hidden group-open:inline">▾ {p.firstName}, at a glance</span>
              </summary>
              <div className="grid gap-2 py-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="font-bold uppercase text-neutral-500">Position matrix (blended)</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {POSITIONS.map((pos) => {
                      const v = blended?.get(pos);
                      return (
                        <span
                          key={pos}
                          className={`rounded border border-line px-1.5 py-0.5 font-bold ${
                            v === undefined
                              ? "text-neutral-400"
                              : v >= 8
                                ? "bg-team-orange text-paper"
                                : v >= 6
                                  ? "bg-team-blue"
                                  : v >= 4
                                    ? "bg-team-blue-light"
                                    : ""
                          }`}
                        >
                          {pos} {v ?? "·"}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-2 font-bold uppercase text-neutral-500">Player feedback (latest · trend)</p>
                  {feedback ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {feedback.map((f) => (
                        <span key={f.key} className="rounded border border-line bg-paper-tint px-1.5 py-0.5 font-semibold">
                          {f.label} {f.latest}
                          {f.arrow}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-neutral-500">No feedback scores yet.</p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="font-bold uppercase text-neutral-500">GameChanger season</p>
                  <p>
                    <b>Bat</b>:{" "}
                    {batting && bat
                      ? `${fmt(bat.avg)} avg · ${fmt(bat.ops)} ops · ${batting.h}-${batting.ab}, ${batting.rbi} RBI, ${batting.sb} SB`
                      : "no at-bats yet"}
                  </p>
                  <p>
                    <b>Arm</b>:{" "}
                    {pitching && arm && pitching.outs > 0
                      ? `${formatIp(pitching.outs)} IP · ${pitching.k} K · ${arm.era?.toFixed(2) ?? "—"} ERA · ${arm.whip?.toFixed(2) ?? "—"} WHIP`
                      : "no innings yet"}
                  </p>
                  <p>
                    <b>Glove</b>:{" "}
                    {fielding && glove
                      ? `${glove.chances} TC · ${fielding.e} E · ${fmt(glove.fpct)} FPCT${fielding.dp ? ` · ${fielding.dp} DP` : ""}`
                      : "no fielding data yet"}
                  </p>
                  <p>
                    <b>Behind the plate</b>:{" "}
                    {catching && behind && catching.outs > 0
                      ? `${formatIp(catching.outs)} INN · ${catching.pb} PB · CS ${fmt(behind.csPct)}`
                      : "no catching data yet"}
                  </p>
                </div>
              </div>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}
