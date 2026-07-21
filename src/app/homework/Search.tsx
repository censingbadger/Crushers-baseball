"use client";

import { useMemo, useState } from "react";
import { BARS_BY_KEY } from "@/lib/bars";
import { searchCatalog } from "@/lib/homework";
import { assignDrillToTeam, assignHomework } from "./actions";

// Search the researched catalog by skill, gap, or goal — "wall ball",
// "focus", "throwing accuracy" — and assign a hit to one player or the
// whole team without hunting through the per-player cards.

export function HomeworkSearch({
  seasonId,
  players,
}: {
  seasonId: string;
  players: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchCatalog(q).slice(0, 8), [q]);
  return (
    <div className="card p-3" data-testid="hw-search">
      <label className="text-xs font-bold uppercase text-neutral-600" htmlFor="hw-q">
        Find a drill — search by skill, gap, or goal
      </label>
      <input
        id="hw-q"
        className="field mt-1"
        placeholder="e.g. wall ball, focus, throwing accuracy, bunt…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() !== "" && (
        <ul className="mt-2 space-y-1.5">
          {results.length === 0 && (
            <li className="text-sm text-neutral-500">
              Nothing in the catalog matches “{q}”.
            </li>
          )}
          {results.map((d) => (
            <li
              key={d.key}
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-paper px-2 py-1.5"
            >
              <span className="text-sm font-bold">
                {d.staple ? "★ " : ""}
                {d.title}
              </span>
              <span className="chip bg-team-blue-light">
                {BARS_BY_KEY[d.dimension].label}
              </span>
              <span className="text-xs font-semibold text-neutral-500">
                {d.minutes} min · {d.partner ? "partner" : "solo"}
              </span>
              <span className="w-full text-xs text-neutral-600 sm:w-auto sm:flex-1">
                {d.fixes}
              </span>
              <form action={assignHomework} className="flex items-center gap-1">
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="drillKey" value={d.key} />
                <select
                  name="playerId"
                  className="rounded border border-line px-1.5 py-1 text-xs"
                  defaultValue={players[0]?.id}
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="btn px-2 py-1 text-xs" type="submit">
                  Assign
                </button>
              </form>
              <form action={assignDrillToTeam}>
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="drillKey" value={d.key} />
                <button
                  className="btn px-2 py-1 text-xs"
                  type="submit"
                  title="Everyone it fits — role drills reach only role players"
                >
                  Whole team
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
