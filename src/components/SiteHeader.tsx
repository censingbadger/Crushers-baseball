import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";

function LogoMark() {
  return (
    <Image
      src="/logo.png"
      alt="Crushers logo"
      width={40}
      height={36}
      priority
      className="h-9 w-auto"
    />
  );
}

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <header className="border-b-2 border-ink bg-team-blue">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-extrabold">
          <LogoMark />
          <span className="text-lg tracking-tight">
            Crushers <span className="text-team-orange-dark">Blue</span>
          </span>
        </Link>
        {user && (
          <>
            <nav className="flex flex-wrap items-center gap-1 text-sm font-semibold">
              <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/schedule">
                Schedule
              </Link>
              <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/roster">
                Roster
              </Link>
              <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/availability">
                Availability
              </Link>
              <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/progress">
                Progress
              </Link>
              {user.role === "coach" && (
                <>
                  <Link className="rounded px-2 py-1 font-extrabold text-team-orange-dark hover:bg-team-blue-light" href="/games">
                    Game day
                  </Link>
                  <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/rate">
                    Rate
                  </Link>
                  <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/matrix">
                    Matrix
                  </Link>
                  <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/lineup">
                    Lineup
                  </Link>
                  <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/weekend">
                    Weekend
                  </Link>
                  <Link className="rounded px-2 py-1 hover:bg-team-blue-light" href="/import">
                    Import
                  </Link>
                </>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden sm:inline">
                {user.displayName}
                {user.role === "coach" && (
                  <span className="ml-1 rounded border border-ink bg-team-orange px-1 py-0.5 text-[10px] font-bold uppercase text-paper">
                    Coach
                  </span>
                )}
              </span>
              <form action={logout}>
                <button className="btn px-2 py-1 text-xs" type="submit">
                  Log out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
