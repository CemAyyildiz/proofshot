import { generateKeyPairSync, sign, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode, bytesToHex, derToRawLowS, hexToBytes, spkiToXY, toWebAuthnAuth } from "./webauthn";

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

describe("derToRawLowS", () => {
  it("round-trips signatures and always yields low-s that still verifies", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    let sawHighS = false;
    for (let k = 0; k < 40; k++) {
      const msg = Buffer.from(`message ${k}`);
      const der = sign("sha256", msg, { key: privateKey, dsaEncoding: "der" });
      const p1363 = sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
      const { r, s } = derToRawLowS(der);
      expect(BigInt(s)).toBeLessThanOrEqual(N / 2n);
      if (BigInt(bytesToHex(p1363.subarray(32))) > N / 2n) sawHighS = true;
      const raw = Buffer.concat([hexToBytes(r), hexToBytes(s)]);
      expect(verify("sha256", msg, { key: publicKey, dsaEncoding: "ieee-p1363" }, raw)).toBe(true);
    }
    expect(sawHighS).toBe(true); // the normalisation branch was exercised
  });

  it("rejects malformed input", () => {
    expect(() => derToRawLowS(new Uint8Array([0x30, 0x02, 0x02, 0x00]))).toThrow();
  });
});

describe("spkiToXY", () => {
  it("extracts the public point", () => {
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const spki = publicKey.export({ format: "der", type: "spki" });
    const jwk = publicKey.export({ format: "jwk" });
    const { qx, qy } = spkiToXY(new Uint8Array(spki));
    expect(qx).toBe(bytesToHex(base64UrlDecode(jwk.x!)));
    expect(qy).toBe(bytesToHex(base64UrlDecode(jwk.y!)));
  });
});

describe("toWebAuthnAuth", () => {
  it("locates type and challenge by byte offset", () => {
    const challenge = base64UrlEncode(new Uint8Array(32).fill(7));
    const json = `{"type":"webauthn.get","challenge":"${challenge}","origin":"https://proofshot.app","crossOrigin":false}`;
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const auth = toWebAuthnAuth({
      authenticatorData: new Uint8Array(37),
      clientDataJSON: new TextEncoder().encode(json),
      signature: sign("sha256", Buffer.from("x"), { key: privateKey, dsaEncoding: "der" }),
    });
    expect(auth.typeIndex).toBe(1);
    expect(auth.challengeIndex).toBe(json.indexOf('"challenge"'));
  });

  it("rejects registration (webauthn.create) client data", () => {
    const json = `{"type":"webauthn.create","challenge":"AA"}`;
    expect(() =>
      toWebAuthnAuth({ authenticatorData: new Uint8Array(37), clientDataJSON: new TextEncoder().encode(json), signature: new Uint8Array() }),
    ).toThrow();
  });
});
