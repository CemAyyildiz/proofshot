import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { and, between, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { deviceKeyRevocations, indexerState, registryRecords } from "../db/schema";

/** A Registry event, already decoded. */
export type RegistryEvent =
  | {
      eventName: "CaptureSealed";
      blockNumber: bigint;
      blockHash: Hex32;
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
      blockHash: Hex32;
      txHash: Hex32;
      logIndex: number;
      args: { exactHash: Hex32; carrierId: Hex32; pHash: Hex32; tiles: readonly Hex32[]; width: number; height: number };
    }
  | {
      eventName: "DeviceKeyRevoked";
      blockNumber: bigint;
      blockHash: Hex32;
      txHash: Hex32;
      logIndex: number;
      args: { keyId: Hex32; atBlock: bigint };
    };

type RecordEvent = Exclude<RegistryEvent, { eventName: "DeviceKeyRevoked" }>;

/** Where events come from: the chain in production, fixtures in tests. */
export interface EventSource {
  chainId: number;
  registry: string;
  deployBlock: bigint;
  maxRange: bigint;
  /** Already-indexed blocks re-read on every sync (see NetworkConfig.rescanBlocks). */
  rescanBlocks: bigint;
  latestBlock(): Promise<bigint>;
  events(fromBlock: bigint, toBlock: bigint): Promise<RegistryEvent[]>;
  blockTimestamp(blockNumber: bigint): Promise<number>;
  /** Canonical hash of a block, or null if this node doesn't have it (yet). */
  blockHash(blockNumber: bigint): Promise<string | null>;
}

type Row = typeof registryRecords.$inferInsert;

function toRow(e: RecordEvent, chainId: number, blockTimestamp: number): Row {
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
    blockHash: e.blockHash.toLowerCase(),
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

/** What one sync changed: rows that appeared (or moved block) and records a reorg took off the chain. */
export interface SyncResult {
  added: Row[];
  removed: { exactHash: string; kind: "sealed" | "imported" }[];
}

const recordKey = (r: { kind: string; exactHash: string }) => `${r.kind}:${r.exactHash}`;

/**
 * Indexes Registry events up to the chain head in `maxRange` chunks, re-reading the last `rescanBlocks` already-indexed
 * blocks each time. Within a chunk, indexed rows are reconciled with a fresh read:
 * - a log that is new, or now sits in a different block, is (re)written;
 * - an indexed record missing from the fresh read is dropped only if its block's hash changed (a reorg). If the hash
 *   is unchanged, or the node doesn't have the block yet, the RPC merely lagged or omitted it, and the record stays.
 * Idempotent: re-running over unchanged blocks changes nothing.
 */
export async function syncRegistry(db: Db, source: EventSource): Promise<SyncResult> {
  const id = `${source.chainId}:${source.registry.toLowerCase()}`;
  const [state] = await db.select().from(indexerState).where(eq(indexerState.id, id));
  const resumeAt = state ? state.lastBlock + 1n - source.rescanBlocks : source.deployBlock;
  let from = resumeAt > source.deployBlock ? resumeAt : source.deployBlock;
  const head = await source.latestBlock();
  const result: SyncResult = { added: [], removed: [] };

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
    const revocations = events.filter((e) => e.eventName === "DeviceKeyRevoked");
    const fresh = events.filter((e): e is RecordEvent => e.eventName !== "DeviceKeyRevoked").map((e) => toRow(e, source.chainId, timestamps.get(e.blockNumber)!));
    const inRange = and(eq(registryRecords.chainId, source.chainId), between(registryRecords.blockNumber, from, to));
    const indexed = state && from <= state.lastBlock ? await db.select().from(registryRecords).where(inRange) : [];

    const freshKeys = new Map(fresh.map((r) => [recordKey(r), r]));
    const indexedKeys = new Map(indexed.map((r) => [recordKey(r), r]));
    const changed = fresh.filter((r) => {
      const was = indexedKeys.get(recordKey(r));
      return !was || was.txHash !== r.txHash || was.blockNumber !== r.blockNumber;
    });
    const reorged: typeof indexed = [];
    for (const r of indexed) {
      if (freshKeys.has(recordKey(r))) continue;
      const canonical = await source.blockHash(r.blockNumber);
      if (canonical !== null && r.blockHash !== null && canonical.toLowerCase() !== r.blockHash) reorged.push(r);
      else console.warn(`[indexer] RPC omitted ${r.kind} ${r.exactHash} in block ${r.blockNumber}; block unchanged, keeping it`);
    }

    await db.transaction(async (tx) => {
      for (const r of reorged) {
        await tx
          .delete(registryRecords)
          .where(and(eq(registryRecords.chainId, source.chainId), eq(registryRecords.exactHash, r.exactHash), eq(registryRecords.kind, r.kind)));
      }
      for (const r of revocations) {
        await tx
          .insert(deviceKeyRevocations)
          .values({
            chainId: source.chainId,
            keyId: r.args.keyId.toLowerCase(),
            atBlock: r.args.atBlock,
            blockTimestamp: timestamps.get(r.blockNumber)!,
            txHash: r.txHash.toLowerCase(),
          })
          .onConflictDoNothing();
      }
      if (changed.length) {
        await tx
          .insert(registryRecords)
          .values(changed)
          .onConflictDoUpdate({
            target: [registryRecords.chainId, registryRecords.exactHash, registryRecords.kind],
            set: {
              blockNumber: sql`excluded.block_number`,
              blockHash: sql`excluded.block_hash`,
              blockTimestamp: sql`excluded.block_timestamp`,
              txHash: sql`excluded.tx_hash`,
              logIndex: sql`excluded.log_index`,
            },
          });
      }
      if (!state || to > state.lastBlock) {
        await tx
          .insert(indexerState)
          .values({ id, lastBlock: to })
          .onConflictDoUpdate({ target: indexerState.id, set: { lastBlock: to, updatedAt: new Date() } });
      }
    });
    for (const r of reorged) console.warn(`[indexer] reorg removed ${r.kind} ${r.exactHash} (block ${r.blockNumber})`);
    result.added.push(...changed);
    result.removed.push(...reorged.map((r) => ({ exactHash: r.exactHash, kind: r.kind })));
    from = to + 1n;
  }
  return result;
}
