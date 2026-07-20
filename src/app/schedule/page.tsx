import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getRsvpsForEvents,
  getSeasonEvents,
  headcount,
} from "@/lib/data";
import { EVENT_TYPE_LABEL, formatEventDate, formatEventTime } from "@/lib/format";

export default async function SchedulePage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const events = await getSeasonEvents(season.id);
  const rsvps = await getRsvpsForEvents(events.map((e) => e.id));
  const now = new Date();
  const upcoming = events.filter((e) => e.startsAt >= now);
  const past = events.filter((e) => e.startsAt < now).reverse();

  const renderList = (list: typeof events) => (
    <ul className="divide-y divide-line">
      {list.map((e) => {
        const counts = headcount(rsvps.get(e.id));
        return (
          <li key={e.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
            <span className="w-24 shrink-0 rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-center text-xs font-bold">
              {EVENT_TYPE_LABEL[e.type]}
            </span>
            <Link
              href={`/schedule/${e.id}`}
              className="min-w-0 flex-1 basis-52 font-semibold underline-offset-2 hover:underline"
            >
              {e.title}
              <span className={e.title ? "ml-2 font-normal text-neutral-600" : "font-normal text-neutral-700"}>
                {formatEventDate(e.startsAt)} · {formatEventTime(e.startsAt, e.endsAt)}
                {e.location ? ` · ${e.location}` : ""}
                {e.opponent ? ` · vs ${e.opponent}` : ""}
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
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold">Schedule</h1>
        {user.role === "coach" && (
          <Link className="btn btn-primary text-sm" href="/schedule/new">
            + New event
          </Link>
        )}
      </div>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing scheduled.</p>
        ) : (
          renderList(upcoming)
        )}
      </section>

      {past.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold">Past</h2>
          {renderList(past)}
        </section>
      )}
    </div>
  );
}
