import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Relayer } from "../chain/relayer";
import type { Db } from "../db/client";
import { carriers } from "../db/schema";
import type { CarrierScope } from "../dal/claim-files";
import { testDb } from "../test-db";
import { IMPORT_BATCH, IMPORTS_PER_CARRIER_PER_DAY, importBatch } from "./import";

const fixture = new URL("../../../../../packages/fingerprint/test-fixtures/scene.jpg", import.meta.url);
let db: Db;
let scope: CarrierScope;
let pid: string;
const importRecords = vi.fn<Relayer["importRecords"]>();
const relayer = () => ({ importRecords }) as unknown as Relayer;

beforeEach(async () => {
  db = await testDb();
  const [c] = await db.select().from(carriers).where(eq(carriers.slug, "harbor"));
  scope = { db, carrierId: c!.id };
  pid = c!.pseudonymousId;
  importRecords.mockReset().mockResolvedValue({ txHash: "0xabc", blockNumber: 5n });
});

describe("importBatch (FR-13)", () => {
  it("writes fingerprints under the Carrier's pseudonymous ID and reports unreadable files", async () => {
    const photo = new Uint8Array(await readFile(fixture));
    const r = await importBatch(scope, relayer, [
      { name: "old-claim.jpg", bytes: photo },
      { name: "notes.txt", bytes: new TextEncoder().encode("hello") },
    ]);
    expect(r).toMatchObject({ ok: true, txHash: "0xabc" });
    if (!r.ok) return;
    expect(r.items.map((i) => i.status)).toEqual(["imported", "unreadable"]);
    const [carrierId, records] = importRecords.mock.calls[0]!;
    expect(carrierId).toBe(pid);
    expect(records).toHaveLength(1);
    expect(records[0]!.tiles).toHaveLength(16);
    expect(Object.keys(records[0]!).sort()).toEqual(["exactHash", "height", "pHash", "tiles", "width"]); // no image bytes
  });

  it("rejects empty or oversize batches and enforces the daily Carrier ceiling", async () => {
    expect(await importBatch(scope, relayer, [])).toMatchObject({ ok: false, status: 400 });
    const many = Array.from({ length: IMPORT_BATCH + 1 }, (_, i) => ({ name: `${i}`, bytes: new Uint8Array() }));
    expect(await importBatch(scope, relayer, many)).toMatchObject({ ok: false, status: 400 });
    const { consume } = await import("../rate-limit");
    const now = new Date("2026-09-28T12:00:00Z");
    for (let i = 0; i < IMPORTS_PER_CARRIER_PER_DAY; i++) await consume(db, `import:${scope.carrierId}`, IMPORTS_PER_CARRIER_PER_DAY, 86_400_000, now);
    expect(await importBatch(scope, relayer, [{ name: "x.jpg", bytes: new Uint8Array(1) }], now)).toMatchObject({ ok: false, status: 429 });
  });

  it("surfaces a failed Registry write as retryable", async () => {
    importRecords.mockRejectedValueOnce(new Error("rpc down"));
    const r = await importBatch(scope, relayer, [{ name: "a.jpg", bytes: new Uint8Array(await readFile(fixture)) }]);
    expect(r).toMatchObject({ ok: false, status: 502 });
  });
});
