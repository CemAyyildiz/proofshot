import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { captures, carriers, claimFiles, claimLinks, duplicateAlerts, retiredClaimLinks, uploads } from "../db/schema";

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

/** `%`, `_` and `\` are wildcards in ILIKE; a reference search must match them literally. */
const likeLiteral = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** This Carrier's Claim Files, newest first; optionally filtered by reference (case-insensitive substring) and paged. */
export async function listClaimFiles(scope: CarrierScope, opts: { q?: string; limit?: number; offset?: number } = {}) {
  const q = opts.q?.trim();
  const query = scope.db
    .select({
      id: claimFiles.id,
      reference: claimFiles.reference,
      status: claimFiles.status,
      createdAt: claimFiles.createdAt,
      link: { token: claimLinks.token, expiresAt: claimLinks.expiresAt, revokedAt: claimLinks.revokedAt },
      items: sql<number>`(select count(*) from ${captures} where ${captures.claimFileId} = ${claimFiles.id})::int
        + (select count(*) from ${uploads} where ${uploads.claimFileId} = ${claimFiles.id})::int`,
      alerts: sql<number>`(select count(*) from ${duplicateAlerts} where ${duplicateAlerts.claimFileId} = ${claimFiles.id})::int`,
    })
    .from(claimFiles)
    .innerJoin(claimLinks, eq(claimLinks.claimFileId, claimFiles.id))
    .where(and(eq(claimFiles.carrierId, scope.carrierId), q ? ilike(claimFiles.reference, `%${likeLiteral(q)}%`) : undefined))
    .orderBy(desc(claimFiles.createdAt), desc(claimFiles.id))
    .$dynamic();
  if (opts.limit !== undefined) query.limit(opts.limit);
  if (opts.offset) query.offset(opts.offset);
  return query;
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
 * Issues a fresh link for the Claim File (new token, new 14-day expiry). The old token is retired, not deleted: it
 * accepts no new photos, but photos already sealed through it can still be delivered. Returns null when the Claim
 * File is not this Carrier's.
 */
export async function replaceClaimLink(scope: CarrierScope, claimFileId: string, now = new Date()) {
  const file = await getClaimFile(scope, claimFileId);
  if (!file) return null;
  return scope.db.transaction(async (tx) => {
    // Retire whatever token is current once the row is locked, not the one read above: a concurrent replacement
    // (a double click, two adjusters) may have moved it on, and its token must be retired too.
    const [current] = await tx.select({ token: claimLinks.token }).from(claimLinks).where(eq(claimLinks.claimFileId, file.id)).for("update");
    await tx.insert(retiredClaimLinks).values({ token: current!.token, claimFileId: file.id, retiredAt: now });
    const [link] = await tx
      .update(claimLinks)
      .set({ token: newClaimLinkToken(), expiresAt: new Date(now.getTime() + CLAIM_LINK_TTL_MS), revokedAt: null, createdAt: now })
      .where(eq(claimLinks.claimFileId, file.id))
      .returning();
    return link!;
  });
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
      isSandbox: carriers.isSandbox,
      expiresAt: claimLinks.expiresAt,
      revokedAt: claimLinks.revokedAt,
      sealCount: claimLinks.sealCount,
    })
    .from(claimLinks)
    .innerJoin(claimFiles, eq(claimFiles.id, claimLinks.claimFileId))
    .innerJoin(carriers, eq(carriers.id, claimFiles.carrierId))
    .where(eq(claimLinks.token, token));
  if (row) return { ...row, state: claimLinkState(row, now) };
  // A replaced token: same Claim File, always inactive.
  const [retired] = await db
    .select({
      claimFileId: claimFiles.id,
      reference: claimFiles.reference,
      carrierName: carriers.name,
      carrierPseudonymousId: carriers.pseudonymousId,
      isSandbox: carriers.isSandbox,
      retiredAt: retiredClaimLinks.retiredAt,
    })
    .from(retiredClaimLinks)
    .innerJoin(claimFiles, eq(claimFiles.id, retiredClaimLinks.claimFileId))
    .innerJoin(carriers, eq(carriers.id, claimFiles.carrierId))
    .where(eq(retiredClaimLinks.token, token));
  if (!retired) return null;
  const { retiredAt, ...rest } = retired;
  return { ...rest, expiresAt: retiredAt, revokedAt: retiredAt, sealCount: 0, state: "revoked" as const };
}

