import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getRoster,
  getRsvpsForEvents,
  getSeasonEvents,
  headcount,
} from "@/lib/data";
import { EVENT_TYPE_LABEL, formatEventDate, formatEventTime } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-extrabold">Welcome, {user.displayName}.</h1>
        <p className="mt-2 text-sm">
          No active season yet.{" "}
          {user.role === "coach" ? (
            <>
              Run the seed script or head to <Link className="underline" href="/import">Import</Link> to
              bring in the team.
            </>
          ) : (
            "Check back once the coaches set up the season."
          )}
        </p>
      </div>
    );
  }

  const [events, roster] = await Promise.all([
    getSeasonEvents(season.id),
    getRoster(season.id),
  ]);
  const now = new Date();
  const upcoming = events.filter((e) => e.startsAt >= now).slice(0, 5);
  const rsvps = await getRsvpsForEvents(upcoming.map((e) => e.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{season.name}</h1>
        <span className="rounded border border-line bg-team-blue px-2 py-0.5 text-xs font-bold uppercase">
          {season.ageGroup} · {season.term} {season.year}
        </span>
      </div>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Next up</h2>
          <Link className="text-sm font-semibold underline" href="/schedule">
            Full schedule →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((e) => {
              const counts = headcount(rsvps.get(e.id));
              return (
                <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
                  <span className="w-24 shrink-0 rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-center text-xs font-bold">
                    {EVENT_TYPE_LABEL[e.type]}
                  </span>
                  <Link href={`/schedule/${e.id}`} className="min-w-0 flex-1 basis-52 font-semibold underline-offset-2 hover:underline">
                    {e.title}
                    <span className={e.title ? "ml-2 font-normal text-neutral-600" : "font-normal text-neutral-700"}>
                      {formatEventDate(e.startsAt)} · {formatEventTime(e.startsAt, e.endsAt)}
                      {e.location ? ` · ${e.location}` : ""}
                    </span>
                  </Link>
                  <span className="ml-auto shrink-0 whitespace-nowrap text-xs font-semibold">
                    <span className="text-green-700">{counts.yes} in</span>
                    {" · "}
                    <span className="text-red-700">{counts.no} out</span>
                    {counts.maybe > 0 && (
                      <>
                        {" · "}
                        <span className="text-amber-600">{counts.maybe} maybe</span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card p-4">
          <h2 className="text-lg font-bold">Roster</h2>
          <p className="mt-1 text-3xl font-extrabold text-team-blue-dark">
            {roster.length}
            <span className="ml-2 text-sm font-semibold text-ink">players</span>
          </p>
          <Link className="mt-2 inline-block text-sm font-semibold underline" href="/roster">
            View roster →
          </Link>
        </div>
        <div className="card p-4">
          <h2 className="text-lg font-bold">Availability</h2>
          <p className="mt-1 text-sm text-neutral-700">
            The whole season's In/Out grid, plus tournament weekends.
          </p>
          <Link className="mt-2 inline-block text-sm font-semibold underline" href="/availability">
            Open the grid →
          </Link>
        </div>
      </section>
    </div>
  );
}
