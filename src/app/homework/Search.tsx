"use client";

import { useMemo, useState } from "react";
import { BARS_BY_KEY } from "@/lib/bars";
import { HOMEWORK_CATALOG, searchCatalog, type HomeworkDrill } from "@/lib/homework";
import { DrillDetail } from "@/components/DrillDetail";
import { assignDrillToTeam, assignHomework } from "./actions";

// Find & browse the researched catalog. Type a skill, gap, or goal
// ("wall ball", "focus", "throwing accuracy") — or leave it blank to see
// every drill. Each hit opens to its full details (you don't have to know
// the drill by name), then assigns to one player or the whole team.

export function HomeworkSearch({
  seasonId,
  players,
}: {
  seasonId: string;
  players: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const trimmed = q.trim();
  // Blank box = browse everything; otherwise the ranked matches.
  const results = useMemo(
    () => (trimmed === "" ? [...HOMEWORK_CATALOG] : searchCatalog(q).slice(0, 12)),
    [q, trimmed],
  );

  return (
    <div className="card p-3" data-testid="hw-search">
      <label className="text-xs font-bold uppercase text-neutral-600" htmlFor="hw-q">
        Find a drill — search by skill, gap, or goal
      </label>
      <input
        id="hw-q"
        className="field mt-1"
        placeholder="e.g. wall ball, focus, throwing accuracy, bunt… (blank = show all)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <ul className="mt-2 space-y-1">
        {results.length === 0 && (
          <li className="text-sm text-neutral-500">
            Nothing in the catalog matches “{q}”.
          </li>
        )}
        {results.map((d) => (
          <DrillResult key={d.key} drill={d} seasonId={seasonId} players={players} />
        ))}
      </ul>
    </div>
  );
}

function DrillResult({
  drill,
  seasonId,
  players,
}: {
  drill: HomeworkDrill;
  seasonId: string;
  players: { id: string; name: string }[];
}) {
  return (
    <li className="rounded-lg border border-line bg-paper p-2" data-search-drill={drill.title}>
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-1.5">
          <span className="text-sm font-bold">
            {drill.staple ? "★ " : ""}
            {drill.title}
          </span>
          <span className="chip bg-team-blue-light">{BARS_BY_KEY[drill.dimension].label}</span>
          <span className="text-xs font-semibold text-neutral-500">
            {drill.minutes} min · {drill.partner ? "partner" : "solo"}
          </span>
        </summary>
        <DrillDetail drill={drill} compact>
          <div className="flex flex-wrap items-center gap-1.5">
            <form action={assignHomework} className="flex items-center gap-1">
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="drillKey" value={drill.key} />
              <select
                name="playerId"
                className="rounded border border-line px-1.5 py-1 text-xs"
                defaultValue={players[0]?.id}
                aria-label="Assign to player"
              >
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn btn-primary px-3 py-1.5 text-xs" type="submit">
                ＋ Assign
              </button>
            </form>
            <form action={assignDrillToTeam}>
              <input type="hidden" name="seasonId" value={seasonId} />
              <input type="hidden" name="drillKey" value={drill.key} />
              <button
                className="btn px-3 py-1.5 text-xs"
                type="submit"
                title="Everyone it fits — role drills reach only role players"
              >
                Whole team
              </button>
            </form>
          </div>
        </DrillDetail>
      </details>
    </li>
  );
}
