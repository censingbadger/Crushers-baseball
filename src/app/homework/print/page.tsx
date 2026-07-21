import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getRoster } from "@/lib/data";
import { BARS_BY_KEY, type BarsKey } from "@/lib/bars";
import { drillByKey } from "@/lib/homework";
import { DrillDiagram } from "@/components/DrillDiagram";
import { PrintButton } from "./PrintButton";

// Printable homework handouts: one sheet per player with his assigned
// drills — instructions, the one cue, the diagram — and a four-week
// practice log (minutes + parent initials) as the accountability loop.
// Print CSS hides the app chrome; each sheet breaks to its own page.

const LOG_WEEKS = 4;
const DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"];

export default async function HomeworkPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string }>;
}) {
  await requireCoach();
  const { player: onlyPlayer } = await searchParams;
  const db = await getDb();
  const [season] = await db
    .select()
    .from(tables.seasons)
    .where(eq(tables.seasons.isActive, true))
    .limit(1);
  if (!season) return <p className="card p-4">No active season.</p>;

  const [roster, open] = await Promise.all([
    getRoster(season.id),
    db
      .select()
      .from(tables.homeworkAssignments)
      .where(
        and(
          eq(tables.homeworkAssignments.seasonId, season.id),
          eq(tables.homeworkAssignments.status, "assigned"),
        ),
      )
      .orderBy(asc(tables.homeworkAssignments.createdAt)),
  ]);
  const byPlayer = new Map<string, typeof open>();
  for (const a of open) {
    const list = byPlayer.get(a.playerId) ?? [];
    list.push(a);
    byPlayer.set(a.playerId, list);
  }
  const sheets = roster
    .filter((p) => (onlyPlayer ? p.playerId === onlyPlayer : true))
    .map((p) => ({ p, list: byPlayer.get(p.playerId) ?? [] }))
    .filter((s) => s.list.length > 0);

  return (
    <div className="space-y-4">
      <div className="print-hide card flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-extrabold">Homework handouts</h1>
          <p className="text-sm text-neutral-600">
            {sheets.length === 0
              ? "No open assignments to print — assign homework first."
              : `${sheets.length} sheet${sheets.length === 1 ? "" : "s"} — each player prints on his own page, practice log included.`}
          </p>
        </div>
        <Link className="btn" href="/homework">
          ← Homework
        </Link>
        {sheets.length > 0 && <PrintButton />}
      </div>

      {sheets.map(({ p, list }) => (
        <section
          key={p.playerId}
          className="print-sheet card space-y-3 p-4"
          data-print-player={`${p.firstName} ${p.lastName}`}
        >
          <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b-2 border-ink pb-2">
            <span className="text-lg font-extrabold uppercase tracking-wide">
              Crushers Blue · Homework
            </span>
            <span className="text-lg font-extrabold">
              {p.jerseyNumber !== null ? `#${p.jerseyNumber} ` : ""}
              {p.firstName} {p.lastName}
            </span>
            <span className="ml-auto text-sm font-semibold text-neutral-600">
              Handed out: ____________
            </span>
          </header>

          {list.map((a) => {
            const drill = drillByKey(a.drillKey);
            if (!drill) return null;
            return (
              <article key={a.id} className="rounded-lg border border-line p-3">
                <h2 className="font-extrabold">
                  {drill.title}
                  <span className="ml-2 text-xs font-bold uppercase text-neutral-500">
                    {BARS_BY_KEY[a.dimension as BarsKey]?.label ?? a.dimension} ·{" "}
                    {drill.minutes} min · {drill.partner ? "with a partner" : "solo"}
                  </span>
                </h2>
                <p className="mt-1 rounded bg-team-blue-light/50 px-2 py-1 text-sm font-bold">
                  🗣 Hold this thought: “{drill.cue}”
                </p>
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-sm">
                  {drill.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p className="mt-1 text-xs font-semibold text-neutral-600">
                  <b>How much:</b> {drill.reps} · <b>Gear:</b> {drill.equipment}
                </p>
                {drill.safety && (
                  <p className="mt-1 rounded border border-amber-600 bg-amber-50 px-2 py-1 text-xs font-semibold">
                    ⚠ {drill.safety}
                  </p>
                )}
                {a.note && (
                  <p className="mt-1 text-xs font-semibold">Coach&apos;s note: “{a.note}”</p>
                )}
                {drill.diagram && (
                  <div className="mt-2 max-w-xs">
                    <DrillDiagram kind={drill.diagram} />
                  </div>
                )}
              </article>
            );
          })}

          <div>
            <h3 className="text-sm font-extrabold uppercase">Practice log</h3>
            <p className="text-xs text-neutral-600">
              Circle the days you practiced, write your total minutes, and have
              a parent initial the week. Bring this back — coach checks it at
              practice.
            </p>
            <table className="mt-1.5 w-full border-collapse text-sm">
              <thead>
                <tr>
                  {["Week of", "Days practiced", "Total minutes", "Parent initials"].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-2 border-ink px-2 py-1 text-left text-xs font-extrabold uppercase"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: LOG_WEEKS }, (_, i) => (
                  <tr key={i}>
                    <td className="border-2 border-ink px-2 py-3 font-semibold">
                      ____ / ____
                    </td>
                    <td className="border-2 border-ink px-2 py-3">
                      <span className="flex gap-2 font-semibold text-neutral-600">
                        {DAYS.map((d) => (
                          <span key={d}>{d}</span>
                        ))}
                      </span>
                    </td>
                    <td className="border-2 border-ink px-2 py-3" />
                    <td className="border-2 border-ink px-2 py-3" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
