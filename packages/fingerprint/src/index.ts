// PDQ, tile and Exact Hash fingerprinting lands in Story 1.2.

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
