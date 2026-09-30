import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../db/client";
import { carrierScope, testDb } from "../test-db";
import { CLAIM_LINK_TTL_MS, type CarrierScope, createClaimFile, getClaimFile, listClaimFiles, resolveClaimLink, revokeClaimLink } from "./claim-files";

let db: Db;
let northwind: CarrierScope;
let harbor: CarrierScope;

beforeAll(async () => {
  db = await testDb();
  northwind = await carrierScope(db, "northwind");
  harbor = await carrierScope(db, "harbor");
});

describe("createClaimFile", () => {
  it("creates a Claim File with a unique 14-day Claim Link", async () => {
    const now = new Date("2026-09-28T12:00:00Z");
    const a = await createClaimFile(northwind, "  AUTO-2026-0042 ", now);
    const b = await createClaimFile(northwind, "AUTO-2026-0043", now);
    expect(a.reference).toBe("AUTO-2026-0042");
    expect(a.status).toBe("awaiting_evidence");
    expect(a.link.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a.link.token).not.toBe(b.link.token);
    expect(a.link.expiresAt.getTime() - now.getTime()).toBe(CLAIM_LINK_TTL_MS);
  });

  it("validates the reference", async () => {
    await expect(createClaimFile(northwind, "   ")).rejects.toThrow(RangeError);
    await expect(createClaimFile(northwind, "x".repeat(81))).rejects.toThrow(RangeError);
  });
});

describe("Claim Link resolution", () => {
  it("resolves to exactly one Claim File with Carrier name and reference", async () => {
    const file = await createClaimFile(northwind, "HAIL-7");
    const link = await resolveClaimLink(db, file.link.token);
    expect(link).toMatchObject({ claimFileId: file.id, reference: "HAIL-7", carrierName: "Northwind Mutual", state: "active" });
  });

  it("reports expired links", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    const file = await createClaimFile(northwind, "OLD-1", t0);
    const link = await resolveClaimLink(db, file.link.token, new Date(t0.getTime() + CLAIM_LINK_TTL_MS));
    expect(link?.state).toBe("expired");
  });

  it("reports revoked links; revocation is idempotent", async () => {
    const file = await createClaimFile(northwind, "REV-1");
    expect(await revokeClaimLink(northwind, file.id)).toBe(true);
    expect(await revokeClaimLink(northwind, file.id)).toBe(true);
    expect((await resolveClaimLink(db, file.link.token))?.state).toBe("revoked");
  });

  it("returns null for unknown or malformed tokens", async () => {
    expect(await resolveClaimLink(db, "A".repeat(32))).toBeNull();
    expect(await resolveClaimLink(db, "'; drop table claim_links; --")).toBeNull();
  });
});

describe("tenant isolation (FR-15)", () => {
  it("never exposes one Carrier's Claim Files to another", async () => {
    const secret = await createClaimFile(northwind, "NW-PRIVATE");
    await createClaimFile(harbor, "HB-OWN");

    expect(await getClaimFile(harbor, secret.id)).toBeNull();
    expect(await revokeClaimLink(harbor, secret.id)).toBe(false);
    expect((await resolveClaimLink(db, secret.link.token))?.state).toBe("active"); // untouched

    const harborRefs = (await listClaimFiles(harbor)).map((f) => f.reference);
    expect(harborRefs).toContain("HB-OWN");
    expect(harborRefs).not.toContain("NW-PRIVATE");
    expect((await listClaimFiles(northwind)).map((f) => f.reference)).not.toContain("HB-OWN");
  });

  it("treats malformed ids as not found", async () => {
    expect(await getClaimFile(northwind, "../etc/passwd")).toBeNull();
  });
});

describe("listClaimFiles search and paging", () => {
  it("filters by reference, case-insensitively and literally, and pages newest first", async () => {
    const db = await testDb();
    const scope = await carrierScope(db, "northwind");
    for (const ref of ["HAIL-100", "hail-200", "FIRE-300", "WIND_50%"]) await createClaimFile(scope, ref);
    expect((await listClaimFiles(scope, { q: "hail" })).map((f) => f.reference).sort()).toEqual(["HAIL-100", "hail-200"]);
    // % and _ are data, not wildcards.
    expect((await listClaimFiles(scope, { q: "_50%" })).map((f) => f.reference)).toEqual(["WIND_50%"]);
    expect(await listClaimFiles(scope, { q: "%" })).toHaveLength(1);
    const page1 = await listClaimFiles(scope, { limit: 3 });
    const page2 = await listClaimFiles(scope, { limit: 3, offset: 3 });
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(1);
    expect(new Set([...page1, ...page2].map((f) => f.id)).size).toBe(4);
  });
});
