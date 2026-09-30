import { randomBytes } from "node:crypto";
import { type Fingerprint, type RegistryEntry, type Thresholds, type Verdict, DEFAULT_THRESHOLDS, computeVerdict } from "@proofshot/fingerprint";
import { FingerprintError, ImageTooLargeError, MAX_PIXELS, fingerprintFile } from "../fingerprint";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { verifications } from "../db/schema";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Public Verifier budget per caller: fingerprinting is the most expensive unauthenticated request. */
export const VERIFICATIONS_PER_WINDOW = 30;
export const VERIFICATION_WINDOW_MS = 10 * 60 * 1000;

export type VerifyResult =
  | { ok: true; id: string; fingerprint: Fingerprint; verdict: Verdict }
  | { ok: false; status: 400 | 413 | 415; error: string };

/** Short, unguessable, URL-safe id for the Receipt URL. */
const newId = () => randomBytes(9).toString("base64url");

/**
 * Fingerprints the submitted bytes (never stored), computes the Verdict against the Registry and records the
 * outcome so it has a Receipt.
 */
export async function verifyImage(
  db: Db,
  chainId: number,
  entries: () => Promise<RegistryEntry[]>,
  bytes: Uint8Array,
  opts: { claimFileId?: string; thresholds?: Thresholds } = {},
): Promise<VerifyResult> {
  if (bytes.byteLength === 0) return { ok: false, status: 400, error: "Choose an image to verify." };
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, status: 413, error: "This image is larger than 20 MB." };

  let fingerprint: Fingerprint;
  try {
    fingerprint = await fingerprintFile(bytes);
  } catch (e) {
    if (e instanceof ImageTooLargeError) {
      return { ok: false, status: 413, error: `This image is over ${MAX_PIXELS / 1e6} megapixels. Use a smaller copy.` };
    }
    if (e instanceof FingerprintError) {
      return { ok: false, status: 415, error: "This file isn't a supported image. Use JPEG, PNG, WebP or HEIC." };
    }
    throw e;
  }

  const verdict = computeVerdict(fingerprint, await entries(), opts.thresholds ?? DEFAULT_THRESHOLDS);
  const id = newId();
  await db.insert(verifications).values({
    id,
    chainId,
    submittedExactHash: fingerprint.exactHash,
    submittedWidth: fingerprint.width,
    submittedHeight: fingerprint.height,
    verdict: verdict.kind,
    alterationCheck: "alterationCheck" in verdict ? verdict.alterationCheck : null,
    matchedExactHash: "record" in verdict ? verdict.record.exactHash : null,
    matchedKind: "record" in verdict ? verdict.record.kind : null,
    distance: "distance" in verdict ? verdict.distance : null,
    alteredTiles: verdict.kind === "altered" ? verdict.alteredTiles : null,
    claimFileId: opts.claimFileId ?? null,
  });
  return { ok: true, id, fingerprint, verdict };
}

export async function getVerification(db: Db, id: string) {
  if (!/^[A-Za-z0-9_-]{12}$/.test(id)) return null;
  const [row] = await db.select().from(verifications).where(eq(verifications.id, id));
  return row ?? null;
}
