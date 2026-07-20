import Link from "next/link";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  blendedLookup,
  getCurrentRatings,
  listRaters,
  ratingLookup,
} from "@/lib/matrix";
import { POSITIONS } from "@/db/schema";
import { ImportForm } from "@/app/import/ImportForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { clearMatrixRow, importMatrixXlsx, saveMatrixRow } from "./actions";

function ratingBg(v: number | undefined): string {
  if (v === undefined) return "";
  if (v >= 8) return "bg-team-orange text-paper font-bold";
  if (v >= 6) return "bg-team-blue font-semibold";
  if (v >= 4) return "bg-team-blue-light";
  return "text-neutral-500";
}

export default async function MatrixPage({
  searchParams,
}: {
  searchParams: Promise<{ rater?: string }>;
}) {
  await requireCoach();
  const season = await getActiveSeason();
  if (!season) {
    return <p className="card p-6 text-sm">No active season yet.</p>;
  }
  const [roster, ratings] = await Promise.all([
    getRoster(season.id),
    getCurrentRatings(season.id),
  ]);
  const raters = listRaters(ratings);
  const byRater = ratingLookup(ratings);
  const blended = blendedLookup(ratings);
  const { rater: raterParam } = await searchParams;
  const activeTab =
    raterParam && (raters.includes(raterParam) || raterParam === "new")
      ? raterParam
      : "blended";
  const editable = activeTab !== "blended";
  const activeRater = activeTab === "new" ? "" : activeTab;
  const lineupPlayers = roster.filter((p) => p.status !== "practice");
  const practicePlayers = roster.filter((p) => p.status === "practice");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Position matrix</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Ratings are 1–10 per position, kept per coach with full history.
          The blended view averages every coach's current rating. Practice
          players are rated too but sit apart — they don't enter lineups.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 text-sm font-semibold">
        <Link
          className={`rounded border border-line px-3 py-1 ${activeTab === "blended" ? "bg-ink text-paper" : "bg-paper hover:bg-team-blue-light"}`}
          href="/matrix"
        >
          Blended
        </Link>
        {raters.map((r) => (
          <Link
            key={r}
            className={`rounded border border-line px-3 py-1 ${activeTab === r ? "bg-team-orange text-paper" : "bg-paper hover:bg-team-blue-light"}`}
            href={`/matrix?rater=${encodeURIComponent(r)}`}
          >
            ✎ Coach {r}
          </Link>
        ))}
        <Link
          className={`rounded border border-line px-3 py-1 ${activeTab === "new" ? "bg-team-orange text-paper" : "bg-paper hover:bg-team-blue-light"}`}
          href="/matrix?rater=new"
        >
          + New coach
        </Link>
      </div>

      {activeTab === "blended" && raters.length > 0 && (
        <p className="text-sm text-neutral-700">
          Blended is read-only — it averages each coach&apos;s current
          numbers. To change a rating, open a ✎ coach tab, type in any
          cell, and save that row.
        </p>
      )}

      <section className="card overflow-x-auto p-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-1 pr-2 text-left">Player</th>
              {POSITIONS.map((pos) => (
                <th key={pos} className="border border-line px-2 py-1 text-center">
                  {pos}
                </th>
              ))}
              {editable && <th className="sticky right-0 bg-paper px-2 py-1" />}
            </tr>
          </thead>
          <tbody>
            {[...lineupPlayers, ...practicePlayers].map((p, i) => {
              const values = editable
                ? byRater.get(activeRater)?.get(p.playerId)
                : blended.get(p.playerId);
              const firstPractice =
                practicePlayers.length > 0 && i === lineupPlayers.length;
              const row = (
                <tr
                  key={p.playerId}
                  className={firstPractice ? "border-t-4 border-line-strong" : ""}
                >
                  <td className="whitespace-nowrap py-1.5 pr-2 font-semibold">
                    {p.firstName} {p.lastName}
                    {p.status !== "full" && (
                      <span className="ml-1 rounded border border-line bg-team-blue-light px-1 py-0.5 text-[11px] font-bold uppercase">
                        {p.status}
                      </span>
                    )}
                  </td>
                  {POSITIONS.map((pos) => {
                    const v = values?.get(pos);
                    return (
                      // Value in the key: uncontrolled inputs only re-read
                      // defaultValue on remount, e.g. after a row is cleared.
                      <td key={`${pos}:${v ?? ""}`} className="border border-line p-0 text-center">
                        {editable ? (
                          <input
                            name={`pos_${pos}`}
                            defaultValue={v ?? ""}
                            inputMode="numeric"
                            className="w-full min-w-10 border-0 bg-transparent px-1 py-1.5 text-center outline-team-orange"
                            form={`row-${p.playerId}`}
                          />
                        ) : (
                          <span className={`block px-1 py-1.5 ${ratingBg(v)}`}>
                            {v ?? "·"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  {editable && (
                    <td className="sticky right-0 bg-paper p-1">
                      <form id={`row-${p.playerId}`} action={saveMatrixRow}>
                        <input type="hidden" name="playerId" value={p.playerId} />
                        <input
                          type={activeTab === "new" ? "text" : "hidden"}
                          name="rater"
                          defaultValue={activeRater}
                          placeholder="initials"
                          className={activeTab === "new" ? "field mb-1 w-20 text-xs" : ""}
                          required
                        />
                        <div className="flex items-center gap-1">
                          <button className="btn px-2.5 py-1 text-xs" type="submit">
                            Save
                          </button>
                          {activeTab !== "new" && (
                            <ConfirmButton
                              formAction={clearMatrixRow}
                              message={`Delete ALL of coach ${activeRater}'s numbers for ${p.firstName} ${p.lastName}? The row goes blank until they're rated again.`}
                              className="btn px-2 py-1 text-xs text-red-700"
                            >
                              Clear
                            </ConfirmButton>
                          )}
                        </div>
                      </form>
                    </td>
                  )}
                </tr>
              );
              return row;
            })}
          </tbody>
        </table>
        {activeTab === "new" && (
          <p className="mt-2 text-xs text-neutral-600">
            Enter your initials in a row's small box and save — the new coach
            tab appears after the first rating.
          </p>
        )}
      </section>

      <ImportForm
        title="Import the matrix workbook (.xlsx)"
        description="One sheet per coach (e.g. 'Position Matrix_MC' → coach MC), rows of player names against p/c/1b/2b/ss/3b/lf/cf/rf. Rows that don't match the roster are reported, not imported — so departed players in old files are skipped automatically."
        action={importMatrixXlsx}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      />
    </div>
  );
}
