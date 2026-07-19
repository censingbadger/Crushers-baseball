import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { monthLabel } from "@/lib/reports";
import { generateReport } from "./actions";

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The report month plus the five before it, newest first. */
function recentMonths(): string[] {
  const months: string[] = [];
  const d = new Date();
  for (let i = 0; i < 6; i++) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return months;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; error?: string }>;
}) {
  await requireCoach();
  const { month: monthParam, error } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : currentMonth();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const db = await getDb();
  const roster = await getRoster(season.id);
  const monthReports = await db
    .select()
    .from(tables.reports)
    .where(
      and(eq(tables.reports.seasonId, season.id), eq(tables.reports.month, month)),
    );
  const byPlayer = new Map(monthReports.map((r) => [r.playerId, r]));
  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Monthly parent reports</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Drafted from each player&apos;s family-shareable data — goals, shared
          cues, trends, and stats. Nothing reaches a family until you review
          and publish it. Published reports appear on that family&apos;s
          Progress page.
        </p>
        {!aiConfigured && (
          <p className="mt-2 max-w-2xl rounded border border-line bg-team-blue-light px-3 py-1.5 text-xs font-semibold">
            No ANTHROPIC_API_KEY is configured, so drafts use the built-in
            letter template. Add the key in the site environment to have
            Claude write first drafts.
          </p>
        )}
        {error && (
          <p className="mt-2 rounded border border-line bg-red-100 px-3 py-1.5 text-sm font-semibold text-red-800">
            Draft failed: {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {recentMonths().map((m) => (
          <Link
            key={m}
            href={`/reports?month=${m}`}
            className={`rounded border border-line px-2.5 py-1 text-sm font-bold ${
              m === month ? "bg-team-orange text-paper" : "bg-paper hover:bg-team-blue-light"
            }`}
          >
            {monthLabel(m)}
          </Link>
        ))}
      </div>

      <section className="card divide-y divide-line p-4">
        {roster
          .filter((p) => p.status !== "hopeful")
          .map((p) => {
            const report = byPlayer.get(p.playerId);
            return (
              <div
                key={p.playerId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="min-w-0 flex-1 basis-40 font-semibold">
                  {p.firstName} {p.lastName}
                </span>
                {report ? (
                  <>
                    <span
                      className={`chip ${
                        report.status === "published"
                          ? "bg-green-600 text-white"
                          : "bg-team-blue-light"
                      }`}
                    >
                      {report.status}
                    </span>
                    <Link
                      className="btn px-2.5 py-1 text-sm"
                      href={`/reports/${report.id}`}
                    >
                      {report.status === "published" ? "View" : "Review & publish"}
                    </Link>
                  </>
                ) : (
                  <form action={generateReport}>
                    <input type="hidden" name="playerId" value={p.playerId} />
                    <input type="hidden" name="month" value={month} />
                    <button className="btn btn-primary px-2.5 py-1 text-sm" type="submit">
                      Generate draft
                    </button>
                  </form>
                )}
              </div>
            );
          })}
      </section>
    </div>
  );
}
