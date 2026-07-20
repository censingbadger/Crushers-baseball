import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { NavLinks, type NavEntry, type NavItem } from "@/components/NavLinks";

const TEAM: NavItem[] = [
  { href: "/schedule", label: "Schedule" },
  { href: "/roster", label: "Roster" },
  { href: "/players", label: "Players" },
  { href: "/availability", label: "Availability" },
];

const PROGRESS: NavItem[] = [
  { href: "/progress", label: "Progress" },
  { href: "/stats", label: "Stats" },
];

const SETTINGS: NavEntry = { href: "/account", label: "Settings", mobileOnly: true };

const PARENT_ENTRIES: NavEntry[] = [
  { label: "Team", items: TEAM },
  { label: "Progress", items: PROGRESS },
  SETTINGS,
];

const COACH_ENTRIES: NavEntry[] = [
  { label: "Team", items: TEAM },
  { href: "/games", label: "Game day", accent: true },
  {
    label: "Progress",
    items: [
      ...PROGRESS,
      { href: "/rate", label: "Rate" },
      { href: "/matrix", label: "Matrix" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/lineup", label: "Lineup" },
      { href: "/weekend", label: "Weekend" },
      { href: "/drills", label: "Drills" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/families", label: "Families" },
      { href: "/import", label: "Import" },
    ],
  },
  SETTINGS,
];

export async function SiteHeader() {
  const user = await getCurrentUser();
  const entries = user?.role === "coach" ? COACH_ENTRIES : PARENT_ENTRIES;
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
            <div className="ml-auto flex items-center gap-2 text-sm sm:order-last sm:ml-0">
              <span className="hidden font-semibold sm:inline">
                {user.displayName}
                {user.role === "coach" && (
                  <span className="chip ml-1.5 bg-ink text-paper">Coach</span>
                )}
              </span>
              <Link className="btn hidden px-2.5 py-1 text-xs sm:inline-flex" href="/account">
                Settings
              </Link>
              <form action={logout}>
                <button className="btn px-2.5 py-1 text-xs" type="submit">
                  Log out
                </button>
              </form>
            </div>
            {/* On phones the nav collapses behind ☰ (Settings moves inside);
                from sm up groups open as dropdowns from the pill row. */}
            <NavLinks entries={entries} />
          </>
        )}
      </div>
    </header>
  );
}
