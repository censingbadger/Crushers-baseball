import { requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getAvailabilityDays,
  getRoster,
  getRsvpsForEvents,
  getSeasonEvents,
} from "@/lib/data";
import { formatEventDate, formatIsoDay } from "@/lib/format";

const CELL: Record<string, { label: string; cls: string }> = {
  yes: { label: "Y", cls: "bg-green-600 text-white" },
  no: { label: "N", cls: "bg-red-600 text-white" },
  maybe: { label: "?", cls: "bg-amber-400" },
};

function Cell({ status }: { status: string | undefined }) {
  const c = status ? CELL[status] : undefined;
  return (
    <td className="border border-ink/20 p-0 text-center">
      {c ? (
        <span className={`block px-1.5 py-1 text-xs font-bold ${c.cls}`}>{c.label}</span>
      ) : (
        <span className="block px-1.5 py-1 text-xs text-neutral-300">·</span>
      )}
    </td>
  );
}

export default async function AvailabilityPage() {
  await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const [roster, events, days] = await Promise.all([
    getRoster(season.id),
    getSeasonEvents(season.id),
    getAvailabilityDays(season.id),
  ]);
  const rsvps = await getRsvpsForEvents(events.map((e) => e.id));

  const dayList = [...new Set(days.map((d) => d.day))];
  const byPlayerDay = new Map<string, string>();
  for (const d of days) byPlayerDay.set(`${d.playerId}|${d.day}`, d.status);
  const dayTotals = dayList.map(
    (day) => days.filter((d) => d.day === day && d.status === "yes").length,
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Availability</h1>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-1 text-lg font-bold">Event RSVPs</h2>
        <p className="mb-3 text-xs text-neutral-600">
          The familiar grid: every player, every event. Families answer from
          each event's page; totals compute themselves.
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-neutral-600">No events yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-paper py-1 pr-2 text-left">Player</th>
                {events.map((e) => (
                  <th key={e.id} className="border border-ink/20 px-1 py-1 text-center text-[10px] font-bold">
                    <div>{formatEventDate(e.startsAt)}</div>
                    <div className="font-normal uppercase text-neutral-500">{e.type.slice(0, 4)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.playerId}>
                  <td className="sticky left-0 bg-paper py-1 pr-2 font-semibold whitespace-nowrap">
                    {p.firstName} {p.lastName}
                  </td>
                  {events.map((e) => (
                    <Cell key={e.id} status={rsvps.get(e.id)?.get(p.playerId)} />
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-bold">
                <td className="sticky left-0 bg-paper py-1 pr-2">Players in</td>
                {events.map((e) => {
                  let yes = 0;
                  const m = rsvps.get(e.id);
                  if (m) for (const s of m.values()) if (s === "yes") yes++;
                  return (
                    <td key={e.id} className="border border-ink/20 py-1 text-center text-team-blue-dark">
                      {yes}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-1 text-lg font-bold">Tournament weekends</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Family availability for potential tournament dates — used to pick
          which weekends we enter. (Imported from the organizing Sheet;
          in-app editing arrives with the planning tools.)
        </p>
        {dayList.length === 0 ? (
          <p className="text-sm text-neutral-600">No availability data yet — import the tournament tab.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-paper py-1 pr-2 text-left">Player</th>
                {dayList.map((day) => (
                  <th key={day} className="border border-ink/20 px-1 py-1 text-center text-[10px] font-bold">
                    {formatIsoDay(day)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => (
                <tr key={p.playerId}>
                  <td className="sticky left-0 bg-paper py-1 pr-2 font-semibold whitespace-nowrap">
                    {p.firstName} {p.lastName}
                  </td>
                  {dayList.map((day) => (
                    <Cell key={day} status={byPlayerDay.get(`${p.playerId}|${day}`)} />
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-bold">
                <td className="sticky left-0 bg-paper py-1 pr-2">Available</td>
                {dayTotals.map((n, i) => (
                  <td
                    key={dayList[i]}
                    className={`border border-ink/20 py-1 text-center ${
                      n >= 9 ? "bg-green-600 text-white" : n <= 7 ? "bg-red-600 text-white" : "bg-amber-400"
                    }`}
                  >
                    {n}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
