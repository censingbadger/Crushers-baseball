"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveBarsRating } from "@/app/rate/actions";

interface Def {
  key: string;
  code: string;
  label: string;
  sub: string;
  cluster: string;
  cadence: string;
  anchors: Record<1 | 2 | 3 | 4 | 5, string>;
  guardrail: string | null;
  roleModule: boolean;
}

interface PlayerRow {
  playerId: string;
  name: string;
  youngest: boolean;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const LEVELS = [1, 2, 3, 4, 5] as const;

export function RateBars({
  def,
  players,
  initial,
  rater,
}: {
  def: Def;
  players: PlayerRow[];
  initial: Record<string, { level: number; day: string }>;
  rater: string;
}) {
  const [day, setDay] = useState(todayIso());
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(
      Object.entries(initial).map(([pid, v]) => [pid, v.level]),
    ),
  );
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [openAnchor, setOpenAnchor] = useState<number | null>(3);
  const [, startTransition] = useTransition();

  function tap(playerId: string, level: number) {
    setValues((v) => ({ ...v, [playerId]: level }));
    setSavedFlash(playerId);
    window.setTimeout(
      () => setSavedFlash((k) => (k === playerId ? null : k)),
      900,
    );
    startTransition(async () => {
      await saveBarsRating(playerId, def.key, level, day);
    });
  }

  const technicalFlag = def.cluster === "technical" || def.roleModule;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">
          <span className="mr-2 rounded border border-line bg-team-blue-light px-1.5 text-base align-middle">
            {def.code}
          </span>
          {def.label}
        </h1>
        <Link className="text-sm font-semibold underline" href="/rate">
          ← All dimensions
        </Link>
      </div>
      <p className="text-sm text-neutral-700">
        {def.sub} · {def.cadence}. Rate from games and scrimmages, not drills
        — a skill executed while a coach cues it hasn&apos;t been demonstrated.
        Every tap saves under <b>Coach {rater}</b>.
      </p>

      {def.guardrail && (
        <p className="rounded border border-amber-500 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
          ⚠ {def.guardrail}
        </p>
      )}

      {/* The anchors — the instrument itself, always on screen. */}
      <div className="card divide-y divide-line p-0" data-testid="anchors">
        {LEVELS.map((lvl) => (
          <button
            key={lvl}
            className="block w-full px-3 py-1.5 text-left"
            onClick={() => setOpenAnchor(openAnchor === lvl ? null : lvl)}
          >
            <span className="flex items-baseline gap-2">
              <span
                className={`w-5 shrink-0 rounded border border-line text-center text-sm font-extrabold ${
                  lvl === 3 ? "bg-team-orange text-paper" : "bg-team-blue-light"
                }`}
              >
                {lvl}
              </span>
              <span
                className={`text-xs ${openAnchor === lvl ? "" : "line-clamp-1 text-neutral-600"}`}
              >
                {lvl === 3 && <b className="text-team-orange-dark">The standard · </b>}
                {def.anchors[lvl]}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="font-bold" htmlFor="day">
          Observation date
        </label>
        <input
          id="day"
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded border border-line px-2 py-1"
        />
        {def.roleModule && (
          <span className="text-xs text-neutral-600">
            Rate only the kids who actually fill this role — leave the rest
            untouched or Not observed.
          </span>
        )}
      </div>

      <div className="card divide-y divide-line p-2">
        {players.map((p) => {
          const val = values[p.playerId];
          return (
            <div
              key={p.playerId}
              data-player-row={p.name}
              className="flex flex-wrap items-center gap-2 py-1.5"
            >
              <span className="min-w-32 flex-1 text-sm font-bold">
                {p.name}
                {technicalFlag && p.youngest && (
                  <span
                    className="ml-1 align-middle text-xs"
                    title="Youngest quartile of the roster — technical levels are partly maturity; read with that in mind."
                  >
                    🐣
                  </span>
                )}
                {savedFlash === p.playerId && (
                  <span className="ml-1 text-[10px] text-green-700">✓ saved</span>
                )}
              </span>
              <span className="flex gap-1">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl}
                    data-player={p.playerId}
                    data-level={lvl}
                    onClick={() => tap(p.playerId, lvl)}
                    className={`h-9 w-9 rounded border text-sm font-extrabold transition ${
                      val === lvl
                        ? "border-team-orange-dark bg-team-orange text-paper"
                        : "border-line bg-paper hover:bg-team-blue-light"
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
                <button
                  data-player={p.playerId}
                  data-level={0}
                  onClick={() => tap(p.playerId, 0)}
                  title="Not observed — honestly missing beats fabricated"
                  className={`h-9 rounded border px-2 text-xs font-extrabold transition ${
                    val === 0
                      ? "border-team-blue-dark bg-team-blue"
                      : "border-line bg-paper hover:bg-team-blue-light"
                  }`}
                >
                  N/O
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-neutral-500">
        Anchors describe what the player <b>does</b>, never how good he is.
        If two coaches land two or more levels apart, the split is flagged on
        the roster instead of being averaged away — that disagreement is
        information.
      </p>
    </div>
  );
}
