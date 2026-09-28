import type { RegistryEntry } from "@proofshot/fingerprint";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { blockTime } from "@/server/registry/chain-source";

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/** Onchain references for a Registry entry: what a third party needs to re-check it. */
export async function ReceiptDetails({ record }: { record: RegistryEntry }) {
  const { network, REGISTRY_ADDRESS } = env();
  const sealedAt = new Date(record.blockTimestamp * 1000);
  const refTime = record.refBlock !== undefined ? await blockTime(record.refBlock) : null;
  const txUrl = network.explorerUrl ? `${network.explorerUrl}/tx/${record.txHash}` : null;
  const rows: [string, React.ReactNode][] = [
    [record.kind === "sealed" ? "Sealed" : "Imported", formatDateTime(sealedAt)],
  ];
  if (record.kind === "sealed" && record.refBlock !== undefined) {
    const span = refTime !== null ? ` — a window of ${Math.max(0, record.blockTimestamp - refTime)} s` : "";
    rows.push([
      "Signing Window",
      <>
        Signed after block {record.refBlock.toString()}
        {refTime !== null && ` (${formatDateTime(new Date(refTime * 1000))})`}, sealed in block {record.blockNumber.toString()}
        {span}
      </>,
    ]);
    rows.push(["Device Key", <code key="k">{short(record.keyId!)}</code>]);
  } else {
    rows.push(["Signature", "None — imported records are not device-signed"]);
  }
  rows.push(["Carrier", "a carrier"]);
  rows.push(["Exact Hash", <code key="e">{short(record.exactHash)}</code>]);
  rows.push([
    "Ledger record",
    txUrl ? (
      <a key="t" href={txUrl} className="underline underline-offset-4" rel="noreferrer" target="_blank">
        {short(record.txHash)} on the public explorer
      </a>
    ) : (
      <code key="t">{short(record.txHash)}</code>
    ),
  ]);
  return (
    <section aria-labelledby="details-heading" className="flex flex-col gap-2">
      <h2 id="details-heading" className="font-semibold">
        Record details
      </h2>
      <dl className="grid gap-x-6 gap-y-2 rounded-md border border-line bg-surface p-4 text-sm sm:grid-cols-[max-content_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-medium">{k}</dt>
            <dd className="break-words text-muted">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        Registry {REGISTRY_ADDRESS ? <code>{REGISTRY_ADDRESS}</code> : "(not configured)"} on chain {network.chainId}.
      </p>
    </section>
  );
}

export function VerifyYourself() {
  const { network, REGISTRY_ADDRESS, rpcUrl } = env();
  return (
    <section aria-labelledby="diy-heading" className="flex flex-col gap-2 text-sm">
      <h2 id="diy-heading" className="font-semibold">
        Verify it yourself
      </h2>
      <p className="text-muted">
        This check uses only public data. You don&apos;t need to trust Proofshot to reproduce it.
      </p>
      <ol className="ml-5 list-decimal space-y-1 text-muted">
        <li>Get the image file you want to check.</li>
        <li>
          Run the open-source verifier:
          <pre className="mt-1 overflow-x-auto rounded bg-background p-2 text-xs">
            npx proofshot-verify photo.jpg --rpc {rpcUrl} --registry {REGISTRY_ADDRESS ?? "<registry address>"}
          </pre>
        </li>
        <li>
          Or by hand: compute the file&apos;s SHA-256 (Exact Hash) and its PDQ fingerprints (whole image and a 4×4
          grid), read the <code>CaptureSealed</code> events of the Registry on chain {network.chainId}, and compare
          them with the published thresholds.
        </li>
      </ol>
    </section>
  );
}
