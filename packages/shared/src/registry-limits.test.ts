import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BATCH, MAX_SIGNING_LAG_BLOCKS } from "./registry-limits";

const source = readFileSync(new URL("../../../contracts/src/Registry.sol", import.meta.url), "utf8");
const constant = (name: string) => Number(new RegExp(`uint256 public constant ${name} = (\\d+);`).exec(source)?.[1]);

describe("TypeScript mirrors of Registry limits", () => {
  it("match the Solidity constants", () => {
    expect(MAX_IMPORT_BATCH).toBe(constant("MAX_IMPORT_BATCH"));
    expect(MAX_SIGNING_LAG_BLOCKS).toBe(constant("MAX_LAG"));
  });
});
