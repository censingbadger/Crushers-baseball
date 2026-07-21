import Link from "next/link";
import { inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { barPct, effortSummary, WEEK_TARGET } from "@/lib/effort";
import { parseAvatarConfig } from "@/lib/playerpage";
import { Avatar } from "@/components/Avatar";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PlayersPage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) return <p className="card p-6 text-sm">No active season yet.</p>;
  const roster = (await getRoster(season.id)).filter((p) => p.status !== "hopeful");
  const mine = new Set(await editablePlayerIds(user));

  const db = await getDb();
  const ids = roster.map((p) => p.playerId);
  const [pages, aspirations, logs] = await Promise.all([
    ids.length
      ? db.select().from(tables.playerPages).where(inArray(tables.playerPages.playerId, ids))
      : [],
    ids.length
      ? db.select().from(tables.aspirations).where(inArray(tables.aspirations.playerId, ids))
      : [],
    ids.length
      ? db.select().from(tables.workoutLogs).where(inArray(tables.workoutLogs.playerId, ids))
      : [],
  ]);
  const pageByPlayer = new Map(pages.map((p) => [p.playerId, p]));
  const today = todayIso();

  const sorted = [...roster].sort((a, b) => {
    const aMine = mine.has(a.playerId) ? 0 : 1;
    const bMine = mine.has(b.playerId) ? 0 : 1;
    return (
      aMine - bMine ||
      a.firstName.localeCompare(b.firstName) ||
      a.lastName.localeCompare(b.lastName)
    );
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Player pages</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          {user.role === "coach"
            ? "Every player's own corner — goals, effort bars, and guided workouts. Open any page."
            : "Your player's own corner of the team — goals, effort bars, guided workouts, and their look. Teammates' goals show for cheering, not comparing."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sorted.map((p) => {
          const page = pageByPlayer.get(p.playerId);
          const asp = aspirations.find((a) => a.playerId === p.playerId);
          const pLogs = logs.filter((l) => l.playerId === p.playerId);
          const effort = effortSummary(
            pLogs.map((l) => ({ day: l.day, totalMinutes: l.totalMinutes })),
            today,
          );
          const pct = barPct(effort.weekSessions, WEEK_TARGET);
          const canOpen = mine.has(p.playerId);
          const inner = (
            <div className="flex items-center gap-3">
              <Avatar
                config={parseAvatarConfig(page?.avatarConfig)}
                photoDataUrl={page?.avatarKind === "photo" ? page?.photoDataUrl : null}
                size={56}
              />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold">
                  {p.firstName} {p.lastName}
                  {p.jerseyNumber != null && (
                    <span className="ml-1.5 text-team-blue-dark">#{p.jerseyNumber}</span>
                  )}
                  {canOpen && (
                    <span className="chip ml-2 bg-team-orange text-ink">
                      {user.role === "coach" ? "open" : "yours"}
                    </span>
                  )}
                </p>
                <p className="truncate text-sm text-neutral-600">
                  {asp?.seasonGoals ?? "Setting a goal soon"}
                </p>
                <div className="mt-1.5 h-2.5 overflow-hidden rounded-full border border-line bg-paper">
                  <div
                    className={`h-full ${pct >= 100 ? "bg-green-600" : "bg-team-orange"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
          return canOpen ? (
            <Link
              key={p.playerId}
              href={`/players/${p.playerId}`}
              className="card p-3 transition-shadow hover:shadow-lg"
            >
              {inner}
            </Link>
          ) : (
            <div key={p.playerId} className="card p-3 opacity-90">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
