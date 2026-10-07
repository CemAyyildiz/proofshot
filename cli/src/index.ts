#!/usr/bin/env node
/**
 * proofshot-verify — reproduce a Proofshot Verdict from public data only (FR-10).
 *
 *   proofshot-verify <image> --rpc <url> --registry <address> [--from-block <n>] [--range <n>] [--concurrency <n>] [--json]
 *
 * Fingerprints the image locally (SHA-256 + PDQ, same code as the Public Verifier), reads the Registry's events
 * from the chain, and applies the published Verdict rules.
 *
 * `--from-block` defaults to the deploy block of a Registry this repository knows, else 0. Reading takes one request
 * per 100 blocks on a public RPC, so it grows with the Registry's age: an RPC that serves wider log ranges, with a
 * larger `--range`, is faster.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_THRESHOLDS, type Verdict, computeVerdict } from "@proofshot/fingerprint";
import { fingerprintFile, setPdqWasmPath } from "@proofshot/fingerprint/node";
import { knownDeployBlock } from "@proofshot/shared";
import { createPublicClient, http, type Hex } from "viem";
import { readRegistry } from "./registry";

// The published bundle ships pdq.wasm next to itself; running from source uses the package's copy.
const bundledWasm = join(dirname(fileURLToPath(import.meta.url)), "pdq.wasm");
if (existsSync(bundledWasm)) setPdqWasmPath(bundledWasm);

const USAGE = "usage: proofshot-verify <image> --rpc <url> --registry <address> [--from-block <n>] [--range <n>] [--concurrency <n>] [--json]";

export interface CliResult {
  verdict: Verdict["kind"];
  alterationCheck: string | null;
  alteredTiles: number[];
  distance: number | null;
  matched: {
    kind: string;
    exactHash: string;
    txHash: string;
    blockNumber: string;
    sealedAt: string | null;
    /** Seals only: the Signing Window starts after this block (the device signed a record naming it). */
    signedAfterBlock: string | null;
    /** Seals only: the Device Key that signed. */
    keyId: string | null;
    /** Seals only: the block from which that key was revoked, if it was. The Seal still stands; the reader should ask why. */
    keyRevokedAtBlock: string | null;
  } | null;
  submitted: { exactHash: string; width: number; height: number };
  registry: { address: string; chainId: number; entries: number };
  thresholds: typeof DEFAULT_THRESHOLDS;
}

export async function run(argv: string[], onProgress?: (done: bigint, total: bigint) => void): Promise<CliResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      rpc: { type: "string" },
      registry: { type: "string" },
      "from-block": { type: "string" },
      range: { type: "string", default: "1000" },
      concurrency: { type: "string", default: "4" },
      json: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
    },
  });
  const image = positionals[0];
  if (!image || !values.rpc || !values.registry || !/^0x[0-9a-fA-F]{40}$/.test(values.registry)) throw new Error(USAGE);

  const client = createPublicClient({ transport: http(values.rpc, { retryCount: 3 }) });
  // `pnpm --filter proofshot-verify start photo.jpg` runs inside cli/; resolve the path from where the user typed it.
  const imagePath = resolve(process.env.INIT_CWD ?? process.cwd(), image);
  const [fp, chainId] = await Promise.all([fingerprintFile(await readFile(imagePath)), client.getChainId()]);
  const fromBlock = values["from-block"] !== undefined ? BigInt(values["from-block"]) : (knownDeployBlock(chainId, values.registry) ?? 0n);
  const { entries, revocations } = await readRegistry(client, values.registry as Hex, fromBlock, BigInt(values.range), {
    concurrency: Number(values.concurrency),
    onProgress,
  });
  const v = computeVerdict(fp, entries, DEFAULT_THRESHOLDS);

  let matched: CliResult["matched"] = null;
  if ("record" in v) {
    const r = v.record;
    const block = await client.getBlock({ blockNumber: r.blockNumber }).catch(() => null);
    const keyId = r.kind === "sealed" ? (r.keyId ?? null) : null;
    const revokedAt = keyId ? revocations.get(keyId) : undefined;
    matched = {
      kind: r.kind,
      exactHash: r.exactHash,
      txHash: r.txHash,
      blockNumber: r.blockNumber.toString(),
      sealedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
      signedAfterBlock: r.refBlock?.toString() ?? null,
      keyId,
      keyRevokedAtBlock: revokedAt === undefined ? null : revokedAt.toString(),
    };
  }
  return {
    verdict: v.kind,
    alterationCheck: "alterationCheck" in v ? v.alterationCheck : null,
    alteredTiles: v.kind === "altered" ? v.alteredTiles : [],
    distance: "distance" in v ? v.distance : null,
    matched,
    submitted: { exactHash: fp.exactHash, width: fp.width, height: fp.height },
    registry: { address: values.registry, chainId, entries: entries.length },
    thresholds: DEFAULT_THRESHOLDS,
  };
}

const TITLES = { original: "Original", "derived-copy": "Derived Copy", altered: "Altered", "no-record": "No Record" } as const;

export function describe(r: CliResult): string {
  const lines = [`Verdict: ${TITLES[r.verdict]}${r.matched?.kind === "imported" ? " (imported, unsigned)" : ""}`];
  if (r.alterationCheck === "unavailable") lines.push("Cropped copy — alteration check not possible. Request the original from the sender.");
  if (r.verdict === "altered") lines.push(`Changed regions (0-15, row-major 4x4): ${r.alteredTiles.join(", ")}`);
  if (r.matched) {
    lines.push(`Matched record: ${r.matched.exactHash}`);
    lines.push(`  ${r.matched.kind === "sealed" ? "sealed" : "imported"} ${r.matched.sealedAt ?? "(time unavailable)"} in block ${r.matched.blockNumber}, tx ${r.matched.txHash}`);
    if (r.matched.signedAfterBlock) lines.push(`  Signing Window: signed after block ${r.matched.signedAfterBlock}, sealed in block ${r.matched.blockNumber}`);
    if (r.matched.keyId) lines.push(`  Device Key: ${r.matched.keyId}`);
    if (r.matched.keyRevokedAtBlock) {
      lines.push(
        `  Key revoked in block ${r.matched.keyRevokedAtBlock}, after this photo was sealed. Revoking stops a key from sealing anything new; ask the carrier why it was revoked before relying on this Seal.`,
      );
    }
  }
  if (r.verdict === "no-record") lines.push("No Record means the image was not sealed with Proofshot. It does not mean the image is fake.");
  lines.push(`Checked against ${r.registry.entries} Registry entries at ${r.registry.address} on chain ${r.registry.chainId}.`);
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && /proofshot-verify|cli[/\\](src|dist)[/\\]index\.[jt]s$/.test(process.argv[1]);
if (invokedDirectly) {
  // Progress goes to stderr, and only to a terminal: piped output and --json stay clean.
  const live = process.stderr.isTTY && !process.argv.includes("--quiet");
  const progress = live
    ? (done: bigint, total: bigint) => process.stderr.write(`\rReading the Registry from the chain… ${Number((done * 100n) / total)}% of ${total} blocks`)
    : undefined;
  run(process.argv.slice(2), progress)
    .then((r) => {
      if (live) process.stderr.write("\n");
      console.log(process.argv.includes("--json") ? JSON.stringify(r, null, 2) : describe(r));
    })
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 2;
    });
}
