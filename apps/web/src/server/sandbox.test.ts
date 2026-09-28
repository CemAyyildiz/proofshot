import { describe, expect, it } from "vitest";
import { resolveClaimLink } from "./dal/claim-files";
import { testDb } from "./test-db";
import { SANDBOX_FILES_PER_DAY, startSandbox } from "./sandbox";

describe("startSandbox", () => {
  it("creates an active Claim Link in the sandbox Carrier", async () => {
    const db = await testDb();
    const r = await startSandbox(db, "1.2.3.4");
    expect(r.ok).toBe(true);
    const link = await resolveClaimLink(db, (r as { token: string }).token);
    expect(link).toMatchObject({ carrierName: "Proofshot Sandbox", state: "active" });
  });

  it("limits how many demos one visitor starts per day", async () => {
    const db = await testDb();
    for (let i = 0; i < SANDBOX_FILES_PER_DAY; i++) expect((await startSandbox(db, "5.6.7.8")).ok).toBe(true);
    expect((await startSandbox(db, "5.6.7.8")).ok).toBe(false);
    expect((await startSandbox(db, "9.9.9.9")).ok).toBe(true);
  });
});
