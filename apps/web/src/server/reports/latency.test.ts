import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { captures, deviceKeys } from "../db/schema";
import { createClaimFile } from "../dal/claim-files";
import { carrierScope, testDb } from "../test-db";
import { latencyMarkdown, latencyReport, percentile, stats } from "./latency";

let db: Db;
let n = 0;

async function sealWith(carrier: "northwind" | "sandbox", timings: { shutterToSignedMs?: number; shutterToSealedMs?: number } | null, sealedAt = new Date()) {
  const file = await createClaimFile(await carrierScope(db, carrier), `LAT-${n}`);
  const exactHash = `0x${(++n).toString(16).padStart(64, "0")}`;
  await db.insert(captures).values({ claimFileId: file.id, deviceKeyId: "0x01", exactHash, txHash: "0xfeed", sealedAt, timings });
}

beforeEach(async () => {
  db = await testDb();
  await db.insert(deviceKeys).values({ keyId: "0x01", credentialId: "cred", qx: "0x", qy: "0x" });
});

describe("percentile (nearest rank)", () => {
  it("picks an actual sample, never an interpolated one", () => {
    const v = Array.from({ length: 20 }, (_, i) => (i + 1) * 100); // 100 … 2000
    expect(percentile(v, 0.5)).toBe(1000);
    expect(percentile(v, 0.95)).toBe(1900);
    expect(percentile([700], 0.95)).toBe(700);
    expect(stats([])).toBeNull();
    expect(stats([3, -1, Number.NaN, 1])).toEqual({ n: 2, p50: 1, p95: 3, max: 3 });
  });
});

describe("latencyReport", () => {
  it("splits Claim Links from the Try-it sandbox, skips Seals without timings, and honours --since", async () => {
    for (const ms of [800, 1200, 1500, 2500]) await sealWith("northwind", { shutterToSignedMs: ms / 2, shutterToSealedMs: ms });
    await sealWith("sandbox", { shutterToSealedMs: 4000 });
    await sealWith("northwind", null);
    await sealWith("northwind", { shutterToSealedMs: 9000 }, new Date("2026-01-01T00:00:00Z"));

    const r = await latencyReport(db, new Date("2026-09-01T00:00:00Z"));
    expect(r.sealed.claimLinks).toEqual({ n: 4, p50: 1200, p95: 2500, max: 2500 });
    expect(r.sealed.tryIt).toEqual({ n: 1, p50: 4000, p95: 4000, max: 4000 });
    expect(r.sealed.all).toMatchObject({ n: 5, p95: 4000 });
    expect(r.signed).toMatchObject({ n: 4, p95: 1250 });

    const md = latencyMarkdown(r, { network: "testnet", generatedAt: new Date("2026-10-01T00:00:00Z") });
    expect(md).toContain("| Claim Links | 4 | 1.20 s | **2.50 s** | 2.50 s |");
    expect(md).toContain("Target p95 ≤ 3 s: **not met**.");
  });

  it("reports no data instead of inventing numbers", async () => {
    const md = latencyMarkdown(await latencyReport(db), { network: "mainnet", generatedAt: new Date() });
    expect(md).toContain("| All | 0 | — | — | — |");
    expect(md).toContain("Target p95 ≤ 3 s: no data.");
  });
});
