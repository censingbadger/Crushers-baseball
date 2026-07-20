import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { initialsOf } from "@/lib/format";
import { getCurrentRatings } from "@/lib/matrix";
import { QuickRate } from "./QuickRate";

export default async function QuickMatrixPage() {
  const user = await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const rater = initialsOf(user.displayName);
  const [roster, ratings] = await Promise.all([
    getRoster(season.id),
    getCurrentRatings(season.id),
  ]);

  // Prefill only this coach's own column — same as their tab on the grid.
  const mine: Record<string, Record<string, number>> = {};
  for (const r of ratings) {
    if (r.rater !== rater) continue;
    (mine[r.playerId] ??= {})[r.position] = r.rating;
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold">Position matrix — quick entry</h1>
          <Link className="text-sm font-semibold underline" href="/matrix">
            Full grid →
          </Link>
        </div>
        <p className="mt-1 text-sm text-neutral-700">
          One player at a time: tap a number for each position. Every tap
          saves instantly to <b>your</b> column — you&apos;re rating as{" "}
          <b>Coach {rater}</b> — and the blended view updates everywhere.
        </p>
      </div>
      <QuickRate
        players={roster.map((p) => ({
          playerId: p.playerId,
          name: `${p.firstName} ${p.lastName}`,
        }))}
        initialRatings={mine}
        rater={rater}
      />
    </div>
  );
}
