import type { RegistryEntry } from "@proofshot/fingerprint";
import QRCode from "qrcode";
import { CopyButton } from "@/components/copy-button";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { keyRevocation } from "@/server/registry";
import { blockTime } from "@/server/registry/chain-source";

/** Full values, never shortened: a receipt is audit evidence, and a printed "0x82ab…ddf4a6" can't be checked. */
const Hash = ({ value }: { value: string }) => <code className="break-all font-mono">{value}</code>;

/** Only on paper: where this receipt lives, as a code and a URL, so a printed copy leads back to the live page. */
export async function PrintedReceiptUrl({ path }: { path: string }) {
  const url = new URL(path, env().APP_URL).toString();
  const qr = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return (
    <div className="hidden items-center gap-3 print:flex">
      <div className="w-20 shrink-0" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={`QR code for ${url}`} />
      <p className="text-xs">
        This receipt online: <span className="break-all font-mono">{url}</span>
      </p>
    </div>
  );
}

/** Seconds between the referenced block and the sealing block; sub-second on Monad, so never "0 s". */
export function windowLabel(seconds: number): string {
  return seconds < 1 ? "under 1 s" : `${seconds} s`;
}

type Row = [string, React.ReactNode];

function Rows({ rows, technical = false }: { rows: Row[]; technical?: boolean }) {
  return (
    <dl
      className={`grid gap-x-6 rounded-md border border-line bg-surface p-4 sm:grid-cols-[max-content_1fr] ${
        technical ? "gap-y-2 text-xs" : "gap-y-3 text-sm"
      }`}
    >
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className={technical ? "font-medium text-muted" : "font-medium"}>{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A Registry entry as a document: a summary a claims handler reads, then the technical record a third party needs to
 * re-check it against the public registry.
 */
export async function ReceiptDetails({ record }: { record: RegistryEntry }) {
  const { network, REGISTRY_ADDRESS } = env();
  const sealedAt = new Date(record.blockTimestamp * 1000);
  const refTime = record.refBlock !== undefined ? await blockTime(record.refBlock) : null;
  const txUrl = network.explorerUrl ? `${network.explorerUrl}/tx/${record.txHash}` : null;
  const sealed = record.kind === "sealed" && record.refBlock !== undefined;

  const summary: Row[] = [[sealed ? "Sealed" : "Imported", formatDateTime(sealedAt)]];
  const technical: Row[] = [];
  if (sealed) {
    summary.push([
      "Signing Window",
      refTime === null
        ? "Signed at most 100 blocks (about 30 s) before it was sealed"
        : record.blockTimestamp - refTime < 1
          ? "Signed less than 1 s before it was sealed"
          : `Signed at most ${windowLabel(record.blockTimestamp - refTime)} before it was sealed`,
    ]);
    // A revoked key is a signal (e.g. a lost phone or a compromised relayer): Seals made before still stand, but a
    // reader must be told.
    const revoked = await keyRevocation(record.keyId!);
    summary.push([
      "Key status",
      revoked ? (
        <strong key="r" className="font-semibold">
          This Device Key was revoked in block {revoked.atBlock.toString()} ({formatDateTime(revoked.at)}), after this
          photo was sealed. Revoking stops a key from sealing anything new; ask the carrier why it was revoked before
          relying on this Seal.
        </strong>
      ) : (
        "Not revoked"
      ),
    ]);
    technical.push(["Device Key", <Hash key="k" value={record.keyId!} />]);
    technical.push(["Blocks", `Signed after block ${record.refBlock!.toString()}, sealed in block ${record.blockNumber.toString()}`]);
  } else {
    summary.push(["Signature", "None — imported records are not device-signed"]);
  }
  summary.push(["Carrier", "a carrier"]);
  technical.push(["Exact Hash", <Hash key="e" value={record.exactHash} />]);
  technical.push([
    "Ledger record",
    txUrl ? (
      <a key="t" href={txUrl} className="underline underline-offset-4" rel="noreferrer" target="_blank">
        <Hash value={record.txHash} /> <span className="print:hidden">on the public explorer</span>
      </a>
    ) : (
      <Hash key="t" value={record.txHash} />
    ),
  ]);
  technical.push(["Registry", REGISTRY_ADDRESS ? <Hash key="g" value={`${REGISTRY_ADDRESS} on chain ${network.chainId}`} /> : "(not configured)"]);

  return (
    <>
      <section aria-labelledby="details-heading" className="flex flex-col gap-2">
        <h2 id="details-heading" className="font-semibold">
          Summary
        </h2>
        <Rows rows={summary} />
      </section>
      <section aria-labelledby="technical-heading" className="flex flex-col gap-2">
        <h2 id="technical-heading" className="font-semibold">
          Technical record
        </h2>
        <p className="text-xs text-muted">What anyone needs to re-check this against the public registry. Full values, never shortened.</p>
        <Rows rows={technical} technical />
      </section>
    </>
  );
}

/** For the technically minded: collapsed so it doesn't bury the result for everyone else. */
export function VerifyYourself() {
  // The public RPC, never the app's own RPC_URL: a provider URL often carries an API key.
  const { network, REGISTRY_ADDRESS, publicRpcUrl } = env();
  const command = `pnpm install\npnpm --filter proofshot-verify start ./photo.jpg --rpc ${publicRpcUrl} --registry ${REGISTRY_ADDRESS ?? "<registry address>"}`;
  return (
    <details className="group rounded-md border border-line bg-surface text-sm print:hidden">
      <summary className="flex min-h-11 items-center justify-between gap-3 px-4 py-2">
        <h2 id="diy-heading" className="font-semibold">
          Verify it yourself
        </h2>
        <span className="text-muted group-open:hidden">Uses only public data</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-line p-4">
        <p className="text-muted">This check uses only public data. You don&apos;t need to trust Proofshot to reproduce it.</p>
        <ol className="ml-5 list-decimal space-y-2 text-muted">
          <li>Get the image file you want to check.</li>
          <li>
            Run the open-source verifier from the Proofshot repository (Node 22 and pnpm):
            <div className="mt-1 flex flex-col gap-2 rounded bg-background p-2">
              {/* One line per command, scrolled rather than broken mid-word. */}
              <pre className="overflow-x-auto whitespace-pre font-mono text-xs text-foreground">{command}</pre>
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
      </div>
    </details>
  );
}
