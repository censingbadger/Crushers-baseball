import Link from "next/link";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getRoster,
  getRsvpsForEvents,
  getSeasonEvents,
} from "@/lib/data";
import {
  eventHeadcount,
  getLatestStatGame,
  getLiveGame,
  getRaterCount,
  getRecentPitchDays,
  getUnratedPlayers,
  pickNextEvent,
  restingPitchers,
} from "@/lib/home";
import {
  EVENT_TYPE_LABEL,
  formatEventDate,
  formatEventTime,
  formatIsoDay,
} from "@/lib/format";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

interface Attention {
  text: string;
  href: string;
  label: string;
}

export default async function HomePage() {
  const user = await requireUser();
  const season = await getActiveSeason();
  if (!season) {
    return (
      <div className="card p-6">
        <h1 className="text-xl font-extrabold">Welcome, {user.displayName}.</h1>
        <p className="mt-2 text-sm">
          No active season yet.{" "}
          {user.role === "coach" ? (
            <>
              Run the seed script or head to <Link className="underline" href="/import">Import</Link> to
              bring in the team.
            </>
          ) : (
            "Check back once the coaches set up the season."
          )}
        </p>
      </div>
    );
  }

  const now = new Date();
  const [events, roster] = await Promise.all([
    getSeasonEvents(season.id),
    getRoster(season.id),
  ]);
  const next = pickNextEvent(events, now);
  const isCoach = user.role === "coach";
  // RSVP data only feeds the (parked) parent hero — skip it for coaches.
  const rsvps = next && !isCoach ? await getRsvpsForEvents([next.id]) : new Map();

  // Parents triage only their own kids; coaches triage the whole roster.
  const myPlayerIds = isCoach ? null : new Set(await editablePlayerIds(user));
  const myRoster = myPlayerIds
    ? roster.filter((p) => myPlayerIds.has(p.playerId))
    : roster;
  const counts = next
    ? eventHeadcount(isCoach ? roster : myRoster, rsvps.get(next.id))
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-extrabold">{season.name}</h1>
        <span className="rounded border border-line bg-team-blue px-2 py-0.5 text-xs font-bold uppercase">
          {season.ageGroup} · {season.term} {season.year}
        </span>
      </div>

      {/* ---- Hero: the one event that's next (or happening) ---- */}
      <section className="card overflow-hidden">
        {next ? (
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-line bg-team-blue-light px-2 py-0.5 text-xs font-bold uppercase">
                {EVENT_TYPE_LABEL[next.type]}
              </span>
              <span className="text-sm font-semibold text-neutral-600">
                {next.startsAt <= now ? "Happening now" : "Next up"}
              </span>
            </div>
            <p className="mt-2 text-xl font-extrabold leading-snug sm:text-2xl">
              {next.title || EVENT_TYPE_LABEL[next.type]}
              {next.opponent ? ` vs ${next.opponent}` : ""}
            </p>
            <p className="mt-1 text-sm font-semibold text-neutral-700">
              {formatEventDate(next.startsAt)} · {formatEventTime(next.startsAt, next.endsAt)}
              {next.location ? ` · ${next.location}` : ""}
            </p>
            {/* RSVP tallies are family-app territory — GameChanger carries
                attendance while parents aren't in here, so coaches don't
                see counts that would always read "no answer". */}
            {counts && myRoster.length > 0 && !isCoach && (
              <p className="mt-2 text-sm font-semibold">
                <span className="text-green-700">{counts.yes} in</span>
                {" · "}
                <span className="text-red-700">{counts.no} out</span>
                {counts.maybe > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600">{counts.maybe} maybe</span>
                  </>
                )}
                {counts.unanswered > 0 && (
                  <>
                    {" · "}
                    <span className="text-team-blue-dark">
                      {counts.unanswered} no answer
                    </span>
                  </>
                )}
                {!isCoach && myRoster.length > 0 && (
                  <span className="ml-1 font-normal text-neutral-600">
                    (your {myRoster.length === 1 ? "player" : "players"})
                  </span>
                )}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Game days lead to the dugout; everything else to the event. */}
              {isCoach && next.type !== "practice" && (
                <Link className="btn btn-primary px-4 py-1.5 text-sm" href="/games">
                  Open Game day
                </Link>
              )}
              <Link
                className={`btn px-4 py-1.5 text-sm ${isCoach && next.type !== "practice" ? "" : "btn-primary"}`}
                href={`/schedule/${next.id}`}
              >
                {isCoach ? "Event details" : "Details & RSVP"}
              </Link>
              {isCoach && next.type === "practice" && (
                <Link className="btn px-4 py-1.5 text-sm" href="/drills">
                  Drill library
                </Link>
              )}
              <Link className="btn px-4 py-1.5 text-sm" href="/schedule">
                Full schedule
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <p className="text-lg font-bold">Nothing on the calendar.</p>
            <p className="mt-1 text-sm text-neutral-700">
              {isCoach ? (
                <>
                  Add the next practice or game on the{" "}
                  <Link className="underline" href="/schedule/new">schedule</Link>.
                </>
              ) : (
                "Enjoy the day off — check back for the next event."
              )}
            </p>
          </div>
        )}
      </section>

      {isCoach ? <CoachPanels seasonId={season.id} roster={roster} events={events} now={now} /> : (
        <ParentPanels myRoster={myRoster} />
      )}
    </div>
  );
}

