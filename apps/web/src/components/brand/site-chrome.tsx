import Link from "next/link";
import { env } from "@/lib/env";
import { Wordmark } from "./logo";
import { NavLinks } from "./nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/90 backdrop-blur print:static">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-2">
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
    <footer className="ink mt-auto print:hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Wordmark className="text-2xl" />
          <p className="max-w-sm text-muted">
            <span className="font-medium text-foreground">Proofshot — proof created at capture, checkable by anyone.</span> Photos
            never leave the carrier. Only fingerprints are public.
          </p>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Sealed on Monad {network.name}</p>
        </div>
        <nav aria-label="Footer" className="-mx-2 flex flex-wrap sm:max-w-md sm:justify-end">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="inline-flex min-h-11 items-center px-2 font-medium underline-offset-4 hover:underline">
              {l.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
