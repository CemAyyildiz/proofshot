import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintedReceiptUrl, ReceiptDetails, VerifyYourself } from "@/components/receipt/receipt-details";
import { VerdictPanel } from "@/components/verdict/verdict-panel";
import { formatDateTime } from "@/lib/format";
import { getDb } from "@/server/db";
import { registryEntries } from "@/server/registry";
import { getVerification } from "@/server/verify/verify";

export const metadata: Metadata = { title: "Verification Receipt · Proofshot" };

/** FR-9: public, stable receipt for one Verification. Never shows the image. */
export default async function VerificationReceipt({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const v = await getVerification(await getDb(), id);
  if (!v) notFound();
  const record = v.matchedExactHash
    ? (await registryEntries()).find((e) => e.exactHash === v.matchedExactHash && e.kind === v.matchedKind) ?? null
    : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header>
        <p className="eyebrow">Verification Receipt</p>
        <p className="text-sm text-muted">Checked {formatDateTime(v.createdAt)} · Receipt {v.id}</p>
        <PrintedReceiptUrl path={`/v/${v.id}`} />
      </header>
      <VerdictPanel
        headingLevel={1}
        view={{
          verdict: v.verdict,
          alterationCheck: v.alterationCheck ?? null,
          alteredTiles: v.alteredTiles ?? [],
          record: record ? { kind: record.kind, sealedAt: new Date(record.blockTimestamp * 1000) } : null,
        }}
      />
      {v.verdict === "altered" && (
        <p className="text-sm">
          Changed regions (row, column, 4×4 grid): {(v.alteredTiles ?? []).map((i) => `${Math.floor(i / 4) + 1},${(i % 4) + 1}`).join("; ")}.
        </p>
      )}
      <section aria-labelledby="checked-heading" className="flex flex-col gap-2">
        <h2 id="checked-heading" className="font-semibold">
          File checked
        </h2>
        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="font-medium">Exact Hash (SHA-256)</dt>
          <dd className="break-all font-mono text-muted">{v.submittedExactHash}</dd>
          <dt className="font-medium">Dimensions</dt>
          <dd className="text-muted">
            {v.submittedWidth} × {v.submittedHeight} px
          </dd>
        </dl>
        <p className="text-xs text-muted">Compute the SHA-256 of your file to confirm this receipt is about it. The image itself was not stored.</p>
      </section>
      {record && <ReceiptDetails record={record} />}
      <VerifyYourself />
      <Link href="/verify" className="inline-flex min-h-11 items-center self-start text-sm underline underline-offset-4 print:hidden">
        Verify another photo
      </Link>
    </main>
  );
}
