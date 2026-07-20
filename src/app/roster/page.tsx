import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getGuardiansByPlayer,
  getPositionRoles,
  getRoster,
} from "@/lib/data";
import { rolesByPlayerFrom, type RolesByPlayer } from "@/lib/depth";
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
import { BARS_BY_KEY, barsSummary } from "@/lib/bars";
import { computeSeasonUsage, type PlayerUsage } from "@/lib/usage";
import { eq, inArray } from "drizzle-orm";
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
  // Depth-chart roles drive the Positions chips: the staff's call first,
  // ability as the number inside the chip.
  const rolesByPlayer: RolesByPlayer = isCoach
    ? rolesByPlayerFrom(await getPositionRoles(season.id))
    : {};
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
          .from(tables.barsRatings)
          .where(eq(tables.barsRatings.seasonId, season.id)),
      ])
    : [null, null, null, null, null, null];

  // Season playing-time ledger from the dugout's game records.
  let usage: ReturnType<typeof computeSeasonUsage> = new Map();
  if (isCoach) {
    const db = await getDb();
    const liveGames = await db
      .select()
      .from(tables.liveGames)
      .where(eq(tables.liveGames.seasonId, season.id));
    const liveIds = liveGames.map((g) => g.id);
    const assignmentRows = liveIds.length
      ? await db
          .select()
          .from(tables.gameAssignments)
          .where(inArray(tables.gameAssignments.gameId, liveIds))
      : [];
    usage = computeSeasonUsage(liveGames, assignmentRows);
  }

  // BARS development levels: each rater's latest observed level, medianed
  // across raters, with two-level splits flagged rather than averaged away.
  const feedbackByPlayer = new Map<
    string,
    { key: string; label: string; latest: number; arrow: string; flagged: boolean }[]
  >();
  if (feedbackRows) {
    const ARROW = { up: "↗", down: "↘", flat: "→" } as const;
    for (const [pid, cells] of barsSummary(feedbackRows)) {
      const dims = [...cells.entries()].map(([key, cell]) => ({
        key,
        label: `${BARS_BY_KEY[key].code} ${BARS_BY_KEY[key].label}`,
        latest: cell.median,
        arrow: cell.direction ? ARROW[cell.direction] : "",
        flagged: cell.flagged,
      }));
      if (dims.length > 0) feedbackByPlayer.set(pid, dims);
    }
  }

  const counts = { full: 0, hopeful: 0, practice: 0 };
  for (const p of roster) {
    if (p.status === "hopeful") counts.hopeful += 1;
    else if (p.status === "practice") counts.practice += 1;
    else counts.full += 1;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Roster</h1>
          <p className="text-xs font-semibold text-neutral-500">
            {roster.length} players · {counts.full} full
            {counts.hopeful > 0 && <> · {counts.hopeful} hopeful</>}
            {counts.practice > 0 && <> · {counts.practice} practice</>}
          </p>
        </div>
        {isCoach && (
          <Link className="btn btn-primary text-sm" href="/roster/new">
            + Add player
          </Link>
        )}
      </div>

      {isCoach ? (
        <div className="space-y-2">
          {roster.map((p) => (
            <PlayerCard
              key={p.playerId}
              p={p}
              guardians={guardians?.get(p.playerId) ?? []}
              roles={rolesByPlayer[p.playerId] ?? {}}
              blended={blended?.get(p.playerId)}
              batting={batting?.get(p.playerId)}
              pitching={pitching?.get(p.playerId)}
              fielding={fielding?.get(p.playerId)}
              catching={catching?.get(p.playerId)}
              feedback={feedbackByPlayer.get(p.playerId)}
              usage={usage.get(p.playerId)}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="card divide-y divide-line p-0">
            {roster.map((p) => (
              <div key={p.playerId} className="flex items-center gap-3 px-3 py-2">
                <span className="w-8 shrink-0 text-center text-lg font-extrabold text-team-blue-dark">
                  {p.jerseyNumber ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {p.firstName} {p.lastName}
                </span>
                <StatusChip status={p.status} />
                <span className="hidden max-w-[40%] truncate text-xs text-neutral-600 sm:block">
                  {p.positions ?? "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-500">
            Contact details are visible to coaches only.
          </p>
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  if (status === "practice") {
    return (
      <span className="shrink-0 rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-xs font-bold">
        Practice
      </span>
    );
  }
  if (status === "hopeful") {
    return (
      <span className="shrink-0 rounded border border-line bg-amber-300 px-1.5 py-0.5 text-xs font-bold">
        Hopeful
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded border border-line bg-team-orange px-1.5 py-0.5 text-xs font-bold text-paper">
      Full
    </span>
  );
}

/**
 * One expandable card per player: the always-visible header carries the
 * at-a-glance essentials (number, name, status, position chips, season
 * line), and tapping anywhere on it opens the "everything" panel —
 * matrix, development levels, GameChanger season, playing time, and the
 * family contacts — with the edit page one prominent button away.
 */
function PlayerCard({
  p,
  guardians,
  roles,
  blended,
  batting,
  pitching,
  fielding,
  catching,
  feedback,
  usage,
}: {
  p: Awaited<ReturnType<typeof getRoster>>[number];
  guardians: { firstName: string; lastName: string; email: string | null; phone: string | null }[];
  roles: NonNullable<RolesByPlayer[string]>;
  blended: Map<(typeof POSITIONS)[number], number> | undefined;
  batting: Parameters<typeof battingRates>[0] | undefined;
  pitching: Parameters<typeof pitchingRates>[0] | undefined;
  fielding: Parameters<typeof fieldingRates>[0] | undefined;
  catching: Parameters<typeof catchingRates>[0] | undefined;
  feedback: { key: string; label: string; latest: number; arrow: string; flagged: boolean }[] | undefined;
  usage: PlayerUsage | undefined;
}) {
  const bat = batting ? battingRates(batting) : null;
  const arm = pitching ? pitchingRates(pitching) : null;
  const glove = fielding ? fieldingRates(fielding) : null;
  const behind = catching ? catchingRates(catching) : null;
  const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(3).replace(/^0/, ""));
  return (
    <details className="group card overflow-hidden p-0">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 hover:bg-team-blue-light/40 [&::-webkit-details-marker]:hidden">
        <span className="w-8 shrink-0 text-center text-xl font-extrabold text-team-blue-dark">
          {p.jerseyNumber ?? "—"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link
              className="font-bold underline-offset-2 hover:underline"
              href={`/roster/${p.playerId}`}
            >
              {p.firstName} {p.lastName}
            </Link>
            <StatusChip status={p.status} />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <PositionChips roles={roles} blended={blended} />
          </span>
        </span>
        <span className="hidden shrink-0 text-right text-xs text-neutral-500 md:block">
          {bat?.avg !== null && bat?.avg !== undefined ? `${fmt(bat.avg)} avg` : "no ABs"}
          {pitching && pitching.outs > 0 && (
            <>
              <br />
              {formatIp(pitching.outs)} IP
            </>
          )}
        </span>
        <span
          className="shrink-0 rounded-lg border border-line px-2 py-1 text-xs font-bold text-team-blue-dark group-open:bg-team-blue-light"
          data-testid="expand-everything"
        >
          <span className="group-open:hidden">
            ▸ everything<span className="hidden sm:inline"> on {p.firstName}</span>
          </span>
          <span className="hidden group-open:inline">▾ close</span>
        </span>
      </summary>

      <div className="grid gap-4 border-t border-line px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="font-bold uppercase text-neutral-500">Player</p>
          <p className="mt-1">
            <b>Birthdate</b>: {p.birthdate ? formatIsoDay(p.birthdate) : "—"}
          </p>
          <p>
            <b>School</b>: {p.school ?? "—"}
          </p>
          <p className="mt-3 font-bold uppercase text-neutral-500">Parents &amp; guardians</p>
          {guardians.length > 0 ? (
            <div className="mt-1 space-y-2">
              {guardians.map((g, i) => (
                <div key={i}>
                  <p className="font-semibold">
                    {g.firstName} {g.lastName}
                  </p>
                  {g.email && (
                    <a
                      className="block truncate text-team-blue-dark underline-offset-2 hover:underline"
                      href={`mailto:${g.email}`}
                    >
                      {g.email}
                    </a>
                  )}
                  {g.phone && (
                    <a
                      className="block text-team-blue-dark underline-offset-2 hover:underline"
                      href={`tel:${g.phone}`}
                    >
                      {g.phone}
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-neutral-500">No guardian contacts on file.</p>
          )}
        </div>

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
          <p className="mt-3 font-bold uppercase text-neutral-500">
            Development levels (1–5 · 3 = the 11U standard)
          </p>
          {feedback ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {feedback.map((f) => (
                <span
                  key={f.key}
                  title={f.flagged ? "Coaches split by 2+ levels — worth a conversation" : undefined}
                  className={`rounded border px-1.5 py-0.5 font-semibold ${
                    f.flagged ? "border-amber-500 bg-amber-50" : "border-line bg-paper-tint"
                  }`}
                >
                  {f.label} {f.latest}
                  {f.arrow}
                  {f.flagged && " ⚑"}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-neutral-500">No development levels yet.</p>
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
          <p>
            <b>Playing time</b>:{" "}
            {usage
              ? `${usage.games} G · ${usage.fieldInnings} inn played · ${usage.benchInnings} sat${
                  usage.satShare !== null
                    ? ` (${Math.round(usage.satShare * 100)}%)`
                    : ""
                }${
                  usage.positions.length > 0
                    ? ` · ${usage.positions.map(([pos, n]) => `${pos} ${n}`).join(", ")}`
                    : ""
                }`
              : "no dugout games yet"}
          </p>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Link
            className="btn btn-primary inline-block px-3 py-1 text-xs"
            href={`/roster/${p.playerId}`}
          >
            ✎ Edit {p.firstName} — goals, notes &amp; full page
          </Link>
        </div>
      </div>
    </details>
  );
}

/**
 * The Positions chips: depth-chart primaries (team orange) then
 * secondaries (team blue), best-rated first, each carrying the blended
 * rating — the staff's call and the evidence in one glance. Until roles
 * are marked, the top three rated spots stand in (neutral chips).
 */
function PositionChips({
  roles,
  blended,
}: {
  roles: NonNullable<RolesByPlayer[string]>;
  blended: Map<(typeof POSITIONS)[number], number> | undefined;
}) {
  const byRating = (a: (typeof POSITIONS)[number], b: (typeof POSITIONS)[number]) =>
    (blended?.get(b) ?? 0) - (blended?.get(a) ?? 0);
  const chips = [
    ...POSITIONS.filter((pos) => roles[pos] === "primary")
      .sort(byRating)
      .map((pos) => ({ pos, primary: true })),
    ...POSITIONS.filter((pos) => roles[pos] === "secondary")
      .sort(byRating)
      .map((pos) => ({ pos, primary: false })),
  ].slice(0, 4);

  if (chips.length > 0) {
    return (
      <>
        {chips.map(({ pos, primary }) => (
          <span
            key={pos}
            title={primary ? "Primary (depth chart)" : "Secondary (depth chart)"}
            className={`rounded border px-1 py-0.5 text-xs font-bold ${
              primary
                ? "border-team-orange-dark bg-team-orange text-paper"
                : "border-team-blue-dark bg-team-blue"
            }`}
          >
            {pos} {blended?.get(pos) ?? "·"}
          </span>
        ))}
      </>
    );
  }
  const top = topPositions(blended, 3);
  if (top.length === 0) {
    return <span className="text-xs text-neutral-500">unrated</span>;
  }
  return (
    <>
      {top.map((t) => (
        <span
          key={t.position}
          title="Top rated (no depth-chart call yet)"
          className="mr-1 rounded border border-line bg-team-blue-light px-1 py-0.5 text-xs font-bold"
        >
          {t.position} {t.rating}
        </span>
      ))}
    </>
  );
}
