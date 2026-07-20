"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  accent?: boolean;
  /** Rendered only inside the collapsed phone menu. */
  mobileOnly?: boolean;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full sm:ml-2 sm:w-auto sm:flex-1">
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
        className={`${open ? "mt-2 flex" : "hidden"} w-full flex-col gap-1 rounded-xl border border-line bg-paper p-2 text-sm font-bold shadow-lg sm:mt-0 sm:flex sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none`}
      >
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`block rounded-lg px-3 py-2.5 sm:rounded-full sm:px-2.5 sm:py-1 ${
                item.mobileOnly ? "sm:hidden" : ""
              } ${
                active
                  ? "bg-team-blue-light text-team-blue-dark sm:bg-paper sm:shadow-sm"
                  : item.accent
                    ? "text-team-orange-dark hover:bg-team-blue-light sm:hover:bg-paper/60"
                    : "hover:bg-team-blue-light sm:hover:bg-paper/60"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
