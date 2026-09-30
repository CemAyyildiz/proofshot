"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/console", label: "Claim Files", current: (p: string) => p === "/console" || p.startsWith("/console/claims") },
  { href: "/console/imports", label: "Import past photos", current: (p: string) => p.startsWith("/console/imports") },
] as const;

/** Where you are in the Console, marked for sight and for screen readers. */
export function ConsoleNav() {
  const path = usePathname();
  return (
    <nav aria-label="Console" className="flex items-center gap-1 text-sm">
      {NAV.map((n) => {
        const current = n.current(path);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={current ? "page" : undefined}
            className={`relative inline-flex min-h-11 items-center rounded-md px-2.5 hover:bg-background hover:text-foreground ${
              current ? "font-medium text-foreground after:absolute after:inset-x-2.5 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground" : "text-muted"
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
