import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getPositionRoles, getRoster } from "@/lib/data";
import { aspiringTokens } from "@/lib/depth";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import { getDb, tables } from "@/db";
import { eq } from "drizzle-orm";
import { DepthGrid } from "./DepthGrid";

const LEGEND: { letter: string; name: string; blurb: string; cls: string }[] = [
  { letter: "P", name: "Primary", blurb: "where we want him", cls: "bg-team-orange text-ink border-team-orange-dark" },
  { letter: "S", name: "Secondary", blurb: "fine anytime", cls: "bg-team-blue border-team-blue-dark" },
  { letter: "D", name: "Develop", blurb: "reps when the game allows", cls: "bg-team-blue-light border-line" },
  { letter: "E", name: "Emergency", blurb: "only if we must, or up big", cls: "bg-paper text-neutral-500 border-dashed border-line" },
  { letter: "N", name: "Never", blurb: "not in a real game", cls: "bg-red-100 text-red-700 border-red-300" },
];

export default async function DepthChartPage() {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const db = await getDb();
  const [roster, roleRows, ratings, aspRows] = await Promise.all([
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
  ]);

  const initialRoles: Record<string, Record<string, string>> = {};
  for (const r of roleRows) {
    (initialRoles[r.playerId] ??= {})[r.position] = r.role;
  }
  const blended = blendedLookup(ratings);
  const abilities: Record<string, Record<string, number>> = {};
  for (const p of roster) {
    abilities[p.playerId] = Object.fromEntries(blended.get(p.playerId) ?? new Map());
  }
  const aspiring: Record<string, string[]> = {};
  for (const row of aspRows) {
    const tokens = aspiringTokens(row.desiredPositions);
    if (tokens.length > 0) aspiring[row.playerId] = tokens;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-extrabold">Depth chart</h1>
          <Link className="text-sm font-semibold underline" href="/matrix">
            Position matrix →
          </Link>
        </div>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Where should each kid play? The <Link className="underline" href="/matrix">position matrix</Link>{" "}
          grades ability; this chart records the staff&apos;s call — and Game day
          suggestions rank with both. One shared chart: any coach can tap, every
          tap saves instantly. Small number = blended ability there, ★ = the
          kid asked for the spot.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {LEGEND.map((l) => (
          <span key={l.letter} className="flex items-center gap-1.5 rounded border border-line bg-paper px-1.5 py-1">
            <span className={`inline-block w-5 rounded border text-center font-extrabold ${l.cls}`}>
              {l.letter}
            </span>
            <span>
              <b>{l.name}</b> — {l.blurb}
            </span>
          </span>
        ))}
        <span className="flex items-center rounded border border-line bg-paper px-1.5 py-1 text-neutral-600">
          Tap a cell to cycle · blank = no call yet
        </span>
      </div>

      <DepthGrid
        players={roster.map((p) => ({
          playerId: p.playerId,
          name: `${p.firstName} ${p.lastName}`,
        }))}
        initialRoles={initialRoles}
        abilities={abilities}
        aspiring={aspiring}
      />

      <p className="text-xs text-neutral-500">
        How Game day uses this: in a close game, primaries and secondaries get
        the field and <b>never</b> is off-limits to suggestions; flip the
        dugout to &ldquo;Up big&rdquo; and the develop spots and ★ picks get
        the reps instead. You can always drag anyone anywhere by hand.
      </p>
    </div>
  );
}
