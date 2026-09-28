import { encodeAbiParameters, sha256, type Hex } from "viem";

/** Mirrors `CaptureRecord` in contracts/src. Field order is the ABI encoding order — do not reorder. */
export interface CaptureRecord {
  exactHash: Hex;
  pHash: Hex;
  tiles: readonly Hex[];
  width: number;
  height: number;
  locCommit: Hex;
  deviceTime: bigint;
  claimRef: Hex;
  carrierId: Hex;
  refBlock: bigint;
}

export const captureRecordAbi = {
  type: "tuple",
  components: [
    { name: "exactHash", type: "bytes32" },
    { name: "pHash", type: "bytes32" },
    { name: "tiles", type: "bytes32[16]" },
    { name: "width", type: "uint32" },
    { name: "height", type: "uint32" },
    { name: "locCommit", type: "bytes32" },
    { name: "deviceTime", type: "uint64" },
    { name: "claimRef", type: "bytes32" },
    { name: "carrierId", type: "bytes32" },
    { name: "refBlock", type: "uint64" },
  ],
} as const;

/** The 32-byte WebAuthn challenge a Device Key signs for a Seal: sha256(abi.encode(record)). */
export function sealChallenge(record: CaptureRecord): Hex {
  if (record.tiles.length !== 16) throw new Error("CaptureRecord needs exactly 16 tiles");
  return sha256(encodeAbiParameters([captureRecordAbi], [{ ...record, tiles: record.tiles as readonly Hex[] } as never]));
}
