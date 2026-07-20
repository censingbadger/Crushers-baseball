import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  BARS_BY_KEY,
  BARS_KEYS,
  youngestQuartile,
  type BarsKey,
} from "@/lib/bars";
import { initialsOf } from "@/lib/format";
import { RateBars } from "./RateBars";

export default async function RateDimensionPage({
  params,
}: {
  params: Promise<{ dimension: string }>;
}) {
  const user = await requireCoach();
  const { dimension } = await params;
  // Old per-player links (and anything unknown) land back on the picker.
  if (!(BARS_KEYS as readonly string[]).includes(dimension)) redirect("/rate");
  const key = dimension as BarsKey;
  const def = BARS_BY_KEY[key];

  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const rater = initialsOf(user.displayName);
  const roster = await getRoster(season.id);
  const db = await getDb();
  const rows = await db
    .select()
    .from(tables.barsRatings)
    .where(
      and(
        eq(tables.barsRatings.seasonId, season.id),
        eq(tables.barsRatings.dimension, key),
      ),
    )
    .orderBy(tables.barsRatings.createdAt);

  // My latest entry per player (any level incl. not-observed) — prefill.
  const mine: Record<string, { level: number; day: string }> = {};
  for (const r of rows) {
    if (r.rater === rater) mine[r.playerId] = { level: r.level, day: r.day };
  }

  const youngest = youngestQuartile(roster);

  return (
    <RateBars
      def={{
        key: def.key,
        code: def.code,
        label: def.label,
        sub: def.sub,
        cluster: def.cluster,
        cadence: def.cadence,
        anchors: def.anchors,
        guardrail: def.guardrail ?? null,
        roleModule: Boolean(def.roleModule),
      }}
      players={roster.map((p) => ({
        playerId: p.playerId,
        name: `${p.firstName} ${p.lastName}`,
        youngest: youngest.has(p.playerId),
      }))}
      initial={mine}
      rater={rater}
    />
  );
}
