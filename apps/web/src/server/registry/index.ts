import "server-only";
import type { RegistryEntry } from "@proofshot/fingerprint";
import { eq } from "drizzle-orm";
import { env } from "@/lib/env";
import { getDb } from "../db";
import { registryRecords } from "../db/schema";
import { processSingleton } from "../singleton";
import { chainEventSource } from "./chain-source";
import { syncRegistry, toEntry } from "./indexer";

/** The Registry could not be read. Callers must say so rather than return a Verdict from stale data. */
export class RegistryUnavailable extends Error {
  override name = "RegistryUnavailable";
}

/** Minimum gap between chain syncs; verifications within it reuse the in-memory index. */
const SYNC_INTERVAL_MS = 1_000;

interface Index {
  entries: RegistryEntry[];
  loaded: boolean;
  lastSync: number;
  inflight?: Promise<void>;
}

const index = () => processSingleton<Index>("registry-index", () => ({ entries: [], loaded: false, lastSync: 0 }));

/**
 * Every Registry entry on the configured chain, synced from events at most `SYNC_INTERVAL_MS` ago. Held in memory:
 * at the hackathon's scale (≤ 10,000 entries, NFR-2) a linear Hamming scan is well under a millisecond per entry.
 */
export async function registryEntries(): Promise<RegistryEntry[]> {
  const idx = index();
  if (Date.now() - idx.lastSync >= SYNC_INTERVAL_MS) {
    idx.inflight ??= (async () => {
      try {
        const db = await getDb();
        if (!idx.loaded) {
          const rows = await db.select().from(registryRecords).where(eq(registryRecords.chainId, env().network.chainId));
          idx.entries = rows.map(toEntry);
          idx.loaded = true;
        }
        const source = chainEventSource();
        if (source) {
          const added = await syncRegistry(db, source);
          if (added.length) idx.entries = [...idx.entries, ...added.map((r) => toEntry(r as typeof registryRecords.$inferSelect))];
        }
        idx.lastSync = Date.now();
      } catch (err) {
        console.error("[registry] sync failed", err);
        throw new RegistryUnavailable("The public registry is temporarily unreachable.");
      } finally {
        idx.inflight = undefined;
      }
    })();
    await idx.inflight;
  }
  return idx.entries;
}

/** The sealed Registry entry for an Exact Hash, if any (forces a sync first). */
export async function findSealedOnchain(exactHash: string) {
  const e = (await registryEntries()).find((r) => r.kind === "sealed" && r.exactHash === exactHash.toLowerCase());
  return e && e.claimRef && e.keyId ? { txHash: e.txHash, blockNumber: e.blockNumber, claimRef: e.claimRef, keyId: e.keyId } : null;
}
