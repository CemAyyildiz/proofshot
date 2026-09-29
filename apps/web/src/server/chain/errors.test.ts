import { describe, expect, it } from "vitest";
import { relayerErrorKind } from "./errors";

describe("relayerErrorKind", () => {
  it("classifies the failures the Capturer must hear about differently", () => {
    expect(relayerErrorKind(new Error("insufficient funds for gas * price + value"))).toBe("unfunded");
    expect(relayerErrorKind(new Error('reverted with the following reason: EnforcedPause()'))).toBe("paused");
    expect(relayerErrorKind(new Error("custom error AlreadySealed(0x…)"))).toBe("already-sealed");
    expect(relayerErrorKind(new Error("SigningWindowExpired(10, 200)"))).toBe("window-expired");
    expect(relayerErrorKind(new Error("Timed out while waiting for transaction with hash 0x…"))).toBe("timeout");
    expect(relayerErrorKind("socket hang up")).toBe("other");
  });
});
