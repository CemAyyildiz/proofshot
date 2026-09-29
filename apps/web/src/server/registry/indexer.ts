import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { indexerState, registryRecords } from "../db/schema";

/** A Registry event, already decoded. */
export type RegistryEvent =
  | {
      eventName: "CaptureSealed";
      blockNumber: bigint;
      txHash: Hex32;
      logIndex: number;
      args: {
        exactHash: Hex32;
        keyId: Hex32;
        carrierId: Hex32;
        pHash: Hex32;
        tiles: readonly Hex32[];
        width: number;
        height: number;
        locCommit: Hex32;
        claimRef: Hex32;
        deviceTime: bigint;
        refBlock: bigint;
      };
    }
  | {
      eventName: "RecordImported";
      blockNumber: bigint;
      txHash: Hex32;
      logIndex: number;
      args: { exactHash: Hex32; carrierId: Hex32; pHash: Hex32; tiles: readonly Hex32[]; width: number; height: number };
    };

/** Where events come from: the chain in production, fixtures in tests. */
export interface EventSource {
  chainId: number;
  registry: string;
  deployBlock: bigint;
  maxRange: bigint;
  latestBlock(): Promise<bigint>;
  events(fromBlock: bigint, toBlock: bigint): Promise<RegistryEvent[]>;
  blockTimestamp(blockNumber: bigint): Promise<number>;
}

type Row = typeof registryRecords.$inferInsert;

function toRow(e: RegistryEvent, chainId: number, blockTimestamp: number): Row {
  const common = {
    chainId,
    exactHash: e.args.exactHash.toLowerCase(),
    pHash: e.args.pHash.toLowerCase(),
    tiles: e.args.tiles.map((t) => t.toLowerCase()),
    width: e.args.width,
    height: e.args.height,
    carrierId: e.args.carrierId.toLowerCase(),
    blockNumber: e.blockNumber,
    blockTimestamp,
    txHash: e.txHash.toLowerCase(),
    logIndex: e.logIndex,
  };
  if (e.eventName === "RecordImported") return { ...common, kind: "imported" };
  return {
    ...common,
    kind: "sealed",
    keyId: e.args.keyId.toLowerCase(),
    claimRef: e.args.claimRef.toLowerCase(),
    refBlock: e.args.refBlock,
    deviceTime: e.args.deviceTime,
    locCommit: e.args.locCommit.toLowerCase(),
  };
}

export function toEntry(r: typeof registryRecords.$inferSelect): RegistryEntry {
  return {
    kind: r.kind,
    exactHash: r.exactHash as Hex32,
    pHash: r.pHash as Hex32,
    tiles: r.tiles as Hex32[],
    width: r.width,
    height: r.height,
    carrierId: r.carrierId as Hex32,
    blockNumber: r.blockNumber,
    txHash: r.txHash as Hex32,
    blockTimestamp: r.blockTimestamp,
    ...(r.kind === "sealed"
      ? {
          keyId: r.keyId as Hex32,
          claimRef: r.claimRef as Hex32,
          refBlock: r.refBlock ?? undefined,
          deviceTime: r.deviceTime ?? undefined,
          locCommit: r.locCommit as Hex32,
        }
      : {}),
  };
}

/**
 * Indexes Registry events from the last indexed block up to the chain head, in `maxRange` chunks. Idempotent:
 * re-running over indexed blocks inserts nothing new. Returns the rows added.
 */
export async function syncRegistry(db: Db, source: EventSource): Promise<Row[]> {
  const id = `${source.chainId}:${source.registry.toLowerCase()}`;
  const [state] = await db.select().from(indexerState).where(eq(indexerState.id, id));
  let from = state ? state.lastBlock + 1n : source.deployBlock;
  const head = await source.latestBlock();
  const added: Row[] = [];

  let range = source.maxRange;
  while (from <= head) {
    const to = from + range - 1n < head ? from + range - 1n : head;
    let events: RegistryEvent[];
    try {
      events = await source.events(from, to);
    } catch (err) {
      // RPCs cap eth_getLogs ranges differently; shrink until this one accepts, down to a single block.
      if (range > 1n) {
        range = range / 2n;
        continue;
      }
      throw err;
    }
    const timestamps = new Map<bigint, number>();
    for (const e of events) if (!timestamps.has(e.blockNumber)) timestamps.set(e.blockNumber, await source.blockTimestamp(e.blockNumber));
    const rows = events.map((e) => toRow(e, source.chainId, timestamps.get(e.blockNumber)!));

    await db.transaction(async (tx) => {
      if (rows.length) added.push(...(await tx.insert(registryRecords).values(rows).onConflictDoNothing().returning()));
      await tx
        .insert(indexerState)
        .values({ id, lastBlock: to })
        .onConflictDoUpdate({ target: indexerState.id, set: { lastBlock: to, updatedAt: new Date() } });
    });
    from = to + 1n;
  }
  return added;
}