async function CoachPanels({
  seasonId,
  roster,
  events,
  now,
}: {
  seasonId: string;
  roster: Awaited<ReturnType<typeof getRoster>>;
  events: Awaited<ReturnType<typeof getSeasonEvents>>;
  now: Date;
}) {
  const today = isoDay(now);
  const [liveGame, pitchDays, unrated, latestStats, raterCount] =
    await Promise.all([
      getLiveGame(seasonId),
      getRecentPitchDays(seasonId, addDaysIso(today, -6)),
      getUnratedPlayers(seasonId, roster),
      getLatestStatGame(seasonId),
      getRaterCount(seasonId),
    ]);

  const nameOf = new Map(roster.map((p) => [p.playerId, `${p.firstName} ${p.lastName.charAt(0)}.`]));
  const resting = restingPitchers(pitchDays, today);

  const attention: Attention[] = [];
  if (liveGame) {
    attention.push({
      label: "Live",
      text: `${liveGame.label}${liveGame.opponent ? ` vs ${liveGame.opponent}` : ""} is in progress — back to the dugout.`,
      href: `/game/${liveGame.id}`,
    });
  }
  for (const r of resting) {
    attention.push({
      label: "Arm care",
      text: `${nameOf.get(r.playerId) ?? "A pitcher"} — ${r.eligibility.reason}; eligible ${formatIsoDay(r.eligibility.nextEligibleDay!)}.`,
      href: "/games",
    });
  }
  if (unrated.length > 0) {
    const names = unrated
      .slice(0, 2)
      .map((p) => `${p.firstName} ${p.lastName}`)
      .join(" and ");
    attention.push({
      label: "Matrix",
      text:
        unrated.length <= 2
          ? `${names} ${unrated.length === 1 ? "has" : "have"} no position ratings yet.`
          : `${unrated.length} players have no position ratings yet.`,
      href: "/matrix",
    });
  }
  const nextTournament = pickNextEvent(
    events.filter((e) => e.type === "tournament"),
    now,
  );

  const tiles = [
    {
      href: "/stats",
      title: "Stats",
      line: latestStats
        ? `Last: ${formatIsoDay(latestStats.gameDate)}${latestStats.opponent ? ` vs ${latestStats.opponent}` : ` · ${latestStats.label}`}`
        : "No games logged yet",
    },
    {
      href: "/matrix",
      title: "Position matrix",
      line: `${raterCount} ${raterCount === 1 ? "coach" : "coaches"} rating · ${unrated.length} unrated`,
    },
    {
      href: "/lineup",
      title: "Lineup lab",
      line: "Build a field from the current matrix",
    },
    {
      href: "/weekend",
      title: "Weekend",
      line: nextTournament
        ? `Next: ${formatEventDate(nextTournament.startsAt)}`
        : "No tournament on the calendar",
    },
  ];

  return (
    <>
      {attention.length > 0 && (
        <section className="card p-4">
          <h2 className="text-lg font-bold">Needs you</h2>
          <ul className="mt-2 divide-y divide-line">
            {attention.map((a) => (
              <li key={a.text}>
                <Link
                  href={a.href}
                  className="group flex items-start gap-2.5 py-2 text-sm"
                >
                  <span className="mt-0.5 shrink-0 rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-[11px] font-bold uppercase">
                    {a.label}
                  </span>
                  <span className="font-semibold underline-offset-2 group-hover:underline">
                    {a.text}
                  </span>
                  <span className="ml-auto shrink-0 text-neutral-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="card p-3.5 transition hover:shadow-pop">
            <p className="font-extrabold">{t.title}</p>
            <p className="mt-1 text-xs font-medium text-neutral-600">{t.line}</p>
          </Link>
        ))}
      </section>
    </>
  );
}

function ParentPanels({
  myRoster,
}: {
  myRoster: { playerId: string; firstName: string; lastName: string }[];
}) {
  return (
    <>
      {myRoster.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {myRoster.map((p) => (
            <Link
              key={p.playerId}
              href={`/players/${p.playerId}`}
              className="card p-3.5 transition hover:shadow-pop"
            >
              <p className="font-extrabold">{p.firstName}&apos;s page</p>
              <p className="mt-1 text-xs font-medium text-neutral-600">
                Avatar, cues & workouts
              </p>
            </Link>
          ))}
          <Link href="/progress" className="card p-3.5 transition hover:shadow-pop">
            <p className="font-extrabold">Progress</p>
            <p className="mt-1 text-xs font-medium text-neutral-600">
              Monthly reports & shared cues
            </p>
          </Link>
          <Link href="/stats" className="card p-3.5 transition hover:shadow-pop">
            <p className="font-extrabold">Stats</p>
            <p className="mt-1 text-xs font-medium text-neutral-600">
              Season batting & pitching
            </p>
          </Link>
        </section>
      )}
    </>
  );
}
