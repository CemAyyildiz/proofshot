/**
 * A software P-256 "platform authenticator" for fixtures and testnet spikes. Produces the same byte-level
 * assertion shape as iCloud Keychain / Google Password Manager passkeys (DER signature, UP|UV|BE|BS flags).
 */
import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { base64UrlEncode, spkiToXY, toWebAuthnAuth, type Hex, type WebAuthnAuth } from "@proofshot/shared";
import { keccak256 } from "viem";

const sha = (b: Uint8Array) => new Uint8Array(createHash("sha256").update(b).digest());

export const FLAGS_UP_UV_BE_BS = 0x1d;
export const FLAGS_UP_BE_BS = 0x19;

export class SoftwareAuthenticator {
  readonly qx: Hex;
  readonly qy: Hex;
  readonly keyId: Hex;
  readonly #key: KeyObject;

  constructor(readonly rpId = "localhost", readonly origin = "http://localhost:3000") {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#key = privateKey;
    ({ qx: this.qx, qy: this.qy } = spkiToXY(new Uint8Array(publicKey.export({ format: "der", type: "spki" }))));
    this.keyId = keccak256(sha(new TextEncoder().encode(`${this.qx}${this.qy}`)).subarray(0, 20));
  }

  assert(challenge: Uint8Array, flags = FLAGS_UP_UV_BE_BS): WebAuthnAuth {
    const authenticatorData = new Uint8Array([...sha(new TextEncoder().encode(this.rpId)), flags, 0, 0, 0, 0]);
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: "webauthn.get", challenge: base64UrlEncode(challenge), origin: this.origin, crossOrigin: false }),
    );
    const signature = sign("sha256", Buffer.concat([authenticatorData, sha(clientDataJSON)]), { key: this.#key, dsaEncoding: "der" });
    return toWebAuthnAuth({ authenticatorData, clientDataJSON, signature: new Uint8Array(signature) });
  }
}

export function sampleRecordFields(label: string) {
  const h = (s: string) => `0x${createHash("sha256").update(`${label}:${s}`).digest("hex")}` as Hex;
  return {
    exactHash: h("exact"),
    pHash: h("phash"),
    tiles: Array.from({ length: 16 }, (_, i) => h(`tile${i}`)),
    width: 4032,
    height: 3024,
    locCommit: h("loc"),
    deviceTime: BigInt(Math.floor(Date.now() / 1000)),
    claimRef: h("claim"),
    carrierId: h("carrier"),
  };
}
