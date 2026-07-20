import { eq } from "drizzle-orm";
import { getDb, tables } from "@/db";
import { requireCoach } from "@/lib/auth";
import { getActiveSeason, getRoster } from "@/lib/data";
import {
  linkGuardianPlayer,
  removeGuardian,
  revokeLogin,
  setUserRole,
  unlinkGuardianPlayer,
} from "./actions";
import { AddCoachForm, AddFamilyForm, CredsPanel, ResetButton } from "./CredsPanel";

export default async function FamiliesPage() {
  await requireCoach();
  const db = await getDb();
  const season = await getActiveSeason();
  const roster = season ? await getRoster(season.id) : [];
  const [guardians, users, links] = await Promise.all([
    db.select().from(tables.guardians),
    db.select().from(tables.users),
    db
      .select({
        guardianId: tables.playerGuardians.guardianId,
        playerId: tables.playerGuardians.playerId,
        firstName: tables.players.firstName,
        lastName: tables.players.lastName,
      })
      .from(tables.playerGuardians)
      .innerJoin(
        tables.players,
        eq(tables.playerGuardians.playerId, tables.players.id),
      ),
  ]);
  const userByGuardian = new Map(
    users.filter((u) => u.guardianId).map((u) => [u.guardianId!, u]),
  );
  const coaches = users.filter((u) => u.role === "coach");
  const pendingCount = guardians.filter(
    (g) => g.email && !userByGuardian.has(g.id),
  ).length;
  const sorted = [...guardians].sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName),
  );
  const playerOptions = roster.map((p) => ({
    id: p.playerId,
    name: `${p.firstName} ${p.lastName}`,
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Team admin — families & access</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-700">
          Add or remove family members, hand out logins, reset passwords,
          and revoke access. Passwords are shown to you exactly once when
          created — only scrambled versions are ever stored.
        </p>
      </div>

      <section className="card space-y-3 p-4">
        <h2 className="text-lg font-bold">Add a family member</h2>
        <AddFamilyForm players={playerOptions} />
        <div className="border-t border-line pt-3">
          <CredsPanel pendingCount={pendingCount} />
        </div>
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-lg font-bold">Families</h2>
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left">
              <th className="py-1 pr-2">Guardian</th>
              <th className="py-1 pr-2">Players</th>
              <th className="py-1 pr-2">Email</th>
              <th className="py-1 pr-2">Login</th>
              <th className="sticky right-0 bg-paper py-1 pl-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const account = userByGuardian.get(g.id);
              const myLinks = links.filter((l) => l.guardianId === g.id);
              const linkedIds = new Set(myLinks.map((l) => l.playerId));
              const unlinked = playerOptions.filter((p) => !linkedIds.has(p.id));
              const revoked = account && !account.passwordHash;
              return (
                <tr key={g.id} className="border-b border-line align-top">
                  <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">
                    {g.firstName} {g.lastName}
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {myLinks.map((l) => (
                        <form key={l.playerId} action={unlinkGuardianPlayer} className="inline">
                          <input type="hidden" name="guardianId" value={g.id} />
                          <input type="hidden" name="playerId" value={l.playerId} />
                          <span className="chip bg-team-blue-light">
                            {l.firstName}
                            <button
                              className="ml-1 px-1.5 py-0.5 text-sm opacity-60 hover:opacity-100"
                              title={`Unlink ${l.firstName}`}
                              type="submit"
                            >
                              ×
                            </button>
                          </span>
                        </form>
                      ))}
                      {unlinked.length > 0 && (
                        <form action={linkGuardianPlayer} className="inline-flex items-center gap-1">
                          <input type="hidden" name="guardianId" value={g.id} />
                          <select
                            className="field w-auto px-1 py-0.5 text-xs"
                            name="playerId"
                            defaultValue=""
                          >
                            <option value="" disabled>+ link</option>
                            {unlinked.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button className="btn px-1.5 py-0.5 text-xs" type="submit">
                            Link
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2">
                    {g.email ?? <span className="text-neutral-400">no email</span>}
                  </td>
                  <td className="py-1.5 pr-2">
                    {revoked ? (
                      <span className="chip bg-red-600 text-white">revoked</span>
                    ) : account ? (
                      <span className="chip bg-green-600 text-white">active</span>
                    ) : g.email ? (
                      <span className="chip bg-amber-400">pending</span>
                    ) : (
                      <span className="chip bg-line">n/a</span>
                    )}
                  </td>
                  <td className="sticky right-0 bg-paper py-1.5 pl-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {account && (
                        <ResetButton
                          userId={account.id}
                          family={`${g.firstName} ${g.lastName}`}
                        />
                      )}
                      {account && !revoked && (
                        <form action={revokeLogin}>
                          <input type="hidden" name="userId" value={account.id} />
                          <button
                            className="btn px-2.5 py-1.5 text-xs text-red-700"
                            title="Blocks sign-in; reset password to restore"
                            type="submit"
                          >
                            revoke access
                          </button>
                        </form>
                      )}
                      {account && !revoked && account.role === "parent" && (
                        <form action={setUserRole}>
                          <input type="hidden" name="userId" value={account.id} />
                          <input type="hidden" name="role" value="coach" />
                          <button
                            className="btn px-2.5 py-1.5 text-xs text-team-blue-dark"
                            title="Coaches see contacts, ratings, and all tools"
                            type="submit"
                          >
                            make coach
                          </button>
                        </form>
                      )}
                      {!account && (
                        <form action={removeGuardian}>
                          <input type="hidden" name="guardianId" value={g.id} />
                          <button
                            className="btn px-2.5 py-1.5 text-xs text-red-700"
                            title="Removes this guardian entirely"
                            type="submit"
                          >
                            remove
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-neutral-600">
          Revoking blocks sign-in but keeps history; &quot;reset password&quot;
          restores access with a fresh password. Guardians can only be fully
          removed before they have a login.
        </p>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 text-lg font-bold">Coaches</h2>
        <p className="mb-3 text-xs text-neutral-600">
          Coaches see everything — contacts, ratings, and all tools.
        </p>
        <ul className="mb-3 divide-y divide-line">
          {coaches.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
              <span className="font-semibold">{c.displayName}</span>
              <span className="text-neutral-500">{c.email}</span>
              {coaches.length > 1 ? (
                <form action={setUserRole} className="ml-auto">
                  <input type="hidden" name="userId" value={c.id} />
                  <input type="hidden" name="role" value="parent" />
                  <button
                    className="btn px-2.5 py-1.5 text-xs text-team-blue-dark"
                    title="Back to a family account"
                    type="submit"
                  >
                    make parent
                  </button>
                </form>
              ) : (
                <span
                  className="ml-auto text-xs text-neutral-400"
                  title="Someone has to hold the keys"
                >
                  last coach
                </span>
              )}
            </li>
          ))}
        </ul>
        <AddCoachForm />
      </section>
    </div>
  );
}
