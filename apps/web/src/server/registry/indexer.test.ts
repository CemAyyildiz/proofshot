import { randomBytes } from "node:crypto";
import type { Hex32 } from "@proofshot/fingerprint";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { deviceKeyRevocations, registryRecords } from "../db/schema";
import { testDb } from "../test-db";
import { type EventSource, type RegistryEvent, syncRegistry, toEntry } from "./indexer";

const h = (): Hex32 => `0x${randomBytes(32).toString("hex")}`;

/** Block hashes of the fake chain; `fork` bumps one to simulate a reorg. */
const forks = new Map<bigint, number>();
const blockHashOf = (n: bigint): Hex32 => `0x${n.toString(16).padStart(60, "0")}${(forks.get(n) ?? 0).toString(16).padStart(4, "0")}`;

function sealed(blockNumber: bigint, logIndex = 0): Extract<RegistryEvent, { eventName: "CaptureSealed" }> {
  return {
    eventName: "CaptureSealed",
    blockNumber,
    blockHash: blockHashOf(blockNumber),
    txHash: h(),
    logIndex,
    args: {
      exactHash: h(),
      keyId: h(),
      carrierId: h(),
      pHash: h(),
      tiles: Array.from({ length: 16 }, h),
      width: 4032,
      height: 3024,
      locCommit: h(),
      claimRef: h(),
      deviceTime: 1_790_000_000n,
      refBlock: blockNumber - 2n,
    },
  };
}

function imported(blockNumber: bigint): Extract<RegistryEvent, { eventName: "RecordImported" }> {
  return {
    eventName: "RecordImported",
    blockNumber,
    blockHash: blockHashOf(blockNumber),
    txHash: h(),
    logIndex: 0,
    args: { exactHash: h(), carrierId: h(), pHash: h(), tiles: Array.from({ length: 16 }, h), width: 1600, height: 1200 },
  };
}

class FakeChain implements EventSource {
  chainId = 31337;
  registry = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
  deployBlock = 10n;
  maxRange = 5n;
  rescanBlocks = 0n;
  head = 10n;
  log: RegistryEvent[] = [];
  calls: [bigint, bigint][] = [];
  latestBlock = async () => this.head;
  events = async (from: bigint, to: bigint) => {
    this.calls.push([from, to]);
    return this.log.filter((e) => e.blockNumber >= from && e.blockNumber <= to);
  };
  blockTimestamp = async (n: bigint) => 1_790_000_000 + Number(n);
  blockHash = async (n: bigint) => (n <= this.head ? blockHashOf(n) : null);
}

let db: Db;
let chain: FakeChain;
beforeEach(async () => {
  db = await testDb();
  chain = new FakeChain();
  forks.clear();
});

