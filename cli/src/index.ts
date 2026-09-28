#!/usr/bin/env node
/**
 * proofshot-verify — reproduce a Proofshot Verdict from public data only (FR-10).
 *
 *   proofshot-verify <image> --rpc <url> --registry <address> [--from-block <n>] [--range <n>] [--json]
 *
 * Fingerprints the image locally (SHA-256 + PDQ, same code as the Public Verifier), reads the Registry's events
 * from the chain, and applies the published Verdict rules.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { DEFAULT_THRESHOLDS, type Verdict, computeVerdict } from "@proofshot/fingerprint";
import { fingerprintFile, setPdqWasmPath } from "@proofshot/fingerprint/node";
import { createPublicClient, http, type Hex } from "viem";
import { readRegistry } from "./registry";

// The published bundle ships pdq.wasm next to itself; running from source uses the package's copy.
const bundledWasm = join(dirname(fileURLToPath(import.meta.url)), "pdq.wasm");
if (existsSync(bundledWasm)) setPdqWasmPath(bundledWasm);

const USAGE = "usage: proofshot-verify <image> --rpc <url> --registry <address> [--from-block <n>] [--range <n>] [--json]";

export interface CliResult {
  verdict: Verdict["kind"];
  alterationCheck: string | null;
  alteredTiles: number[];
  distance: number | null;
  matched: { kind: string; exactHash: string; txHash: string; blockNumber: string; sealedAt: string | null } | null;
  submitted: { exactHash: string; width: number; height: number };
  registry: { address: string; chainId: number; entries: number };
  thresholds: typeof DEFAULT_THRESHOLDS;
}

export async function run(argv: string[]): Promise<CliResult> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      rpc: { type: "string" },
      registry: { type: "string" },
      "from-block": { type: "string", default: "0" },
      range: { type: "string", default: "1000" },
      json: { type: "boolean", default: false },
      quiet: { type: "boolean", default: false },
    },
  });
  const image = positionals[0];
  if (!image || !values.rpc || !values.registry || !/^0x[0-9a-fA-F]{40}$/.test(values.registry)) throw new Error(USAGE);

  const client = createPublicClient({ transport: http(values.rpc, { retryCount: 3 }) });
  const [fp, chainId] = await Promise.all([fingerprintFile(await readFile(image)), client.getChainId()]);
  const entries = await readRegistry(client, values.registry as Hex, BigInt(values["from-block"]), BigInt(values.range));
  const v = computeVerdict(fp, entries, DEFAULT_THRESHOLDS);

  let matched: CliResult["matched"] = null;
  if ("record" in v) {
    const block = await client.getBlock({ blockNumber: v.record.blockNumber }).catch(() => null);
    matched = {
      kind: v.record.kind,
      exactHash: v.record.exactHash,
      txHash: v.record.txHash,
      blockNumber: v.record.blockNumber.toString(),
      sealedAt: block ? new Date(Number(block.timestamp) * 1000).toISOString() : null,
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
  }
  if (r.verdict === "no-record") lines.push("No Record means the image was not sealed with Proofshot. It does not mean the image is fake.");
  lines.push(`Checked against ${r.registry.entries} Registry entries at ${r.registry.address} on chain ${r.registry.chainId}.`);
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && /proofshot-verify|cli[/\\](src|dist)[/\\]index\.[jt]s$/.test(process.argv[1]);
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((r) => console.log(process.argv.includes("--json") ? JSON.stringify(r, null, 2) : describe(r)))
    .catch((e: Error) => {
      console.error(e.message);
      process.exitCode = 2;
    });
}
