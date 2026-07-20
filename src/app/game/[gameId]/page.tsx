import { notFound } from "next/navigation";
import { requireCoach } from "@/lib/auth";
import { benchInnings } from "@/lib/gameday";
import { gameSnapshot } from "@/app/game/actions";
import { Dashboard } from "./Dashboard";

export default async function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  await requireCoach();
  const { gameId } = await params;
  const snap = await gameSnapshot(gameId);
  if (!snap) notFound();
  const { game, assignmentRows, orderRows, scoreRows, pitchRows, players } = snap;

  const current: Record<string, string> = {};
  for (const r of assignmentRows) {
    if (r.inning === game.currentInning) current[r.playerId] = r.position;
  }

  const benchInningsByPlayer: Record<string, number> = {};
  const pitchInningsByPlayer: Record<string, number> = {};
  const gamePitchesByPlayer: Record<string, number> = {};
  for (const p of players) {
    // Count only completed innings — the one in progress hasn't been "sat".
    benchInningsByPlayer[p.id] = benchInnings(
      assignmentRows,
      p.id,
      game.currentInning - 1,
    );
  }
  for (const r of pitchRows) {
    gamePitchesByPlayer[r.playerId] = (gamePitchesByPlayer[r.playerId] ?? 0) + r.pitches;
    if (r.pitches > 0) {
      pitchInningsByPlayer[r.playerId] = (pitchInningsByPlayer[r.playerId] ?? 0) + 1;
    }
  }

  return (
    <div>
      <h1 className="mb-2 text-xl font-extrabold">
        {game.label}
        {game.opponent && <span className="text-neutral-600"> vs {game.opponent}</span>}
        <span className="ml-2 text-sm font-semibold text-neutral-500">{game.gameDate}</span>
      </h1>
      <Dashboard
        game={{
          id: game.id,
          label: game.label,
          opponent: game.opponent,
          status: game.status,
          innings: game.innings,
          clockMinutes: game.clockMinutes,
          startedAtMs: game.startedAt ? game.startedAt.getTime() : null,
          currentInning: game.currentInning,
          outs: game.outs,
        }}
        players={players}
        current={current}
        benchInningsByPlayer={benchInningsByPlayer}
        pitchInningsByPlayer={pitchInningsByPlayer}
        gamePitchesByPlayer={gamePitchesByPlayer}
        eligibility={snap.eligibility}
        ratingsByPlayer={snap.ratingsByPlayer}
        score={scoreRows.map((s) => ({ inning: s.inning, side: s.side, runs: s.runs }))}
        battingOrder={orderRows.map((o) => ({ playerId: o.playerId, spot: o.spot }))}
      />
    </div>
  );
}
