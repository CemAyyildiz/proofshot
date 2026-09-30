import Link from "next/link";
import { env } from "@/lib/env";
import { Wordmark } from "./logo";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface/80 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-1.5">
        <Link href="/" aria-label="Proofshot home" className="inline-flex min-h-11 items-center rounded">
          <Wordmark />
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { network, REGISTRY_ADDRESS, PUBLIC_REPO_URL } = env();
  const links = [
    { href: "/verify", label: "Verify a photo" },
    { href: "/try", label: "Try it" },
    { href: "/console", label: "Carrier Console" },
    ...(PUBLIC_REPO_URL ? [{ href: PUBLIC_REPO_URL, label: "Source code" }] : []),
    ...(network.explorerUrl && REGISTRY_ADDRESS ? [{ href: `${network.explorerUrl}/address/${REGISTRY_ADDRESS}`, label: "Registry contract" }] : []),
  ];
  return (
    <footer className="mt-auto border-t border-line print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 text-muted">
          <p className="font-medium text-foreground">Proofshot — proof created at capture, checkable by anyone.</p>
          <p>Photos never leave the carrier. Only fingerprints are public.</p>
        </div>
        <nav aria-label="Footer" className="-mx-2 flex flex-wrap">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center px-2 text-muted underline-offset-4 hover:text-foreground hover:underline">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
