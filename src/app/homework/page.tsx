import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getPositionRoles, getRoster } from "@/lib/data";
import { BARS_BY_KEY, barsSummary, type BarsKey } from "@/lib/bars";
import {
  HOMEWORK_CATALOG,
  drillByKey,
  drillsFor,
  playerGaps,
  teamGaps,
  type HomeworkDrill,
} from "@/lib/homework";
import { DrillDetail } from "@/components/DrillDetail";
import { formatEventDate } from "@/lib/format";
import { HomeworkSearch } from "./Search";
import {
  assignDrillToTeam,
  assignHomework,
  autoAssignPlayer,
  autoAssignTeam,
  removeHomework,
  toggleHomework,
} from "./actions";

// Homework: the feedback loop's second half. The BARS medians say where
// each kid stands against the 11U standard; this page turns the gaps —
// skills AND the self-regulation cluster (focus, response to failure,
// coachability) — into researched, sourced drills a family can run at
// home, and tracks what's been assigned. Roster order, no ranking.

// A drill as a click-to-open card: the name is the summary, the details
// (what it fixes, the cue, steps, gear, safety, diagram, source) open
// below, with an Assign button.
function DrillCard({
  drill,
  seasonId,
  playerId,
}: {
  drill: HomeworkDrill;
  seasonId: string;
  playerId: string;
}) {
  return (
    <details className="rounded-lg border border-line bg-paper p-2" data-drill={drill.key}>
      <summary className="cursor-pointer text-sm font-bold">
        {drill.staple ? "★ " : ""}
        {drill.title}
        <span className="ml-1.5 text-xs font-semibold text-neutral-500">
          {drill.minutes} min · {drill.partner ? "needs a partner" : "solo"}
        </span>
      </summary>
      <DrillDetail drill={drill}>
        <form action={assignHomework}>
          <input type="hidden" name="seasonId" value={seasonId} />
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="drillKey" value={drill.key} />
          <button className="btn btn-primary px-3 py-1.5 text-xs" type="submit">
            ＋ Assign as homework
          </button>
        </form>
      </DrillDetail>
    </details>
  );
}

