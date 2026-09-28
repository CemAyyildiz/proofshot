import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { captures, claimFiles } from "../db/schema";
import { resolveClaimLink } from "../dal/claim-files";
import { captureKey, type Storage } from "../storage";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export type SendResult = { ok: true; status: "received" | "already-received" } | { ok: false; status: 400 | 404 | 410 | 413; error: string };

/**
 * Accepts the original image bytes of a sealed Capture into Carrier-scoped storage. The bytes must hash to
 * the sealed Exact Hash, so what the Carrier receives verifies as Original.
 */
export async function receiveCaptureFile(db: Db, storage: Storage, token: string, exactHash: string, bytes: Uint8Array): Promise<SendResult> {
  if (!/^0x[0-9a-f]{64}$/.test(exactHash)) return { ok: false, status: 400, error: "Invalid request." };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, status: 413, error: "This photo is too large." };

  const link = await resolveClaimLink(db, token);
  if (!link) return { ok: false, status: 404, error: "This link is not valid." };
  if (link.state !== "active") return { ok: false, status: 410, error: "This link is no longer active." };

  const [capture] = await db
    .select()
    .from(captures)
    .where(and(eq(captures.exactHash, exactHash), eq(captures.claimFileId, link.claimFileId)));
  // Only sealed Captures of this Claim File can be sent.
  if (!capture) return { ok: false, status: 404, error: "Only sealed photos can be sent." };
  if (capture.sentAt) return { ok: true, status: "already-received" };

  if (`0x${createHash("sha256").update(bytes).digest("hex")}` !== exactHash) {
    return { ok: false, status: 400, error: "This file doesn't match the sealed photo." };
  }

  const [file] = await db.select({ carrierId: claimFiles.carrierId }).from(claimFiles).where(eq(claimFiles.id, link.claimFileId));
  const key = captureKey(file!.carrierId, link.claimFileId, exactHash);
  await storage.put(key, bytes, "image/jpeg");
  await db.transaction(async (tx) => {
    await tx.update(captures).set({ storageKey: key, sentAt: new Date() }).where(eq(captures.id, capture.id));
    await tx.update(claimFiles).set({ status: "evidence_received" }).where(eq(claimFiles.id, link.claimFileId));
  });
  return { ok: true, status: "received" };
}

export async function recordTimings(db: Db, token: string, exactHash: string, input: unknown) {
  const t = input as { shutterToSignedMs?: unknown; shutterToSealedMs?: unknown } | null;
  const ms = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 600_000 ? Math.round(v) : undefined);
  const timings = { shutterToSignedMs: ms(t?.shutterToSignedMs), shutterToSealedMs: ms(t?.shutterToSealedMs) };
  const link = await resolveClaimLink(db, token);
  if (!link) return false;
  const rows = await db
    .update(captures)
    .set({ timings })
    .where(and(eq(captures.exactHash, exactHash), eq(captures.claimFileId, link.claimFileId)))
    .returning({ id: captures.id });
  return rows.length > 0;
}
