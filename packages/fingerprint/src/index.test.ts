import { describe, expect, it } from "vitest";
import { hamming } from "./index";

describe("hamming", () => {
  it("counts differing bits", () => {
    expect(hamming("0x00", "0xff")).toBe(8);
    expect(hamming("0f0f", "0f0e")).toBe(1);
    expect(hamming("0x" + "a".repeat(64), "0x" + "a".repeat(64))).toBe(0);
    expect(hamming("0x" + "0".repeat(64), "0x" + "f".repeat(64))).toBe(256);
  });

  it("rejects mismatched lengths", () => {
    expect(() => hamming("00", "0000")).toThrow();
  });
});
