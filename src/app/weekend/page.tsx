import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { POSITIONS, type Position } from "@/db/schema";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster, getSeasonEvents } from "@/lib/data";
import { computeWeekendBalance, type PlanLineInput } from "@/lib/weekend";
import { formatEventDate } from "@/lib/format";
import { saveAllLines, upsertPlan } from "./actions";

const FIELD_POSITIONS = POSITIONS.filter((p) => p !== "P");

export default async function WeekendPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const { event: eventId } = await searchParams;
  const events = (await getSeasonEvents(season.id)).filter(
    (e) => e.type === "tournament",
  );
  const event = events.find((e) => e.id === eventId) ?? null;

  const db = await getDb();
  const plan = event
    ? (
        await db
          .select()
          .from(tables.weekendPlans)
          .where(eq(tables.weekendPlans.eventId, event.id))
          .limit(1)
      )[0] ?? null
    : null;

  const roster = (await getRoster(season.id)).filter((p) => p.status === "full");
  const lines = plan
    ? await db
        .select()
        .from(tables.weekendPlanLines)
        .where(eq(tables.weekendPlanLines.planId, plan.id))
    : [];
  const lineByPlayer = new Map(lines.map((l) => [l.playerId, l]));

  const balance = plan
    ? computeWeekendBalance(
        roster.map((p): PlanLineInput => {
          const l = lineByPlayer.get(p.playerId);
          return {
            playerId: p.playerId,
            posA: (l?.posA as Position | null) ?? null,
            inningsA: l?.inningsA ?? 0,
            posB: (l?.posB as Position | null) ?? null,
            inningsB: l?.inningsB ?? 0,
            pitchInnings: l?.pitchInnings ?? 0,
          };
        }),
        plan.games,
        plan.inningsPerGame,
      )
    : null;
  const benchByPlayer = new Map(balance?.players.map((p) => [p.playerId, p]) ?? []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Weekend planner</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Allocate every player's innings across a tournament weekend — two
          field slots plus pitching per player, bench derived — with the
          balance checks computed live instead of by hand.
        </p>
      </div>

      {events.length === 0 ? (
        <p className="card p-4 text-sm">
          No tournaments on the schedule yet.{" "}
          <Link className="underline" href="/schedule/new">
            Add one
          </Link>{" "}
          first.
        </p>
      ) : (
        <form action={upsertPlan} className="card flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="label" htmlFor="eventId">Tournament</label>
            <select className="field" id="eventId" name="eventId" defaultValue={event?.id ?? ""} required>
              {!event && <option value="">— choose —</option>}
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {formatEventDate(e.startsAt)} · {e.title ?? "Tournament"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="games">Games</label>
            <input className="field w-20" id="games" name="games" type="number" min={1} max={10} defaultValue={plan?.games ?? 4} />
          </div>
          <div>
            <label className="label" htmlFor="inningsPerGame">Innings / game</label>
            <input className="field w-20" id="inningsPerGame" name="inningsPerGame" type="number" min={1} max={9} defaultValue={plan?.inningsPerGame ?? 6} />
          </div>
          <button className="btn btn-primary" type="submit">
            {plan ? "Update weekend" : "Start plan"}
          </button>
        </form>
      )}

      {plan && balance && (
        <>
          <form action={saveAllLines}>
            <input type="hidden" name="planId" value={plan.id} />
            <section className="card overflow-x-auto p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold">
                  {event!.title ?? "Tournament"} — {plan.games} games ×{" "}
                  {plan.inningsPerGame} innings = {balance.totalPerPlayer} innings each
                </h2>
                <button className="btn btn-primary text-sm" type="submit">
                  Save all
                </button>
              </div>
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b-2 border-ink text-left">
                    <th className="py-1 pr-2">Player</th>
                    <th className="py-1 pr-2">Slot A</th>
                    <th className="py-1 pr-2">Inn</th>
                    <th className="py-1 pr-2">Slot B</th>
                    <th className="py-1 pr-2">Inn</th>
                    <th className="py-1 pr-2">Pitch</th>
                    <th className="py-1 pr-2">Max/G</th>
                    <th className="py-1 pr-2">Games</th>
                    <th className="py-1 pr-2 text-right">Bench</th>
                    <th className="py-1 text-center">✓</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map((p) => {
                    const l = lineByPlayer.get(p.playerId);
                    const pb = benchByPlayer.get(p.playerId);
                    const posSelect = (name: string, value: string | null) => (
                      <select className="field px-1 py-1 text-xs" name={name} defaultValue={value ?? ""}>
                        <option value="">—</option>
                        {FIELD_POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>{pos}</option>
                        ))}
                      </select>
                    );
                    const inn = (name: string, value: number | undefined) => (
                      <input
                        className="field w-14 px-1 py-1 text-center text-xs"
                        name={name}
                        inputMode="numeric"
                        defaultValue={value || ""}
                        placeholder="0"
                      />
                    );
                    return (
                      <tr key={p.playerId} className="border-b border-ink/10">
                        <td className="whitespace-nowrap py-1 pr-2 font-semibold">
                          {p.firstName} {p.lastName}
                          <input type="hidden" name="playerId" value={p.playerId} />
                        </td>
                        <td className="py-1 pr-2">{posSelect(`posA_${p.playerId}`, l?.posA ?? null)}</td>
                        <td className="py-1 pr-2">{inn(`inningsA_${p.playerId}`, l?.inningsA)}</td>
                        <td className="py-1 pr-2">{posSelect(`posB_${p.playerId}`, l?.posB ?? null)}</td>
                        <td className="py-1 pr-2">{inn(`inningsB_${p.playerId}`, l?.inningsB)}</td>
                        <td className="py-1 pr-2">{inn(`pitch_${p.playerId}`, l?.pitchInnings)}</td>
                        <td className="py-1 pr-2">{inn(`pitchMax_${p.playerId}`, l?.pitchMaxPerGame ?? undefined)}</td>
                        <td className="py-1 pr-2">
                          <input
                            className="field w-20 px-1 py-1 text-xs"
                            name={`pitchGames_${p.playerId}`}
                            defaultValue={l?.pitchGames ?? ""}
                            placeholder="G1, G3"
                          />
                        </td>
                        <td className={`py-1 pr-2 text-right font-bold ${pb && pb.bench < 0 ? "text-red-700" : ""}`}>
                          {pb?.bench ?? balance.totalPerPlayer}
                        </td>
                        <td className="py-1 text-center">
                          {pb?.ok ? "✓" : <span className="font-bold text-red-700">✗</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          </form>

          <section className="card p-4">
            <h2 className="mb-2 text-lg font-bold">
              Position coverage{" "}
              {balance.allOk ? (
                <span className="ml-1 rounded border-2 border-ink bg-green-600 px-2 py-0.5 text-xs font-bold text-white">
                  BALANCED
                </span>
              ) : (
                <span className="ml-1 rounded border-2 border-ink bg-amber-400 px-2 py-0.5 text-xs font-bold">
                  IN PROGRESS
                </span>
              )}
            </h2>
            <div className="flex flex-wrap gap-2">
              {balance.positions.map((pos) => (
                <div
                  key={pos.position}
                  className={`rounded border-2 border-ink px-2 py-1 text-center text-sm font-bold ${
                    pos.ok
                      ? "bg-green-600 text-white"
                      : pos.supplied > pos.needed
                        ? "bg-red-600 text-white"
                        : "bg-paper"
                  }`}
                >
                  {pos.position}
                  <div className="text-xs font-semibold">
                    {pos.supplied}/{pos.needed}
                  </div>
                </div>
              ))}
              <div
                className={`rounded border-2 border-ink px-2 py-1 text-center text-sm font-bold ${
                  balance.benchSupplied === balance.benchNeeded
                    ? "bg-green-600 text-white"
                    : "bg-paper"
                }`}
              >
                Bench
                <div className="text-xs font-semibold">
                  {balance.benchSupplied}/{balance.benchNeeded}
                </div>
              </div>
            </div>
            {balance.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {[...new Set(balance.warnings)].map((w, i) => (
                  <li key={i} className="rounded border-2 border-ink bg-amber-50 px-2 py-1 text-xs font-semibold">
                    ⚠ {w}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-neutral-500">
              When the weekend is balanced, use the{" "}
              <Link className="underline" href="/lineup">
                Lineup lab
              </Link>{" "}
              to draw each game's alignment from it.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
