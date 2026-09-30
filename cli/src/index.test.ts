import type { PublicClient } from "viem";
import { describe as suite, expect, it } from "vitest";
import { type CliResult, describe } from "./index";
import { readRegistry } from "./registry";

const hash = (n: number) => `0x${n.toString(16).padStart(64, "0")}` as const;

/** A chain whose logs are handed out per block range, refusing ranges wider than `maxRange` like public RPCs do. */
function fakeClient(logs: { blockNumber: bigint; eventName: string; args: Record<string, unknown> }[], head: bigint, maxRange = 10n) {
  return {
    getBlockNumber: async () => head,
    getContractEvents: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      if (toBlock - fromBlock + 1n > maxRange) throw new Error("block range too large");
      return logs.filter((l) => l.blockNumber >= fromBlock && l.blockNumber <= toBlock).map((l) => ({ ...l, transactionHash: hash(99) }));
    },
  } as unknown as PublicClient;
}

const sealedArgs = {
  exactHash: hash(1),
  keyId: hash(2).toUpperCase().replace("0X", "0x"),
  carrierId: hash(3),
  pHash: hash(4),
  tiles: Array.from({ length: 16 }, (_, i) => hash(10 + i)),
  width: 4032,
  height: 3024,
  locCommit: hash(0),
  claimRef: hash(5),
  deviceTime: 1_790_000_000n,
  refBlock: 40n,
};

suite("readRegistry", () => {
  it("reads records and Device Key revocations from events alone, narrowing the range when the RPC refuses it", async () => {
    const client = fakeClient(
      [
        { blockNumber: 42n, eventName: "CaptureSealed", args: sealedArgs },
        { blockNumber: 50n, eventName: "DeviceKeyRegistered", args: { keyId: hash(7), qx: hash(8), qy: hash(9) } },
        { blockNumber: 60n, eventName: "DeviceKeyRevoked", args: { keyId: sealedArgs.keyId, atBlock: 60n } },
      ],
      70n,
    );
    const { entries, revocations } = await readRegistry(client, "0x5FbDB2315678afecb367f032d93F642f64180aa3", 0n, 100n);
    expect(entries).toEqual([expect.objectContaining({ kind: "sealed", exactHash: hash(1), keyId: hash(2), refBlock: 40n, blockNumber: 42n })]);
    expect(revocations).toEqual(new Map([[hash(2), 60n]]));
  });
});

suite("describe", () => {
  const result: CliResult = {
    verdict: "original",
    alterationCheck: "passed",
    alteredTiles: [],
    distance: 0,
    matched: {
      kind: "sealed",
      exactHash: hash(1),
      txHash: hash(99),
      blockNumber: "42",
      sealedAt: "2026-09-30T08:00:00.000Z",
      signedAfterBlock: "40",
      keyId: hash(2),
      keyRevokedAtBlock: null,
    },
    submitted: { exactHash: hash(1), width: 4032, height: 3024 },
    registry: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", chainId: 10143, entries: 1 },
    thresholds: {} as CliResult["thresholds"],
  };

  it("prints the Signing Window and the Device Key of a Seal", () => {
    const text = describe(result);
    expect(text).toContain("Verdict: Original");
    expect(text).toContain("Signing Window: signed after block 40, sealed in block 42");
    expect(text).toContain(`Device Key: ${hash(2)}`);
    expect(text).not.toContain("revoked");
  });

  it("tells the reader when the Seal's Device Key was later revoked, as the receipt does", () => {
    const text = describe({ ...result, matched: { ...result.matched!, keyRevokedAtBlock: "60" } });
    expect(text).toContain("Key revoked in block 60, after this photo was sealed.");
    expect(text).toContain("ask the carrier why it was revoked before relying on this Seal");
  });
});
