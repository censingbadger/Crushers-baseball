import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { formatIp } from "@/lib/stats";
import { formatIsoDay } from "@/lib/format";
import { saveStatLines } from "@/app/stats/actions";

export default async function StatGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  const { gameId } = await params;
  const { saved } = await searchParams;
  const db = await getDb();
  const [game] = await db
    .select()
    .from(tables.statGames)
    .where(eq(tables.statGames.id, gameId))
    .limit(1);
  if (!game) notFound();
  const season = await getActiveSeason();
  const roster = season ? await getRoster(season.id) : [];
  const batting = await db
    .select()
    .from(tables.battingLines)
    .where(eq(tables.battingLines.statGameId, gameId));
  const pitching = await db
    .select()
    .from(tables.pitchingLines)
    .where(eq(tables.pitchingLines.statGameId, gameId));
  const bByPlayer = new Map(batting.map((b) => [b.playerId, b]));
  const pByPlayer = new Map(pitching.map((p) => [p.playerId, p]));
  const editable = user.role === "coach" && game.source === "manual";

  const BAT_COLS: { key: string; label: string }[] = [
    { key: "ab", label: "AB" }, { key: "r", label: "R" }, { key: "h", label: "H" },
    { key: "doubles", label: "2B" }, { key: "triples", label: "3B" },
    { key: "hr", label: "HR" }, { key: "rbi", label: "RBI" }, { key: "bb", label: "BB" },
    { key: "k", label: "K" }, { key: "sb", label: "SB" }, { key: "hbp", label: "HBP" },
    { key: "sf", label: "SF" },
  ];
  const PIT_COLS: { key: string; label: string }[] = [
    { key: "bf", label: "BF" }, { key: "pitches", label: "#P" }, { key: "ph", label: "H" },
    { key: "pr", label: "R" }, { key: "er", label: "ER" }, { key: "pbb", label: "BB" },
    { key: "pk", label: "K" },
  ];
  const pitchValue = (pid: string, key: string): number | undefined => {
    const line = pByPlayer.get(pid);
    if (!line) return undefined;
    switch (key) {
      case "bf": return line.bf;
      case "pitches": return line.pitches;
      case "ph": return line.h;
      case "pr": return line.r;
      case "er": return line.er;
      case "pbb": return line.bb;
      case "pk": return line.k;
      default: return undefined;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">
          {game.label}
          {game.opponent && <span className="text-neutral-600"> vs {game.opponent}</span>}
        </h1>
        <p className="text-sm text-neutral-600">
          {formatIsoDay(game.gameDate)} ·{" "}
          {game.source === "gc" ? "GameChanger snapshot (read-only)" : "manual box score"}
        </p>
        {saved && (
          <p className="mt-2 rounded border border-line bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">
            ✓ Box score saved.
          </p>
        )}
      </div>

      <form action={saveStatLines}>
        <input type="hidden" name="gameId" value={game.id} />
        <section className="card overflow-x-auto p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Batting</h2>
            {editable && (
              <button className="btn btn-primary text-sm" type="submit">Save all</button>
            )}
          </div>
          <table className="w-full min-w-[720px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-center">
                <th className="py-1 text-left">Player</th>
                {BAT_COLS.map((c) => <th key={c.key} className="px-1">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const line = bByPlayer.get(p.playerId) as Record<string, unknown> | undefined;
                return (
                  <tr key={p.playerId} className="border-b border-line text-center">
                    <td className="whitespace-nowrap py-1 text-left font-semibold">
                      {p.firstName} {p.lastName}
                      {editable && <input type="hidden" name="playerId" value={p.playerId} />}
                    </td>
                    {BAT_COLS.map((c) => (
                      <td key={c.key} className="px-0.5 py-0.5">
                        {editable ? (
                          <input
                            className="field w-11 px-1 py-0.5 text-center text-xs"
                            name={`${c.key}_${p.playerId}`}
                            inputMode="numeric"
                            defaultValue={(line?.[c.key] as number | undefined) || ""}
                            placeholder="0"
                          />
                        ) : (
                          <span>{(line?.[c.key] as number | undefined) ?? "·"}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="card mt-4 overflow-x-auto p-4">
          <h2 className="mb-2 text-lg font-bold">Pitching</h2>
          <table className="w-full min-w-[560px] text-sm" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="border-b border-line-strong text-center">
                <th className="py-1 text-left">Player</th>
                <th className="px-1">IP</th>
                {PIT_COLS.map((c) => <th key={c.key} className="px-1">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {roster.map((p) => {
                const line = pByPlayer.get(p.playerId);
                return (
                  <tr key={p.playerId} className="border-b border-line text-center">
                    <td className="whitespace-nowrap py-1 text-left font-semibold">
                      {p.firstName} {p.lastName}
                    </td>
                    <td className="px-0.5 py-0.5">
                      {editable ? (
                        <input
                          className="field w-12 px-1 py-0.5 text-center text-xs"
                          name={`ip_${p.playerId}`}
                          defaultValue={line ? formatIp(line.outs) : ""}
                          placeholder="0.0"
                        />
                      ) : (
                        <span>{line ? formatIp(line.outs) : "·"}</span>
                      )}
                    </td>
                    {PIT_COLS.map((c) => (
                      <td key={c.key} className="px-0.5 py-0.5">
                        {editable ? (
                          <input
                            className="field w-11 px-1 py-0.5 text-center text-xs"
                            name={`${c.key}_${p.playerId}`}
                            inputMode="numeric"
                            defaultValue={pitchValue(p.playerId, c.key) || ""}
                            placeholder="0"
                          />
                        ) : (
                          <span>{pitchValue(p.playerId, c.key) ?? "·"}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {editable && (
            <button className="btn btn-primary mt-3 text-sm" type="submit">Save all</button>
          )}
        </section>
      </form>
    </div>
  );
}
