import { MAX_SIGNING_LAG_BLOCKS } from "@proofshot/shared";
import { parseEther, parseGwei } from "viem";
import { describe, expect, it, vi } from "vitest";
import { relayerErrorKind } from "./errors";
import { SEND_MARGIN_BLOCKS, STATUS_TTL_MS, assertWindowOpen, cachedStatus, sealingBlocked } from "./readiness";
import type { Relayer } from "./relayer";

const ok = { balanceWei: parseEther("5"), paused: false, baseFeeWei: parseGwei("102") };

describe("cachedStatus", () => {
  it("reads once per TTL for the same relayer, and never reuses a failed read", async () => {
    const status = vi.fn(async () => ok);
    const relayer = { status } as unknown as Relayer;
    const t = 1_000_000;
    await Promise.all([cachedStatus(relayer, t), cachedStatus(relayer, t + 1), cachedStatus(relayer, t + STATUS_TTL_MS)]);
    expect(status).toHaveBeenCalledTimes(1);
    await cachedStatus(relayer, t + STATUS_TTL_MS + 1);
    expect(status).toHaveBeenCalledTimes(2);

    status.mockRejectedValueOnce(new Error("rpc down"));
    await expect(cachedStatus(relayer, t + 2 * STATUS_TTL_MS + 2)).rejects.toThrow("rpc down");
    await cachedStatus(relayer, t + 2 * STATUS_TTL_MS + 3);
    expect(status).toHaveBeenCalledTimes(4);
  });
});

describe("sealingBlocked", () => {
  const cap = parseGwei("500");
  it("names what stops every Seal: pause, a fee above the cap, or a balance that can't pay one", () => {
    expect(sealingBlocked(ok, cap)).toBeNull();
    expect(sealingBlocked({ ...ok, paused: true }, cap)).toBe("paused");
    expect(sealingBlocked({ ...ok, baseFeeWei: parseGwei("501") }, cap)).toBe("fee-too-high");
    expect(sealingBlocked({ ...ok, balanceWei: parseEther("0.01") }, cap)).toBe("unfunded"); // < 150k gas at 102 gwei
    expect(sealingBlocked({ ...ok, balanceWei: parseEther("0.02") }, cap)).toBeNull();
  });
});

describe("assertWindowOpen", () => {
  it(`refuses to send with fewer than ${SEND_MARGIN_BLOCKS} blocks of the Signing Window left, as a window error`, () => {
    const last = BigInt(MAX_SIGNING_LAG_BLOCKS - SEND_MARGIN_BLOCKS);
    expect(() => assertWindowOpen(1000n, 1000n + last)).not.toThrow();
    let err: unknown;
    try {
      assertWindowOpen(1000n, 1000n + last + 1n);
    } catch (e) {
      err = e;
    }
    expect(relayerErrorKind(err)).toBe("window-expired"); // the Capturer is told the photo took too long, and can retry
  });
});
