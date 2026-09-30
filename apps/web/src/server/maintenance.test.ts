import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { issueMagicLink, redeemMagicLink } from "./auth/core";
import { createClaimFile, replaceClaimLink } from "./dal/claim-files";
import { captures, carriers, claimFiles, claimLinks, deviceKeys, duplicateAlerts, magicLinkTokens, rateLimits, sessions, uploads, verifications } from "./db/schema";
import { DEMO_RETENTION_DAYS, pruneDemoData, pruneExpired } from "./maintenance";
import { FsStorage, type Storage, captureKey } from "./storage";
import { DAY_MS, consume } from "./rate-limit";
import { carrierScope, testDb } from "./test-db";

describe("pruneExpired", () => {
  it("drops stale rate-limit windows, expired sessions and old sign-in tokens only", async () => {
    const db = await testDb();
    const now = new Date("2026-10-10T12:00:00Z");
    const old = new Date(now.getTime() - 3 * DAY_MS);
    await consume(db, "a", 5, DAY_MS, old);
    await consume(db, "a", 5, DAY_MS, now);
    const oldToken = await issueMagicLink(db, "dana@harbor.demo", old);
    await redeemMagicLink(db, oldToken!, old); // used 3 days ago; its session is still valid for 30 days
    await issueMagicLink(db, "dana@harbor.demo", now); // fresh, unused

    const r = await pruneExpired(db, now);
    expect(r).toEqual({ rateLimits: 1, sessions: 0, signInTokens: 1 });
    expect(await db.select().from(rateLimits)).toHaveLength(1);
    expect(await db.select().from(magicLinkTokens)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);

    const later = await pruneExpired(db, new Date(now.getTime() + 40 * DAY_MS));
    expect(later.sessions).toBe(1);
  });
});

describe("pruneDemoData", () => {
  it("removes old demo and sandbox Claim Files with their images, never a real carrier's, and keeps receipts", async () => {
    const db = await testDb();
    const storage: Storage = new FsStorage(await mkdtemp(join(tmpdir(), "ps-prune-")));
    const now = new Date("2026-10-20T12:00:00Z");
    const old = new Date(now.getTime() - (DEMO_RETENTION_DAYS + 1) * DAY_MS);
    const recent = new Date(now.getTime() - DAY_MS);
    await db.insert(deviceKeys).values({ keyId: "0x01", credentialId: "cred", qx: "0x", qy: "0x" });

    const demo = await carrierScope(db, "northwind");
    const sandbox = await carrierScope(db, "sandbox");
    const [real] = await db.insert(carriers).values({ slug: "acme", name: "Acme Insurance", pseudonymousId: "0x02" }).returning();
    const acme = { db, carrierId: real!.id };

    let n = 0;
    async function fileWithEvidence(scope: { db: typeof db; carrierId: string }, createdAt: Date) {
      const f = await createClaimFile(scope, `REF-${++n}`);
      await db.update(claimFiles).set({ createdAt }).where(eq(claimFiles.id, f.id));
      const hash = `0x${n.toString(16).padStart(64, "0")}`;
      const key = captureKey(scope.carrierId, f.id, hash);
      await storage.put(key, new Uint8Array([n]), "image/jpeg");
      await db.insert(captures).values({ claimFileId: f.id, deviceKeyId: "0x01", exactHash: hash, txHash: "0xfeed", sealedAt: createdAt, storageKey: key });
      const verificationId = `v${n}`;
      await db.insert(verifications).values({ id: verificationId, chainId: 31337, submittedExactHash: hash, submittedWidth: 1, submittedHeight: 1, verdict: "no-record", claimFileId: f.id });
      await db.insert(uploads).values({ claimFileId: f.id, exactHash: hash, verdict: "no-record", verificationId, storageKey: `${scope.carrierId}/${f.id}/uploads/u.orig` });
      await db.insert(duplicateAlerts).values({ claimFileId: f.id, sourceExactHash: hash, matchedExactHash: hash, matchedKind: "sealed", matchedAt: createdAt, sameCarrier: true, exact: true, distance: 0, tileMatches: 16 });
      return { id: f.id, key, verificationId };
    }

    const oldDemo = await fileWithEvidence(demo, old);
    await replaceClaimLink(demo, oldDemo.id, old); // a retired link must not block the prune
    const oldSandbox = await fileWithEvidence(sandbox, old);
    const newDemo = await fileWithEvidence(demo, recent);
    const oldReal = await fileWithEvidence(acme, old);

    expect(await pruneDemoData(db, storage, now)).toEqual({ demoClaimFiles: 2 });

    const remaining = (await db.select({ id: claimFiles.id }).from(claimFiles)).map((r) => r.id);
    expect(remaining).toContain(newDemo.id);
    expect(remaining).toContain(oldReal.id);
    expect(remaining).not.toContain(oldDemo.id);
    expect(remaining).not.toContain(oldSandbox.id);
    for (const gone of [oldDemo, oldSandbox]) {
      expect(await storage.get(gone.key)).toBeNull();
      expect(await db.select().from(captures).where(eq(captures.claimFileId, gone.id))).toEqual([]);
      expect(await db.select().from(claimLinks).where(eq(claimLinks.claimFileId, gone.id))).toEqual([]);
      // The public receipt stays, just detached from the deleted Claim File.
      const [receipt] = await db.select().from(verifications).where(eq(verifications.id, gone.verificationId));
      expect(receipt).toMatchObject({ claimFileId: null });
    }
    expect(await storage.get(oldReal.key)).not.toBeNull();
    expect(await storage.get(newDemo.key)).not.toBeNull();
    expect(await db.select().from(duplicateAlerts)).toHaveLength(2);

    // Idempotent.
    expect(await pruneDemoData(db, storage, now)).toEqual({ demoClaimFiles: 0 });
  });
});
