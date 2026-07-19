import { redirect } from "next/navigation";
import { getDb, tables } from "@/db";
import { getCurrentUser } from "@/lib/auth";
import { createFirstCoach, login } from "@/app/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { error } = await searchParams;
  const db = await getDb();
  const anyUser = await db
    .select({ id: tables.users.id })
    .from(tables.users)
    .limit(1);
  const firstRun = anyUser.length === 0;

  if (firstRun) {
    return (
      <div className="mx-auto mt-10 max-w-sm">
        <div className="card p-6">
          <h1 className="mb-1 text-2xl font-extrabold">Welcome, Coach.</h1>
          <p className="mb-4 text-sm text-neutral-600">
            This is a brand-new team site — create the first coach account
            to take the field. (This option disappears once an account
            exists.)
          </p>
          {error === "setup" && (
            <p className="mb-3 rounded border border-line bg-team-orange px-3 py-2 text-sm font-semibold text-paper">
              Fill in every field — password needs 8+ characters.
            </p>
          )}
          <form action={createFirstCoach} className="space-y-3">
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input className="field" id="name" name="name" autoComplete="name" required />
            </div>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input className="field" id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Choose a password</label>
              <input
                className="field"
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <button className="btn btn-primary w-full" type="submit">
              Create coach account
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <div className="card p-6">
        <h1 className="mb-1 text-2xl font-extrabold">Play ball.</h1>
        <p className="mb-4 text-sm text-neutral-600">
          Sign in to the Crushers Blue team manager.
        </p>
        {error && (
          <p className="mb-3 rounded border border-line bg-team-orange px-3 py-2 text-sm font-semibold text-paper">
            {error === "missing"
              ? "Enter your email and password."
              : "That email or password didn't match."}
          </p>
        )}
        <form action={login} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              className="field"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              className="field"
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn btn-primary w-full" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
