import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { carriers, claimFiles, claimLinks } from "../db/schema";

export const CLAIM_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const REFERENCE_MAX = 80;

/**
 * Every Carrier-owned read or write goes through a scope bound to one Carrier. A row that belongs to
 * another Carrier is indistinguishable from a missing row (callers render 404).
 */
export interface CarrierScope {
  db: Db;
  carrierId: string;
  userId?: string;
}

export type ClaimLinkState = "active" | "revoked" | "expired";

export function claimLinkState(link: { revokedAt: Date | null; expiresAt: Date }, now = new Date()): ClaimLinkState {
  if (link.revokedAt) return "revoked";
  return link.expiresAt <= now ? "expired" : "active";
}

/** ≥ 128 bits of entropy; URL-safe. */
export const newClaimLinkToken = () => randomBytes(24).toString("base64url");

export async function createClaimFile(scope: CarrierScope, reference: string, now = new Date()) {
  const ref = reference.trim();
  if (!ref || ref.length > REFERENCE_MAX) throw new RangeError(`reference must be 1–${REFERENCE_MAX} characters`);
  return scope.db.transaction(async (tx) => {
    const [file] = await tx
      .insert(claimFiles)
      .values({ carrierId: scope.carrierId, reference: ref, createdBy: scope.userId })
      .returning();
    const [link] = await tx
      .insert(claimLinks)
      .values({ token: newClaimLinkToken(), claimFileId: file!.id, expiresAt: new Date(now.getTime() + CLAIM_LINK_TTL_MS) })
      .returning();
    return { ...file!, link: link! };
  });
}

export async function listClaimFiles(scope: CarrierScope) {
  return scope.db
    .select({
      id: claimFiles.id,
      reference: claimFiles.reference,
      status: claimFiles.status,
      createdAt: claimFiles.createdAt,
      link: { token: claimLinks.token, expiresAt: claimLinks.expiresAt, revokedAt: claimLinks.revokedAt },
    })
    .from(claimFiles)
    .innerJoin(claimLinks, eq(claimLinks.claimFileId, claimFiles.id))
    .where(eq(claimFiles.carrierId, scope.carrierId))
    .orderBy(desc(claimFiles.createdAt));
}

export async function getClaimFile(scope: CarrierScope, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await scope.db
    .select({ file: claimFiles, link: claimLinks })
    .from(claimFiles)
    .innerJoin(claimLinks, eq(claimLinks.claimFileId, claimFiles.id))
    .where(and(eq(claimFiles.id, id), eq(claimFiles.carrierId, scope.carrierId)));
  return row ? { ...row.file, link: row.link } : null;
}

/** Returns false when the Claim File is not this Carrier's (or does not exist). Idempotent. */
export async function revokeClaimLink(scope: CarrierScope, claimFileId: string, now = new Date()): Promise<boolean> {
  const file = await getClaimFile(scope, claimFileId);
  if (!file) return false;
  if (!file.link.revokedAt) {
    await scope.db.update(claimLinks).set({ revokedAt: now }).where(eq(claimLinks.claimFileId, file.id));
  }
  return true;
}

/**
 * Public (unauthenticated) resolution of a Claim Link for the Capturer. Exposes only what the capture
 * landing page shows: Carrier name, claim reference and link state.
 */
export async function resolveClaimLink(db: Db, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      claimFileId: claimFiles.id,
      reference: claimFiles.reference,
      carrierName: carriers.name,
      carrierPseudonymousId: carriers.pseudonymousId,
      expiresAt: claimLinks.expiresAt,
      revokedAt: claimLinks.revokedAt,
      sealCount: claimLinks.sealCount,
    })
    .from(claimLinks)
    .innerJoin(claimFiles, eq(claimFiles.id, claimLinks.claimFileId))
    .innerJoin(carriers, eq(carriers.id, claimFiles.carrierId))
    .where(eq(claimLinks.token, token));
  return row ? { ...row, state: claimLinkState(row, now) } : null;
}
