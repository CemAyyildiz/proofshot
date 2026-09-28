import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { registryAbi } from "@proofshot/shared";
import type { Hex, PublicClient } from "viem";

/**
 * Every Capture Record and Imported Record of a Registry, read straight from chain events — no Proofshot API.
 * Block timestamps are filled in lazily by the caller for the matched record only.
 */
export async function readRegistry(
  client: PublicClient,
  registry: Hex,
  fromBlock: bigint,
  range: bigint,
  onProgress?: (done: bigint, head: bigint) => void,
): Promise<RegistryEntry[]> {
  const head = await client.getBlockNumber();
  const entries: RegistryEntry[] = [];
  let from = fromBlock;
  let step = range;
  while (from <= head) {
    const to = from + step - 1n < head ? from + step - 1n : head;
    let logs;
    try {
      logs = await client.getContractEvents({ address: registry, abi: registryAbi, fromBlock: from, toBlock: to, strict: true });
    } catch (e) {
      if (step > 1n) {
        step = step / 2n; // RPC refused the range; retry smaller
        continue;
      }
      throw e;
    }
    for (const l of logs) {
      if (l.eventName !== "CaptureSealed" && l.eventName !== "RecordImported") continue;
      const a = l.args as Record<string, unknown>;
      const base = {
        exactHash: (a.exactHash as string).toLowerCase() as Hex32,
        pHash: (a.pHash as string).toLowerCase() as Hex32,
        tiles: (a.tiles as string[]).map((t) => t.toLowerCase() as Hex32),
        width: Number(a.width),
        height: Number(a.height),
        carrierId: (a.carrierId as string).toLowerCase() as Hex32,
        blockNumber: l.blockNumber,
        txHash: l.transactionHash as Hex32,
        blockTimestamp: 0,
      };
      entries.push(
        l.eventName === "CaptureSealed"
          ? {
              ...base,
              kind: "sealed",
              keyId: (a.keyId as string).toLowerCase() as Hex32,
              claimRef: (a.claimRef as string).toLowerCase() as Hex32,
              refBlock: a.refBlock as bigint,
              deviceTime: a.deviceTime as bigint,
              locCommit: (a.locCommit as string).toLowerCase() as Hex32,
            }
          : { ...base, kind: "imported" },
      );
    }
    onProgress?.(to, head);
    from = to + 1n;
  }
  return entries;
}
