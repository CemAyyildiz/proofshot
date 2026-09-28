import type { Metadata } from "next";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { claimLinkState, listClaimFiles } from "@/server/dal/claim-files";
import { carrierScope } from "@/server/dal/scope";
import { CreateClaimForm } from "./create-claim-form";

export const metadata: Metadata = { title: "Claim Files · Proofshot Console" };

const STATUS_LABEL = { awaiting_evidence: "Awaiting evidence", evidence_received: "Evidence received" } as const;

export default async function ConsoleHome() {
  const files = await listClaimFiles(await carrierScope());
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Claim Files</h1>
      <CreateClaimForm />
      {files.length === 0 ? (
        <p className="text-muted">No Claim Files yet. Create one to get a Claim Link for the policyholder.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line bg-surface">
          {files.map((f) => {
            const link = claimLinkState(f.link);
            return (
              <li key={f.id}>
                <Link href={`/console/claims/${f.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-background">
                  <span className="font-medium">{f.reference}</span>
                  <span className="flex items-center gap-4 text-sm text-muted">
                    <span>{STATUS_LABEL[f.status]}</span>
                    {link !== "active" && <span>Link {link}</span>}
                    <span>{formatDate(f.createdAt)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
