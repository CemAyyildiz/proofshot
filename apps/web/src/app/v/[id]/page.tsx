import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptDetails, VerifyYourself } from "@/components/receipt/receipt-details";
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
      {record && <ReceiptDetails record={record} />}
      <VerifyYourself />
      <Link href="/verify" className="text-sm underline underline-offset-4">
        Verify another photo
      </Link>
    </main>
  );
}
