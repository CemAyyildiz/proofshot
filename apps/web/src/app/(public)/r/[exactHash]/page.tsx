import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReceiptDetails, VerifyYourself } from "@/components/receipt/receipt-details";
import { VerdictBadge } from "@/components/verdict/verdict-badge";
import { formatDateTime } from "@/lib/format";
import { registryEntries } from "@/server/registry";

export const metadata: Metadata = { title: "Seal Receipt · Proofshot" };

/** FR-9: public, stable receipt for one Capture Record. Never shows the image. */
export default async function CaptureReceipt({ params }: PageProps<"/r/[exactHash]">) {
  const { exactHash } = await params;
  const hash = exactHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) notFound();
  const record = (await registryEntries()).find((e) => e.exactHash === hash && e.kind === "sealed");
  if (!record) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-3">
        <p className="eyebrow">Seal Receipt</p>
        <h1 className="text-2xl font-semibold">Sealed photo</h1>
        <div>
          <VerdictBadge kind="original" />
        </div>
        <p className="text-lg">
          A photo with this Exact Hash was sealed {formatDateTime(new Date(record.blockTimestamp * 1000))}. The file that
          produced it verifies as Original; re-saved copies verify as Derived Copy.
        </p>
        <p className="text-sm text-muted">
          A Seal proves when and on which device the photo was sealed. It does not prove the scene is what anyone says it is.
        </p>
      </header>
      <ReceiptDetails record={record} />
      <VerifyYourself />
      <Link href="/verify" className="text-sm underline underline-offset-4">
        Check a copy of this photo
      </Link>
    </main>
  );
}
