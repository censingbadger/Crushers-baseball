import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { initialsOf } from "@/lib/format";
import {
  blendedLookup,
  getCurrentRatings,
  listRaters,
} from "@/lib/matrix";
import { POSITIONS } from "@/db/schema";

function ratingBg(v: number | undefined): string {
  if (v === undefined) return "";
  if (v >= 8) return "bg-team-orange text-paper font-bold";
  if (v >= 6) return "bg-team-blue font-semibold";
  if (v >= 4) return "bg-team-blue-light";
  return "text-neutral-500";
}

export default async function MatrixPage() {
  const user = await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const [roster, ratings] = await Promise.all([
    getRoster(season.id),
    getCurrentRatings(season.id),
  ]);
  const raters = listRaters(ratings);
  const blended = blendedLookup(ratings);
  const rater = initialsOf(user.displayName);
  const ratedCount = (playerId: string) => blended.get(playerId)?.size ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Position matrix</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-700">
            The blend of every coach&apos;s current 1–10 ratings
            {raters.length > 0 && (
              <> (rating now: {raters.map((r) => `Coach ${r}`).join(", ")})</>
            )}
            . This view is read-only — each coach&apos;s own numbers are
            entered player by player.
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-2">
          <Link className="btn btn-primary px-5 py-2" href="/matrix/quick">
            ✎ Rate players (as Coach {rater})
          </Link>
          <Link className="btn px-4 py-2" href="/depth">
            Depth chart
          </Link>
        </span>
      </div>

      <section className="card overflow-x-auto p-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-2 text-left">Player</th>
              {POSITIONS.map((pos) => (
                <th key={pos} className="border border-line px-2 py-1 text-center">
                  {pos}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const values = blended.get(p.playerId);
              return (
                <tr key={p.playerId}>
                  <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">
                    {p.firstName} {p.lastName}
                    {p.status !== "full" && (
                      <span className="ml-1 rounded border border-line bg-team-blue-light px-1 py-0.5 text-[11px] font-bold uppercase">
                        {p.status}
                      </span>
                    )}
                    {ratedCount(p.playerId) < POSITIONS.length && (
                      <span className="ml-1 rounded border border-amber-400 bg-amber-100 px-1 py-0.5 text-[11px] font-bold text-amber-800">
                        {ratedCount(p.playerId)}/9
                      </span>
                    )}
                  </td>
                  {POSITIONS.map((pos) => {
                    const v = values?.get(pos);
                    return (
                      <td key={pos} className="border border-line p-0 text-center">
                        <span className={`block px-1 py-1.5 ${ratingBg(v)}`}>
                          {v ?? "·"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-neutral-600">
          Blank cells count as unknowns everywhere lineups are suggested — a
          full row per player keeps the tools honest. The original workbook
          import lives on the <Link className="underline" href="/import">Import page</Link>.
        </p>
      </section>
    </div>
  );
}
