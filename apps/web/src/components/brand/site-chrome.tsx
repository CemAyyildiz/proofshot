import Link from "next/link";
import { Wordmark } from "./logo";

const NAV = [
  { href: "/verify", label: "Verify a photo" },
  { href: "/try", label: "Try it" },
  { href: "/console", label: "Carrier Console" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label="Proofshot home" className="rounded">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-2 text-muted hover:bg-background hover:text-foreground">
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>Proofshot — proof created at capture, checkable by anyone.</p>
        <p>Photos never leave the carrier. Only fingerprints are public.</p>
      </div>
    </footer>
  );
}
