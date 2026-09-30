"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/verify", label: "Verify a photo", short: "Verify" },
  { href: "/try", label: "Try it", short: "Try it" },
  { href: "/console", label: "Carrier Console", short: "Console" },
] as const;

/** Main navigation: 44 px targets, and the current section marked for sight and for screen readers. */
export function NavLinks() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex items-center gap-0.5 text-sm print:hidden sm:gap-1">
      {NAV.map((n) => {
        const current = path === n.href || path.startsWith(`${n.href}/`);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current ? "page" : undefined}
            className={`relative inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-2.5 hover:bg-background hover:text-foreground sm:px-3 ${
              current ? "font-medium text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted"
            }`}
          >
            <span className="sm:hidden">{n.short}</span>
            <span className="hidden sm:inline">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
