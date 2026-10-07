import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./index", () => ({ registryEntries: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: () => ({}) }));

const { repeatWithBackoff } = await import("./keep-warm");

describe("repeatWithBackoff (keeps the Registry index warm)", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("syncs at once, then on every interval, and stops when told to", async () => {
    const sync = vi.fn().mockResolvedValue(undefined);
    const stop = repeatWithBackoff(sync, 3_000, 60_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9_000);
    expect(sync).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sync).toHaveBeenCalledTimes(4);
  });

  it("backs off while the chain is unreachable, up to the cap, and recovers on the first success", async () => {
    const sync = vi.fn().mockRejectedValue(new Error("rpc down"));
    const stop = repeatWithBackoff(sync, 1_000, 4_000);
    await vi.advanceTimersByTimeAsync(0); // fails; next try in 2 s
    await vi.advanceTimersByTimeAsync(1_999);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); // fails; next in 4 s
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4_000); // fails; stays at the 4 s cap
    expect(sync).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(3_999);
    expect(sync).toHaveBeenCalledTimes(3);
    sync.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(1); // succeeds; back to 1 s
    expect(sync).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sync).toHaveBeenCalledTimes(5);
    stop();
  });
});
