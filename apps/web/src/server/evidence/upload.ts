import { randomUUID } from "node:crypto";
import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { carriers, uploads } from "../db/schema";
import { type CarrierScope, getClaimFile } from "../dal/claim-files";
import { decodeForPreview } from "../fingerprint";
import { claimRefFor } from "../capture/seal";
import type { Storage } from "../storage";
import { DAY_MS, consume } from "../rate-limit";
import { verifyImage } from "../verify/verify";
import { raiseDuplicateAlerts } from "./duplicates";

const PREVIEW_MAX = 1600;
/** In-file verifications per Carrier per day: bounds storage and CPU (demo carriers are open to visitors). */
export const UPLOADS_PER_CARRIER_PER_DAY = 500;

function sniffContentType(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return "image/heic";
}

export type UploadResult =
  | { ok: true; uploadId: string; verificationId: string; verdict: string; alerts: number }
  | { ok: false; status: 400 | 404 | 413 | 415 | 429; error: string };

/**
 * FR-14: a Carrier User verifies an image received outside Proofshot (e.g. by email) inside a Claim File. The
 * image is kept in Carrier-scoped storage with a JPEG preview, and duplicate checks run on it (FR-12).
 */
export async function uploadIntoClaimFile(
  scope: CarrierScope,
  storage: Storage,
  entries: () => Promise<RegistryEntry[]>,
  chainId: number,
  claimFileId: string,
  bytes: Uint8Array,
): Promise<UploadResult> {
  const file = await getClaimFile(scope, claimFileId);
  if (!file) return { ok: false, status: 404, error: "Claim File not found." };
  if (!(await consume(scope.db, `upload:${scope.carrierId}`, UPLOADS_PER_CARRIER_PER_DAY, DAY_MS)).allowed) {
    return { ok: false, status: 429, error: "Your carrier has reached today's verification limit. Try again tomorrow." };
  }

  const result = await verifyImage(scope.db, chainId, entries, bytes, { claimFileId: file.id });
  if (!result.ok) return result;

  const id = randomUUID();
  const base = `${scope.carrierId}/${file.id}/uploads/${id}`;
  const img = await decodeForPreview(bytes);
  const preview = await sharp(img.data, { raw: { width: img.width, height: img.height, channels: 3 } })
    .resize(PREVIEW_MAX, PREVIEW_MAX, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  await storage.put(`${base}.orig`, bytes, sniffContentType(bytes));
  await storage.put(`${base}.preview.jpg`, preview, "image/jpeg");

  const v = result.verdict;
  await scope.db.insert(uploads).values({
    id,
    claimFileId: file.id,
    storageKey: `${base}.orig`,
    previewKey: `${base}.preview.jpg`,
    contentType: sniffContentType(bytes),
    exactHash: result.fingerprint.exactHash,
    verdict: v.kind,
    matchedExactHash: "record" in v ? v.record.exactHash : null,
    verificationId: result.id,
    createdBy: scope.userId,
  });

  const [carrier] = await scope.db.select({ pid: carriers.pseudonymousId }).from(carriers).where(eq(carriers.id, scope.carrierId));
  const alerts = await raiseDuplicateAlerts(scope.db, await entries(), {
    claimFileId: file.id,
    claimRef: claimRefFor(file.id),
    carrierId: carrier!.pid as Hex32,
    fingerprint: result.fingerprint,
  });
  return { ok: true, uploadId: id, verificationId: result.id, verdict: v.kind, alerts: alerts.length };
}
