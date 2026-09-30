import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { testDb } from "../test-db";
import { carriers, users } from "../db/schema";
import { DEMO_SESSION_TTL_MS, MAGIC_LINK_TTL_MS, SESSION_TTL_MS, endSession, issueMagicLink, openDemoSession, redeemMagicLink, sessionUser } from "./core";

let db: Db;
beforeEach(async () => {
  db = await testDb();
});

describe("magic link sign-in", () => {
  it("signs a known Carrier User into their Carrier", async () => {
    const token = await issueMagicLink(db, "  Marcus@Northwind.demo ");
    expect(token).toBeTruthy();
    const session = await redeemMagicLink(db, token!);
    const user = await sessionUser(db, session!);
    expect(user).toMatchObject({ email: "marcus@northwind.demo", carrierName: "Northwind Mutual" });
  });

  it("issues nothing for unknown emails", async () => {
    expect(await issueMagicLink(db, "nobody@example.com")).toBeNull();
  });

  it("is single-use", async () => {
    const token = (await issueMagicLink(db, "dana@harbor.demo"))!;
    expect(await redeemMagicLink(db, token)).toBeTruthy();
    expect(await redeemMagicLink(db, token)).toBeNull();
  });

  it("expires", async () => {
    const t0 = new Date("2026-09-28T10:00:00Z");
    const token = (await issueMagicLink(db, "dana@harbor.demo", t0))!;
    expect(await redeemMagicLink(db, token, new Date(t0.getTime() + MAGIC_LINK_TTL_MS + 1))).toBeNull();
  });

  it("rejects garbage tokens", async () => {
    expect(await redeemMagicLink(db, "not-a-token")).toBeNull();
  });
});

describe("sessions", () => {
  it("expire and can be ended", async () => {
    const t0 = new Date("2026-09-28T10:00:00Z");
    const session = (await redeemMagicLink(db, (await issueMagicLink(db, "dana@harbor.demo", t0))!, t0))!;
    expect(await sessionUser(db, session, new Date(t0.getTime() + SESSION_TTL_MS - 1))).not.toBeNull();
    expect(await sessionUser(db, session, new Date(t0.getTime() + SESSION_TTL_MS + 1))).toBeNull();
    await endSession(db, session);
    expect(await sessionUser(db, session, t0)).toBeNull();
  });
});

describe("demo sessions", () => {
  it("open only for seeded demo carriers, and expire after two hours", async () => {
    const t0 = new Date("2026-09-30T10:00:00Z");
    const token = await openDemoSession(db, "harbor", t0);
    expect(await sessionUser(db, token!, t0)).toMatchObject({ carrierName: "Harbor Insurance", isDemo: true });
    expect(await sessionUser(db, token!, new Date(t0.getTime() + DEMO_SESSION_TTL_MS + 1))).toBeNull();
  });

  it("never open for a real carrier, the sandbox or an unknown slug", async () => {
    const [real] = await db.insert(carriers).values({ slug: "acme", name: "Acme Insurance", pseudonymousId: "0x01" }).returning();
    await db.insert(users).values({ carrierId: real!.id, email: "claims@acme.example" });
    expect(await openDemoSession(db, "acme")).toBeNull();
    expect(await openDemoSession(db, "sandbox")).toBeNull();
    expect(await openDemoSession(db, "nope")).toBeNull();
  });
});
