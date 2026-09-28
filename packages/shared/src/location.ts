import { encodeAbiParameters, keccak256, type Hex } from "viem";

export const NO_LOCATION: Hex = `0x${"0".repeat(64)}`;

/** Micro-degrees; ~0.1 m precision, and integers so the commitment is reproducible from disclosed values. */
export const toMicroDegrees = (deg: number) => BigInt(Math.round(deg * 1e6));

/**
 * Location Commitment: keccak256(abi.encode(int64 latE6, int64 lonE6, bytes32 salt)). Reveals nothing
 * without the salt; disclosing (lat, lon, salt) lets anyone check it against the Capture Record.
 */
export function locationCommitment(lat: number, lon: number, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "int64" }, { type: "int64" }, { type: "bytes32" }], [toMicroDegrees(lat), toMicroDegrees(lon), salt]),
  );
}
