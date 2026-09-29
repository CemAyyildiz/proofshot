import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/health", () => {
  it("reports ok with the configured network when no relayer is configured", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, network: "testnet", chainId: 10143, relayer: "not-configured" });
  });
});
