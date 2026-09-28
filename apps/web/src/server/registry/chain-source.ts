import "server-only";
import type { Hex32 } from "@proofshot/fingerprint";
import { registryAbi } from "@proofshot/shared";
import { createPublicClient, http, type Hex } from "viem";
import { env } from "@/lib/env";
import { processSingleton } from "../singleton";
import type { EventSource, RegistryEvent } from "./indexer";

export function chainEventSource(): EventSource | null {
  const e = env();
  if (!e.REGISTRY_ADDRESS) return null;
  const client = createPublicClient({ transport: http(e.rpcUrl, { retryCount: 2 }) });
  const address = e.REGISTRY_ADDRESS as Hex;
  return {
    chainId: e.network.chainId,
    registry: address,
    deployBlock: e.REGISTRY_DEPLOY_BLOCK,
    maxRange: e.LOGS_BLOCK_RANGE,
    latestBlock: () => client.getBlockNumber({ cacheTime: 0 }),
    async events(fromBlock, toBlock) {
      const logs = await client.getContractEvents({ address, abi: registryAbi, fromBlock, toBlock, strict: true });
      return logs
        .filter((l) => l.eventName === "CaptureSealed" || l.eventName === "RecordImported")
        .map((l) => ({ ...l, txHash: l.transactionHash as Hex32, logIndex: l.logIndex }) as unknown as RegistryEvent);
    },
    async blockTimestamp(blockNumber) {
      return Number((await client.getBlock({ blockNumber })).timestamp);
    },
  };
}

/** Timestamp of any block (for Signing Window lower bounds), cached for the process. Null if the RPC fails. */
export async function blockTime(blockNumber: bigint): Promise<number | null> {
  const cache = processSingleton("block-times", () => new Map<bigint, number>());
  const hit = cache.get(blockNumber);
  if (hit !== undefined) return hit;
  try {
    const t = Number((await createPublicClient({ transport: http(env().rpcUrl) }).getBlock({ blockNumber })).timestamp);
    cache.set(blockNumber, t);
    return t;
  } catch {
    return null;
  }
}
