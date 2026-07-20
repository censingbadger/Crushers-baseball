"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  accent?: boolean;
  /** Rendered only inside the collapsed phone menu. */
  mobileOnly?: boolean;
}

/** A top-level entry: either a direct link or a labeled group of links. */
export interface NavEntry {
  label: string;
  href?: string;
  accent?: boolean;
  mobileOnly?: boolean;
  items?: NavItem[];
  /** Parked features: rendered muted, with a "not in use yet" note. */
  preview?: boolean;
}

export function NavLinks({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // phone menu
  const [openGroup, setOpenGroup] = useState<string | null>(null); // desktop dropdown
  const navRef = useRef<HTMLDivElement | null>(null);

  // Any click outside the nav closes an open desktop dropdown.
  useEffect(() => {
    if (!openGroup) return;
    const onDown = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openGroup]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const groupActive = (entry: NavEntry) =>
    entry.items?.some((i) => isActive(i.href)) ?? false;

  const linkCls = (active: boolean, accent?: boolean, mobileOnly?: boolean) =>
    `block rounded-lg px-3 py-2.5 sm:rounded-full sm:px-2.5 sm:py-1 ${
      mobileOnly ? "sm:hidden" : ""
    } ${
      active
        ? "bg-team-blue-light text-team-blue-dark sm:bg-paper sm:shadow-sm"
        : accent
          ? "text-team-orange-dark hover:bg-team-blue-light sm:hover:bg-paper/60"
          : "hover:bg-team-blue-light sm:hover:bg-paper/60"
    }`;

  return (
    <div ref={navRef} className="w-full sm:ml-2 sm:w-auto sm:flex-1">
      <button
        className="btn w-full px-3 py-2 text-sm sm:hidden"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen(!open)}
      >
        ☰ Menu
      </button>
      <nav
        id="site-nav"
        className={`${open ? "mt-2 flex" : "hidden"} w-full flex-col gap-1 rounded-xl border border-line bg-paper p-2 text-sm font-bold shadow-lg sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-0.5 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
      >
        {entries.map((entry) => {
          if (entry.href) {
            return (
              <Link
                key={entry.href}
                href={entry.href}
                onClick={() => setOpen(false)}
                className={linkCls(isActive(entry.href), entry.accent, entry.mobileOnly)}
              >
                {entry.label}
              </Link>
            );
          }
          const active = groupActive(entry);
          const expanded = openGroup === entry.label;
          return (
            <div
              key={entry.label}
              className="mt-1.5 border-t border-line pt-1.5 first:mt-0 first:border-t-0 first:pt-0 sm:relative sm:mt-0 sm:border-t-0 sm:pt-0"
            >
              {/* Phone: the section header — larger and darker than its
                  links, so the hierarchy reads parent over child. */}
              <span
                className={`block px-3 pb-0.5 text-sm font-extrabold uppercase tracking-wide sm:hidden ${
                  entry.preview ? "text-amber-700" : "text-ink"
                }`}
              >
                {entry.label}
                {entry.preview && (
                  <span className="ml-1.5 text-[11px] font-bold normal-case text-amber-600">
                    · not in use yet
                  </span>
                )}
              </span>
              <button
                className={`hidden sm:block ${linkCls(active)} ${
                  entry.preview && !active ? "text-neutral-500" : ""
                }`}
                aria-expanded={expanded}
                onClick={() => setOpenGroup(expanded ? null : entry.label)}
              >
                {entry.label} <span className="text-[10px] align-middle">▾</span>
              </button>
              <div
                className={`sm:absolute sm:left-0 sm:top-full sm:z-50 sm:mt-1 sm:min-w-40 sm:rounded-xl sm:border sm:border-line sm:bg-paper sm:p-1.5 sm:shadow-lg ${
                  expanded ? "sm:block" : "sm:hidden"
                }`}
              >
                {entry.preview && (
                  <p className="hidden px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-700 sm:block">
                    Not in use yet
                  </p>
                )}
                {entry.items!.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setOpen(false);
                      setOpenGroup(null);
                    }}
                    className={`${linkCls(isActive(item.href), item.accent, item.mobileOnly)} !pl-6 sm:!rounded-lg sm:!px-3 sm:!pl-3 sm:!py-1.5`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
