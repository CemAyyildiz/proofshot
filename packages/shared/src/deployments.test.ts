import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KNOWN_REGISTRIES, knownDeployBlock } from "./deployments";

describe("known Registries", () => {
  it("match the deployment records written by the deploy script", () => {
    for (const r of KNOWN_REGISTRIES) {
      const record = JSON.parse(readFileSync(new URL(`../../../contracts/deployments/${r.chainId}.json`, import.meta.url), "utf8")) as { registry: string; deployBlock: number };
      expect(record.registry.toLowerCase()).toBe(r.registry.toLowerCase());
      expect(BigInt(record.deployBlock)).toBe(r.deployBlock);
    }
  });

  it("are found whatever the letter case, and only on their own chain", () => {
    const [mainnet] = KNOWN_REGISTRIES;
    expect(knownDeployBlock(mainnet!.chainId, mainnet!.registry.toUpperCase().replace("0X", "0x"))).toBe(mainnet!.deployBlock);
    expect(knownDeployBlock(10143, mainnet!.registry)).toBeUndefined();
    expect(knownDeployBlock(143, "0x5FbDB2315678afecb367f032d93F642f64180aa3")).toBeUndefined();
  });
});
