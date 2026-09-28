import { randomBytes } from "node:crypto";
import type { Hex32 } from "@proofshot/fingerprint";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { registryRecords } from "../db/schema";
import { testDb } from "../test-db";
import { type EventSource, type RegistryEvent, syncRegistry, toEntry } from "./indexer";

const h = (): Hex32 => `0x${randomBytes(32).toString("hex")}`;

function sealed(blockNumber: bigint, logIndex = 0): RegistryEvent {
  return {
    eventName: "CaptureSealed",
    blockNumber,
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

function imported(blockNumber: bigint): RegistryEvent {
  return {
    eventName: "RecordImported",
    blockNumber,
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
  head = 10n;
  log: RegistryEvent[] = [];
  calls: [bigint, bigint][] = [];
  latestBlock = async () => this.head;
  events = async (from: bigint, to: bigint) => {
    this.calls.push([from, to]);
    return this.log.filter((e) => e.blockNumber >= from && e.blockNumber <= to);
  };
  blockTimestamp = async (n: bigint) => 1_790_000_000 + Number(n);
}

let db: Db;
let chain: FakeChain;
beforeEach(async () => {
  db = await testDb();
  chain = new FakeChain();
});

describe("syncRegistry", () => {
  it("indexes sealed and imported events in bounded chunks from the deploy block", async () => {
    chain.log = [sealed(11n), imported(13n), sealed(22n, 3)];
    chain.head = 23n;
    const added = await syncRegistry(db, chain);
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

  it("resumes after the last indexed block and is idempotent", async () => {
    chain.log = [sealed(11n)];
    chain.head = 12n;
    await syncRegistry(db, chain);
    chain.calls = [];
    expect(await syncRegistry(db, chain)).toHaveLength(0);
    expect(chain.calls).toEqual([]);

    chain.log.push(sealed(14n));
    chain.head = 15n;
    expect(await syncRegistry(db, chain)).toHaveLength(1);
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
});
