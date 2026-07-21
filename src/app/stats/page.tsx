import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  addBatting,
  addCatching,
  addFielding,
  addPitching,
  battingRates,
  catchingRates,
  EMPTY_BATTING,
  EMPTY_CATCHING,
  EMPTY_FIELDING,
  EMPTY_PITCHING,
  fieldingRates,
  formatIp,
  pitchingRates,
} from "@/lib/stats";
import { formatIsoDay } from "@/lib/format";
import { computeSeasonUsage } from "@/lib/usage";
import { getRecentPitchDays } from "@/lib/home";
import { pitchEligibility } from "@/lib/pitchsmart";
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
  const [battingRows, pitchingRows, fieldingRows, catchingRows] = gameIds.length
    ? await Promise.all([
        db
          .select()
          .from(tables.battingLines)
          .where(inArray(tables.battingLines.statGameId, gameIds)),
        db
          .select()
          .from(tables.pitchingLines)
          .where(inArray(tables.pitchingLines.statGameId, gameIds)),
        db
          .select()
          .from(tables.fieldingLines)
          .where(inArray(tables.fieldingLines.statGameId, gameIds)),
        db
          .select()
          .from(tables.catchingLines)
          .where(inArray(tables.catchingLines.statGameId, gameIds)),
      ])
    : [[], [], [], []];

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

  const fieldingByPlayer = new Map<string, typeof EMPTY_FIELDING>();
  for (const row of fieldingRows) {
    fieldingByPlayer.set(
      row.playerId,
      addFielding(fieldingByPlayer.get(row.playerId) ?? EMPTY_FIELDING, row),
    );
  }
  const catchingByPlayer = new Map<string, typeof EMPTY_CATCHING>();
  for (const row of catchingRows) {
    catchingByPlayer.set(
      row.playerId,
      addCatching(catchingByPlayer.get(row.playerId) ?? EMPTY_CATCHING, row),
    );
  }
  const fielders = roster
    .filter((p) => fieldingByPlayer.has(p.playerId))
    .map((p) => {
      const totals = fieldingByPlayer.get(p.playerId)!;
      return { p, totals, rates: fieldingRates(totals) };
    })
    .sort((a, b) => (b.rates.fpct ?? 0) - (a.rates.fpct ?? 0));
  const catchers = roster
    .filter((p) => catchingByPlayer.has(p.playerId))
    .map((p) => {
      const totals = catchingByPlayer.get(p.playerId)!;
      return { p, totals, rates: catchingRates(totals) };
    })
    .sort((a, b) => b.totals.outs - a.totals.outs);
  const isCoach = user.role === "coach";

  // The fairness ledger + pitcher availability, from dugout game records.
  let usage: ReturnType<typeof computeSeasonUsage> = new Map();
  let pitchStatus: { playerId: string; last7: number; note: string }[] = [];
  if (isCoach) {
    const liveGames = await db
      .select()
      .from(tables.liveGames)
      .where(eq(tables.liveGames.seasonId, season.id));
    const liveIds = liveGames.map((g) => g.id);
    const assignmentRows = liveIds.length
      ? await db
          .select()
          .from(tables.gameAssignments)
          .where(inArray(tables.gameAssignments.gameId, liveIds))
      : [];
    usage = computeSeasonUsage(liveGames, assignmentRows);

    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 6 * 86400_000).toISOString().slice(0, 10);
    const pitchDays = await getRecentPitchDays(season.id, since);
    const byPlayer = new Map<string, { day: string; pitches: number }[]>();
    for (const d of pitchDays) {
      byPlayer.set(d.playerId, [...(byPlayer.get(d.playerId) ?? []), d]);
    }
    pitchStatus = [...byPlayer.entries()].map(([playerId, days]) => {
      const e = pitchEligibility(days, today);
      return {
        playerId,
        last7: days.reduce((n, d) => n + d.pitches, 0),
        note: e.eligible
          ? `OK · ${e.pitchesRemainingToday} left today`
          : e.nextEligibleDay
            ? `resting — back ${formatIsoDay(e.nextEligibleDay)}`
            : "at the daily cap",
      };
    });
  }
  const nameOf = new Map(roster.map((p) => [p.playerId, `${p.firstName} ${p.lastName}`]));

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

      {fielders.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-lg font-bold">Fielding</h2>
          <table className="w-full min-w-[420px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Player</th>
                <th className="px-1.5">TC</th><th className="px-1.5">PO</th>
                <th className="px-1.5">A</th><th className="px-1.5">E</th>
                <th className="px-1.5">DP</th>
                <th className="px-1.5 font-extrabold">FPCT</th>
              </tr>
            </thead>
            <tbody>
              {fielders.map(({ p, totals, rates }) => (
                <tr key={p.playerId} className="border-b border-line text-right">
                  <td className="py-1 text-left font-semibold">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-1.5">{rates.chances}</td>
                  <td className="px-1.5">{totals.po}</td>
                  <td className="px-1.5">{totals.a}</td>
                  <td className="px-1.5">{totals.e}</td>
                  <td className="px-1.5">{totals.dp}</td>
                  <td className="px-1.5 font-extrabold text-team-blue-dark">{fmt3(rates.fpct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {catchers.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-2 text-lg font-bold">Catching</h2>
          <table className="w-full min-w-[420px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Player</th>
                <th className="px-1.5">INN</th><th className="px-1.5">PB</th>
                <th className="px-1.5">SB</th><th className="px-1.5">CS</th>
                <th className="px-1.5 font-extrabold">CS%</th>
              </tr>
            </thead>
            <tbody>
              {catchers.map(({ p, totals, rates }) => (
                <tr key={p.playerId} className="border-b border-line text-right">
                  <td className="py-1 text-left font-semibold">
                    {p.firstName} {p.lastName}
                  </td>
                  <td className="px-1.5">{formatIp(totals.outs)}</td>
                  <td className="px-1.5">{totals.pb}</td>
                  <td className="px-1.5">{totals.sbAllowed}</td>
                  <td className="px-1.5">{totals.cs}</td>
                  <td className="px-1.5 font-extrabold text-team-blue-dark">{fmt3(rates.csPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {isCoach && usage.size > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-1 text-lg font-bold">Playing time (season)</h2>
          <p className="mb-2 text-xs text-neutral-600">
            Rolled up from every dugout game — the receipts when someone asks
            about innings. Sat% is bench share of innings present.
          </p>
          <table className="w-full min-w-[520px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Player</th>
                <th className="px-1.5">G</th>
                <th className="px-1.5">Inn played</th>
                <th className="px-1.5">Inn sat</th>
                <th className="px-1.5 font-extrabold">Sat%</th>
                <th className="py-1 pl-3 text-left">Where they played</th>
              </tr>
            </thead>
            <tbody>
              {roster
                .filter((p) => usage.has(p.playerId))
                .map((p) => usage.get(p.playerId)!)
                .sort((a, b) => (b.satShare ?? 0) - (a.satShare ?? 0))
                .map((u) => (
                  <tr key={u.playerId} className="border-b border-line text-right">
                    <td className="py-1 text-left font-semibold">{nameOf.get(u.playerId)}</td>
                    <td className="px-1.5">{u.games}</td>
                    <td className="px-1.5">{u.fieldInnings}</td>
                    <td className="px-1.5">{u.benchInnings}</td>
                    <td
                      className={`px-1.5 font-extrabold ${
                        (u.satShare ?? 0) >= 0.4 ? "text-red-700" : "text-team-blue-dark"
                      }`}
                    >
                      {u.satShare === null ? "—" : `${Math.round(u.satShare * 100)}%`}
                    </td>
                    <td className="py-1 pl-3 text-left text-xs">
                      {u.positions.map(([pos, n]) => `${pos} ${n}`).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {isCoach && pitchStatus.length > 0 && (
        <section className="card overflow-x-auto p-4">
          <h2 className="mb-1 text-lg font-bold">Pitching — last 7 days</h2>
          <p className="mb-2 text-xs text-neutral-600">
            Pitch Smart across the week: who&apos;s fresh for the weekend, who
            needs rest. Plan Sunday&apos;s arms backward from here.
          </p>
          <table className="w-full min-w-[380px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-right">
                <th className="py-1 text-left">Pitcher</th>
                <th className="px-1.5">Pitches (7d)</th>
                <th className="py-1 pl-3 text-left">Today</th>
              </tr>
            </thead>
            <tbody>
              {pitchStatus
                .sort((a, b) => b.last7 - a.last7)
                .map((s) => (
                  <tr key={s.playerId} className="border-b border-line text-right">
                    <td className="py-1 text-left font-semibold">{nameOf.get(s.playerId)}</td>
                    <td className="px-1.5">{s.last7}</td>
                    <td
                      className={`py-1 pl-3 text-left text-xs font-bold ${
                        s.note.startsWith("OK") ? "text-green-700" : "text-red-700"
                      }`}
                    >
                      {s.note}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">Games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-neutral-600">None yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {games.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className={`chip ${g.source === "gc" ? "bg-team-blue-light" : "bg-team-orange text-ink"}`}>
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
