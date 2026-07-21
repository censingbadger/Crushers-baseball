"use client";

import { useState, useTransition } from "react";
import { POSITIONS } from "@/db/schema";
import { nextRole } from "@/lib/depth";
import { savePositionRole } from "@/app/depth/actions";

interface Player {
  playerId: string;
  name: string;
}

type Role = "primary" | "secondary" | "develop" | "emergency" | "never";

const ROLE_STYLE: Record<Role, string> = {
  primary: "border-team-orange-dark bg-team-orange text-paper",
  secondary: "border-team-blue-dark bg-team-blue",
  develop: "border-line bg-team-blue-light",
  emergency: "border-dashed border-line bg-paper text-neutral-500",
  never: "border-red-300 bg-red-100 text-red-700",
};

const ROLE_LETTER: Record<Role, string> = {
  primary: "P",
  secondary: "S",
  develop: "D",
  emergency: "E",
  never: "N",
};

export function DepthGrid({
  players,
  initialRoles,
  abilities,
  aspiring,
}: {
  players: Player[];
  initialRoles: Record<string, Record<string, string>>;
  abilities: Record<string, Record<string, number>>;
  aspiring: Record<string, string[]>;
}) {
  const [roles, setRoles] = useState(initialRoles);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  if (players.length === 0) {
    return <p className="card p-6 text-sm">No players on the roster yet.</p>;
  }

  function tap(playerId: string, position: string) {
    const cur = (roles[playerId]?.[position] ?? null) as Role | null;
    const next = nextRole(cur);
    setRoles((r) => {
      const row = { ...(r[playerId] ?? {}) };
      if (next === null) delete row[position];
      else row[position] = next;
      return { ...r, [playerId]: row };
    });
    const key = `${playerId}-${position}`;
    setSavedFlash(key);
    window.setTimeout(() => setSavedFlash((k) => (k === key ? null : k)), 900);
    startTransition(async () => {
      await savePositionRole(playerId, position, next);
    });
  }

  return (
    <div className="card overflow-x-auto p-2">
      <table className="w-full min-w-[560px] border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="sticky left-0 bg-paper px-1 text-left text-xs font-extrabold">
              Player
            </th>
            {POSITIONS.map((pos) => (
              <th key={pos} className="text-center text-xs font-extrabold">
                {pos}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.playerId}>
              <td className="sticky left-0 z-10 bg-paper px-1 text-sm font-bold whitespace-nowrap">
                {p.name}
              </td>
              {POSITIONS.map((pos) => {
                const role = (roles[p.playerId]?.[pos] ?? null) as Role | null;
                const ability = abilities[p.playerId]?.[pos];
                const wants = (aspiring[p.playerId] ?? []).includes(pos);
                const key = `${p.playerId}-${pos}`;
                return (
                  <td key={pos} className="text-center">
                    <button
                      data-cell={key}
                      onClick={() => tap(p.playerId, pos)}
                      title={`${p.name} at ${pos}${role ? ` — ${role}` : ""}${wants ? " · wants this spot" : ""}`}
                      className={`relative h-10 w-full min-w-10 rounded border text-sm font-extrabold transition ${
                        role ? ROLE_STYLE[role] : "border-line bg-paper text-neutral-300 hover:bg-team-blue-light"
                      }`}
                    >
                      {role ? ROLE_LETTER[role] : "·"}
                      {savedFlash === key && (
                        <span className="absolute right-0.5 top-0 text-[9px] text-green-700">✓</span>
                      )}
                      {wants && (
                        <span className="absolute left-0.5 top-0 text-[9px]">★</span>
                      )}
                      {ability !== undefined && (
                        <span className="absolute bottom-0 right-0.5 text-[11px] font-bold">
                          {Math.round(ability)}
                        </span>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
