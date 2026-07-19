import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { NavLinks, type NavItem } from "@/components/NavLinks";

const EVERYONE: NavItem[] = [
  { href: "/schedule", label: "Schedule" },
  { href: "/roster", label: "Roster" },
  { href: "/players", label: "Players" },
  { href: "/availability", label: "Availability" },
  { href: "/progress", label: "Progress" },
  { href: "/stats", label: "Stats" },
];

const COACH: NavItem[] = [
  { href: "/games", label: "Game day", accent: true },
  { href: "/rate", label: "Rate" },
  { href: "/reports", label: "Reports" },
  { href: "/matrix", label: "Matrix" },
  { href: "/lineup", label: "Lineup" },
  { href: "/weekend", label: "Weekend" },
  { href: "/drills", label: "Drills" },
  { href: "/families", label: "Admin" },
  { href: "/import", label: "Import" },
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const items = user?.role === "coach" ? [...EVERYONE, ...COACH] : EVERYONE;
  return (
    <header className="sticky top-0 z-40 border-b border-team-blue-dark/25 bg-gradient-to-b from-[#a8d4f0] to-team-blue shadow-[0_2px_14px_rgb(23_42_58_/_0.12)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Crushers logo"
            width={40}
            height={36}
            priority
            className="h-9 w-auto drop-shadow-sm"
          />
          <span
            className="text-xl font-extrabold uppercase leading-none tracking-wide"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Crushers <span className="text-team-orange-dark">Blue</span>
          </span>
        </Link>
        {user && (
          <>
            <NavLinks items={items} />
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden font-semibold sm:inline">
                {user.displayName}
                {user.role === "coach" && (
                  <span className="chip ml-1.5 bg-ink text-paper">Coach</span>
                )}
              </span>
              <Link className="btn px-2.5 py-1 text-xs" href="/account">
                Settings
              </Link>
              <form action={logout}>
                <button className="btn px-2.5 py-1 text-xs" type="submit">
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
