import { createHash, randomBytes } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { captures, claimFiles, deviceKeys } from "../db/schema";
import { createClaimFile, replaceClaimLink, revokeClaimLink, type CarrierScope } from "../dal/claim-files";
import { FsStorage, captureKey } from "../storage";
import { carrierScope, testDb } from "../test-db";
import { MAX_IMAGE_BYTES, receiveCaptureFile, recordTimings } from "./send";
import { claimRefFor } from "./seal";

let db: Db;
let storage: FsStorage;
let scope: CarrierScope;
let token: string;
let fileId: string;
const photo = new Uint8Array(randomBytes(5000));
const exactHash = `0x${createHash("sha256").update(photo).digest("hex")}`;

beforeEach(async () => {
  db = await testDb();
  storage = new FsStorage(await mkdtemp(join(tmpdir(), "ps-storage-")));
  scope = await carrierScope(db, "northwind");
  const file = await createClaimFile(scope, "HAIL-1");
  token = file.link.token;
  fileId = file.id;
  await db.insert(deviceKeys).values({ keyId: "0x01", credentialId: "cred", qx: "0x", qy: "0x" });
  await db.insert(captures).values({ claimFileId: fileId, deviceKeyId: "0x01", exactHash, txHash: "0xfeed", sealedAt: new Date() });
});

describe("receiveCaptureFile", () => {
  it("stores the exact sealed bytes under the Carrier and marks evidence received", async () => {
    expect(await receiveCaptureFile(db, storage, token, exactHash, photo)).toEqual({ ok: true, status: "received" });
    expect(await storage.get(captureKey(scope.carrierId, fileId, exactHash))).toEqual(photo);
    const [cap] = await db.select().from(captures);
    expect(cap!.sentAt).not.toBeNull();
    const [file] = await db.select().from(claimFiles).where(eq(claimFiles.id, fileId));
    expect(file!.status).toBe("evidence_received");
    expect(await receiveCaptureFile(db, storage, token, exactHash, photo)).toEqual({ ok: true, status: "already-received" });
  });

  it("rejects bytes that don't hash to the sealed Exact Hash", async () => {
    const tampered = photo.slice();
    tampered[10]! ^= 1;
    expect(await receiveCaptureFile(db, storage, token, exactHash, tampered)).toMatchObject({ ok: false, status: 400 });
  });

  it("only accepts sealed Captures of this Claim File", async () => {
    const other = await createClaimFile(scope, "OTHER");
    expect(await receiveCaptureFile(db, storage, other.link.token, exactHash, photo)).toMatchObject({ ok: false, status: 404 });
    const unsealed = new Uint8Array(randomBytes(100));
    const h = `0x${createHash("sha256").update(unsealed).digest("hex")}`;
    expect(await receiveCaptureFile(db, storage, token, h, unsealed)).toMatchObject({ ok: false, status: 404 });
  });

  it("rejects inactive links, bad hashes and oversize files", async () => {
    expect(await receiveCaptureFile(db, storage, token, "0x1234", photo)).toMatchObject({ status: 400 });
    expect(await receiveCaptureFile(db, storage, token, exactHash, new Uint8Array(MAX_IMAGE_BYTES + 1))).toMatchObject({ status: 413 });
    await revokeClaimLink(scope, fileId);
    const unsealed = new Uint8Array(randomBytes(100));
    const h = `0x${createHash("sha256").update(unsealed).digest("hex")}`;
    const findSealed = async () => ({ txHash: "0xabc" as const, blockNumber: 9n, claimRef: claimRefFor(fileId), keyId: "0x01" as const });
    expect(await receiveCaptureFile(db, storage, token, h, unsealed, findSealed)).toMatchObject({ status: 410 });
  });

  it("still delivers a photo sealed before the link was revoked, and only its exact bytes", async () => {
    await revokeClaimLink(scope, fileId);
    const tampered = photo.slice();
    tampered[0]! ^= 1;
    expect(await receiveCaptureFile(db, storage, token, exactHash, tampered)).toMatchObject({ ok: false, status: 400 });
    expect(await receiveCaptureFile(db, storage, token, exactHash, photo)).toEqual({ ok: true, status: "received" });
    expect(await storage.get(captureKey(scope.carrierId, fileId, exactHash))).toEqual(photo);
  });
});

describe("receiveCaptureFile after the link was replaced", () => {
  it("still delivers a photo sealed through the old link", async () => {
    await replaceClaimLink(scope, fileId);
    expect(await receiveCaptureFile(db, storage, token, exactHash, photo)).toEqual({ ok: true, status: "received" });
  });
});

describe("receiveCaptureFile reconciliation", () => {
  it("restores a lost captures row from the Registry before accepting the file", async () => {
    const lost = new Uint8Array(randomBytes(3000));
    const h = `0x${createHash("sha256").update(lost).digest("hex")}` as const;
    const findSealed = async () => ({ txHash: "0xabc" as const, blockNumber: 9n, claimRef: claimRefFor(fileId), keyId: "0x01" as const });
    expect(await receiveCaptureFile(db, storage, token, h, lost, findSealed)).toEqual({ ok: true, status: "received" });
    const other = async () => ({ txHash: "0xabc" as const, blockNumber: 9n, claimRef: `0x${"9".repeat(64)}` as const, keyId: "0x01" as const });
    const stranger = new Uint8Array(randomBytes(3000));
    const h2 = `0x${createHash("sha256").update(stranger).digest("hex")}`;
    expect(await receiveCaptureFile(db, storage, token, h2, stranger, other)).toMatchObject({ ok: false, status: 404 });
  });
});

describe("FsStorage", () => {
  it("refuses keys that escape the root", async () => {
    await expect(storage.put("../escape.jpg", photo)).rejects.toThrow();
  });
});

describe("recordTimings", () => {
  it("stores sane numbers and drops the rest", async () => {
    expect(await recordTimings(db, token, exactHash, { shutterToSignedMs: 412.6, shutterToSealedMs: "fast" })).toBe(true);
    const [cap] = await db.select().from(captures);
    expect(cap!.timings).toEqual({ shutterToSignedMs: 413 });
  });
});
