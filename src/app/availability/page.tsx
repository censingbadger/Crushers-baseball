import { editablePlayerIds, requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getAvailabilityDays,
  getRoster,
  getRsvpsForEvents,
  getSeasonEvents,
} from "@/lib/data";
import { nextStatus, weekendRollup } from "@/lib/availability";
import { formatEventDate, formatIsoDay } from "@/lib/format";
import {
  addAvailabilityDay,
  removeAvailabilityDay,
  setAvailabilityDay,
} from "./actions";
import { setRsvpCell } from "@/app/schedule/actions";

const CELL: Record<string, { label: string; cls: string }> = {
  yes: { label: "Y", cls: "bg-green-600 text-white" },
  no: { label: "N", cls: "bg-red-600 text-white" },
  maybe: { label: "?", cls: "bg-amber-400" },
};

function cellFace(status: string | undefined) {
  const c = status ? CELL[status] : undefined;
  return c ?? { label: "·", cls: "text-neutral-300" };
}

export default async function AvailabilityPage() {
  const user = await requireUser();
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
  const editable = new Set(await editablePlayerIds(user));
  const isCoach = user.role === "coach";

  const dayList = [...new Set(days.map((d) => d.day))].sort();
  const byPlayerDay = new Map<string, (typeof days)[number]["status"]>();
  for (const d of days) byPlayerDay.set(`${d.playerId}|${d.day}`, d.status);
  const fullIds = new Set(
    roster.filter((p) => p.status === "full").map((p) => p.playerId),
  );
  const rollup = weekendRollup(days, fullIds);
  const fullDayTotals = dayList.map(
    (day) =>
      days.filter(
        (d) => d.day === day && d.status === "yes" && fullIds.has(d.playerId),
      ).length,
  );

  const viabilityCls = (n: number) =>
    n >= 9 ? "bg-green-600 text-white" : n === 8 ? "bg-amber-400" : "bg-red-600 text-white";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Availability</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          {isCoach
            ? "Families answer right on the grids — tap a cell to cycle · → Y → ? → N. You can answer for anyone."
            : "Tap your player's cells to answer — each tap cycles · → Y → ? → N. Everything saves instantly."}
        </p>
      </div>

      {rollup.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 text-lg font-bold">Best tournament weekends</h2>
          <p className="mb-3 text-xs text-neutral-600">
            Ranked by the thinnest Saturday/Sunday, counting full-roster
            players only — 9+ makes a weekend safe to enter, 8 is workable
            with call-ups.
          </p>
          <ul className="space-y-2">
            {rollup.map((w) => {
              const sat = w.days[0]?.day;
              const sun = w.days[w.days.length - 1]?.day;
              return (
                <li
                  key={w.anchor}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-line bg-paper-tint px-3 py-2"
                >
                  <span
                    className={`chip ${viabilityCls(w.minYes)}`}
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {w.minYes} can play
                  </span>
                  <span className="font-bold">
                    {formatIsoDay(sat)}
                    {sun !== sat && ` – ${formatIsoDay(sun)}`}
                  </span>
                  <span className="ml-auto flex flex-wrap gap-2 text-xs font-semibold text-neutral-600">
                    {w.days.map((d) => (
                      <span key={d.day} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatIsoDay(d.day)}:{" "}
                        <span className="text-green-700">{d.yes}Y</span>{" "}
                        <span className="text-amber-600">{d.maybe}?</span>{" "}
                        <span className="text-red-700">{d.no}N</span>
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-1 text-lg font-bold">Tournament weekends</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Family availability for candidate tournament dates — this drives
          the ranking above.
          {isCoach && " Add candidate days below; remove a day with its ×."}
        </p>
        {dayList.length === 0 ? (
          <p className="text-sm text-neutral-600">
            No candidate days yet — add one below or import the tournament tab.
          </p>
        ) : (
          <form action={setAvailabilityDay}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-paper py-1 pr-2 text-left">Player</th>
                  {dayList.map((day) => (
                    <th
                      key={day}
                      className="border border-line px-1 py-1 text-center text-[10px] font-bold"
                    >
                      {formatIsoDay(day)}
                      {isCoach && (
                        <button
                          formAction={removeAvailabilityDay.bind(null, day)}
                          title={`Remove ${formatIsoDay(day)} and all its answers`}
                          className="ml-1 rounded px-0.5 text-neutral-400 hover:bg-red-600 hover:text-white"
                        >
                          ×
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((p) => (
                  <tr key={p.playerId}>
                    <td className="sticky left-0 bg-paper py-1 pr-2 font-semibold whitespace-nowrap">
                      {p.firstName} {p.lastName}
                      {p.status !== "full" && (
                        <span className="ml-1 text-[10px] font-bold uppercase text-neutral-500">
                          {p.status === "practice" ? "practice" : "hopeful"}
                        </span>
                      )}
                    </td>
                    {dayList.map((day) => {
                      const status = byPlayerDay.get(`${p.playerId}|${day}`);
                      const face = cellFace(status);
                      return (
                        <td key={day} className="border border-line p-0 text-center">
                          {editable.has(p.playerId) ? (
                            <button
                              name="cell"
                              value={`${p.playerId}|${day}|${nextStatus(status)}`}
                              data-cell={`${p.playerId}|${day}`}
                              title={`${p.firstName} — ${formatIsoDay(day)}: tap to change`}
                              className={`block w-full cursor-pointer px-1.5 py-1 text-xs font-bold hover:opacity-80 ${face.cls}`}
                            >
                              {face.label}
                            </button>
                          ) : (
                            <span className={`block px-1.5 py-1 text-xs font-bold ${face.cls}`}>
                              {face.label}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line font-bold">
                  <td className="sticky left-0 bg-paper py-1 pr-2">Full roster in</td>
                  {fullDayTotals.map((n, i) => (
                    <td
                      key={dayList[i]}
                      className={`border border-line py-1 text-center ${viabilityCls(n)}`}
                    >
                      {n}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </form>
        )}
        {isCoach && (
          <form action={addAvailabilityDay} className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="day">Add a candidate day</label>
              <input className="field" id="day" name="day" type="date" required />
            </div>
            <button className="btn btn-blue text-sm" type="submit">
              Add day
            </button>
          </form>
        )}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-1 text-lg font-bold">Event RSVPs</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Every player, every event — tap to answer here, or from each
          event&apos;s page.
        </p>
        {events.length === 0 ? (
          <p className="text-sm text-neutral-600">No events yet.</p>
        ) : (
          <form action={setRsvpCell}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-paper py-1 pr-2 text-left">Player</th>
                  {events.map((e) => (
                    <th
                      key={e.id}
                      className="border border-line px-1 py-1 text-center text-[10px] font-bold"
                    >
                      <div>{formatEventDate(e.startsAt)}</div>
                      <div className="font-normal uppercase text-neutral-500">
                        {e.type.slice(0, 4)}
                      </div>
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
                    {events.map((e) => {
                      const status = rsvps.get(e.id)?.get(p.playerId);
                      const face = cellFace(status);
                      return (
                        <td key={e.id} className="border border-line p-0 text-center">
                          {editable.has(p.playerId) ? (
                            <button
                              name="cell"
                              value={`${e.id}|${p.playerId}|${nextStatus(status)}`}
                              data-cell={`${e.id}|${p.playerId}`}
                              title={`${p.firstName} — ${formatEventDate(e.startsAt)}: tap to change`}
                              className={`block w-full cursor-pointer px-1.5 py-1 text-xs font-bold hover:opacity-80 ${face.cls}`}
                            >
                              {face.label}
                            </button>
                          ) : (
                            <span className={`block px-1.5 py-1 text-xs font-bold ${face.cls}`}>
                              {face.label}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-line font-bold">
                  <td className="sticky left-0 bg-paper py-1 pr-2">Players in</td>
                  {events.map((e) => {
                    let yes = 0;
                    const m = rsvps.get(e.id);
                    if (m) for (const s of m.values()) if (s === "yes") yes++;
                    return (
                      <td
                        key={e.id}
                        className="border border-line py-1 text-center text-team-blue-dark"
                      >
                        {yes}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </form>
        )}
      </section>
    </div>
  );
}
