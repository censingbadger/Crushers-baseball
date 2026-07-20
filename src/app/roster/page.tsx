import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getActiveSeason, getGuardiansByPlayer, getRoster } from "@/lib/data";
import { formatIsoDay } from "@/lib/format";
import {
  getBlendedRatingsByPlayer,
  getSeasonBattingByPlayer,
  getSeasonPitchingByPlayer,
  topPositions,
} from "@/lib/performance";
import { battingRates, formatIp } from "@/lib/stats";

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
  // The one-stop columns: coach ratings + GameChanger season stats.
  const [blended, batting, pitching] = isCoach
    ? await Promise.all([
        getBlendedRatingsByPlayer(season.id),
        getSeasonBattingByPlayer(season.id),
        getSeasonPitchingByPlayer(season.id),
      ])
    : [null, null, null];

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
              <tr key={p.playerId} className="border-b border-line align-top">
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
                    {topPositions(blended?.get(p.playerId)).map((t) => (
                      <span
                        key={t.position}
                        className="mr-1 rounded border border-line bg-team-blue-light px-1 py-0.5 text-xs font-bold"
                      >
                        {t.position} {t.rating}
                      </span>
                    ))}
                    {topPositions(blended?.get(p.playerId)).length === 0 && (
                      <span className="text-xs text-neutral-500">unrated</span>
                    )}
                  </td>
                )}
                {isCoach && (
                  <td className="whitespace-nowrap py-1.5 pr-2 text-xs">
                    {(() => {
                      const b = batting?.get(p.playerId);
                      const arm = pitching?.get(p.playerId);
                      const avg = b ? battingRates(b).avg : null;
                      return (
                        <>
                          {avg !== null && avg !== undefined
                            ? `${String(avg.toFixed(3)).replace(/^0/, "")} avg`
                            : "no ABs"}
                          {arm && arm.outs > 0 && (
                            <span className="text-neutral-600"> · {formatIp(arm.outs)} IP</span>
                          )}
                        </>
                      );
                    })()}
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
                    {(guardians?.get(p.playerId) ?? []).map((g, i) => (
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
