import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/logo";
import Link from "next/link";
import { completeSignIn } from "../actions";

export const metadata: Metadata = { title: "Sign in · Proofshot Console", robots: { index: false } };

/**
 * Confirmation step: the token is only redeemed on POST, so link scanners that prefetch emailed URLs
 * cannot burn the single-use token.
 */
export default async function VerifyPage({ searchParams }: PageProps<"/auth/verify">) {
  const { token, error } = await searchParams;
  const valid = typeof token === "string" && token.length > 0 && !error;
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Link href="/" aria-label="Proofshot home" className="self-start">
        <Wordmark />
      </Link>
      <p className="eyebrow">Carrier Console</p>
      {valid ? (
        <form action={completeSignIn} className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">Continue to your workspace</h1>
          <input type="hidden" name="token" value={token} />
          <button type="submit" className="btn-primary">
            Sign in
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <h1 className="text-2xl font-semibold">This sign-in link is no longer valid</h1>
          <p>Links work once and expire after 15 minutes.</p>
          <Link href="/console/sign-in" className="btn-primary text-center">
            Request a new link
          </Link>
        </div>
      )}
    </main>
  );
}
