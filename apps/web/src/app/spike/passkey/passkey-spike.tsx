"use client";

import { useEffect, useState } from "react";
import { base64UrlDecode, base64UrlEncode, bytesToHex, hexToBytes, sealChallenge, spkiToXY, toWebAuthnAuth, type CaptureRecord, type Hex } from "@proofshot/shared";
import { keccak256 } from "viem";

const STORE = "proofshot.spike.passkey";

interface StoredKey {
  credentialId: string;
  qx: Hex;
  qy: Hex;
}

async function h32(label: string): Promise<Hex> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(label))));
}

async function fixtureRecord(): Promise<CaptureRecord> {
  return {
    exactHash: await h32(`device:${Date.now()}:exact`),
    pHash: await h32("device:phash"),
    tiles: await Promise.all(Array.from({ length: 16 }, (_, i) => h32(`device:tile${i}`))),
    width: 4032,
    height: 3024,
    locCommit: await h32("device:loc"),
    deviceTime: BigInt(Math.floor(Date.now() / 1000)),
    claimRef: await h32("device:claim"),
    carrierId: await h32("device:carrier"),
    refBlock: 1_000n,
  };
}

function load(): StoredKey | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as StoredKey) : null;
  } catch {
    return null;
  }
}

export function PasskeySpike() {
  const [key, setKey] = useState<StoredKey | null>(null);
  // localStorage is client-only; read after mount to keep SSR and hydration output identical.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setKey(load()), []);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  async function create() {
    setError("");
    try {
      const cred = (await navigator.credentials.create({
        publicKey: {
          rp: { name: "Proofshot", id: location.hostname },
          user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "spike", displayName: "Spike B" },
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("no credential returned");
      const spki = (cred.response as AuthenticatorAttestationResponse).getPublicKey();
      if (!spki) throw new Error("authenticator did not expose a public key");
      const stored = { credentialId: base64UrlEncode(new Uint8Array(cred.rawId)), ...spkiToXY(new Uint8Array(spki)) };
      localStorage.setItem(STORE, JSON.stringify(stored));
      setKey(stored);
    } catch (e) {
      setError(String(e));
    }
  }

  async function signSeal() {
    if (!key) return;
    setError("");
    try {
      const record = await fixtureRecord();
      const challenge = sealChallenge(record);
      const started = performance.now();
      const cred = (await navigator.credentials.get({
        publicKey: {
          challenge: hexToBytes(challenge) as Uint8Array<ArrayBuffer>,
          allowCredentials: [{ type: "public-key", id: base64UrlDecode(key.credentialId) as Uint8Array<ArrayBuffer> }],
          userVerification: "required",
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error("no assertion returned");
      const promptMs = Math.round(performance.now() - started);
      const res = cred.response as AuthenticatorAssertionResponse;
      const auth = toWebAuthnAuth({
        authenticatorData: new Uint8Array(res.authenticatorData),
        clientDataJSON: new Uint8Array(res.clientDataJSON),
        signature: new Uint8Array(res.signature),
      });
      setOutput(
        JSON.stringify(
          {
            source: `${navigator.userAgent} (prompt ${promptMs} ms)`,
            keyId: keccak256(base64UrlDecode(key.credentialId)),
            qx: key.qx,
            qy: key.qy,
            record: { ...record, deviceTime: Number(record.deviceTime), refBlock: Number(record.refBlock) },
            challenge,
            auth,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button className="rounded-xl bg-black px-4 py-3 text-white" onClick={create}>
        {key ? "Create a new passkey" : "Create passkey"}
      </button>
      <button className="rounded-xl border px-4 py-3 disabled:opacity-40" onClick={signSeal} disabled={!key}>
        Sign test Seal
      </button>
      {key && <p className="break-all font-mono text-xs opacity-60">qx {key.qx}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {output && (
        <>
          <button className="rounded-xl border px-4 py-2 text-sm" onClick={() => navigator.clipboard.writeText(output)}>
            Copy fixture JSON
          </button>
          <pre className="max-h-96 overflow-auto rounded bg-neutral-100 p-3 text-xs text-black">{output}</pre>
        </>
      )}
    </div>
  );
}
