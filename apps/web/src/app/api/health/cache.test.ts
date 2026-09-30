import { describe, expect, it, vi } from "vitest";

const status = vi.fn(async () => ({ balanceWei: 5n * 10n ** 18n, paused: false, baseFeeWei: 100n * 10n ** 9n }));
const relayer = { status }; // one process-wide relayer, as getRelayer() returns
vi.mock("@/server/chain/relayer", async (orig) => ({
  ...(await orig<typeof import("@/server/chain/relayer")>()),
  getRelayer: () => relayer,
}));

describe("GET /api/health under load", () => {
  it("reads the chain at most once per 15 s however often it is called, and retries at once after a failure", async () => {
    const { GET } = await import("./route");
    await Promise.all(Array.from({ length: 20 }, () => GET()));
    expect(status).toHaveBeenCalledTimes(1);

    vi.useFakeTimers({ now: Date.now() + 16_000 });
    status.mockRejectedValueOnce(new Error("rpc down"));
    expect((await GET()).status).toBe(503); // chain-unreachable
    await GET();
    expect(status).toHaveBeenCalledTimes(3); // the failure wasn't served from the cache
    vi.useRealTimers();
  });
});
