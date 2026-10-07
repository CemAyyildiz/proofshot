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
            className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3 font-medium sm:px-4 ${
              current ? "bg-foreground text-background" : "text-muted hover:text-foreground"
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
