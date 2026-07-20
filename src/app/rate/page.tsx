import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  BARS_DIMENSIONS,
  BARS_LEVEL_LOGIC,
  NOT_OBSERVED,
  type BarsCluster,
} from "@/lib/bars";
import { initialsOf } from "@/lib/format";
import { formatIsoDay } from "@/lib/format";

const CLUSTER_LABEL: Record<BarsCluster, string> = {
  technical: "Technical — rate 3× a season",
  tactical: "Tactical — rate 3× a season",
  "self-regulation": "Self-regulation — rate after each tournament",
  team: "Team behavior — rate after each tournament",
  role: "Role modules — pitchers and catchers only",
};

export default async function RateIndexPage() {
  const user = await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const rater = initialsOf(user.displayName);
  const roster = await getRoster(season.id);
  const db = await getDb();
  const rows = await db
    .select({
      dimension: tables.barsRatings.dimension,
      playerId: tables.barsRatings.playerId,
      rater: tables.barsRatings.rater,
      level: tables.barsRatings.level,
      day: tables.barsRatings.day,
    })
    .from(tables.barsRatings)
    .where(eq(tables.barsRatings.seasonId, season.id));

  // My coverage per dimension: distinct players I've observed, latest day.
  const mine = new Map<string, { players: Set<string>; lastDay: string }>();
  for (const r of rows) {
    if (r.rater !== rater || r.level === NOT_OBSERVED) continue;
    const cur = mine.get(r.dimension) ?? { players: new Set(), lastDay: "" };
    cur.players.add(r.playerId);
    if (r.day > cur.lastDay) cur.lastDay = r.day;
    mine.set(r.dimension, cur);
  }

  const clusters: BarsCluster[] = [
    "technical",
    "tactical",
    "self-regulation",
    "team",
    "role",
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Player feedback — development levels</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Behaviorally anchored 1–5 levels, rated against the standard for a
          competitive 11U player — never against our own roster. <b>3 is the
          target</b>: does it reliably, without prompting, in routine game
          conditions. A team of twelve 3s is a successful 11U team; 5s are
          rare on purpose. Rate one dimension at a time, from games and
          scrimmages — not drills — and use <b>Not observed</b> honestly.
        </p>
      </div>

      <details className="card p-3 text-sm">
        <summary className="cursor-pointer font-bold">
          The five levels (same logic for every dimension)
        </summary>
        <ul className="mt-2 space-y-1">
          {BARS_LEVEL_LOGIC.map((l) => (
            <li key={l.level}>
              <b>
                {l.level} — {l.label}:
              </b>{" "}
              {l.logic}
            </li>
          ))}
        </ul>
      </details>

      {clusters.map((cluster) => (
        <section key={cluster}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-neutral-500">
            {CLUSTER_LABEL[cluster]}
          </h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {BARS_DIMENSIONS.filter((d) => d.cluster === cluster).map((d) => {
              const cov = mine.get(d.key);
              return (
                <Link
                  key={d.key}
                  href={`/rate/${d.key}`}
                  className="card p-3 transition hover:bg-team-blue-light"
                >
                  <p className="font-extrabold">
                    <span className="mr-1.5 rounded border border-line bg-team-blue-light px-1 text-xs">
                      {d.code}
                    </span>
                    {d.label}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-600">{d.sub}</p>
                  <p className="mt-1 text-xs font-semibold text-neutral-500">
                    {cov
                      ? `you: ${cov.players.size}/${roster.length} rated · last ${formatIsoDay(cov.lastDay)}`
                      : "you haven't rated this yet"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
