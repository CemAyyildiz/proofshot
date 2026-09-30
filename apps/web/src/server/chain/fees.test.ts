import { describe, expect, it } from "vitest";
import { FeeTooHigh, capFees } from "./fees";

const gwei = (n: number) => BigInt(n) * 1_000_000_000n;

describe("capFees", () => {
  it("passes normal Monad fees through unchanged", () => {
    expect(capFees({ maxFeePerGas: gwei(122), maxPriorityFeePerGas: gwei(2) }, gwei(100), gwei(500))).toEqual({
      maxFeePerGas: gwei(122),
      maxPriorityFeePerGas: gwei(2),
    });
  });

  it("clamps a spike to the cap and keeps the tip within what the cap leaves above the base fee", () => {
    expect(capFees({ maxFeePerGas: gwei(900), maxPriorityFeePerGas: gwei(300) }, gwei(400), gwei(500))).toEqual({
      maxFeePerGas: gwei(500),
      maxPriorityFeePerGas: gwei(100),
    });
  });

  it("refuses to send when the base fee alone is above the cap (the tx would sit pending and block later nonces)", () => {
    expect(() => capFees({ maxFeePerGas: gwei(700), maxPriorityFeePerGas: gwei(2) }, gwei(600), gwei(500))).toThrow(FeeTooHigh);
  });
});
