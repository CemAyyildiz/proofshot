import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { claimLinkState, getClaimFile, listCaptures } from "@/server/dal/claim-files";
import { carrierScope } from "@/server/dal/scope";
import { revokeLink } from "../../actions";

export const metadata: Metadata = { title: "Claim File · Proofshot Console" };

export default async function ClaimFilePage({ params }: PageProps<"/console/claims/[id]">) {
  const { id } = await params;
  const scope = await carrierScope();
  const file = await getClaimFile(scope, id);
  if (!file) notFound();
  const evidence = await listCaptures(scope, file.id);

  const url = new URL(`/c/${file.link.token}`, env().APP_URL).toString();
  const state = claimLinkState(file.link);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/console" className="text-sm text-muted underline underline-offset-4">
          All Claim Files
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{file.reference}</h1>
        <p className="text-sm text-muted">Created {formatDate(file.createdAt)}</p>
      </div>

      <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4" aria-labelledby="link-heading">
        <h2 id="link-heading" className="font-semibold">
          Claim Link
        </h2>
        {state === "active" ? (
          <>
            <p className="text-sm text-muted">
              Send this link to the policyholder by SMS or email. It lets them add photos to this Claim File only, and
              expires {formatDateTime(file.link.expiresAt)}.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={url} aria-label="Claim Link" className="flex-1 rounded-md border border-line bg-background px-3 py-2 font-mono text-sm" />
              <CopyButton value={url} label="Copy link" />
            </div>
            <form action={revokeLink}>
              <input type="hidden" name="claimFileId" value={file.id} />
              <button type="submit" className="text-sm text-danger underline underline-offset-4">
                Revoke link
              </button>
            </form>
          </>
        ) : (
          <p className="text-sm">
            This link is {state === "revoked" ? `revoked (${formatDateTime(file.link.revokedAt!)})` : `expired (${formatDateTime(file.link.expiresAt)})`}. It no
            longer accepts photos.
          </p>
        )}
      </section>

      <section aria-labelledby="evidence-heading" className="flex flex-col gap-2">
        <h2 id="evidence-heading" className="font-semibold">
          Evidence
        </h2>
        {evidence.length === 0 ? (
          <p className="text-muted">No photos yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {evidence.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-mono">{c.exactHash.slice(0, 10)}…</span>
                <span className="text-muted">Sealed {formatDateTime(c.sealedAt)}</span>
                <span>{c.sentAt ? "Photo received" : "Sealed, not sent yet"}</span>
                <a href={`/r/${c.exactHash}`} className="underline underline-offset-4">
                  Receipt
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
