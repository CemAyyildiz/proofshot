import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_SAMPLES, DEMO_SAMPLES_SEALED_ON, demoSamples } from "./demo-samples";

describe("demo samples", () => {
  it("are offered only where they were sealed: that chain and that Registry, in any letter case", () => {
    const { chainId, registry } = DEMO_SAMPLES_SEALED_ON;
    expect(demoSamples(chainId, registry.toUpperCase().replace("0X", "0x"))).toHaveLength(4);
    expect(demoSamples(chainId, "0x5FbDB2315678afecb367f032d93F642f64180aa3")).toEqual([]);
    expect(demoSamples(31337, registry)).toEqual([]);
    expect(demoSamples(chainId, undefined)).toEqual([]);
  });

  it("point at files that ship with the app", () => {
    for (const s of DEMO_SAMPLES) {
      expect(existsSync(`public${s.src}`), s.src).toBe(true);
      expect(existsSync(`public${s.thumb}`), s.thumb).toBe(true);
    }
  });
});
