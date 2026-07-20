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

interface Need {
  href: string;
  title: string;
  desc: string;
  line: string;
  live?: boolean;
  action?: { href: string; label: string };
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

  const header = (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h1 className="text-2xl font-extrabold">{season.name}</h1>
      <span className="rounded border border-line bg-team-blue px-2 py-0.5 text-xs font-bold uppercase">
        {season.ageGroup} · {season.term} {season.year}
      </span>
    </div>
  );

  // Coaches land on the four needs — no schedule hero, no parked pages.
  if (user.role === "coach") {
    return (
      <div className="space-y-6">
        {header}
        <CoachHome seasonId={season.id} />
      </div>
    );
  }

  // Parents keep the event hero — their whole area sits behind the
  // Future preview banner until family logins go out.
  const now = new Date();
  const [events, roster] = await Promise.all([
    getSeasonEvents(season.id),
    getRoster(season.id),
  ]);
  const next = pickNextEvent(events, now);
  const rsvps = next ? await getRsvpsForEvents([next.id]) : new Map();
  const myPlayerIds = new Set(await editablePlayerIds(user));
  const myRoster = roster.filter((p) => myPlayerIds.has(p.playerId));
  const counts = next ? eventHeadcount(myRoster, rsvps.get(next.id)) : null;

  return (
    <div className="space-y-6">
      {header}
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
            {counts && myRoster.length > 0 && (
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
                <span className="ml-1 font-normal text-neutral-600">
                  (your {myRoster.length === 1 ? "player" : "players"})
                </span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="btn btn-primary px-4 py-1.5 text-sm" href={`/schedule/${next.id}`}>
                Details & RSVP
              </Link>
              <Link className="btn px-4 py-1.5 text-sm" href="/schedule">
                Full schedule
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <p className="text-lg font-bold">Nothing on the calendar.</p>
            <p className="mt-1 text-sm text-neutral-700">
              Enjoy the day off — check back for the next event.
            </p>
          </div>
        )}
      </section>
      <ParentPanels myRoster={myRoster} />
    </div>
  );
}

async function CoachHome({ seasonId }: { seasonId: string }) {
  const now = new Date();
  const today = isoDay(now);
  const roster = await getRoster(seasonId);
  const [liveGame, pitchDays, unrated, latestStats, raterCount] =
    await Promise.all([
      getLiveGame(seasonId),
      getRecentPitchDays(seasonId, addDaysIso(today, -6)),
      getUnratedPlayers(seasonId, roster),
      getLatestStatGame(seasonId),
      getRaterCount(seasonId),
    ]);

  // The four needs — the whole coach workflow, one tap each.
  const needs: Need[] = [
    {
      href: liveGame ? `/game/${liveGame.id}` : "/games",
      title: "Game day",
      desc: "Set the lineup, run the dugout",
      line: liveGame
        ? `${liveGame.label}${liveGame.opponent ? ` vs ${liveGame.opponent}` : ""} is open — jump back in`
        : "⚡ Auto-arrange · ▦ Dugout board · pitch counts",
      live: Boolean(liveGame),
    },
    {
      href: "/matrix",
      title: "Position matrix",
      desc: "Who can play where, 1–10",
      line: `${raterCount} ${raterCount === 1 ? "coach" : "coaches"} rating · ${unrated.length} unrated`,
      action: { href: "/matrix/quick", label: "✎ Quick entry" },
    },
    {
      href: "/roster",
      title: "Roster",
      desc: "Every player in one click",
      line: "Blended ratings · GameChanger line · feedback",
      action: { href: "/rate", label: "★ Log feedback" },
    },
    {
      href: "/stats",
      title: "Stats",
      desc: "GameChanger uploads & season view",
      line: latestStats
        ? `Last game: ${formatIsoDay(latestStats.gameDate)}${latestStats.opponent ? ` vs ${latestStats.opponent}` : ""}`
        : "Drop the four GameChanger exports",
    },
  ];

  const nameOf = new Map(roster.map((p) => [p.playerId, `${p.firstName} ${p.lastName.charAt(0)}.`]));
  const resting = restingPitchers(pitchDays, today);

  const attention: Attention[] = [];
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

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2">
        {needs.map((n) => (
          <div
            key={n.title}
            className={`card relative p-4 transition hover:shadow-pop sm:p-5 ${n.title === "Game day" ? "bg-team-blue-light" : ""}`}
          >
            <Link href={n.href} className="absolute inset-0" aria-label={n.title} />
            <div className="flex items-center gap-2">
              <p className="text-lg font-extrabold sm:text-xl">{n.title}</p>
              {n.live && (
                <span className="rounded border border-line bg-team-orange px-1.5 py-0.5 text-[11px] font-bold uppercase">
                  Live
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm font-semibold text-neutral-700">{n.desc}</p>
            <p className="mt-2 text-xs font-medium text-neutral-600">{n.line}</p>
            {n.action && (
              <Link
                href={n.action.href}
                className="btn relative z-10 mt-3 inline-block px-3 py-1 text-xs"
              >
                {n.action.label}
              </Link>
            )}
          </div>
        ))}
      </section>

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
