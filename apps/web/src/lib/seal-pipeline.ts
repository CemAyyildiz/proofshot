"use client";

import { type Fingerprint, fingerprintBlob, initBrowser } from "@proofshot/fingerprint/browser";
import { type CaptureRecord, type Hex, NO_LOCATION, bytesToHex, hexToBytes, locationCommitment, sealChallenge } from "@proofshot/shared";
import { signWithPasskey, type StoredDeviceKey } from "./passkey";

let pdqReady: Promise<void> | undefined;
export const warmUpFingerprinting = () => (pdqReady ??= initBrowser("/pdq.wasm"));

/** A JPEG straight from the live camera frame. This file is what gets sealed and later sent. */
export async function grabFrame(video: HTMLVideoElement, attempts = 3): Promise<Blob> {
  // A single grab can come back empty: no decoded frame yet after the stream (re)starts, or toBlob yielding null under
  // memory pressure. Retry on the next video frame before telling the Capturer anything went wrong.
  for (let i = 1; ; i++) {
    try {
      return await grabOnce(video);
    } catch (e) {
      if (i >= attempts) throw e;
      await nextVideoFrame(video);
    }
  }
}

async function grabOnce(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth || !video.videoHeight) throw new Error("no video frame yet");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  ctx.drawImage(video, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned no image"))), "image/jpeg", 0.92));
}

/** Resolves on the next presented video frame (or after 250 ms where that API is missing or the stream stalls). */
function nextVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 250);
    video.requestVideoFrameCallback?.(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** Location only if the permission was already granted — never an extra prompt during capture (FR-2). */
export async function currentLocationIfAllowed(): Promise<{ lat: number; lon: number; salt: Hex } | undefined> {
  try {
    const perm = await navigator.permissions?.query({ name: "geolocation" });
    if (perm?.state !== "granted") return undefined;
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 60_000, timeout: 2_000 }),
    );
    return { lat: pos.coords.latitude, lon: pos.coords.longitude, salt: bytesToHex(crypto.getRandomValues(new Uint8Array(32))) };
  } catch {
    return undefined;
  }
}

export async function fingerprintCapture(blob: Blob): Promise<Fingerprint> {
  await warmUpFingerprinting();
  return fingerprintBlob(blob);
}

export class SealError extends Error {
  constructor(
    message: string,
    readonly receiptUrl?: string,
    readonly alreadySealed = false,
  ) {
    super(message);
  }
}

export interface SealOutcome {
  receiptUrl: string;
  signedAt: number;
}

interface SealContext {
  claimRef: Hex;
  carrierId: Hex;
  refBlock: string;
}

/**
 * Binds the fingerprints to this Claim Link and the latest block, asks the Device Key to sign (one biometric
 * prompt), then hands the signed record to the server for sealing. Resolves once the Seal is included.
 * `onSigned` fires as soon as the prompt completes, so the next photo can be taken while this one seals.
 */
export async function signAndSeal(opts: {
  token: string;
  key: StoredDeviceKey;
  fingerprint: Fingerprint;
  location?: { lat: number; lon: number; salt: Hex };
  deviceTime: number;
  onSigned?: () => void;
}): Promise<SealOutcome> {
  const { token, key, fingerprint: fp, location } = opts;
  const ctxRes = await fetch(`/api/claim-links/${token}/seal-context`, { cache: "no-store" });
  if (!ctxRes.ok) throw new SealError((await ctxRes.json().catch(() => ({}))).error ?? "This photo couldn't be sealed. Tap retry.");
  const ctx = (await ctxRes.json()) as SealContext;

  const record: CaptureRecord = {
    exactHash: fp.exactHash,
    pHash: fp.pHash,
    tiles: fp.tiles,
    width: fp.width,
    height: fp.height,
    locCommit: location ? locationCommitment(location.lat, location.lon, location.salt) : NO_LOCATION,
    deviceTime: BigInt(Math.floor(opts.deviceTime / 1000)),
    claimRef: ctx.claimRef,
    carrierId: ctx.carrierId,
    refBlock: BigInt(ctx.refBlock),
  };

  let auth;
  try {
    auth = await signWithPasskey(key.credentialId, hexToBytes(sealChallenge(record)));
  } catch {
    throw new SealError("Sealing was cancelled. Tap retry.");
  }
  const signedAt = performance.now();
  opts.onSigned?.();

  const res = await fetch(`/api/claim-links/${token}/seals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keyId: key.keyId,
      record: { ...record, deviceTime: record.deviceTime.toString(), refBlock: record.refBlock.toString() },
      auth,
      locSalt: location?.salt,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { receiptUrl?: string; error?: string };
  if (res.status === 409 && body.receiptUrl) throw new SealError("Already sealed.", body.receiptUrl, true);
  if (!res.ok || !body.receiptUrl) throw new SealError(body.error ?? "This photo couldn't be sealed. Tap retry.");
  return { receiptUrl: body.receiptUrl, signedAt };
}
