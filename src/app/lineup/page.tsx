import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import {
  getActiveSeason,
  getRoster,
  getRsvpsForEvents,
  getSeasonEvents,
} from "@/lib/data";
import { blendedLookup, getCurrentRatings } from "@/lib/matrix";
import { solveLineup, type LineupCandidate } from "@/lib/lineup";
import { POSITIONS, type Position } from "@/db/schema";
import { EVENT_TYPE_LABEL, formatEventDate } from "@/lib/format";

function asArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export default async function LineupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const params = await searchParams;
  const [roster, ratings, events] = await Promise.all([
    getRoster(season.id),
    getCurrentRatings(season.id),
    getSeasonEvents(season.id),
  ]);
  const blended = blendedLookup(ratings);

  const eventId = typeof params.event === "string" ? params.event : "";
  const event = events.find((e) => e.id === eventId) ?? null;
  const reset = params.reset === "1";
  const availParams = reset ? [] : asArray(params.avail);

  const selectable = roster.filter((p) => p.status !== "practice");
  const practicePlayers = roster.filter((p) => p.status === "practice");

  // Default availability: explicit checkboxes if submitted; otherwise from
  // the event's RSVPs (out = No); otherwise every full-time player.
  let availableIds: Set<string>;
  if (availParams.length > 0) {
    availableIds = new Set(availParams);
  } else if (event) {
    const rsvps = (await getRsvpsForEvents([event.id])).get(event.id);
    availableIds = new Set(
      selectable
        .filter((p) => p.status === "full")
        .filter((p) => rsvps?.get(p.playerId) !== "no")
        .map((p) => p.playerId),
    );
  } else {
    availableIds = new Set(
      selectable.filter((p) => p.status === "full").map((p) => p.playerId),
    );
  }

  const pins: Partial<Record<Position, string>> = {};
  for (const pos of POSITIONS) {
    const v = reset ? "" : params[`pin_${pos}`];
    if (typeof v === "string" && v) pins[pos] = v;
  }

  const pool: LineupCandidate[] = selectable
    .filter((p) => availableIds.has(p.playerId))
    .map((p) => ({
      playerId: p.playerId,
      name: `${p.firstName} ${p.lastName}`,
      ratings: blended.get(p.playerId) ?? new Map(),
    }));

  const solution = pool.length > 0 ? solveLineup(pool, pins) : null;
  const hasPins = Object.keys(pins).length > 0;
  const unpinned =
    solution && hasPins && pool.length > 0 ? solveLineup(pool, {}) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Lineup lab</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          The solver finds the strongest defensive alignment from the blended
          matrix for the players available. Pin choices ("what if he
          pitches?") and it re-optimizes everyone else around them.
        </p>
      </div>

      <form method="get" className="card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="event">Game / event</label>
            <select className="field" id="event" name="event" defaultValue={eventId}>
              <option value="">— none (ad-hoc) —</option>
              {events
                .filter((e) => e.type !== "practice")
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatEventDate(e.startsAt)} · {e.title ?? EVENT_TYPE_LABEL[e.type]}
                    {e.opponent ? ` vs ${e.opponent}` : ""}
                  </option>
                ))}
            </select>
          </div>
          <button className="btn btn-primary" type="submit">Recompute</button>
          <button className="btn" type="submit" name="reset" value="1">
            Reset from RSVPs
          </button>
        </div>

        <div>
          <span className="label">Available players</span>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {selectable.map((p) => (
              <label key={p.playerId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="avail"
                  value={p.playerId}
                  defaultChecked={availableIds.has(p.playerId)}
                  className="h-4 w-4 accent-team-orange"
                />
                <span>
                  {p.firstName} {p.lastName}
                  {p.status === "hopeful" && (
                    <span className="ml-1 text-[10px] font-bold uppercase text-amber-600">
                      hopeful
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {practicePlayers.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              Practice players ({practicePlayers.map((p) => p.firstName).join(", ")})
              don't enter lineups.
            </p>
          )}
        </div>

        <div>
          <span className="label">Pins (optional)</span>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-9">
            {POSITIONS.map((pos) => (
              <div key={pos}>
                <label className="block text-center text-xs font-bold" htmlFor={`pin_${pos}`}>
                  {pos}
                </label>
                <select
                  className="field px-1 py-1 text-xs"
                  id={`pin_${pos}`}
                  name={`pin_${pos}`}
                  defaultValue={pins[pos] ?? ""}
                >
                  <option value="">—</option>
                  {selectable.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {p.firstName} {p.lastName.slice(0, 1)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </form>

      {solution && (
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold">
              Strongest lineup{event ? ` — ${formatEventDate(event.startsAt)}` : ""}
            </h2>
            <p className="text-sm font-semibold">
              Total strength:{" "}
              <span className="text-team-orange-dark">{solution.total.toFixed(1)}</span>
              {unpinned && unpinned.total !== solution.total && (
                <span className="ml-2 text-xs font-normal text-neutral-600">
                  (unpinned optimum {unpinned.total.toFixed(1)}, cost of pins{" "}
                  {(unpinned.total - solution.total).toFixed(1)})
                </span>
              )}
            </p>
          </div>
          {solution.warnings.length > 0 && (
            <ul className="mb-3 space-y-1">
              {solution.warnings.map((w, i) => (
                <li
                  key={i}
                  className="rounded border border-line bg-amber-50 px-2 py-1 text-xs font-semibold"
                >
                  ⚠ {w}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <table className="text-sm">
              <tbody>
                {POSITIONS.map((pos) => {
                  const a = solution.assignments[pos];
                  return (
                    <tr key={pos} className="border-b border-line">
                      <td className="w-10 py-1 font-extrabold text-team-blue-dark">{pos}</td>
                      <td className="py-1 font-semibold">
                        {a ? (
                          <>
                            {a.name}
                            {a.pinned && (
                              <span className="ml-1 rounded border border-line bg-team-orange px-1 text-[10px] font-bold uppercase text-paper">
                                pinned
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-red-700">— unfilled —</span>
                        )}
                      </td>
                      <td className="py-1 text-right font-bold">{a?.rating ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div>
              <h3 className="mb-1 text-sm font-bold uppercase">Bench</h3>
              {solution.bench.length === 0 ? (
                <p className="text-sm text-neutral-600">Nobody — everyone's on the field.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {solution.bench.map((b) => (
                    <li key={b.playerId} className="font-semibold">{b.name}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-neutral-500">
                Ratings come from the blended{" "}
                <Link className="underline" href="/matrix">
                  position matrix
                </Link>
                ; unrated positions count as 1.
              </p>
            </div>
          </div>
        </section>
      )}
      {!solution && (
        <p className="card p-4 text-sm text-neutral-600">
          Check at least one available player to solve a lineup.
        </p>
      )}
    </div>
  );
}