export default async function HomeworkPage() {
  await requireCoach();
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) {
    return <p className="card p-4">No active season yet — set one up first.</p>;
  }

  const [roster, roleRows, barsRows, assignments] = await Promise.all([
    getRoster(season.id),
    getPositionRoles(season.id),
    db.select().from(tables.barsRatings).where(eq(tables.barsRatings.seasonId, season.id)),
    db
      .select()
      .from(tables.homeworkAssignments)
      .where(eq(tables.homeworkAssignments.seasonId, season.id))
      .orderBy(desc(tables.homeworkAssignments.createdAt)),
  ]);
  const summary = barsSummary(barsRows);

  // Role modules count only for kids who actually fill the role; the
  // primary/secondary spots also steer which drills lead a suggestion
  // (an outfielder's fielding gap starts with fly-ball work).
  const roleFlags = new Map<string, { pitcher: boolean; catcher: boolean }>();
  const positionsByPlayer = new Map<string, string[]>();
  for (const r of roleRows) {
    if (!["primary", "secondary", "develop"].includes(r.role)) continue;
    const f = roleFlags.get(r.playerId) ?? { pitcher: false, catcher: false };
    if (r.position === "P") f.pitcher = true;
    if (r.position === "C") f.catcher = true;
    roleFlags.set(r.playerId, f);
    if (r.role !== "develop") {
      const list = positionsByPlayer.get(r.playerId) ?? [];
      list.push(r.position);
      positionsByPlayer.set(r.playerId, list);
    }
  }
  const focus = teamGaps(summary, roleFlags);
  const byPlayer = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const list = byPlayer.get(a.playerId) ?? [];
    list.push(a);
    byPlayer.set(a.playerId, list);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold">Homework</h1>
          <p className="mt-1 text-sm text-neutral-700">
            Feedback gaps → at-home drills.
          </p>
        </div>
        <span className="flex items-center gap-2">
          <form action={autoAssignTeam}>
            <input type="hidden" name="seasonId" value={season.id} />
            <button
              className="btn btn-primary text-sm"
              type="submit"
              title="Every rated player gets his top gap's best-fitting drill — position-aware, duplicates skipped. Remove any you don't want."
            >
              ⚡ Auto-assign team
            </button>
          </form>
          <Link className="btn text-sm" href="/homework/print">
            🖨 Print handouts
          </Link>
        </span>
      </div>

      {/* Where the TEAM is short: dimensions where several kids sit
          below the standard — one drill can be this week's team theme. */}
      {focus.length > 0 && (
        <div className="card p-3" data-testid="team-focus">
          <h2 className="text-xs font-bold uppercase text-neutral-600">
            Team focus — shared gaps
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Open a drill to read it, then send it to everyone it fits.
          </p>
          <div className="mt-1.5 space-y-2">
            {focus.map((f) => (
              <div key={f.dimension}>
                <p className="text-sm">
                  <span className="font-bold">{BARS_BY_KEY[f.dimension].label}</span>
                  <span className="ml-1.5 text-xs font-semibold text-neutral-600">
                    {f.below} of {f.rated} rated players below the 11U standard
                  </span>
                </p>
                <div className="mt-1 space-y-1">
                  {drillsFor(f.dimension, HOMEWORK_CATALOG, 2).map((d) => (
                    <details
                      key={d.key}
                      className="rounded-lg border border-line bg-paper p-2"
                      data-drill={d.key}
                    >
                      <summary className="cursor-pointer text-sm font-bold">
                        {d.staple ? "★ " : ""}
                        {d.title}
                        <span className="ml-1.5 text-xs font-semibold text-neutral-500">
                          {d.minutes} min · {d.partner ? "needs a partner" : "solo"}
                        </span>
                      </summary>
                      <DrillDetail drill={d}>
                        <form action={assignDrillToTeam}>
                          <input type="hidden" name="seasonId" value={season.id} />
                          <input type="hidden" name="drillKey" value={d.key} />
                          <button
                            className="btn btn-primary px-3 py-1.5 text-xs"
                            type="submit"
                            title="Everyone it fits — role drills reach only role players"
                          >
                            ＋ Assign to whole team
                          </button>
                        </form>
                      </DrillDetail>
                    </details>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <HomeworkSearch
        seasonId={season.id}
        players={roster.map((p) => ({
          id: p.playerId,
          name: `${p.firstName} ${p.lastName}`,
        }))}
      />

      {roster.map((p) => {
        const gaps = playerGaps(summary.get(p.playerId), roleFlags.get(p.playerId));
        const positions = positionsByPlayer.get(p.playerId) ?? [];
        const mine = byPlayer.get(p.playerId) ?? [];
        const open = mine.filter((a) => a.status === "assigned");
        const name = `${p.firstName} ${p.lastName}`;
        return (
          <details key={p.playerId} className="card p-0" data-hw-player={name}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 p-3">
              <span className="font-extrabold">
                {p.jerseyNumber !== null && (
                  <span className="mr-1.5 text-neutral-500">#{p.jerseyNumber}</span>
                )}
                {name}
              </span>
              {gaps.map((g) => (
                <span
                  key={g.dimension}
                  className={`chip ${
                    g.kind === "below"
                      ? "border border-amber-600 bg-amber-100"
                      : "bg-team-blue-light"
                  }`}
                  title={
                    g.kind === "below"
                      ? "Below the 11U standard — homework target"
                      : "At standard — sharpening target"
                  }
                >
                  {BARS_BY_KEY[g.dimension].label} {g.median}
                  {g.flagged ? " ⚠" : ""}
                </span>
              ))}
              {gaps.length === 0 && (
                <span className="chip bg-paper text-neutral-500">not rated yet</span>
              )}
              {open.length > 0 && (
                <span className="chip bg-team-orange text-ink">
                  {open.length} assigned
                </span>
              )}
            </summary>
            <div className="space-y-3 border-t border-line p-3">
              {gaps.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={autoAssignPlayer}>
                    <input type="hidden" name="seasonId" value={season.id} />
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <button
                      className="btn btn-primary px-3 py-1.5 text-xs"
                      type="submit"
                      title="His top gaps get their best-fitting drills in one tap — position-aware, duplicates skipped."
                    >
                      ⚡ Auto-assign his suggestions
                    </button>
                  </form>
                  {open.length > 0 && (
                    <Link
                      className="btn px-3 py-1.5 text-xs"
                      href={`/homework/print?player=${p.playerId}`}
                    >
                      🖨 Print his sheet
                    </Link>
                  )}
                </div>
              )}
              {gaps.map((g) => (
                <section key={g.dimension}>
                  <h3 className="text-sm font-extrabold">
                    {BARS_BY_KEY[g.dimension].label}
                    <span className="ml-1.5 text-xs font-bold text-neutral-500">
                      median {g.median}
                      {g.kind === "below" ? " · below the 11U standard" : " · level up"}
                    </span>
                    {g.flagged && (
                      <span className="ml-1.5 text-xs font-bold text-amber-700">
                        raters split — compare notes first
                      </span>
                    )}
                  </h3>
                  <p className="mt-0.5 text-xs font-semibold text-neutral-600">
                    Working toward: {g.target}
                  </p>
                  <div className="mt-1.5 space-y-1.5">
                    {drillsFor(g.dimension, HOMEWORK_CATALOG, 3, positions).map((d) => (
                      <DrillCard
                        key={d.key}
                        drill={d}
                        seasonId={season.id}
                        playerId={p.playerId}
                      />
                    ))}
                    {drillsFor(g.dimension).length === 0 && (
                      <p className="text-xs text-neutral-500">
                        No catalog drills for this dimension yet.
                      </p>
                    )}
                  </div>
                </section>
              ))}
              {gaps.length === 0 && (
                <p className="text-sm text-neutral-600">
                  No observed feedback yet —{" "}
                  <Link className="underline" href="/rate">
                    rate him first
                  </Link>{" "}
                  and the gaps appear here, or assign straight from the full
                  list below.
                </p>
              )}

              <p className="text-xs text-neutral-500">
                Assigning something specific? Use <b>Find a drill</b> at the top
                — search or leave it blank to browse all {HOMEWORK_CATALOG.length},
                open any to read it, then assign to {name.split(" ")[0]} or the team.
              </p>

              {mine.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase text-neutral-600">
                    Assigned homework
                  </h4>
                  <ul className="mt-1 space-y-1">
                    {mine.map((a) => {
                      const drill = drillByKey(a.drillKey);
                      return (
                        <li
                          key={a.id}
                          className="rounded-lg border border-line bg-paper px-2 py-1.5 text-sm"
                          data-assigned={drill?.title ?? a.drillKey}
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`font-bold ${
                                a.status === "done" ? "text-neutral-400 line-through" : ""
                              }`}
                            >
                              {drill?.title ?? a.drillKey}
                            </span>
                            <span className="chip bg-team-blue-light">
                              {BARS_BY_KEY[a.dimension as BarsKey]?.label ?? a.dimension}
                            </span>
                            <span className="text-xs font-semibold text-neutral-500">
                              {a.assignedBy} · {formatEventDate(a.createdAt)}
                            </span>
                            {a.note && (
                              <span className="text-xs text-neutral-600">“{a.note}”</span>
                            )}
                            <span className="ml-auto flex items-center gap-1">
                              <form action={toggleHomework}>
                                <input type="hidden" name="id" value={a.id} />
                                <button
                                  className={`btn px-2 py-1 text-xs ${
                                    a.status === "done" ? "" : "btn-primary"
                                  }`}
                                  type="submit"
                                >
                                  {a.status === "done" ? "↺ Reopen" : "✓ Done"}
                                </button>
                              </form>
                              <form action={removeHomework}>
                                <input type="hidden" name="id" value={a.id} />
                                <button
                                  className="btn px-2 py-1 text-xs"
                                  type="submit"
                                  title="Remove"
                                >
                                  ✕
                                </button>
                              </form>
                            </span>
                          </div>
                          {drill && (
                            <details className="mt-1">
                              <summary className="cursor-pointer text-xs font-semibold text-team-blue-dark underline">
                                What is this drill?
                              </summary>
                              <DrillDetail drill={drill} />
                            </details>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}
