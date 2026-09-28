/**
 * WebAuthn helpers shared by the browser (assertion capture), the server (relay) and fixture tooling.
 * They turn a raw assertion into the shape OpenZeppelin's `WebAuthn.verify` expects onchain.
 */

/** secp256r1 group order; OZ `P256.verify` rejects s > N/2 to prevent malleability. */
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

export type Hex = `0x${string}`;

/** Mirrors `WebAuthn.WebAuthnAuth` in OpenZeppelin 5.6. */
export interface WebAuthnAuth {
  r: Hex;
  s: Hex;
  challengeIndex: number;
  typeIndex: number;
  authenticatorData: Hex;
  clientDataJSON: string;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length % 2) throw new Error("odd-length hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const toBig = (b: Uint8Array) => BigInt(bytesToHex(b));
const to32 = (n: bigint): Hex => `0x${n.toString(16).padStart(64, "0")}`;

/** ASN.1 DER ECDSA signature (what authenticators return) → 32-byte r and low-s. */
export function derToRawLowS(der: Uint8Array): { r: Hex; s: Hex } {
  let i = 0;
  const expect = (tag: number) => {
    if (der[i++] !== tag) throw new Error("malformed DER signature");
  };
  const readInt = () => {
    expect(0x02);
    const len = der[i++]!;
    const v = der.subarray(i, i + len);
    i += len;
    return toBig(v);
  };
  expect(0x30);
  const seqLen = der[i++]!;
  if (seqLen & 0x80 || seqLen !== der.length - 2) throw new Error("malformed DER signature");
  const r = readInt();
  let s = readInt();
  if (i !== der.length || r === 0n || s === 0n || r >= P256_N || s >= P256_N) throw new Error("malformed DER signature");
  if (s > P256_N / 2n) s = P256_N - s;
  return { r: to32(r), s: to32(s) };
}

/**
 * Uncompressed P-256 public key from the SPKI DER returned by `AuthenticatorAttestationResponse.getPublicKey()`.
 * P-256 SPKI is a fixed 91-byte structure ending in 0x04 || X || Y.
 */
export function spkiToXY(spki: Uint8Array): { qx: Hex; qy: Hex } {
  if (spki.length !== 91 || spki[26] !== 0x04) throw new Error("not an uncompressed P-256 SPKI key");
  return { qx: bytesToHex(spki.subarray(27, 59)), qy: bytesToHex(spki.subarray(59, 91)) };
}

/** Build the onchain auth struct from the raw pieces of an `AuthenticatorAssertionResponse`. */
export function toWebAuthnAuth(parts: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): WebAuthnAuth {
  const clientDataJSON = new TextDecoder().decode(parts.clientDataJSON);
  const typeIndex = clientDataJSON.indexOf('"type":"webauthn.get"');
  const challengeIndex = clientDataJSON.indexOf('"challenge":"');
  if (typeIndex < 0 || challengeIndex < 0) throw new Error("clientDataJSON is not a webauthn.get assertion");
  // Indices are byte offsets onchain; clientDataJSON is ASCII up to these fields in practice, but be exact.
  const enc = new TextEncoder();
  return {
    ...derToRawLowS(parts.signature),
    typeIndex: enc.encode(clientDataJSON.slice(0, typeIndex)).length,
    challengeIndex: enc.encode(clientDataJSON.slice(0, challengeIndex)).length,
    authenticatorData: bytesToHex(parts.authenticatorData),
    clientDataJSON,
  };
}
