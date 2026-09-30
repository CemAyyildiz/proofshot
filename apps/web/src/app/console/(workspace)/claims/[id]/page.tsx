import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDate, formatDateTime } from "@/lib/format";
import { ArrowLeftIcon, WarningIcon } from "@/components/icons";
import { TileMap } from "@/components/verdict/tile-map";
import { VerdictBadge } from "@/components/verdict/verdict-badge";
import type { VerdictKind } from "@/components/verdict/copy";
import { claimLinkState, getClaimFile, listCaptures, listDuplicateAlerts, listUploads } from "@/server/dal/claim-files";
import { matchStrength } from "@/server/evidence/duplicates";
import { getVerification } from "@/server/verify/verify";
import { RevokeLink } from "./revoke-link";
import { UploadForm } from "./upload-form";
import { carrierScope } from "@/server/dal/scope";

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

  // Every item gets a stable, human label and anchor so an alert can say exactly which photo it is about.
  const items = [
    ...evidence.map((c, i) => ({ exactHash: c.exactHash, label: `Policyholder photo ${i + 1}`, anchor: `photo-${i + 1}` })),
    ...uploaded.map((u, i) => ({ exactHash: u.exactHash, label: `Team upload ${i + 1}`, anchor: `upload-${i + 1}` })),
  ];
  const alertGroups = items
    .map((item) => ({ item, matches: alerts.filter((a) => a.sourceExactHash === item.exactHash) }))
    .filter((g) => g.matches.length > 0);
  const alertCount = (exactHash: string) => alerts.filter((a) => a.sourceExactHash === exactHash).length;

  const url = new URL(`/c/${file.link.token}`, env().APP_URL).toString();
  const state = claimLinkState(file.link);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/console" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeftIcon /> All Claim Files
        </Link>
        <h1 className="mt-2 text-2xl font-semibold [overflow-wrap:anywhere]">{file.reference}</h1>
        <p className="text-sm text-muted">Created {formatDate(file.createdAt)} · {evidence.length + uploaded.length} item{evidence.length + uploaded.length === 1 ? "" : "s"}{alerts.length ? ` · ${alerts.length} Duplicate Alert${alerts.length === 1 ? "" : "s"}` : ""}</p>
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
            <RevokeLink claimFileId={file.id} />
          </>
        ) : (
          <p className="text-sm">
            This link is {state === "revoked" ? `revoked (${formatDateTime(file.link.revokedAt!)})` : `expired (${formatDateTime(file.link.expiresAt)})`}. It no
            longer accepts photos.
          </p>
        )}
      </section>

      {alertGroups.length > 0 && (
        <section aria-labelledby="alerts-heading" className="flex flex-col gap-2">
          <h2 id="alerts-heading" className="font-semibold">
            Duplicate Alerts ({alerts.length})
          </h2>
          <ul className="flex flex-col gap-2">
            {alertGroups.map(({ item, matches }) => (
              <li
                key={item.exactHash}
                id={`alerts-${item.anchor}`}
                className="flex scroll-mt-4 gap-3 rounded-md border border-l-4 border-line border-l-foreground bg-surface p-3 text-sm"
              >
                <WarningIcon className="mt-0.5 size-5 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="font-semibold">
                    <a href={`#${item.anchor}`} className="underline underline-offset-4">
                      {item.label}
                    </a>{" "}
                    matches {matches.length === 1 ? "a record in another Claim File" : `${matches.length} records in other Claim Files`}
                  </p>
                  <ul className="flex flex-col divide-y divide-line">
                    {matches.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5 first:pt-0 last:pb-0">
                        <span>
                          {a.matchedKind === "imported" ? "Imported record (unsigned)" : "Sealed photo"} ·{" "}
                          {a.sameCarrier ? "same carrier" : "another carrier"} · {formatDateTime(a.matchedAt)}
                        </span>
                        <span className="text-muted">Match strength: {matchStrength(a)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
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
          <p className="rounded-md border border-dashed border-line p-6 text-center text-muted">
            No photos yet. Send the Claim Link above to the policyholder, or upload a photo you received by email.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {evidence.map((c, i) => (
              <li key={c.id} id={`photo-${i + 1}`} className="flex scroll-mt-4 flex-col gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">Policyholder photo {i + 1}</span>
                  {c.sentAt ? <VerdictBadge kind="original" /> : <span className="text-muted">Sealed, not sent yet</span>}
                </div>
                {c.sentAt ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- authenticated, Carrier-scoped image */
                  <img src={`/api/console/claims/${file.id}/images/capture/${c.exactHash}`} alt={`Policyholder photo ${i + 1}`} className="aspect-[4/3] w-full rounded object-cover" />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded bg-background text-muted">Not sent yet</div>
                )}
                <span className="text-muted">Sealed {formatDateTime(c.sealedAt)}{c.sentAt ? " · Photo received" : ""}</span>
                <AlertLink count={alertCount(c.exactHash)} anchor={`photo-${i + 1}`} />
                <a href={`/r/${c.exactHash}`} className="underline underline-offset-4">
                  Receipt
                </a>
              </li>
            ))}
            {uploaded.map((u, i) => {
              const v = uploadVerifications.get(u.id);
              const src = `/api/console/claims/${file.id}/images/upload/${u.id}`;
              return (
                <li key={u.id} id={`upload-${i + 1}`} className="flex scroll-mt-4 flex-col gap-2 rounded-md border border-line bg-surface p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Team upload {i + 1}</span>
                    <VerdictBadge kind={u.verdict as VerdictKind} alterationCheck={v?.alterationCheck} imported={v?.matchedKind === "imported"} />
                  </div>
                  {u.verdict === "altered" && v ? (
                    <TileMap
                      src={src}
                      alt={`Team upload ${i + 1} with changed regions highlighted`}
                      alteredTiles={v.alteredTiles ?? []}
                      width={v.submittedWidth}
                      height={v.submittedHeight}
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element -- authenticated, Carrier-scoped image */
                    <img src={src} alt={`Team upload ${i + 1}`} className="aspect-[4/3] w-full rounded object-cover" />
                  )}
                  <span className="text-muted">Checked {formatDateTime(u.createdAt)}</span>
                  <AlertLink count={alertCount(u.exactHash)} anchor={`upload-${i + 1}`} />
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

/** On an evidence card: jumps to the Duplicate Alerts about this item. */
function AlertLink({ count, anchor }: { count: number; anchor: string }) {
  if (count === 0) return null;
  return (
    <a href={`#alerts-${anchor}`} className="inline-flex items-center gap-1.5 font-medium underline underline-offset-4">
      <WarningIcon className="size-4 shrink-0" />
      {count} Duplicate Alert{count === 1 ? "" : "s"}
    </a>
  );
}
