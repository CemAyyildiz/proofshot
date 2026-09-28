import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { resolveClaimLink } from "@/server/dal/claim-files";

export const metadata: Metadata = { title: "Add photos · Proofshot", robots: { index: false } };

export default async function ClaimLinkPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const link = await resolveClaimLink(await getDb(), token);

  if (!link || link.state !== "active") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
        <h1 className="text-2xl font-semibold">This link is no longer active</h1>
        <p className="text-muted">Ask your insurer to send you a new link.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <p className="eyebrow">{link.carrierName}</p>
      <h1 className="text-2xl font-semibold">Take photos of the damage</h1>
      <p className="text-muted">Claim {link.reference}</p>
    </main>
  );
}
