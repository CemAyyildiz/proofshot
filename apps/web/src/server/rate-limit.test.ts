import { describe, expect, it } from "vitest";
import { testDb } from "./test-db";
import { DAY_MS, consume } from "./rate-limit";

describe("consume", () => {
  it("allows up to the limit per window and resets in the next window", async () => {
    const db = await testDb();
    const t = new Date("2026-09-28T10:00:00Z");
    const results = [];
    for (let i = 0; i < 4; i++) results.push((await consume(db, "b", 3, DAY_MS, t)).allowed);
    expect(results).toEqual([true, true, true, false]);
    expect((await consume(db, "other", 3, DAY_MS, t)).allowed).toBe(true);
    expect((await consume(db, "b", 3, DAY_MS, new Date(t.getTime() + DAY_MS))).allowed).toBe(true);
  });

  it("can consume several units at once (e.g. a batch of images)", async () => {
    const db = await testDb();
    const t = new Date("2026-09-28T10:00:00Z");
    expect(await consume(db, "w", 10, DAY_MS, t, 7)).toMatchObject({ allowed: true, count: 7, remaining: 3 });
    expect(await consume(db, "w", 10, DAY_MS, t, 4)).toMatchObject({ allowed: false, count: 11 });
  });

  it("is atomic under concurrency", async () => {
    const db = await testDb();
    const t = new Date();
    const out = await Promise.all(Array.from({ length: 20 }, () => consume(db, "c", 5, DAY_MS, t)));
    expect(out.filter((r) => r.allowed)).toHaveLength(5);
  });
});
