import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { registryAbi } from "@proofshot/shared";
import type { Hex, PublicClient } from "viem";

export interface RegistryLog {
  entries: RegistryEntry[];
  /** Device Key ID (lowercase) → block from which it can no longer seal. Seals made before stay valid. */
  revocations: Map<string, bigint>;
}

export interface ReadOptions {
  /** Ranges read at the same time. Public RPCs limit requests per second; 4 stays under Monad's. */
  concurrency?: number;
  /** Called after each range with the number of blocks read so far and the total. */
  onProgress?: (done: bigint, total: bigint) => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every Capture Record and Imported Record of a Registry, plus every Device Key revocation, read straight from chain
 * events — no Proofshot API. Block timestamps are filled in lazily by the caller for the matched record only.
 *
 * Public RPCs cap the block range of one log query, so a Registry's history is read as many ranges, several at a
 * time. The first range finds a size the RPC accepts.
 */
export async function readRegistry(client: PublicClient, registry: Hex, fromBlock: bigint, range: bigint, opts: ReadOptions = {}): Promise<RegistryLog> {
  const head = await client.getBlockNumber();
  const entries: RegistryEntry[] = [];
  const revocations = new Map<string, bigint>();
  if (fromBlock > head) return { entries, revocations };
  const read = (from: bigint, to: bigint) => client.getContractEvents({ address: registry, abi: registryAbi, fromBlock: from, toBlock: to, strict: true });
  type Logs = Awaited<ReturnType<typeof read>>;
  const end = (from: bigint, step: bigint) => (from + step - 1n < head ? from + step - 1n : head);

  // The first range settles the step. Public RPCs differ widely (Monad's serve 100, 1,000 or 10,000 blocks per
  // query), so step down through those sizes before halving.
  let step = range;
  let first: Logs;
  for (;;) {
    try {
      first = await read(fromBlock, end(fromBlock, step));
      break;
    } catch (e) {
      if (step <= 1n) throw e;
      step = step > 1_000n ? 1_000n : step > 100n ? 100n : step / 2n;
    }
  }

  const starts: bigint[] = [];
  for (let from = fromBlock + step; from <= head; from += step) starts.push(from);
  const chunks: Logs[] = new Array(starts.length);
  const total = head - fromBlock + 1n;
  let done = end(fromBlock, step) - fromBlock + 1n;
  opts.onProgress?.(done, total);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < starts.length; i = next++) {
      const from = starts[i]!;
      const to = end(from, step);
      // A refused request this late is a rate limit or a blip, not the range: wait and ask again.
      for (let attempt = 0; ; attempt++) {
        try {
          chunks[i] = await read(from, to);
          break;
        } catch (e) {
          if (attempt >= 5) throw e;
          await sleep(300 * 2 ** attempt);
        }
      }
      done += to - from + 1n;
      opts.onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 4, starts.length)) }, worker));

  // In chain order, whatever order the ranges came back in.
  for (const logs of [first, ...chunks]) {
    for (const l of logs) {
      if (l.eventName === "DeviceKeyRevoked") {
        const a = l.args as { keyId: string; atBlock: bigint };
        revocations.set(a.keyId.toLowerCase(), a.atBlock);
        continue;
      }
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
  }
  return { entries, revocations };
}
