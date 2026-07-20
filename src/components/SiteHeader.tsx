import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { NavLinks, type NavEntry } from "@/components/NavLinks";
import { FUTURE_PREVIEW_LINKS, FUTURE_PREVIEW_TITLE } from "@/lib/preview";

// Coach-first mode: the active tool is ratings, lineups, and the dugout;
// family-facing features sit in the muted "Future preview" group (see
// src/lib/preview.ts) until the team decides to invite parents in.

const SETTINGS: NavEntry = { href: "/account", label: "Settings", mobileOnly: true };

const FUTURE: NavEntry = {
  label: FUTURE_PREVIEW_TITLE,
  preview: true,
  items: FUTURE_PREVIEW_LINKS,
};

const PARENT_ENTRIES: NavEntry[] = [
  { href: "/roster", label: "Roster" },
  {
    label: FUTURE_PREVIEW_TITLE,
    preview: true,
    items: [
      { href: "/schedule", label: "Schedule" },
      { href: "/players", label: "Players" },
      { href: "/progress", label: "Progress" },
      { href: "/stats", label: "Stats" },
    ],
  },
  SETTINGS,
];

const COACH_ENTRIES: NavEntry[] = [
  { href: "/games", label: "Game day", accent: true },
  { href: "/roster", label: "Roster" },
  {
    label: "Performance",
    items: [
      { href: "/matrix", label: "Position matrix" },
      { href: "/depth", label: "Depth chart" },
      { href: "/rate", label: "Player feedback" },
      { href: "/stats", label: "Stats" },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/weekend", label: "Weekend" },
      { href: "/practice", label: "Practice stations" },
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
  FUTURE,
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
