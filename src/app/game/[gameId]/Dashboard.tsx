"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPitches,
  addRun,
  cycleOuts,
  finishGame,
  moveGamePlayer,
  setInning,
  startGame,
  swapBattingSpot,
} from "@/app/game/actions";
import { BENCH } from "@/lib/gameday";

const POSITIONS = ["P", "C", "1B", "2B", "SS", "3B", "LF", "CF", "RF"] as const;

// Chip anchors in percent of the 4:3 field, matching the SVG geometry
// below (home plate at (50,68) in a 100x75 viewBox).
const SLOT_POS: Record<string, { top: string; left: string }> = {
  CF: { top: "17%", left: "50%" },
  LF: { top: "26%", left: "25%" },
  RF: { top: "26%", left: "75%" },
  SS: { top: "44%", left: "37%" },
  "2B": { top: "44%", left: "63%" },
  "3B": { top: "60%", left: "27%" },
  "1B": { top: "60%", left: "73%" },
  P: { top: "62%", left: "50%" },
  C: { top: "87%", left: "50%" },
};

function FieldArt() {
  return (
    <svg
      viewBox="0 0 100 75"
      preserveAspectRatio="none"
      className="absolute inset-0 h-full w-full"
      aria-hidden
    >
      {/* foul ground */}
      <rect width="100" height="75" fill="#2f7a3d" />
      {/* fair territory fan */}
      <path
        d="M 50 68 L 10.4 28.4 A 56 56 0 0 1 89.6 28.4 Z"
        fill="#43974f"
      />
      {/* mowing rings */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="7">
        <path d="M 21.7 39.7 A 40 40 0 0 1 78.3 39.7" />
        <path d="M 31.6 49.6 A 26 26 0 0 1 68.4 49.6" />
      </g>
      {/* outfield fence with foul poles */}
      <path
        d="M 10.4 28.4 A 56 56 0 0 1 89.6 28.4"
        fill="none"
        stroke="#f5efe0"
        strokeWidth="1.1"
      />
      <circle cx="10.4" cy="28.4" r="1" fill="#ffd23f" />
      <circle cx="89.6" cy="28.4" r="1" fill="#ffd23f" />
      {/* infield dirt */}
      <path
        d="M 50 69.5 L 72.5 47 L 50 24.5 L 27.5 47 Z"
        fill="#c99054"
        stroke="#b57e42"
        strokeWidth="0.4"
      />
      {/* infield grass */}
      <path d="M 50 61.5 L 64.5 47 L 50 32.5 L 35.5 47 Z" fill="#43974f" />
      {/* base cutouts */}
      <circle cx="71" cy="47" r="3" fill="#c99054" />
      <circle cx="29" cy="47" r="3" fill="#c99054" />
      <circle cx="50" cy="26" r="3" fill="#c99054" />
      {/* mound + home circle */}
      <circle cx="50" cy="47" r="3.6" fill="#c99054" />
      <rect x="48.9" y="46.7" width="2.2" height="0.7" rx="0.2" fill="#ffffff" />
      <circle cx="50" cy="68" r="5.2" fill="#c99054" />
      {/* foul lines */}
      <g stroke="#ffffff" strokeWidth="0.6">
        <line x1="50" y1="68" x2="10.4" y2="28.4" />
        <line x1="50" y1="68" x2="89.6" y2="28.4" />
      </g>
      {/* bases */}
      <g fill="#ffffff" stroke="#1e1b1b" strokeWidth="0.25">
        <rect x="69.6" y="45.6" width="2.8" height="2.8" transform="rotate(45 71 47)" />
        <rect x="27.6" y="45.6" width="2.8" height="2.8" transform="rotate(45 29 47)" />
        <rect x="48.6" y="24.6" width="2.8" height="2.8" transform="rotate(45 50 26)" />
        {/* home plate */}
        <path d="M 48.7 66.6 h 2.6 v 1.5 l -1.3 1.2 l -1.3 -1.2 Z" />
      </g>
    </svg>
  );
}

interface Player {
  id: string;
  firstName: string;
  lastName: string;
}

interface Props {
  game: {
    id: string;
    label: string;
    opponent: string | null;
    status: "setup" | "live" | "final";
    innings: number;
    clockMinutes: number;
    startedAtMs: number | null;
    currentInning: number;
    outs: number;
  };
  players: Player[];
  /** playerId -> slot for the current inning */
  current: Record<string, string>;
  benchInningsByPlayer: Record<string, number>;
  pitchInningsByPlayer: Record<string, number>;
  gamePitchesByPlayer: Record<string, number>;
  eligibility: Record<string, { eligible: boolean; remaining: number; reason: string | null }>;
  ratingsByPlayer: Record<string, Record<string, number>>;
  score: { inning: number; side: "us" | "them"; runs: number }[];
  battingOrder: { playerId: string; spot: number }[];
}

function Clock({ startedAtMs, clockMinutes }: { startedAtMs: number | null; clockMinutes: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!startedAtMs) {
    return <span className="font-mono text-lg font-bold">{clockMinutes}:00</span>;
  }
  const remainingMs = startedAtMs + clockMinutes * 60_000 - now;
  const negative = remainingMs < 0;
  const abs = Math.abs(remainingMs);
  const mm = Math.floor(abs / 60_000);
  const ss = Math.floor((abs % 60_000) / 1000);
  return (
    <span
      className={`font-mono text-lg font-bold ${
        negative ? "text-red-700" : remainingMs < 10 * 60_000 ? "text-team-orange-dark" : ""
      }`}
    >
      {negative ? "-" : ""}
      {mm}:{String(ss).padStart(2, "0")}
    </span>
  );
}

export function Dashboard(props: Props) {
  const { game, players, current, eligibility } = props;
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);
  const [warning, setWarning] = useState<{ playerId: string; target: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Keep other devices in sync: refresh server state every 15s.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 15_000);
    return () => clearInterval(t);
  }, [router]);

  const nameOf = useMemo(() => {
    const m = new Map(players.map((p) => [p.id, `${p.firstName} ${p.lastName.slice(0, 1)}.`]));
    return (id: string) => m.get(id) ?? "?";
  }, [players]);

  const playerAt = useMemo(() => {
    const m = new Map<string, string>();
    for (const [pid, slot] of Object.entries(current)) m.set(slot, pid);
    return m;
  }, [current]);

  const benchIds = useMemo(
    () =>
      Object.entries(current)
        .filter(([, slot]) => slot === BENCH)
        .map(([pid]) => pid)
        .sort((a, b) => (props.benchInningsByPlayer[b] ?? 0) - (props.benchInningsByPlayer[a] ?? 0)),
    [current, props.benchInningsByPlayer],
  );

  async function doMove(playerId: string, target: string, force = false) {
    setBusy(true);
    const result = await moveGamePlayer(game.id, playerId, target as never, force);
    setBusy(false);
    if (!result.ok && result.warning) {
      setWarning({ playerId, target, text: result.warning });
      return;
    }
    setWarning(null);
    setSelected(null);
    startTransition(() => router.refresh());
  }

  function tapSlot(slot: string) {
    if (busy) return;
    const occupant = playerAt.get(slot) ?? null;
    if (selected) {
      if (occupant === selected) {
        setSelected(null);
        return;
      }
      void doMove(selected, slot);
      return;
    }
    if (occupant) setSelected(occupant);
  }

  function tapBenchPlayer(pid: string) {
    if (busy) return;
    setSelected(selected === pid ? null : pid);
  }

  const suggestionsFor = (slot: string) =>
    benchIds
      .map((pid) => ({ pid, rating: props.ratingsByPlayer[pid]?.[slot] ?? 1 }))
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 3);

  const scoreFor = (inning: number, side: "us" | "them") =>
    props.score.find((s) => s.inning === inning && s.side === side)?.runs;

  const usTotal = props.score.filter((s) => s.side === "us").reduce((n, s) => n + s.runs, 0);
  const themTotal = props.score.filter((s) => s.side === "them").reduce((n, s) => n + s.runs, 0);
  const pitcherId = playerAt.get("P") ?? null;
  const innings = Array.from({ length: Math.max(game.innings, game.currentInning) }, (_, i) => i + 1);

  return (
    <div className="space-y-3">
      {/* Top strip: inning, outs, clock, status */}
      <div className="card flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <button
            className="btn px-2 py-0.5"
            onClick={() => startTransition(async () => { await setInning(game.id, game.currentInning - 1); router.refresh(); })}
            disabled={game.currentInning <= 1}
          >
            ◀
          </button>
          <span className="min-w-16 text-center text-lg font-extrabold">Inn {game.currentInning}</span>
          <button
            className="btn px-2 py-0.5"
            onClick={() => startTransition(async () => { await setInning(game.id, game.currentInning + 1); router.refresh(); })}
          >
            ▶
          </button>
        </div>
        <button
          className="btn px-3 py-0.5 font-mono text-lg"
          title="Tap to add an out"
          onClick={() => startTransition(async () => { await cycleOuts(game.id); router.refresh(); })}
        >
          {"●".repeat(game.outs)}
          {"○".repeat(3 - game.outs)}
        </button>
        <Clock startedAtMs={game.startedAtMs} clockMinutes={game.clockMinutes} />
        <span className="ml-auto flex items-center gap-2">
          <span className="text-2xl font-extrabold">
            {usTotal}<span className="mx-1 text-neutral-400">–</span>{themTotal}
          </span>
          {game.status === "setup" && (
            <button
              className="btn btn-primary"
              onClick={() => startTransition(async () => { await startGame(game.id); router.refresh(); })}
            >
              ▶ Start game
            </button>
          )}
          {game.status === "live" && (
            <button
              className="btn"
              onClick={() => startTransition(async () => { await finishGame(game.id); router.refresh(); })}
            >
              Final
            </button>
          )}
          {game.status === "final" && (
            <span className="rounded border-2 border-ink bg-ink px-2 py-0.5 text-xs font-bold uppercase text-paper">
              Final
            </span>
          )}
        </span>
      </div>

      {warning && (
        <div className="card border-red-700 bg-amber-50 p-3">
          <p className="text-sm font-bold text-red-700">⚠ {warning.text}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn text-xs" onClick={() => setWarning(null)}>
              Cancel
            </button>
            <button
              className="btn bg-red-700 text-xs text-paper"
              onClick={() => void doMove(warning.playerId, warning.target, true)}
            >
              Override anyway
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        {/* Field */}
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border-2 border-ink">
            <FieldArt />
            {POSITIONS.map((pos) => {
              const pid = playerAt.get(pos) ?? null;
              const sel = pid !== null && pid === selected;
              const empty = pid === null;
              return (
                <button
                  key={pos}
                  style={SLOT_POS[pos]}
                  onClick={() => tapSlot(pos)}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 px-2 py-1 text-center shadow ${
                    sel
                      ? "border-team-orange bg-team-orange text-paper"
                      : empty
                        ? "border-dashed border-white bg-white/20 text-white"
                        : "border-ink bg-paper"
                  } ${selected && !sel ? "ring-2 ring-team-orange" : ""}`}
                >
                  <span className="block text-[10px] font-bold uppercase opacity-70">{pos}</span>
                  <span className="block text-sm font-extrabold leading-tight">
                    {pid ? nameOf(pid) : "—"}
                  </span>
                  {pos === "P" && pid && (
                    <span className="block text-[10px] font-semibold">
                      {props.gamePitchesByPlayer[pid] ?? 0} p · {eligibility[pid]?.remaining ?? 0} left
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Pitch counter for the current pitcher */}
          {pitcherId && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border-2 border-ink bg-paper p-2">
              <span className="text-sm font-bold">
                ⚾ {nameOf(pitcherId)} — {props.gamePitchesByPlayer[pitcherId] ?? 0} pitches
                <span className="ml-1 text-xs font-semibold text-neutral-600">
                  ({eligibility[pitcherId]?.remaining ?? 0} left today)
                </span>
              </span>
              {[1, 5, -1].map((d) => (
                <button
                  key={d}
                  className={`btn px-3 py-1 text-sm ${d === 1 ? "btn-primary" : ""}`}
                  onClick={() =>
                    startTransition(async () => {
                      await addPitches(game.id, pitcherId, d);
                      router.refresh();
                    })
                  }
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
              {(eligibility[pitcherId]?.remaining ?? 1) <= 10 && (
                <span className="rounded border-2 border-ink bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                  {eligibility[pitcherId]?.remaining === 0 ? "AT THE CAP" : "NEAR THE CAP"}
                </span>
              )}
            </div>
          )}

          {/* Bench */}
          <div className="mt-2 rounded-lg border-2 border-ink bg-paper p-2">
            <span className="text-xs font-bold uppercase">Bench</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {benchIds.length === 0 && (
                <span className="text-sm text-neutral-500">Empty — everyone's on the field.</span>
              )}
              {benchIds.map((pid) => (
                <button
                  key={pid}
                  onClick={() => tapBenchPlayer(pid)}
                  className={`rounded-lg border-2 px-2 py-1 text-sm font-bold ${
                    selected === pid
                      ? "border-team-orange bg-team-orange text-paper"
                      : "border-ink bg-team-blue-light"
                  }`}
                >
                  {nameOf(pid)}
                  <span className="ml-1 text-[10px] font-semibold opacity-70">
                    {props.benchInningsByPlayer[pid] ?? 0} inn sat
                  </span>
                  {!eligibility[pid]?.eligible && <span title={eligibility[pid]?.reason ?? ""}> 🚫P</span>}
                </button>
              ))}
              {selected && current[selected] !== BENCH && (
                <button
                  className="rounded-lg border-2 border-dashed border-ink px-2 py-1 text-sm font-bold hover:bg-team-blue-light"
                  onClick={() => void doMove(selected, BENCH)}
                >
                  ⬇ send {nameOf(selected)} to bench
                </button>
              )}
            </div>
            {selected && (
              <p className="mt-1 text-xs font-semibold text-team-orange-dark">
                {nameOf(selected)} selected — tap a position to move, tap again to cancel.
              </p>
            )}
            {!selected &&
              POSITIONS.filter((p) => !playerAt.get(p)).map((slot) => (
                <p key={slot} className="mt-1 text-xs font-semibold">
                  <span className="text-red-700">{slot} is empty.</span>{" "}
                  {suggestionsFor(slot).map((s, i) => (
                    <button
                      key={s.pid}
                      className="ml-1 underline"
                      onClick={() => void doMove(s.pid, slot)}
                    >
                      {i === 0 ? "best: " : ""}
                      {nameOf(s.pid)} ({s.rating})
                    </button>
                  ))}
                </p>
              ))}
          </div>
        </div>

        {/* Batting order + counters */}
        <div className="space-y-3">
          <div className="rounded-lg border-2 border-ink bg-paper p-2">
            <span className="text-xs font-bold uppercase">Batting order</span>
            <ol className="mt-1 space-y-0.5 text-sm">
              {props.battingOrder.map((o, i) => (
                <li key={o.playerId} className="flex items-center gap-1">
                  <span className="w-5 text-right font-mono text-xs">{i + 1}.</span>
                  <span className="flex-1 font-semibold">{nameOf(o.playerId)}</span>
                  <span className="text-[10px] text-neutral-500">
                    {current[o.playerId] === BENCH ? "bench" : current[o.playerId]}
                  </span>
                  <button
                    className="rounded border border-ink px-1 text-xs"
                    onClick={() => startTransition(async () => { await swapBattingSpot(game.id, o.playerId, "up"); router.refresh(); })}
                    disabled={i === 0}
                  >
                    ↑
                  </button>
                  <button
                    className="rounded border border-ink px-1 text-xs"
                    onClick={() => startTransition(async () => { await swapBattingSpot(game.id, o.playerId, "down"); router.refresh(); })}
                    disabled={i === props.battingOrder.length - 1}
                  >
                    ↓
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-lg border-2 border-ink bg-paper p-2 text-sm">
            <span className="text-xs font-bold uppercase">Innings pitched</span>
            {Object.entries(props.pitchInningsByPlayer)
              .filter(([, n]) => n > 0)
              .map(([pid, n]) => (
                <p key={pid}>
                  {nameOf(pid)}: <b>{n}</b> inn, {props.gamePitchesByPlayer[pid] ?? 0} pitches
                </p>
              ))}
          </div>
        </div>
      </div>

      {/* Box score strip */}
      <div className="card overflow-x-auto p-3">
        <table className="w-full min-w-[420px] text-center text-sm">
          <thead>
            <tr className="border-b-2 border-ink">
              <th className="py-1 text-left">Box</th>
              {innings.map((i) => (
                <th key={i} className={`px-2 py-1 ${i === game.currentInning ? "bg-team-blue-light" : ""}`}>{i}</th>
              ))}
              <th className="px-2 py-1 font-extrabold">R</th>
            </tr>
          </thead>
          <tbody>
            {(["us", "them"] as const).map((side) => (
              <tr key={side} className="border-b border-ink/10">
                <td className="py-1 text-left font-bold">
                  {side === "us" ? "Crushers" : (game.opponent ?? "Them")}
                </td>
                {innings.map((i) => (
                  <td key={i} className={`px-2 py-1 ${i === game.currentInning ? "bg-team-blue-light font-bold" : ""}`}>
                    {scoreFor(i, side) ?? (i < game.currentInning ? 0 : "")}
                  </td>
                ))}
                <td className="px-2 py-1 font-extrabold">{side === "us" ? usTotal : themTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            className="btn btn-primary text-sm"
            onClick={() => startTransition(async () => { await addRun(game.id, "us", 1); router.refresh(); })}
          >
            +1 Crushers
          </button>
          <button
            className="btn text-sm"
            onClick={() => startTransition(async () => { await addRun(game.id, "them", 1); router.refresh(); })}
          >
            +1 {game.opponent ?? "Them"}
          </button>
          <button
            className="btn text-sm"
            onClick={() => startTransition(async () => { await addRun(game.id, "us", -1); router.refresh(); })}
          >
            −1 Crushers
          </button>
        </div>
      </div>
    </div>
  );
}
