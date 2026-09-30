import type { RegistryEntry } from "@proofshot/fingerprint";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { blockTime } from "@/server/registry/chain-source";

/** Full values, never shortened: a receipt is audit evidence, and a printed "0x82ab…ddf4a6" can't be checked. */
const Hash = ({ value }: { value: string }) => <code className="break-all">{value}</code>;

/** Only on paper: where this receipt lives, so a printed or PDF copy leads back to the live, re-checkable page. */
export function PrintedReceiptUrl({ path }: { path: string }) {
  const url = new URL(path, env().APP_URL).toString();
  return (
    <p className="hidden text-xs print:block">
      This receipt online: <span className="font-mono">{url}</span>
    </p>
  );
}

/** Seconds between the referenced block and the sealing block; sub-second on Monad, so never "0 s". */
export function windowLabel(seconds: number): string {
  return seconds < 1 ? "under 1 s" : `${seconds} s`;
}

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
    const span = refTime !== null ? ` — a window of ${windowLabel(Math.max(0, record.blockTimestamp - refTime))}` : "";
    rows.push([
      "Signing Window",
      <>
        Signed after block {record.refBlock.toString()}
        {refTime !== null && ` (${formatDateTime(new Date(refTime * 1000))})`}, sealed in block {record.blockNumber.toString()}
        {span}
      </>,
    ]);
    rows.push(["Device Key", <Hash key="k" value={record.keyId!} />]);
  } else {
    rows.push(["Signature", "None — imported records are not device-signed"]);
  }
  rows.push(["Carrier", "a carrier"]);
  rows.push(["Exact Hash", <Hash key="e" value={record.exactHash} />]);
  rows.push([
    "Ledger record",
    txUrl ? (
      <a key="t" href={txUrl} className="underline underline-offset-4" rel="noreferrer" target="_blank">
        <Hash value={record.txHash} /> <span className="print:hidden">on the public explorer</span>
      </a>
    ) : (
      <Hash key="t" value={record.txHash} />
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
  const command = `pnpm install\npnpm --filter proofshot-verify start ./photo.jpg --rpc ${rpcUrl} --registry ${REGISTRY_ADDRESS ?? "<registry address>"}`;
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
          Run the open-source verifier from the Proofshot repository (Node 22 and pnpm):
          <div className="mt-1 flex flex-col gap-2 rounded bg-background p-2">
            <pre className="whitespace-pre-wrap break-all font-mono text-xs text-foreground">{command}</pre>
            <CopyButton value={command} label="Copy command" />
          </div>
          It reads the Registry straight from the chain; no Proofshot server is involved.
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
