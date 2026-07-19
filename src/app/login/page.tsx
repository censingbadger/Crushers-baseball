import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { login } from "@/app/auth-actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect("/");
  const { error } = await searchParams;

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
