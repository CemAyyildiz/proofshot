import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { resolveClaimLink } from "@/server/dal/claim-files";
import { formatDate } from "@/lib/format";
import { CaptureApp } from "./capture-app";

export const metadata: Metadata = { title: "Add photos · Proofshot", robots: { index: false } };

export default async function ClaimLinkPage({ params }: PageProps<"/c/[token]">) {
  const { token } = await params;
  const link = await resolveClaimLink(await getDb(), token);

  if (!link || link.state !== "active") {
    return (
      <main className="ink flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-4 py-16">
          <h1 className="display text-3xl">This link is no longer active</h1>
          <p className="text-muted">Ask your insurer to send you a new link.</p>
        </div>
      </main>
    );
  }

  return (
    <CaptureApp
      token={token}
      carrierName={link.carrierName}
      reference={link.reference}
      validUntil={formatDate(link.expiresAt)}
      sandbox={link.isSandbox}
    />
  );
}
