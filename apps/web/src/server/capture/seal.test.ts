import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { captures, carriers, claimLinks, deviceKeys } from "../db/schema";
import { createClaimFile, revokeClaimLink, type CarrierScope } from "../dal/claim-files";
import { testDb } from "../test-db";
import { SEALS_PER_KEY_PER_DAY, SEALS_PER_LINK, claimRefFor, sealCapture, sealContext } from "./seal";

const h32 = (): `0x${string}` => `0x${randomBytes(32).toString("hex")}`;
const KEY = h32();

let db: Db;
let scope: CarrierScope;
let token: string;
let fileId: string;
let carrierId: `0x${string}`;
const seal = vi.fn<Relayer["seal"]>();
const latestBlock = vi.fn<Relayer["latestBlock"]>();
const relayer = () => ({ seal, latestBlock }) as unknown as Relayer;

function body(overrides: Record<string, unknown> = {}) {
  return {
    keyId: KEY,
    record: {
      exactHash: h32(),
      pHash: h32(),
      tiles: Array.from({ length: 16 }, h32),
      width: 4032,
      height: 3024,
      locCommit: h32(),
      deviceTime: 1_790_000_000,
      claimRef: claimRefFor(fileId),
      carrierId,
      refBlock: "1000",
    },
    auth: { r: h32(), s: h32(), challengeIndex: 23, typeIndex: 1, authenticatorData: "0x" + "00".repeat(37), clientDataJSON: "{}" },
    locSalt: h32(),
    ...overrides,
  };
}

beforeEach(async () => {
  db = await testDb();
  const [c] = await db.select().from(carriers).where(eq(carriers.slug, "northwind"));
  scope = { db, carrierId: c!.id };
  carrierId = c!.pseudonymousId as `0x${string}`;
  const file = await createClaimFile(scope, "HAIL-1");
  token = file.link.token;
  fileId = file.id;
  await db.insert(deviceKeys).values({ keyId: KEY, credentialId: "cred-1234567890abcdef", qx: h32(), qy: h32() });
  seal.mockReset().mockResolvedValue({ txHash: "0xfeed", blockNumber: 1003n });
  latestBlock.mockReset().mockResolvedValue({ number: 1000n, hash: "0xbeef" });
});

describe("sealContext", () => {
  it("binds the Claim File and Carrier from the link and the latest block", async () => {
    expect(await sealContext(db, relayer, token)).toEqual({
      claimRef: claimRefFor(fileId),
      carrierId,
      refBlock: "1000",
      sealsRemaining: SEALS_PER_LINK,
    });
  });

  it("is unavailable for inactive links", async () => {
    await revokeClaimLink(scope, fileId);
    expect(await sealContext(db, relayer, token)).toBeNull();
  });
});

