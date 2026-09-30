import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { fingerprintFile } from "@proofshot/fingerprint/node";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { claimRefFor } from "../capture/seal";
import type { Db } from "../db/client";
import { type CarrierScope, createClaimFile, evidenceImageKey, listDuplicateAlerts, listUploads } from "../dal/claim-files";
import { FsStorage } from "../storage";
import { carrierScope, testDb } from "../test-db";
import { recordCapture } from "../capture/seal";
import { deviceKeys } from "../db/schema";
import { matchStrength, raiseDuplicateAlerts } from "./duplicates";
import { uploadIntoClaimFile } from "./upload";

const fixture = new URL("../../../../../packages/fingerprint/test-fixtures/scene.jpg", import.meta.url);
let db: Db;
let storage: FsStorage;
let photo: Buffer;
let northwind: CarrierScope & { pid: Hex32 };
let harbor: CarrierScope & { pid: Hex32 };


function sealedEntry(fp: Awaited<ReturnType<typeof fingerprintFile>>, carrierId: Hex32, claimRef: Hex32): RegistryEntry {
  return {
    kind: "sealed",
    exactHash: fp.exactHash,
    pHash: fp.pHash,
    tiles: fp.tiles,
    width: fp.width,
    height: fp.height,
    carrierId,
    claimRef,
    keyId: `0x${"11".repeat(32)}`,
    blockNumber: 7n,
    txHash: `0x${"22".repeat(32)}`,
    blockTimestamp: 1_790_000_000,
  };
}

beforeAll(async () => {
  db = await testDb();
  storage = new FsStorage(await mkdtemp(join(tmpdir(), "ps-evidence-")));
  photo = await readFile(fixture);
  northwind = await carrierScope(db, "northwind");
  harbor = await carrierScope(db, "harbor");
});

describe("raiseDuplicateAlerts (FR-12)", () => {
  it("flags matches in other Claim Files, labelled same/another carrier, and ignores the file's own Seals", async () => {
    const fp = await fingerprintFile(photo);
    const copy = await fingerprintFile(await sharp(photo).jpeg({ quality: 55 }).toBuffer());
    const mine = await createClaimFile(northwind, "NW-1");
    const earlierNw = await createClaimFile(northwind, "NW-0");
    const entries = [
      sealedEntry(fp, northwind.pid, claimRefFor(mine.id)), // this file's own Seal
      sealedEntry(copy, harbor.pid, `0x${"33".repeat(32)}`), // another carrier
      { ...sealedEntry(copy, northwind.pid, claimRefFor(earlierNw.id)), exactHash: `0x${"44".repeat(32)}` as Hex32 }, // same carrier
    ];
    const alerts = await raiseDuplicateAlerts(db, entries, {
      claimFileId: mine.id,
      claimRef: claimRefFor(mine.id),
      carrierId: northwind.pid,
      fingerprint: fp,
    });
    expect(alerts.map((a) => a.sameCarrier).sort()).toEqual([false, true]);
    expect(alerts.every((a) => a.matchedKind === "sealed" && !a.exact)).toBe(true);

    // Idempotent: the same source never alerts twice for the same match.
    expect(await raiseDuplicateAlerts(db, entries, { claimFileId: mine.id, claimRef: claimRefFor(mine.id), carrierId: northwind.pid, fingerprint: fp })).toEqual([]);

    // Only the owning Carrier can list them.
    expect(await listDuplicateAlerts(northwind, mine.id)).toHaveLength(2);
    expect(await listDuplicateAlerts(harbor, mine.id)).toEqual([]);

    // A same-carrier match names the Claim File it is in (the Carrier's own data); another carrier's never does.
    await db.insert(deviceKeys).values({ keyId: `0x${"11".repeat(32)}`, credentialId: "cred-evidence-test-1", qx: `0x${"01".repeat(32)}`, qy: `0x${"02".repeat(32)}` });
    await recordCapture(db, { claimFileId: earlierNw.id, keyId: `0x${"11".repeat(32)}`, exactHash: `0x${"44".repeat(32)}`, txHash: `0x${"22".repeat(32)}`, now: new Date() });
    const listed = await listDuplicateAlerts(northwind, mine.id);
    expect(listed.find((a) => a.sameCarrier)!.matchedClaimFile).toEqual({ id: earlierNw.id, reference: "NW-0" });
    expect(listed.find((a) => !a.sameCarrier)!.matchedClaimFile).toBeNull();
  });

  it("describes match strength from Registry data only", () => {
    expect(matchStrength({ exact: true, distance: 0, tileMatches: 16 })).toBe("Identical file");
    expect(matchStrength({ exact: false, distance: 6, tileMatches: 16 })).toBe("Very strong");
    expect(matchStrength({ exact: false, distance: 40, tileMatches: 13 })).toBe("Partial (13 of 16 regions)");
  });
});

describe("uploadIntoClaimFile (FR-14)", () => {
  it("verifies, keeps the image in Carrier storage with a preview, and raises alerts", async () => {
    const fp = await fingerprintFile(photo);
    const file = await createClaimFile(harbor, "HB-9");
    const entries = async () => [sealedEntry(fp, northwind.pid, `0x${"55".repeat(32)}`)];
    const forwarded = await sharp(photo).jpeg({ quality: 60 }).toBuffer();

    const r = await uploadIntoClaimFile(harbor, storage, entries, 31337, file.id, forwarded);
    expect(r).toMatchObject({ ok: true, verdict: "derived-copy", alerts: 1 });
    const [u] = await listUploads(harbor, file.id);
    expect(u).toMatchObject({ verdict: "derived-copy", matchedExactHash: fp.exactHash });

    const key = await evidenceImageKey(harbor, file.id, { uploadId: u!.id });
    const preview = await storage.get(key!);
    expect((await sharp(preview!).metadata()).format).toBe("jpeg");

    const [alert] = await listDuplicateAlerts(harbor, file.id);
    expect(alert).toMatchObject({ sameCarrier: false, matchedKind: "sealed" });
  });

  it("never lets one Carrier upload into, list or read another Carrier's Claim File (FR-15)", async () => {
    const file = await createClaimFile(northwind, "NW-SECRET");
    expect(await uploadIntoClaimFile(harbor, storage, async () => [], 31337, file.id, photo)).toMatchObject({ ok: false, status: 404 });
    await uploadIntoClaimFile(northwind, storage, async () => [], 31337, file.id, photo);
    const [u] = await listUploads(northwind, file.id);
    expect(await listUploads(harbor, file.id)).toEqual([]);
    expect(await evidenceImageKey(harbor, file.id, { uploadId: u!.id })).toBeNull();
    expect(await evidenceImageKey(northwind, file.id, { uploadId: u!.id })).not.toBeNull();
  });
});
