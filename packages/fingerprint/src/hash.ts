/** 0x-prefixed hex string of a 32-byte value (bytes32 on the Registry). */
export type Hex32 = `0x${string}`;

export function toHex(bytes: Uint8Array): Hex32 {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex32;
}

/** SHA-256 of the original file bytes — the Exact Hash. Uses WebCrypto (browser and Node ≥ 20). */
export async function sha256(bytes: Uint8Array): Promise<Hex32> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return toHex(new Uint8Array(digest));
}

/** Bit distance between two equal-length fingerprints given as hex (with or without 0x). */
export function hamming(a: string, b: string): number {
  const x = a.replace(/^0x/, "");
  const y = b.replace(/^0x/, "");
  if (x.length !== y.length) throw new Error("fingerprints differ in length");
  let d = 0;
  for (let i = 0; i < x.length; i += 8) {
    let v = (parseInt(x.slice(i, i + 8), 16) ^ parseInt(y.slice(i, i + 8), 16)) >>> 0;
    while (v) {
      v &= v - 1;
      d++;
    }
  }
  return d;
}
