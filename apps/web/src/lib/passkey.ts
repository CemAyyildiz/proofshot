"use client";

import { base64UrlDecode, base64UrlEncode, toWebAuthnAuth, type Hex, type WebAuthnAuth } from "@proofshot/shared";

/** The Capturer's Device Key on this browser. Only identifiers — the private key never leaves the authenticator. */
export interface StoredDeviceKey {
  credentialId: string;
  keyId: Hex;
}

const STORE = "proofshot.deviceKey.v1";

export const SUPPORTED_BROWSERS = "Safari on iPhone (iOS 17 or later) or Chrome on Android (13 or later)";

export async function passkeySupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential || !window.isSecureContext) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function loadDeviceKey(): StoredDeviceKey | null {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as StoredDeviceKey) : null;
  } catch {
    return null;
  }
}

export function saveDeviceKey(key: StoredDeviceKey) {
  try {
    localStorage.setItem(STORE, JSON.stringify(key));
  } catch {
    // Private mode: the key still works for this session; the next visit will set up a new one.
  }
}

export function forgetDeviceKey() {
  try {
    localStorage.removeItem(STORE);
  } catch {}
}

/** One platform prompt (Face ID, fingerprint or device PIN). Returns what the server needs to register it. */
export async function createPasskey(): Promise<{ credentialId: string; publicKey: string }> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Proofshot", id: location.hostname },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "Proofshot photo seal", displayName: "Proofshot photo seal" },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256 / P-256, verifiable onchain
      authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" },
      attestation: "none",
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  const spki = (cred.response as AuthenticatorAttestationResponse).getPublicKey();
  if (!spki) throw new Error("unsupported-key");
  return { credentialId: base64UrlEncode(new Uint8Array(cred.rawId)), publicKey: base64UrlEncode(new Uint8Array(spki)) };
}

/** Signs a 32-byte challenge with the stored Device Key (one biometric prompt). */
export async function signWithPasskey(credentialId: string, challenge: Uint8Array): Promise<WebAuthnAuth> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: challenge as Uint8Array<ArrayBuffer>,
      allowCredentials: [{ type: "public-key", id: base64UrlDecode(credentialId) as Uint8Array<ArrayBuffer> }],
      userVerification: "required",
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("cancelled");
  const res = cred.response as AuthenticatorAssertionResponse;
  return toWebAuthnAuth({
    authenticatorData: new Uint8Array(res.authenticatorData),
    clientDataJSON: new Uint8Array(res.clientDataJSON),
    signature: new Uint8Array(res.signature),
  });
}
