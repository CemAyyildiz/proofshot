import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/brand/site-chrome";
import { ArrowRightIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Page not found · Proofshot" };

/** Any address that leads nowhere: say so, and offer the three places a visitor most likely wanted. */
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-4 py-16">
        <p className="eyebrow">Error 404</p>
        <h1 className="display text-5xl sm:text-6xl">No record of this page</h1>
        <p className="text-lg text-foreground/80">
          The address may be mistyped, or the link may be out of date.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-primary">
            Go to the home page
            <ArrowRightIcon className="size-5" />
          </Link>
          <Link href="/verify" className="btn-secondary">
            Verify a photo
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
