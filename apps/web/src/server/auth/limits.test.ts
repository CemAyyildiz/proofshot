import { describe, expect, it } from "vitest";
import { testDb } from "../test-db";
import { SIGNIN_PER_CLIENT_PER_HOUR, signInAllowed } from "./limits";

describe("signInAllowed", () => {
  it("caps links per address, whether or not the account exists", async () => {
    const db = await testDb();
    const now = new Date("2026-09-30T10:00:00Z");
    for (let i = 0; i < 5; i++) expect(await signInAllowed(db, "nobody@example.com", `c${i}`, 5, now)).toBe(true);
    expect(await signInAllowed(db, "nobody@example.com", "c-new", 5, now)).toBe(false);
    expect(await signInAllowed(db, "nobody@example.com", "c-new", 5, new Date(now.getTime() + 3_600_000))).toBe(true);
  });

  it("caps attempts per client across addresses", async () => {
    const db = await testDb();
    const now = new Date("2026-09-30T10:00:00Z");
    for (let i = 0; i < SIGNIN_PER_CLIENT_PER_HOUR; i++) expect(await signInAllowed(db, `u${i}@example.com`, "same", 100, now)).toBe(true);
    expect(await signInAllowed(db, "fresh@example.com", "same", 100, now)).toBe(false);
  });
});
