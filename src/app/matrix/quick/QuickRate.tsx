"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { POSITIONS } from "@/db/schema";
import { clearMatrixRow, saveMatrixCell } from "@/app/matrix/actions";

interface Player {
  playerId: string;
  name: string;
}

export function QuickRate({
  players,
  initialRatings,
  rater,
}: {
  players: Player[];
  initialRatings: Record<string, Record<string, number>>;
  rater: string;
}) {
  const [idx, setIdx] = useState(0);
  const [values, setValues] = useState(initialRatings);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (players.length === 0) {
    return <p className="card p-6 text-sm">No players on the roster yet.</p>;
  }
  const player = players[idx];
  const mine = values[player.playerId] ?? {};
  const ratedCount = (pid: string) => Object.keys(values[pid] ?? {}).length;

  function tap(position: string, rating: number) {
    setValues((v) => ({
      ...v,
      [player.playerId]: { ...(v[player.playerId] ?? {}), [position]: rating },
    }));
    const key = `${position}`;
    setSavedFlash(key);
    window.setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 900);
    startTransition(async () => {
      await saveMatrixCell(player.playerId, position, rating);
    });
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <button
          className="btn px-3 py-1.5"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          ◀
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-lg font-extrabold">{player.name}</p>
          <p className="text-xs font-semibold text-neutral-500">
            {idx + 1} of {players.length} · {ratedCount(player.playerId)}/9 positions rated
          </p>
        </div>
        <button
          className="btn px-3 py-1.5"
          onClick={() => setIdx((i) => Math.min(players.length - 1, i + 1))}
          disabled={idx === players.length - 1}
        >
          ▶
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {POSITIONS.map((pos) => (
          <div key={pos} className="flex items-center gap-2">
            <span className="w-8 shrink-0 text-sm font-extrabold">
              {pos}
              {savedFlash === pos && (
                <span className="ml-0.5 align-middle text-[10px] text-green-700">✓</span>
              )}
            </span>
            <div className="grid flex-1 grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const active = mine[pos] === n;
                return (
                  <button
                    key={n}
                    data-pos={pos}
                    data-val={n}
                    onClick={() => tap(pos, n)}
                    className={`rounded border py-1.5 text-center text-sm font-bold transition ${
                      active
                        ? "border-team-orange-dark bg-team-orange text-paper"
                        : "border-line bg-paper hover:bg-team-blue-light"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500">
          Every tap saves instantly · rating as Coach {rater}
        </p>
        <div className="flex gap-2">
          <button
            className="text-xs text-red-700 underline"
            onClick={() => {
              if (!window.confirm(`Clear ALL of your ratings for ${player.name}? Other coaches' numbers are untouched.`)) return;
              const fd = new FormData();
              fd.set("playerId", player.playerId);
              fd.set("rater", rater);
              setValues((v) => ({ ...v, [player.playerId]: {} }));
              startTransition(async () => {
                await clearMatrixRow(fd);
              });
            }}
          >
            Clear my row
          </button>
          {idx < players.length - 1 && (
            <button className="btn px-4 py-1.5 text-sm" onClick={() => setIdx(idx + 1)}>
              Next player →
            </button>
          )}
          <Link className="btn btn-primary px-4 py-1.5 text-sm" href="/matrix">
            ✓ Save &amp; done
          </Link>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 border-t border-line pt-2">
        {players.map((p, i) => (
          <button
            key={p.playerId}
            onClick={() => setIdx(i)}
            className={`rounded-full border px-2 py-0.5 text-xs font-bold ${
              i === idx
                ? "border-team-orange-dark bg-team-orange text-paper"
                : ratedCount(p.playerId) === 9
                  ? "border-line bg-team-blue-light"
                  : "border-line bg-paper"
            }`}
          >
            {p.name.split(" ")[0]}
            {ratedCount(p.playerId) === 9 ? " ✓" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}
