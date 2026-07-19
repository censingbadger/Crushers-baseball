import { requireCoach } from "@/lib/auth";
import { createEvent } from "@/app/schedule/actions";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCoach();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-extrabold">New event</h1>
      {error && (
        <p className="mb-3 rounded border-2 border-ink bg-team-orange px-3 py-2 text-sm font-semibold text-paper">
          Check the fields — the event couldn't be saved.
        </p>
      )}
      <form action={createEvent} className="card space-y-3 p-4">
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select className="field" id="type" name="type" defaultValue="practice">
            <option value="practice">Practice</option>
            <option value="game">Game</option>
            <option value="tournament">Tournament</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="title">Title (optional)</label>
          <input className="field" id="title" name="title" placeholder="e.g. Firecracker Classic" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="date">Date</label>
            <input className="field" id="date" name="date" type="date" required />
          </div>
          <div>
            <label className="label" htmlFor="startTime">Start</label>
            <input className="field" id="startTime" name="startTime" type="time" required />
          </div>
          <div>
            <label className="label" htmlFor="endTime">End</label>
            <input className="field" id="endTime" name="endTime" type="time" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="location">Location</label>
          <input className="field" id="location" name="location" placeholder="e.g. White Cross" />
        </div>
        <div>
          <label className="label" htmlFor="opponent">Opponent (games)</label>
          <input className="field" id="opponent" name="opponent" />
        </div>
        <div>
          <label className="label" htmlFor="notes">Notes</label>
          <textarea className="field" id="notes" name="notes" rows={3} />
        </div>
        <button className="btn btn-primary w-full" type="submit">
          Save event
        </button>
      </form>
    </div>
  );
}
