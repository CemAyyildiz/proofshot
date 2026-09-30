import { type Hex, keccak256 } from "viem";
import { describe, expect, it, vi } from "vitest";
import { type RawSender, SEND_ATTEMPTS, sendAtMostOnce } from "./send";

const noSleep = async () => {};

/** Each `sign()` produces a distinct signed transaction, as a fresh nonce would. */
function sender(send: (raw: Hex, n: number) => Promise<Hex>, known: (hash: Hex) => Promise<boolean> = async () => false) {
  let signed = 0;
  let sent = 0;
  const s = {
    sign: vi.fn(async () => `0x0${++signed}` as Hex),
    send: vi.fn((raw: Hex) => send(raw, ++sent)),
    known: vi.fn(known),
  } satisfies RawSender;
  return s;
}

describe("sendAtMostOnce", () => {
  it("sends once and returns the node's hash", async () => {
    const s = sender(async (raw) => keccak256(raw));
    expect(await sendAtMostOnce(s, noSleep)).toBe(keccak256("0x01"));
    expect(s.sign).toHaveBeenCalledTimes(1);
  });

  it("treats 'already known' as our transaction in the pool, and never signs a duplicate", async () => {
    // e.g. the primary RPC accepted it but timed out; the fallback RPC then reports it as already known.
    const s = sender(async () => {
      throw new Error("RPC Request failed. Details: already known");
    });
    expect(await sendAtMostOnce(s, noSleep)).toBe(keccak256("0x01"));
    expect(s.sign).toHaveBeenCalledTimes(1);
  });

  it("returns our own transaction when its nonce is 'too low' because it already landed", async () => {
    const s = sender(
      async () => {
        throw new Error("nonce too low");
      },
      async (hash) => hash === keccak256("0x01"),
    );
    expect(await sendAtMostOnce(s, noSleep)).toBe(keccak256("0x01"));
    expect(s.sign).toHaveBeenCalledTimes(1);
  });

  it("signs again with a fresh nonce when another transaction took it", async () => {
    const s = sender(async (raw, n) => {
      if (n === 1) throw new Error("replacement transaction underpriced");
      return keccak256(raw);
    });
    expect(await sendAtMostOnce(s, noSleep)).toBe(keccak256("0x02"));
    expect(s.sign).toHaveBeenCalledTimes(2);
  });

  it("gives up after a bounded number of nonce races and rethrows anything else at once", async () => {
    const racing = sender(async () => {
      throw new Error("nonce too low");
    });
    await expect(sendAtMostOnce(racing, noSleep)).rejects.toThrow("nonce too low");
    expect(racing.sign).toHaveBeenCalledTimes(SEND_ATTEMPTS);

    const reverted = sender(async () => {
      throw new Error("execution reverted: EnforcedPause()");
    });
    await expect(sendAtMostOnce(reverted, noSleep)).rejects.toThrow("EnforcedPause");
    expect(reverted.sign).toHaveBeenCalledTimes(1);
  });
});
