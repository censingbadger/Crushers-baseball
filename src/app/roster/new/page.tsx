import { requireCoach } from "@/lib/auth";
import { createPlayer } from "@/app/roster/actions";

export default async function NewPlayerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireCoach();
  const { error } = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-2xl font-extrabold">Add player</h1>
      {error && (
        <p className="mb-3 rounded border-2 border-ink bg-team-orange px-3 py-2 text-sm font-semibold text-paper">
          Check the fields — the player couldn't be saved.
        </p>
      )}
      <form action={createPlayer} className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="firstName">First name</label>
            <input className="field" id="firstName" name="firstName" required />
          </div>
          <div>
            <label className="label" htmlFor="lastName">Last name</label>
            <input className="field" id="lastName" name="lastName" required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="jerseyNumber">Jersey #</label>
            <input className="field" id="jerseyNumber" name="jerseyNumber" type="number" min={0} max={99} />
          </div>
          <div>
            <label className="label" htmlFor="birthdate">Birthdate</label>
            <input className="field" id="birthdate" name="birthdate" type="date" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="school">School</label>
          <input className="field" id="school" name="school" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="status">Roster status</label>
            <select className="field" id="status" name="status" defaultValue="full">
              <option value="full">Full-time</option>
              <option value="practice">Practice player</option>
              <option value="hopeful">Hopeful</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="positions">Positions</label>
            <input className="field" id="positions" name="positions" placeholder="e.g. P, SS, CF" />
          </div>
        </div>
        <button className="btn btn-primary w-full" type="submit">
          Add player
        </button>
      </form>
    </div>
  );
}
