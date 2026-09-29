import { generateKeyPairSync, randomBytes } from "node:crypto";
import { base64UrlEncode, spkiToXY } from "@proofshot/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { deviceKeys } from "../db/schema";
import { createClaimFile, revokeClaimLink, type CarrierScope } from "../dal/claim-files";
import { carrierScope, testDb } from "../test-db";
import { ENROLLMENTS_PER_LINK_PER_DAY, enrollDeviceKey, keyIdFor } from "./enroll";

let db: Db;
let scope: CarrierScope;
let token: string;
let fileId: string;
const registerDeviceKey = vi.fn<Relayer["registerDeviceKey"]>();
const relayer = () => ({ registerDeviceKey }) as unknown as Relayer;

function passkey() {
  const { publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const spki = new Uint8Array(publicKey.export({ format: "der", type: "spki" }));
  return { credentialId: base64UrlEncode(randomBytes(32)), publicKey: base64UrlEncode(spki), ...spkiToXY(spki) };
}

beforeEach(async () => {
  db = await testDb();
  scope = await carrierScope(db, "northwind");
  const file = await createClaimFile(scope, "HAIL-1");
  token = file.link.token;
  fileId = file.id;
  registerDeviceKey.mockReset().mockResolvedValue("0xabc");
});

describe("enrollDeviceKey", () => {
  it("stores the key and registers it onchain", async () => {
    const pk = passkey();
    const r = await enrollDeviceKey(db, relayer, token, pk);
    expect(r).toEqual({ ok: true, keyId: keyIdFor(pk.credentialId), status: "registered" });
    expect(registerDeviceKey).toHaveBeenCalledWith(keyIdFor(pk.credentialId), pk.qx, pk.qy);
    expect(await db.select().from(deviceKeys)).toHaveLength(1);
  });

  it("treats a returning device as existing without another onchain write", async () => {
    const pk = passkey();
    await enrollDeviceKey(db, relayer, token, pk);
    const r = await enrollDeviceKey(db, relayer, token, pk);
    expect(r).toMatchObject({ ok: true, status: "existing" });
    expect(registerDeviceKey).toHaveBeenCalledTimes(1);
  });

  it("rejects a different public key under a known credential ID", async () => {
    const pk = passkey();
    await enrollDeviceKey(db, relayer, token, pk);
    const other = passkey();
    const r = await enrollDeviceKey(db, relayer, token, { credentialId: pk.credentialId, publicKey: other.publicKey });
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects inactive or unknown links and malformed bodies", async () => {
    expect(await enrollDeviceKey(db, relayer, "A".repeat(32), passkey())).toMatchObject({ ok: false, status: 404 });
    expect(await enrollDeviceKey(db, relayer, token, { credentialId: "x" })).toMatchObject({ ok: false, status: 400 });
    await revokeClaimLink(scope, fileId);
    expect(await enrollDeviceKey(db, relayer, token, passkey())).toMatchObject({ ok: false, status: 410 });
    expect(registerDeviceKey).not.toHaveBeenCalled();
  });

  it("rate-limits new devices per link", async () => {
    for (let i = 0; i < ENROLLMENTS_PER_LINK_PER_DAY; i++) expect((await enrollDeviceKey(db, relayer, token, passkey())).ok).toBe(true);
    expect(await enrollDeviceKey(db, relayer, token, passkey())).toMatchObject({ ok: false, status: 429 });
  });

  it("rolls back the stored key when the onchain write fails", async () => {
    registerDeviceKey.mockRejectedValueOnce(new Error("rpc down"));
    const r = await enrollDeviceKey(db, relayer, token, passkey());
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(await db.select().from(deviceKeys)).toHaveLength(0);
  });
});