/** Sealed Captures of one of this Carrier's Claim Files, oldest first. */
export async function listCaptures(scope: CarrierScope, claimFileId: string) {
  return scope.db
    .select({
      id: captures.id,
      exactHash: captures.exactHash,
      txHash: captures.txHash,
      sealedAt: captures.sealedAt,
      sentAt: captures.sentAt,
    })
    .from(captures)
    .innerJoin(claimFiles, eq(claimFiles.id, captures.claimFileId))
    .where(and(eq(captures.claimFileId, claimFileId), eq(claimFiles.carrierId, scope.carrierId)))
    .orderBy(asc(captures.sealedAt));
}

/** Images Carrier Users uploaded into one of this Carrier's Claim Files, oldest first. */
export async function listUploads(scope: CarrierScope, claimFileId: string) {
  return scope.db
    .select({
      id: uploads.id,
      exactHash: uploads.exactHash,
      verdict: uploads.verdict,
      verificationId: uploads.verificationId,
      matchedExactHash: uploads.matchedExactHash,
      createdAt: uploads.createdAt,
    })
    .from(uploads)
    .innerJoin(claimFiles, eq(claimFiles.id, uploads.claimFileId))
    .where(and(eq(uploads.claimFileId, claimFileId), eq(claimFiles.carrierId, scope.carrierId)))
    .orderBy(asc(uploads.createdAt));
}

/** Duplicate Alerts of one of this Carrier's Claim Files, newest first. */
export async function listDuplicateAlerts(scope: CarrierScope, claimFileId: string) {
  return scope.db
    .select({
      id: duplicateAlerts.id,
      sourceExactHash: duplicateAlerts.sourceExactHash,
      matchedKind: duplicateAlerts.matchedKind,
      matchedAt: duplicateAlerts.matchedAt,
      sameCarrier: duplicateAlerts.sameCarrier,
      exact: duplicateAlerts.exact,
      distance: duplicateAlerts.distance,
      tileMatches: duplicateAlerts.tileMatches,
      createdAt: duplicateAlerts.createdAt,
    })
    .from(duplicateAlerts)
    .innerJoin(claimFiles, eq(claimFiles.id, duplicateAlerts.claimFileId))
    .where(and(eq(duplicateAlerts.claimFileId, claimFileId), eq(claimFiles.carrierId, scope.carrierId)))
    .orderBy(desc(duplicateAlerts.createdAt));
}

/** Storage key of an image in one of this Carrier's Claim Files, or null. */
export async function evidenceImageKey(scope: CarrierScope, claimFileId: string, ref: { captureExactHash: string } | { uploadId: string }) {
  if ("captureExactHash" in ref) {
    const [row] = await scope.db
      .select({ key: captures.storageKey })
      .from(captures)
      .innerJoin(claimFiles, eq(claimFiles.id, captures.claimFileId))
      .where(and(eq(captures.claimFileId, claimFileId), eq(captures.exactHash, ref.captureExactHash), eq(claimFiles.carrierId, scope.carrierId)));
    return row?.key ?? null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(ref.uploadId)) return null;
  const [row] = await scope.db
    .select({ key: uploads.previewKey })
    .from(uploads)
    .innerJoin(claimFiles, eq(claimFiles.id, uploads.claimFileId))
    .where(and(eq(uploads.claimFileId, claimFileId), eq(uploads.id, ref.uploadId), eq(claimFiles.carrierId, scope.carrierId)));
  return row?.key ?? null;
}
