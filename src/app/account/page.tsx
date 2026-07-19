import { inArray } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { editablePlayerIds, requireUser } from "@/lib/auth";
import { changeOwnEmail, changeOwnPassword, updateOwnPlayer } from "./actions";

const MESSAGES: Record<string, { ok: boolean; text: string }> = {
  "saved:password": { ok: true, text: "Password updated." },
  "saved:email": { ok: true, text: "Email updated — use it next time you sign in." },
  "saved:player": { ok: true, text: "Player details saved." },
  "error:password": { ok: false, text: "New passwords must match and be 8+ characters." },
  "error:current": { ok: false, text: "Your current password didn't match." },
  "error:email": { ok: false, text: "That email is invalid or already in use." },
  "error:player": { ok: false, text: "First and last name are required." },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireUser();
  const { saved, error } = await searchParams;
  const message = saved
    ? MESSAGES[`saved:${saved}`]
    : error
      ? MESSAGES[`error:${error}`]
      : null;

  const db = await getDb();
  const ids = await editablePlayerIds(user);
  // Coaches manage players from the roster; this page keeps the family
  // scope tight — their own kids only.
  const myPlayers =
    user.role === "parent" && ids.length
      ? await db
          .select()
          .from(tables.players)
          .where(inArray(tables.players.id, ids))
      : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">My account</h1>
        <p className="mt-1 text-sm text-neutral-700">
          Signed in as <span className="font-semibold">{user.displayName}</span>{" "}
          ({user.email}) — {user.role}.
        </p>
        {message && (
          <p
            className={`mt-2 max-w-md rounded border border-line px-3 py-1.5 text-sm font-semibold ${
              message.ok ? "bg-green-600 text-white" : "bg-red-100 text-red-800"
            }`}
          >
            {message.text}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={changeOwnPassword} className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Change password</h2>
          <div>
            <label className="label" htmlFor="current">Current password</label>
            <input className="field" id="current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <div>
            <label className="label" htmlFor="next">New password (8+ characters)</label>
            <input className="field" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <label className="label" htmlFor="confirm">New password again</label>
            <input className="field" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <button className="btn btn-primary" type="submit">Update password</button>
        </form>

        <form action={changeOwnEmail} className="card space-y-3 p-4">
          <h2 className="text-lg font-bold">Change email</h2>
          <p className="text-xs text-neutral-600">
            This is the address you sign in with.
          </p>
          <div>
            <label className="label" htmlFor="email">New email</label>
            <input className="field" id="email" name="email" type="email" defaultValue={user.email} required />
          </div>
          <div>
            <label className="label" htmlFor="email-current">Current password</label>
            <input className="field" id="email-current" name="current" type="password" autoComplete="current-password" required />
          </div>
          <button className="btn btn-primary" type="submit">Update email</button>
        </form>
      </div>

      {myPlayers.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-bold">My players</h2>
          <p className="-mt-3 text-xs text-neutral-600">
            Keep your player&apos;s details current — you&apos;re the source of
            truth for name, birthday, and the emergency &amp; medical info the
            coaches carry to the field. (Only coaches ever see those two.)
          </p>
          {myPlayers.map((p) => (
            <form key={p.id} action={updateOwnPlayer} className="card grid gap-3 p-4 sm:grid-cols-2">
              <input type="hidden" name="playerId" value={p.id} />
              <div>
                <label className="label" htmlFor={`fn-${p.id}`}>First name</label>
                <input className="field" id={`fn-${p.id}`} name="firstName" defaultValue={p.firstName} required />
              </div>
              <div>
                <label className="label" htmlFor={`ln-${p.id}`}>Last name</label>
                <input className="field" id={`ln-${p.id}`} name="lastName" defaultValue={p.lastName} required />
              </div>
              <div>
                <label className="label" htmlFor={`bd-${p.id}`}>Birthdate</label>
                <input className="field" id={`bd-${p.id}`} name="birthdate" type="date" defaultValue={p.birthdate ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor={`sc-${p.id}`}>School</label>
                <input className="field" id={`sc-${p.id}`} name="school" defaultValue={p.school ?? ""} />
              </div>
              <div>
                <label className="label" htmlFor={`bats-${p.id}`}>Bats</label>
                <select className="field" id={`bats-${p.id}`} name="bats" defaultValue={p.bats ?? ""}>
                  <option value="">—</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                  <option value="S">Switch</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`throws-${p.id}`}>Throws</label>
                <select className="field" id={`throws-${p.id}`} name="throws" defaultValue={p.throws ?? ""}>
                  <option value="">—</option>
                  <option value="R">Right</option>
                  <option value="L">Left</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`ec-${p.id}`}>Emergency contact (coaches only)</label>
                <input className="field" id={`ec-${p.id}`} name="emergencyContact" defaultValue={p.emergencyContact ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`mn-${p.id}`}>Allergies & medical notes (coaches only)</label>
                <textarea className="field" id={`mn-${p.id}`} name="medicalNotes" rows={2} defaultValue={p.medicalNotes ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <button className="btn btn-primary" type="submit">
                  Save {p.firstName}&apos;s details
                </button>
              </div>
            </form>
          ))}
        </section>
      )}
    </div>
  );
}
