import { describe, expect, it } from "vitest";
import { testDb } from "../test-db";
import { carriers, users } from "./schema";
import { seed } from "./seed";

describe("seed", () => {
  it("creates two demo Carriers plus the sandbox, each with a bytes32 pseudonymous ID", async () => {
    const db = await testDb();
    const rows = await db.select().from(carriers);
    expect(rows.map((r) => r.slug).sort()).toEqual(["harbor", "northwind", "sandbox"]);
    for (const r of rows) expect(r.pseudonymousId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(new Set(rows.map((r) => r.pseudonymousId)).size).toBe(3);
    expect(await db.select().from(users)).toHaveLength(2);
  });

  it("is idempotent and never rotates pseudonymous IDs", async () => {
    const db = await testDb();
    const before = await db.select().from(carriers);
    await seed(db, { northwind: ["New@Example.com"] });
    const after = await db.select().from(carriers);
    expect(after).toEqual(before);
    const emails = (await db.select().from(users)).map((u) => u.email);
    expect(emails).toContain("new@example.com");
    expect(emails).toHaveLength(3);
  });
});