describe("sealCapture", () => {
  it("relays the Seal, stores the Capture and returns the receipt URL", async () => {
    const b = body();
    const r = await sealCapture(db, relayer, token, b);
    expect(r).toEqual({ ok: true, txHash: "0xfeed", blockNumber: "1003", receiptUrl: `/r/${b.record.exactHash}` });
    expect(seal).toHaveBeenCalledWith(KEY, expect.objectContaining({ refBlock: 1000n, deviceTime: 1_790_000_000n }), b.auth);
    const [row] = await db.select().from(captures);
    expect(row).toMatchObject({ claimFileId: fileId, exactHash: b.record.exactHash, txHash: "0xfeed", locSalt: b.locSalt });
    const [link] = await db.select().from(claimLinks);
    expect(link!.sealCount).toBe(1);
  });

  it("refuses records that name another Claim File or Carrier", async () => {
    const other = body();
    other.record.claimRef = h32();
    expect(await sealCapture(db, relayer, token, other)).toMatchObject({ ok: false, status: 400 });
    const other2 = body();
    other2.record.carrierId = h32();
    expect(await sealCapture(db, relayer, token, other2)).toMatchObject({ ok: false, status: 400 });
    expect(seal).not.toHaveBeenCalled();
  });

  it("refuses unknown Device Keys, malformed bodies and inactive links", async () => {
    expect(await sealCapture(db, relayer, token, body({ keyId: h32() }))).toMatchObject({ ok: false, status: 400 });
    expect(await sealCapture(db, relayer, token, { keyId: KEY })).toMatchObject({ ok: false, status: 400 });
    const tiles15 = body();
    tiles15.record.tiles = tiles15.record.tiles.slice(1);
    expect(await sealCapture(db, relayer, token, tiles15)).toMatchObject({ ok: false, status: 400 });
    await revokeClaimLink(scope, fileId);
    expect(await sealCapture(db, relayer, token, body())).toMatchObject({ ok: false, status: 410 });
    expect(seal).not.toHaveBeenCalled();
  });

  it("returns the existing receipt only when this Claim File already sealed the photo", async () => {
    const b = body();
    await sealCapture(db, relayer, token, b);
    expect(await sealCapture(db, relayer, token, b)).toMatchObject({ ok: false, status: 409, receiptUrl: `/r/${b.record.exactHash}` });

    const other = await createClaimFile(scope, "OTHER");
    const reuse = { ...b, record: { ...b.record, claimRef: claimRefFor(other.id) } };
    const r = await sealCapture(db, relayer, other.link.token, reuse);
    expect(r).toMatchObject({ ok: false, status: 409 });
    expect(r.ok === false && r.receiptUrl).toBeUndefined();

    seal.mockRejectedValueOnce(new Error("reverted with custom error AlreadySealed(0x…)"));
    const onchain = await sealCapture(db, relayer, token, body());
    expect(onchain).toMatchObject({ ok: false, status: 409 });
    expect(onchain.ok === false && onchain.receiptUrl).toBeUndefined();
  });

  it("reconciles a Seal that landed onchain but whose DB write was lost", async () => {
    const b = body();
    seal.mockRejectedValueOnce(new Error("reverted with custom error AlreadySealed(0x…)"));
    const findSealed = vi.fn().mockResolvedValue({ txHash: "0xc0ffee", blockNumber: 1004n, claimRef: claimRefFor(fileId), keyId: KEY });
    const r = await sealCapture(db, relayer, token, b, { findSealed });
    expect(r).toEqual({ ok: true, txHash: "0xc0ffee", blockNumber: "1004", receiptUrl: `/r/${b.record.exactHash}` });
    expect(findSealed).toHaveBeenCalledWith(b.record.exactHash);
    const [row] = await db.select().from(captures);
    expect(row).toMatchObject({ exactHash: b.record.exactHash, txHash: "0xc0ffee", claimFileId: fileId });
    expect((await db.select().from(claimLinks))[0]!.sealCount).toBe(1);
  });

  it("does not adopt an onchain Seal from another Claim File or Device Key", async () => {
    for (const other of [{ claimRef: h32(), keyId: KEY }, { claimRef: claimRefFor(fileId), keyId: h32() }]) {
      seal.mockRejectedValueOnce(new Error("AlreadySealed"));
      const r = await sealCapture(db, relayer, token, body(), { findSealed: async () => ({ txHash: "0x1", blockNumber: 1n, ...other }) });
      expect(r).toMatchObject({ ok: false, status: 409 });
    }
    expect(await db.select().from(captures)).toHaveLength(0);
    expect((await db.select().from(claimLinks))[0]!.sealCount).toBe(0);
  });

  it("tells the Capturer the truth when the service can't write, and releases the reservation", async () => {
    const cases: [string, number, RegExp][] = [
      ["insufficient funds for gas * price + value", 503, /paused on our side/],
      ["reverted: EnforcedPause()", 503, /paused on our side/],
      ["Timed out while waiting for transaction with hash 0x1", 504, /taking longer than usual/],
    ];
    for (const [message, status, text] of cases) {
      seal.mockRejectedValueOnce(new Error(message));
      const r = await sealCapture(db, relayer, token, body());
      expect(r).toMatchObject({ ok: false, status });
      expect(r.ok === false && r.error).toMatch(text);
    }
    expect((await db.select().from(claimLinks))[0]!.sealCount).toBe(0);
  });

  it("releases the reserved Seal when the chain rejects it", async () => {
    seal.mockRejectedValueOnce(new Error("InvalidSignature()"));
    expect(await sealCapture(db, relayer, token, body())).toMatchObject({ ok: false, status: 502 });
    const [link] = await db.select().from(claimLinks);
    expect(link!.sealCount).toBe(0);
    expect(await db.select().from(captures)).toHaveLength(0);
  });

  it(`caps a Claim Link at ${SEALS_PER_LINK} Seals`, async () => {
    await db.update(claimLinks).set({ sealCount: SEALS_PER_LINK - 1 });
    expect((await sealCapture(db, relayer, token, body())).ok).toBe(true);
    expect(await sealCapture(db, relayer, token, body())).toMatchObject({ ok: false, status: 429 });
  });

  it(`caps a Device Key at ${SEALS_PER_KEY_PER_DAY} Seals a day`, async () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const { consume } = await import("../rate-limit");
    for (let i = 0; i < SEALS_PER_KEY_PER_DAY; i++) await consume(db, `seal:key:${KEY}`, SEALS_PER_KEY_PER_DAY, 86_400_000, now);
    expect(await sealCapture(db, relayer, token, body(), { now })).toMatchObject({ ok: false, status: 429 });
  });
});
