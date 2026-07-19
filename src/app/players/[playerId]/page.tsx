import { notFound, redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import { barPct, effortSummary } from "@/lib/effort";
import {
  BG_CHOICES,
  BORDER_CHOICES,
  byId,
  DEFAULT_AVATAR,
  FONT_STACKS,
  parseAvatarConfig,
  WALLPAPERS,
} from "@/lib/playerpage";
import type { WorkoutDrill } from "@/lib/drills";
import { Avatar } from "@/components/Avatar";
import { formatIsoDay } from "@/lib/format";
import { WorkoutRunner } from "./WorkoutRunner";
import { CustomizePanel } from "./CustomizePanel";
import { logManualWorkout } from "@/app/players/actions";

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

function EffortBar({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
}) {
  const pct = barPct(value, target);
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="text-neutral-600" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value} / {target} {unit}
        </span>
      </div>
      <div className="h-4 overflow-hidden rounded-full border border-line-strong bg-paper">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 100 ? "bg-green-600" : "bg-team-orange"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const user = await requireUser();
  const { playerId } = await params;
  const allowed = new Set(await editablePlayerIds(user));
  if (!allowed.has(playerId)) redirect("/players");

  const season = await getActiveSeason();
  if (!season) return <p className="card p-6 text-sm">No active season yet.</p>;
  const roster = await getRoster(season.id);
  const me = roster.find((p) => p.playerId === playerId);
  if (!me) notFound();

  const db = await getDb();
  const rosterIds = roster.map((p) => p.playerId);
  const [pageRows, aspirationRows, cueRows, drillRows, logRows, teammatePages] =
    await Promise.all([
      db
        .select()
        .from(tables.playerPages)
        .where(eq(tables.playerPages.playerId, playerId))
        .limit(1),
      db
        .select()
        .from(tables.aspirations)
        .where(
          and(
            eq(tables.aspirations.seasonId, season.id),
            inArray(tables.aspirations.playerId, rosterIds),
          ),
        ),
      db
        .select()
        .from(tables.devNotes)
        .where(
          and(eq(tables.devNotes.playerId, playerId), eq(tables.devNotes.shared, true)),
        )
        .orderBy(asc(tables.devNotes.createdAt)),
      db.select().from(tables.drills).where(eq(tables.drills.active, true)),
      db
        .select()
        .from(tables.workoutLogs)
        .where(inArray(tables.workoutLogs.playerId, rosterIds))
        .orderBy(desc(tables.workoutLogs.day)),
      db.select().from(tables.playerPages).where(inArray(tables.playerPages.playerId, rosterIds)),
    ]);

  const page = pageRows[0];
  const avatarConfig = parseAvatarConfig(page?.avatarConfig);
  const bg = byId(BG_CHOICES, page?.bgColor) ?? BG_CHOICES[0];
  const border = byId(BORDER_CHOICES, page?.borderColor) ?? BORDER_CHOICES[0];
  const font = FONT_STACKS[page?.font ?? "sporty"];
  const wallpaper = byId(WALLPAPERS, page?.wallpaper) ?? WALLPAPERS[0];
  const darkBg = bg.id === "night";

  const myAspiration = aspirationRows.find((a) => a.playerId === playerId);
  const today = todayIso();
  const myLogs = logRows.filter((l) => l.playerId === playerId);
  const effort = effortSummary(
    myLogs.map((l) => ({ day: l.day, totalMinutes: l.totalMinutes })),
    today,
  );

  const workoutDrills: WorkoutDrill[] = drillRows.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    minutes: d.minutes,
    cue: d.cue,
  }));

  const pageByPlayer = new Map(teammatePages.map((p) => [p.playerId, p]));
  const teammates = roster
    .filter((p) => p.playerId !== playerId && p.status !== "hopeful")
    .sort((a, b) =>
      a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName),
    );

  return (
    <div className="space-y-5">
      {/* Hero — the kid's own corner, in their colors */}
      <section
        className="card overflow-hidden p-0"
        style={{ borderColor: border.css, borderWidth: 3 }}
      >
        <div
          className="flex flex-wrap items-center gap-4 p-5"
          style={{
            background: bg.css,
            backgroundImage: wallpaper.css ?? undefined,
            color: darkBg ? "#f4f9fd" : undefined,
            fontFamily: font.css,
          }}
        >
          <Avatar
            config={avatarConfig}
            photoDataUrl={page?.avatarKind === "photo" ? page?.photoDataUrl : null}
            size={110}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold" style={{ fontFamily: font.css }}>
              {me.firstName} {me.lastName}
              {me.jerseyNumber != null && (
                <span className="ml-2 opacity-80">#{me.jerseyNumber}</span>
              )}
            </h1>
            {myAspiration?.desiredPositions && (
              <p className="mt-1 text-sm font-bold uppercase tracking-wide opacity-80">
                Chasing: {myAspiration.desiredPositions}
              </p>
            )}
            {myAspiration?.seasonGoals && (
              <p className="mt-1 max-w-xl text-lg font-semibold">
                🎯 {myAspiration.seasonGoals}
              </p>
            )}
            {effort.streakWeeks > 1 && (
              <p className="mt-1 text-sm font-bold">
                🔥 {effort.streakWeeks}-week practice streak — keep it alive!
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Effort bars — driven entirely by what the kid does */}
      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">My effort</h2>
        <EffortBar
          label="This week"
          value={effort.weekSessions}
          target={effort.weekTarget}
          unit="sessions"
        />
        <EffortBar
          label="This month"
          value={effort.monthSessions}
          target={effort.monthTarget}
          unit="sessions"
        />
        <p className="text-xs text-neutral-600">
          Bars fill up from home practice sessions — every session counts,
          nobody else&apos;s bar is a race.
        </p>
      </section>

      {/* Guided workout */}
      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">⏱ I have free time!</h2>
        <WorkoutRunner
          playerId={playerId}
          firstName={me.firstName}
          drills={workoutDrills}
          desiredPositions={myAspiration?.desiredPositions ?? null}
          seed={dayOfYear()}
        />
      </section>

      {/* Swing thoughts / focus cues — shared by coaches, never critiques */}
      {cueRows.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg font-bold">💭 My focus cues</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {cueRows.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border-2 border-team-orange bg-paper px-3 py-2"
              >
                <span className="chip bg-team-blue-light">{n.category}</span>
                <p className="mt-1 text-base font-bold text-team-orange-dark">
                  {n.cue}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Straight from the coaches — the thoughts to hold onto during home
            practice.
          </p>
        </section>
      )}

      {/* Recent sessions + manual log */}
      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">My sessions</h2>
        {myLogs.length === 0 ? (
          <p className="text-sm text-neutral-600">
            None yet — tap a workout above and the first bar starts filling.
          </p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {myLogs.slice(0, 8).map((l) => {
              const segs = l.segments
                ? (JSON.parse(l.segments) as { title: string }[])
                : [];
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 py-1.5">
                  <span className="font-semibold">{formatIsoDay(l.day)}</span>
                  <span className="chip bg-team-blue-light">{l.totalMinutes} min</span>
                  <span className="text-neutral-600">
                    {segs.length > 0
                      ? segs.map((s) => s.title).join(" · ")
                      : (l.note ?? "practice session")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <form
          action={logManualWorkout}
          className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3"
        >
          <input type="hidden" name="playerId" value={playerId} />
          <div>
            <label className="label" htmlFor="minutes">
              Practiced on your own?
            </label>
            <input
              className="field w-28"
              id="minutes"
              name="minutes"
              inputMode="numeric"
              placeholder="Minutes"
              required
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="note">
              What did you work on?
            </label>
            <input className="field" id="note" name="note" placeholder="e.g. long toss with Dad" />
          </div>
          <button className="btn btn-blue text-sm" type="submit">
            Log it
          </button>
        </form>
      </section>

      {/* Teammates — goals and effort only, alphabetical, never ranked */}
      <section className="card p-4">
        <h2 className="mb-1 text-lg font-bold">My teammates</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Everyone&apos;s chasing something — cheer each other on. (Always
          alphabetical, never a ranking.)
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {teammates.map((p) => {
            const tPage = pageByPlayer.get(p.playerId);
            const tAsp = aspirationRows.find((a) => a.playerId === p.playerId);
            const tLogs = logRows.filter((l) => l.playerId === p.playerId);
            const tEffort = effortSummary(
              tLogs.map((l) => ({ day: l.day, totalMinutes: l.totalMinutes })),
              today,
            );
            const pct = barPct(tEffort.weekSessions, tEffort.weekTarget);
            return (
              <div
                key={p.playerId}
                className="flex items-center gap-3 rounded-xl border border-line bg-paper-tint px-3 py-2"
              >
                <Avatar
                  config={parseAvatarConfig(tPage?.avatarConfig)}
                  photoDataUrl={tPage?.avatarKind === "photo" ? tPage?.photoDataUrl : null}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{p.firstName}</p>
                  <p className="truncate text-xs text-neutral-600">
                    {tAsp?.seasonGoals ?? "Setting a goal soon"}
                  </p>
                  <div className="mt-1 h-2 overflow-hidden rounded-full border border-line bg-paper">
                    <div
                      className={`h-full ${pct >= 100 ? "bg-green-600" : "bg-team-orange"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CustomizePanel
        playerId={playerId}
        initialAvatar={page ? parseAvatarConfig(page.avatarConfig) : DEFAULT_AVATAR}
        initialBg={bg.id}
        initialBorder={border.id}
        initialFont={page?.font ?? "sporty"}
        initialWallpaper={wallpaper.id}
        hasPhoto={Boolean(page?.photoDataUrl)}
      />
    </div>
  );
}
