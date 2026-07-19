"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  accent?: boolean;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm font-bold">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-2.5 py-1 transition-colors ${
              active
                ? "bg-paper text-team-blue-dark shadow-sm"
                : item.accent
                  ? "text-team-orange-dark hover:bg-paper/60"
                  : "hover:bg-paper/60"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
