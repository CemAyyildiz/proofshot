import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "./db/client";
import { captures, carriers, claimFiles, claimLinks, duplicateAlerts, magicLinkTokens, rateLimits, sessions, uploads, verifications } from "./db/schema";
import { type Storage, claimFilePrefix } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes rows that can never matter again: rate-limit windows older than two days (the longest window is one day),
 * expired sessions, and sign-in tokens that expired or were used more than a day ago. Receipts (verifications),
 * evidence and Registry data are kept.
 */
export async function pruneExpired(db: Db, now = new Date()) {
  const cutoff = new Date(now.getTime() - 2 * DAY_MS);
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const [rl, se, tk] = await Promise.all([
    db.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).returning({ b: rateLimits.bucket }),
    db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({ t: sessions.tokenHash }),
    db
      .delete(magicLinkTokens)
      .where(or(lt(magicLinkTokens.expiresAt, dayAgo), and(isNotNull(magicLinkTokens.usedAt), lt(magicLinkTokens.usedAt, dayAgo))))
      .returning({ t: magicLinkTokens.tokenHash }),
  ]);
  return { rateLimits: rl.length, sessions: se.length, signInTokens: tk.length };
}

/** Claim Files in the shared demo carriers and the Try-it sandbox are kept this long, then removed with their images. */
export const DEMO_RETENTION_DAYS = 7;
/** Bounded per run so the daily job stays short; anything left over goes the next day. */
const DEMO_PRUNE_BATCH = 500;

/**
 * Removes old Claim Files of demo and sandbox carriers — the public, shared workspaces every visitor writes to —
 * together with their stored images, uploads, alerts and links. Real carriers are never touched. Seals stay onchain
 * and their public receipts keep working (they read the Registry); Verification Receipts are kept, detached from the
 * deleted Claim File. Images go first: if the database step fails, the next run finds the same Claim Files again.
 */
export async function pruneDemoData(db: Db, storage: Storage, now = new Date()) {
  const cutoff = new Date(now.getTime() - DEMO_RETENTION_DAYS * DAY_MS);
  const old = await db
    .select({ id: claimFiles.id, carrierId: claimFiles.carrierId })
    .from(claimFiles)
    .innerJoin(carriers, eq(carriers.id, claimFiles.carrierId))
    .where(and(lt(claimFiles.createdAt, cutoff), or(eq(carriers.isDemo, true), eq(carriers.isSandbox, true))))
    .limit(DEMO_PRUNE_BATCH);
  if (old.length === 0) return { demoClaimFiles: 0 };

  for (const f of old) await storage.deleteClaimFile(claimFilePrefix(f.carrierId, f.id));
  const ids = old.map((f) => f.id);
  await db.transaction(async (tx) => {
    await tx.delete(duplicateAlerts).where(inArray(duplicateAlerts.claimFileId, ids));
    await tx.delete(uploads).where(inArray(uploads.claimFileId, ids));
    await tx.update(verifications).set({ claimFileId: null }).where(inArray(verifications.claimFileId, ids));
    await tx.delete(captures).where(inArray(captures.claimFileId, ids));
    await tx.delete(claimLinks).where(inArray(claimLinks.claimFileId, ids));
    await tx.delete(claimFiles).where(inArray(claimFiles.id, ids));
  });
  return { demoClaimFiles: ids.length };
}
