import { asc } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { addDrill, loadStarterDrills, toggleDrill } from "./actions";

const CATEGORIES = ["hitting", "fielding", "throwing", "pitching", "speed", "fun"] as const;

export default async function DrillsPage() {
  await requireCoach();
  const db = await getDb();
  const drills = await db
    .select()
    .from(tables.drills)
    .orderBy(asc(tables.drills.category), asc(tables.drills.title));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Drill library</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          The menu the guided workouts draw from. Each drill carries one cue —
          the thought a kid holds while doing it. Inactive drills stay here
          but never appear in workouts.
        </p>
      </div>

      {drills.length === 0 && (
        <form action={loadStarterDrills} className="card flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-semibold">
            Empty library — load the curated starter set (8 drills) and edit
            from there.
          </p>
          <button className="btn btn-primary" type="submit">
            Load starter drills
          </button>
        </form>
      )}

      {drills.length > 0 && (
        <section className="card divide-y divide-line p-4">
          {drills.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="chip bg-team-blue-light">{d.category}</span>
              <span className={`font-bold ${d.active ? "" : "line-through opacity-50"}`}>
                {d.title}
              </span>
              <span className="text-xs text-neutral-500">{d.minutes} min</span>
              <span className="min-w-0 flex-1 basis-52 truncate text-sm text-team-orange-dark">
                💭 {d.cue}
              </span>
              <form action={toggleDrill}>
                <input type="hidden" name="id" value={d.id} />
                <button className="btn px-2 py-0.5 text-xs" type="submit">
                  {d.active ? "Deactivate" : "Reactivate"}
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      <form action={addDrill} className="card grid gap-3 p-4 sm:grid-cols-2">
        <h2 className="text-lg font-bold sm:col-span-2">Add a drill</h2>
        <div>
          <label className="label" htmlFor="title">Title</label>
          <input className="field" id="title" name="title" required />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select className="field" id="category" name="category">
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="minutes">Default minutes</label>
          <input className="field" id="minutes" name="minutes" inputMode="numeric" defaultValue={10} required />
        </div>
        <div>
          <label className="label" htmlFor="cue">Cue (the one thought)</label>
          <input className="field" id="cue" name="cue" placeholder="e.g. Quick glove to the dirt" required />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">How it works</label>
          <textarea className="field" id="description" name="description" rows={2} />
        </div>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" type="submit">Add drill</button>
        </div>
      </form>
    </div>
  );
}
