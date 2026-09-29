import { describe, expect, it } from "vitest";
import { issueMagicLink, redeemMagicLink } from "./auth/core";
import { magicLinkTokens, rateLimits, sessions } from "./db/schema";
import { pruneExpired } from "./maintenance";
import { DAY_MS, consume } from "./rate-limit";
import { testDb } from "./test-db";

describe("pruneExpired", () => {
  it("drops stale rate-limit windows, expired sessions and old sign-in tokens only", async () => {
    const db = await testDb();
    const now = new Date("2026-10-10T12:00:00Z");
    const old = new Date(now.getTime() - 3 * DAY_MS);
    await consume(db, "a", 5, DAY_MS, old);
    await consume(db, "a", 5, DAY_MS, now);
    const oldToken = await issueMagicLink(db, "dana@harbor.demo", old);
    await redeemMagicLink(db, oldToken!, old); // used 3 days ago; its session is still valid for 30 days
    await issueMagicLink(db, "dana@harbor.demo", now); // fresh, unused

    const r = await pruneExpired(db, now);
    expect(r).toEqual({ rateLimits: 1, sessions: 0, signInTokens: 1 });
    expect(await db.select().from(rateLimits)).toHaveLength(1);
    expect(await db.select().from(magicLinkTokens)).toHaveLength(1);
    expect(await db.select().from(sessions)).toHaveLength(1);

    const later = await pruneExpired(db, new Date(now.getTime() + 40 * DAY_MS));
    expect(later.sessions).toBe(1);
  });
});
