import { notFound } from "next/navigation";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import {
  getActiveSeason,
  getEvent,
  getRoster,
  getRsvpsForEvents,
  getSignupsForEvent,
  headcount,
} from "@/lib/data";
import {
  EVENT_TYPE_LABEL,
  formatEventDate,
  formatEventTime,
  RSVP_LABEL,
} from "@/lib/format";
import { addSignup, removeSignup, setRsvp } from "@/app/schedule/actions";

const RSVP_STYLES: Record<string, string> = {
  yes: "bg-green-600 text-white",
  no: "bg-red-600 text-white",
  maybe: "bg-amber-400",
};

const SIGNUP_LABEL: Record<string, string> = {
  helper: "Practice helper (bring a glove)",
  snacks: "Snacks",
  drinks: "Drinks",
};

export default async function EventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const user = await requireUser();
  const { eventId } = await params;
  const event = await getEvent(eventId);
  if (!event) notFound();
  const season = await getActiveSeason();
  const roster = season ? await getRoster(season.id) : [];
  const rsvpsByEvent = await getRsvpsForEvents([event.id]);
  const rsvps = rsvpsByEvent.get(event.id) ?? new Map();
  const counts = headcount(rsvps);
  const editable = new Set(await editablePlayerIds(user));
  const signups = await getSignupsForEvent(event.id);
  const isPractice = event.type === "practice";
  const signupKinds = isPractice ? ["helper"] : ["snacks", "drinks"];

  return (
    <div className="space-y-6">
      <div>
        <span className="rounded border border-line bg-team-blue px-2 py-0.5 text-xs font-bold uppercase">
          {EVENT_TYPE_LABEL[event.type]}
        </span>
        <h1 className="mt-2 text-2xl font-extrabold">
          {event.title ?? EVENT_TYPE_LABEL[event.type]}
        </h1>
        <p className="text-sm text-neutral-700">
          {formatEventDate(event.startsAt)} · {formatEventTime(event.startsAt, event.endsAt)}
          {event.location ? ` · ${event.location}` : ""}
          {event.opponent ? ` · vs ${event.opponent}` : ""}
        </p>
        {event.notes && <p className="mt-2 text-sm">{event.notes}</p>}
        <p className="mt-2 text-sm font-semibold">
          <span className="text-green-700">{counts.yes} in</span>
          {" · "}
          <span className="text-red-700">{counts.no} out</span>
          {" · "}
          <span className="text-amber-600">{counts.maybe} maybe</span>
          {" · "}
          <span className="text-neutral-500">
            {roster.length - counts.yes - counts.no - counts.maybe} no answer
          </span>
        </p>
      </div>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-lg font-bold">Who's in</h2>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th className="py-1 pr-2">Player</th>
              <th className="py-1 pr-2">Answer</th>
              <th className="py-1">Update</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const status = rsvps.get(p.playerId);
              const canEdit = editable.has(p.playerId);
              return (
                <tr key={p.playerId} className="border-b border-line">
                  <td className="py-1.5 pr-2 font-semibold">
                    {p.firstName} {p.lastName}
                    {p.status !== "full" && (
                      <span className="ml-1 text-[10px] font-bold uppercase text-neutral-500">
                        {p.status === "practice" ? "practice player" : "hopeful"}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2">
                    {status ? (
                      <span
                        className={`rounded border border-line px-1.5 py-0.5 text-xs font-bold ${RSVP_STYLES[status]}`}
                      >
                        {RSVP_LABEL[status]}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-400">—</span>
                    )}
                  </td>
                  <td className="py-1.5">
                    {canEdit && (
                      <div className="flex gap-1">
                        {(["yes", "maybe", "no"] as const).map((s) => (
                          <form key={s} action={setRsvp}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="playerId" value={p.playerId} />
                            <input type="hidden" name="status" value={s} />
                            <button
                              type="submit"
                              className={`rounded border border-line px-2 py-0.5 text-xs font-semibold hover:bg-team-blue-light ${
                                status === s ? RSVP_STYLES[s] : "bg-paper"
                              }`}
                            >
                              {RSVP_LABEL[s]}
                            </button>
                          </form>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-lg font-bold">Signups</h2>
        {signups.length > 0 && (
          <ul className="mb-3 space-y-1 text-sm">
            {signups.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="rounded border border-line bg-team-blue-light px-1.5 py-0.5 text-xs font-bold">
                  {SIGNUP_LABEL[s.kind] ?? s.kind}
                </span>
                <span className="font-semibold">{s.guardianName}</span>
                {s.note && <span className="text-neutral-600">({s.note})</span>}
                {(user.role === "coach" || s.createdByUserId === user.id) && (
                  <form action={removeSignup}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="text-xs text-red-700 underline" type="submit">
                      remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        <form action={addSignup} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="eventId" value={event.id} />
          <div>
            <label className="label" htmlFor="kind">I can bring / help with</label>
            <select className="field" id="kind" name="kind" defaultValue={signupKinds[0]}>
              {signupKinds.map((k) => (
                <option key={k} value={k}>
                  {SIGNUP_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="guardianName">Name</label>
            <input
              className="field"
              id="guardianName"
              name="guardianName"
              defaultValue={user.displayName}
              required
            />
          </div>
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="note">Note (optional)</label>
            <input className="field" id="note" name="note" />
          </div>
          <button className="btn btn-blue" type="submit">
            Sign up
          </button>
        </form>
      </section>
    </div>
  );
}
