import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { TileMap } from "@/components/verdict/tile-map";
import { VerdictBadge } from "@/components/verdict/verdict-badge";
import type { VerdictKind } from "@/components/verdict/copy";
import { claimLinkState, getClaimFile, listCaptures, listDuplicateAlerts, listUploads } from "@/server/dal/claim-files";
import { matchStrength } from "@/server/evidence/duplicates";
import { getVerification } from "@/server/verify/verify";
import { UploadForm } from "./upload-form";
import { carrierScope } from "@/server/dal/scope";
import { revokeLink } from "../../actions";

export const metadata: Metadata = { title: "Claim File · Proofshot Console" };

export default async function ClaimFilePage({ params }: PageProps<"/console/claims/[id]">) {
  const { id } = await params;
  const scope = await carrierScope();
  const file = await getClaimFile(scope, id);
  if (!file) notFound();
  const [evidence, uploaded, alerts] = await Promise.all([
    listCaptures(scope, file.id),
    listUploads(scope, file.id),
    listDuplicateAlerts(scope, file.id),
  ]);
  const uploadVerifications = new Map(
    await Promise.all(uploaded.map(async (u) => [u.id, u.verificationId ? await getVerification(scope.db, u.verificationId) : null] as const)),
  );
  const sourceLabel = (hash: string) =>
    evidence.some((c) => c.exactHash === hash) ? "A policyholder photo in this file" : "An image uploaded to this file";

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

      {alerts.length > 0 && (
        <section aria-labelledby="alerts-heading" className="flex flex-col gap-2">
          <h2 id="alerts-heading" className="font-semibold">
            Duplicate Alerts ({alerts.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-md border-2 border-foreground bg-surface p-3 text-sm">
                <p className="font-semibold">
                  ⚠ Duplicate Alert · {a.sameCarrier ? "same carrier" : "another carrier"}
                  {a.matchedKind === "imported" && " · imported (unsigned)"}
                </p>
                <p>
                  {sourceLabel(a.sourceExactHash)} matches {a.matchedKind === "imported" ? "a record imported" : "a photo sealed"}{" "}
                  {formatDateTime(a.matchedAt)} in a different Claim File{a.sameCarrier ? " at your carrier" : " at another carrier"}.
                </p>
                <p className="text-muted">Match strength: {matchStrength(a)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="evidence-heading" className="flex flex-col gap-3">
        <h2 id="evidence-heading" className="font-semibold">
          Evidence
        </h2>
        <UploadForm claimFileId={file.id} />
        {evidence.length === 0 && uploaded.length === 0 ? (
          <p className="text-muted">No photos yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {evidence.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                {c.sentAt ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- authenticated, Carrier-scoped image */
                  <img src={`/api/console/claims/${file.id}/images/capture/${c.exactHash}`} alt="Policyholder photo" className="aspect-[4/3] w-full rounded object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded bg-background text-muted">Not sent yet</div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Photo from policyholder</span>
                  {c.sentAt ? <VerdictBadge kind="original" /> : <span className="text-muted">Sealed, not sent yet</span>}
                </div>
                <span className="text-muted">Sealed {formatDateTime(c.sealedAt)}{c.sentAt ? " · Photo received" : ""}</span>
                <a href={`/r/${c.exactHash}`} className="underline underline-offset-4">
                  Receipt
                </a>
              </li>
            ))}
            {uploaded.map((u) => {
              const v = uploadVerifications.get(u.id);
              const src = `/api/console/claims/${file.id}/images/upload/${u.id}`;
              return (
                <li key={u.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                  {u.verdict === "altered" && v ? (
                    <TileMap src={src} alteredTiles={v.alteredTiles ?? []} width={v.submittedWidth} height={v.submittedHeight} />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element -- authenticated, Carrier-scoped image */
                    <img src={src} alt="Uploaded image" className="aspect-[4/3] w-full rounded object-cover" />
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Uploaded by your team</span>
                    <VerdictBadge kind={u.verdict as VerdictKind} alterationCheck={v?.alterationCheck} imported={v?.matchedKind === "imported"} />
                  </div>
                  <span className="text-muted">Checked {formatDateTime(u.createdAt)}</span>
                  {u.verificationId && (
                    <a href={`/v/${u.verificationId}`} className="underline underline-offset-4">
                      Receipt
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
