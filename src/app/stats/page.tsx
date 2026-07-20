import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  addBatting,
  addPitching,
  battingRates,
  EMPTY_BATTING,
  EMPTY_PITCHING,
  formatIp,
  pitchingRates,
} from "@/lib/stats";
import { formatIsoDay } from "@/lib/format";
import { GcPortal } from "./GcPortal";
import { createStatGame, deleteStatGame } from "./actions";

const fmt3 = (v: number | null) =>
  v === null ? "—" : v.toFixed(3).replace(/^0/, "");

export default async function StatsPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const db = await getDb();
  const roster = await getRoster(season.id);
  const games = await db
    .select()
    .from(tables.statGames)
    .where(eq(tables.statGames.seasonId, season.id))
    .orderBy(asc(tables.statGames.gameDate));
  const gameIds = games.map((g) => g.id);
  const [battingRows, pitchingRows] = gameIds.length
    ? await Promise.all([
        db
          .select()
          .from(tables.battingLines)
          .where(inArray(tables.battingLines.statGameId, gameIds)),
        db
          .select()
          .from(tables.pitchingLines)
          .where(inArray(tables.pitchingLines.statGameId, gameIds)),
      ])
    : [[], []];

  const battingByPlayer = new Map<string, typeof EMPTY_BATTING>();
  for (const row of battingRows) {
    battingByPlayer.set(
      row.playerId,
      addBatting(battingByPlayer.get(row.playerId) ?? EMPTY_BATTING, row),
    );
  }
  const pitchingByPlayer = new Map<string, typeof EMPTY_PITCHING>();
  for (const row of pitchingRows) {
    pitchingByPlayer.set(
      row.playerId,
      addPitching(pitchingByPlayer.get(row.playerId) ?? EMPTY_PITCHING, row),
    );
  }

  const batters = roster
    .filter((p) => battingByPlayer.has(p.playerId))
    .map((p) => {
      const totals = battingByPlayer.get(p.playerId)!;
      return { p, totals, rates: battingRates(totals) };
    })
    .sort((a, b) => (b.rates.avg ?? 0) - (a.rates.avg ?? 0));
  const pitchers = roster
    .filter((p) => pitchingByPlayer.has(p.playerId))
    .map((p) => {
      const totals = pitchingByPlayer.get(p.playerId)!;
      return { p, totals, rates: pitchingRates(totals) };
    })
    .sort((a, b) => (a.rates.era ?? 99) - (b.rates.era ?? 99));
  const isCoach = user.role === "coach";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Stats</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          GameChanger stays the scorer — import its season export here, and
          add manual box scores for scrimmages or anything GC missed. Rates
          compute on a 6-inning basis.
        </p>
      </div>

      {isCoach && <GcPortal />}

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-lg font-bold">Batting</h2>
        {batters.length === 0 ? (
          <p className="text-sm text-neutral-600">
            {isCoach
              ? "No batting stats yet — import GameChanger or enter a game below."
              : "No stats posted yet — they'll appear here once the coaches import GameChanger or enter a box score."}
          </p>
        ) : (
          <table className="w-full min-w-[640px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Player</th>
                <th className="px-1.5">AB</th><th className="px-1.5">R</th>
                <th className="px-1.5">H</th><th className="px-1.5">2B</th>
                <th className="px-1.5">3B</th><th className="px-1.5">HR</th>
                <th className="px-1.5">RBI</th><th className="px-1.5">BB</th>
                <th className="px-1.5">K</th><th className="px-1.5">SB</th>
                <th className="px-1.5 font-extrabold">AVG</th>
                <th className="px-1.5">OBP</th><th className="px-1.5">SLG</th>
                <th className="px-1.5 font-extrabold">OPS</th>
              </tr>
            </thead>
            <tbody>
              {batters.map(({ p, totals, rates }) => (
                <tr key={p.playerId} className="border-b border-line text-right">
                  <td className="py-1 text-left font-semibold">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-1.5">{totals.ab}</td>
                  <td className="px-1.5">{totals.r}</td>
                  <td className="px-1.5">{totals.h}</td>
                  <td className="px-1.5">{totals.doubles}</td>
                  <td className="px-1.5">{totals.triples}</td>
                  <td className="px-1.5">{totals.hr}</td>
                  <td className="px-1.5">{totals.rbi}</td>
                  <td className="px-1.5">{totals.bb}</td>
                  <td className="px-1.5">{totals.k}</td>
                  <td className="px-1.5">{totals.sb}</td>
                  <td className="px-1.5 font-extrabold text-team-blue-dark">{fmt3(rates.avg)}</td>
                  <td className="px-1.5">{fmt3(rates.obp)}</td>
                  <td className="px-1.5">{fmt3(rates.slg)}</td>
                  <td className="px-1.5 font-extrabold text-team-orange-dark">{fmt3(rates.ops)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-lg font-bold">Pitching</h2>
        {pitchers.length === 0 ? (
          <p className="text-sm text-neutral-600">No pitching stats yet.</p>
        ) : (
          <table className="w-full min-w-[520px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Player</th>
                <th className="px-1.5">IP</th><th className="px-1.5">BF</th>
                <th className="px-1.5">Pitches</th><th className="px-1.5">H</th>
                <th className="px-1.5">R</th><th className="px-1.5">ER</th>
                <th className="px-1.5">BB</th><th className="px-1.5">K</th>
                <th className="px-1.5 font-extrabold">ERA</th>
                <th className="px-1.5 font-extrabold">WHIP</th>
              </tr>
            </thead>
            <tbody>
              {pitchers.map(({ p, totals, rates }) => (
                <tr key={p.playerId} className="border-b border-line text-right">
                  <td className="py-1 text-left font-semibold">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-1.5">{formatIp(totals.outs)}</td>
                  <td className="px-1.5">{totals.bf}</td>
                  <td className="px-1.5">{totals.pitches}</td>
                  <td className="px-1.5">{totals.h}</td>
                  <td className="px-1.5">{totals.r}</td>
                  <td className="px-1.5">{totals.er}</td>
                  <td className="px-1.5">{totals.bb}</td>
                  <td className="px-1.5">{totals.k}</td>
                  <td className="px-1.5 font-extrabold text-team-blue-dark">
                    {rates.era === null ? "—" : rates.era.toFixed(2)}
                  </td>
                  <td className="px-1.5 font-extrabold text-team-orange-dark">
                    {rates.whip === null ? "—" : rates.whip.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">Games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-neutral-600">None yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {games.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className={`chip ${g.source === "gc" ? "bg-team-blue-light" : "bg-team-orange text-paper"}`}>
                  {g.source === "gc" ? "GC" : "Manual"}
                </span>
                <Link href={`/stats/game/${g.id}`} className="min-w-0 flex-1 basis-52 font-semibold underline-offset-2 hover:underline">
                  {g.label}
                  {g.opponent && <span className="text-neutral-600"> vs {g.opponent}</span>}
                  <span className="ml-2 text-xs text-neutral-500">{formatIsoDay(g.gameDate)}</span>
                </Link>
                {isCoach && (
                  <form action={deleteStatGame}>
                    <input type="hidden" name="gameId" value={g.id} />
                    <button className="text-xs text-red-700 underline" type="submit">
                      delete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {isCoach && (
        <>
          <form action={createStatGame} className="card flex flex-wrap items-end gap-3 p-4">
            <h2 className="w-full text-lg font-bold">Enter a box score</h2>
            <div>
              <label className="label" htmlFor="label">Game</label>
              <input className="field" id="label" name="label" placeholder="e.g. Scrimmage vs Hawks" required />
            </div>
            <div>
              <label className="label" htmlFor="gameDate">Date</label>
              <input className="field" id="gameDate" name="gameDate" type="date" required />
            </div>
            <div>
              <label className="label" htmlFor="opponent">Opponent</label>
              <input className="field" id="opponent" name="opponent" />
            </div>
            <button className="btn btn-primary" type="submit">Create & enter stats</button>
          </form>

        </>
      )}
    </div>
  );
}
