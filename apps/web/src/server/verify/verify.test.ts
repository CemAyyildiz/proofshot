import { readFile } from "node:fs/promises";
import type { Hex32, RegistryEntry } from "@proofshot/fingerprint";
import { fingerprintFile } from "@proofshot/fingerprint/node";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { verifications } from "../db/schema";
import { testDb } from "../test-db";
import { MAX_UPLOAD_BYTES, getVerification, verifyImage } from "./verify";

const fixture = new URL("../../../../../packages/fingerprint/test-fixtures/scene.jpg", import.meta.url);
let db: Db;
let photo: Buffer;
let entries: RegistryEntry[];

beforeAll(async () => {
  db = await testDb();
  photo = await readFile(fixture);
  const fp = await fingerprintFile(photo);
  entries = [
    {
      kind: "sealed",
      exactHash: fp.exactHash,
      pHash: fp.pHash,
      tiles: fp.tiles,
      width: fp.width,
      height: fp.height,
      carrierId: `0x${"ab".repeat(32)}` as Hex32,
      blockNumber: 42n,
      txHash: `0x${"cd".repeat(32)}` as Hex32,
      blockTimestamp: 1_790_000_000,
    },
  ];
});

const source = () => Promise.resolve(entries);

describe("verifyImage", () => {
  it("returns Original for the sealed file and records the outcome without the image", async () => {
    const r = await verifyImage(db, 31337, source, photo);
    expect(r.ok && r.verdict.kind).toBe("original");
    if (!r.ok) return;
    const row = await getVerification(db, r.id);
    expect(row).toMatchObject({ verdict: "original", matchedExactHash: entries[0]!.exactHash, matchedKind: "sealed" });
    expect(Object.values(row!).some((v) => v instanceof Uint8Array)).toBe(false);
  });

  it("returns Derived Copy for a recompressed copy", async () => {
    const r = await verifyImage(db, 31337, source, await sharp(photo).jpeg({ quality: 45 }).toBuffer());
    expect(r.ok && r.verdict).toMatchObject({ kind: "derived-copy", alterationCheck: "passed" });
  });

  it("returns No Record for an unrelated image", async () => {
    const other = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123456" } })
      .composite([{ input: Buffer.from('<svg width="640" height="480"><circle cx="100" cy="100" r="80" fill="#fff"/></svg>') }])
      .png()
      .toBuffer();
    const r = await verifyImage(db, 31337, source, other);
    expect(r.ok && r.verdict.kind).toBe("no-record");
  });

  it("rejects empty, oversize and non-image uploads with specific messages", async () => {
    expect(await verifyImage(db, 31337, source, new Uint8Array())).toMatchObject({ ok: false, status: 400 });
    expect(await verifyImage(db, 31337, source, new Uint8Array(MAX_UPLOAD_BYTES + 1))).toMatchObject({ ok: false, status: 413 });
    expect(await verifyImage(db, 31337, source, new TextEncoder().encode("%PDF-1.7 not an image"))).toMatchObject({
      ok: false,
      status: 415,
    });
    // A small file that decodes to 256 MP is refused before decoding, with its own message.
    const bomb = await sharp({ create: { width: 16000, height: 16000, channels: 3, background: "#808080" } }).png().toBuffer();
    expect(await verifyImage(db, 31337, source, bomb)).toMatchObject({ ok: false, status: 413, error: expect.stringMatching(/over 50 megapixels/) });
    expect(await db.select().from(verifications)).toHaveLength(3); // only the three successful verifications above
  });

  it("rejects malformed receipt ids", async () => {
    expect(await getVerification(db, "../../etc")).toBeNull();
  });
});