describe("syncRegistry", () => {
  it("indexes sealed and imported events in bounded chunks from the deploy block", async () => {
    chain.log = [sealed(11n), imported(13n), sealed(22n, 3)];
    chain.head = 23n;
    const { added } = await syncRegistry(db, chain);
    expect(added).toHaveLength(3);
    expect(chain.calls).toEqual([
      [10n, 14n],
      [15n, 19n],
      [20n, 23n],
    ]);
    const rows = await db.select().from(registryRecords);
    const s = rows.find((r) => r.blockNumber === 22n)!;
    expect(s).toMatchObject({ kind: "sealed", logIndex: 3, blockTimestamp: 1_790_000_022, width: 4032 });
    expect(s.tiles).toHaveLength(16);
    expect(rows.find((r) => r.kind === "imported")!.keyId).toBeNull();
  });

  it("halves the block range when the RPC refuses it", async () => {
    chain.maxRange = 40n;
    chain.head = 60n;
    chain.log = [sealed(15n), sealed(55n)];
    const inner = chain.events;
    chain.events = async (from, to) => {
      if (to - from + 1n > 10n) throw new Error("query exceeds max block range 10");
      return inner(from, to);
    };
    expect((await syncRegistry(db, chain)).added).toHaveLength(2);
    expect(chain.calls.every(([f, t]) => t - f + 1n <= 10n)).toBe(true);
  });

  it("resumes after the last indexed block and is idempotent", async () => {
    chain.log = [sealed(11n)];
    chain.head = 12n;
    await syncRegistry(db, chain);
    chain.calls = [];
    expect((await syncRegistry(db, chain)).added).toHaveLength(0);
    expect(chain.calls).toEqual([]);

    chain.log.push(sealed(14n));
    chain.head = 15n;
    expect((await syncRegistry(db, chain)).added).toHaveLength(1);
    expect(chain.calls).toEqual([[13n, 15n]]);
  });

  it("keeps an import and a later Seal of the same hash as separate records", async () => {
    const imp = imported(11n);
    const seal = sealed(12n);
    (seal.args as { exactHash: Hex32 }).exactHash = imp.args.exactHash;
    chain.log = [imp, seal];
    chain.head = 12n;
    await syncRegistry(db, chain);
    expect((await db.select().from(registryRecords)).map((r) => r.kind).sort()).toEqual(["imported", "sealed"]);
  });

  it("maps rows to Verdict-engine entries", async () => {
    chain.log = [sealed(11n)];
    chain.head = 11n;
    await syncRegistry(db, chain);
    const [row] = await db.select().from(registryRecords);
    const e = toEntry(row!);
    expect(e).toMatchObject({ kind: "sealed", blockNumber: 11n, refBlock: 9n, deviceTime: 1_790_000_000n });
    expect(e.exactHash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("indexes Device Key revocations alongside records, once", async () => {
    const keyId = h();
    const revoked: RegistryEvent = { eventName: "DeviceKeyRevoked", blockNumber: 12n, blockHash: blockHashOf(12n), txHash: h(), logIndex: 1, args: { keyId, atBlock: 12n } };
    chain.log = [sealed(11n), revoked];
    chain.head = 12n;
    const { added } = await syncRegistry(db, chain);
    expect(added).toHaveLength(1); // the revocation is not a record
    const rows = await db.select().from(deviceKeyRevocations);
    expect(rows).toEqual([expect.objectContaining({ keyId: keyId.toLowerCase(), atBlock: 12n, blockTimestamp: 1_790_000_012 })]);
    await syncRegistry(db, chain); // idempotent
    expect(await db.select().from(deviceKeyRevocations)).toHaveLength(1);
  });

  describe("with a re-scan window (testnet/mainnet)", () => {
    beforeEach(() => {
      chain.rescanBlocks = 4n;
    });

    it("picks up a log a lagging RPC node left out the first time", async () => {
      const late = sealed(12n);
      chain.log = [sealed(11n)];
      chain.head = 12n; // head from one node, logs from another that doesn't have block 12's log yet
      await syncRegistry(db, chain);
      chain.log.push(late);
      chain.head = 13n;
      const { added, removed } = await syncRegistry(db, chain);
      expect(added.map((r) => r.exactHash)).toEqual([late.args.exactHash]);
      expect(removed).toEqual([]);
      expect(await db.select().from(registryRecords)).toHaveLength(2);
    });

    it("keeps an indexed record the RPC omits when its block is unchanged", async () => {
      const kept = sealed(11n);
      chain.log = [kept];
      chain.head = 12n;
      await syncRegistry(db, chain);
      chain.log = [];
      const { removed } = await syncRegistry(db, chain);
      expect(removed).toEqual([]);
      expect((await db.select().from(registryRecords)).map((r) => r.exactHash)).toEqual([kept.args.exactHash.toLowerCase()]);
    });

    it("drops a record whose block was reorged away, and moves one re-included in a later block", async () => {
      const dropped = sealed(11n);
      const moved = sealed(12n);
      chain.log = [dropped, moved];
      chain.head = 12n;
      await syncRegistry(db, chain);

      // Blocks 11 and 12 are replaced: `dropped` is gone for good, `moved` lands in block 13.
      forks.set(11n, 1);
      forks.set(12n, 1);
      chain.log = [{ ...moved, blockNumber: 13n, blockHash: blockHashOf(13n) }];
      chain.head = 13n;
      const { added, removed } = await syncRegistry(db, chain);
      expect(removed).toEqual([{ exactHash: dropped.args.exactHash.toLowerCase(), kind: "sealed" }]);
      expect(added.map((r) => [r.exactHash, r.blockNumber])).toEqual([[moved.args.exactHash.toLowerCase(), 13n]]);
      const rows = await db.select().from(registryRecords);
      expect(rows.map((r) => [r.exactHash, r.blockNumber, r.blockHash])).toEqual([[moved.args.exactHash.toLowerCase(), 13n, blockHashOf(13n)]]);
    });

    it("changes nothing when re-reading unchanged blocks", async () => {
      chain.log = [sealed(11n), imported(12n)];
      chain.head = 12n;
      await syncRegistry(db, chain);
      chain.calls = [];
      expect(await syncRegistry(db, chain)).toEqual({ added: [], removed: [] });
      expect(chain.calls).toEqual([[10n, 12n]]); // the window, clamped to the deploy block
    });
  });
});
