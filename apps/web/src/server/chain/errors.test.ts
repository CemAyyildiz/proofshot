import { describe, expect, it } from "vitest";
import { isServiceUnavailable, relayerErrorKind } from "./errors";
import { FeeTooHigh } from "./fees";

describe("relayerErrorKind", () => {
  it("classifies the failures the Capturer must hear about differently", () => {
    expect(relayerErrorKind(new Error("insufficient funds for gas * price + value"))).toBe("unfunded");
    expect(relayerErrorKind(new Error('reverted with the following reason: EnforcedPause()'))).toBe("paused");
    expect(relayerErrorKind(new Error("custom error AlreadySealed(0x…)"))).toBe("already-sealed");
    expect(relayerErrorKind(new Error("SigningWindowExpired(10, 200)"))).toBe("window-expired");
    expect(relayerErrorKind(new Error("Timed out while waiting for transaction with hash 0x…"))).toBe("timeout");
    expect(relayerErrorKind("socket hang up")).toBe("other");
    expect(relayerErrorKind(new Error("DeviceKeyExists(0x…)"))).toBe("key-exists");
    // A fee spike above the relayer's cap is ours to wait out, not the Capturer's to retry now.
    expect(relayerErrorKind(new FeeTooHigh("base fee above cap"))).toBe("fee-too-high");
    expect(isServiceUnavailable("fee-too-high")).toBe(true);
  });
});
