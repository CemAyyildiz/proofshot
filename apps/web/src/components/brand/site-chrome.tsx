import Link from "next/link";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/verify", label: "Verify a photo", short: "Verify" },
  { href: "/try", label: "Try it", short: "Try it" },
  { href: "/console", label: "Carrier Console", short: "Console" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Proofshot home" className="rounded">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center print:hidden gap-0.5 text-sm sm:gap-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="whitespace-nowrap rounded-md px-2 py-2 text-muted hover:bg-background hover:text-foreground sm:px-2.5"
            >
              <span className="sm:hidden">{n.short}</span>
              <span className="hidden sm:inline">{n.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Proofshot — proof created at capture, checkable by anyone.</p>
        <p>Photos never leave the carrier. Only fingerprints are public.</p>
      </div>
    </footer>
  );
}
