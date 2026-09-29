import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { serverEnvSchema } from "./env";

describe("apps/web/.env.example", () => {
  it("documents exactly the variables the server reads", () => {
    const example = readFileSync(new URL("../../../apps/web/.env.example", import.meta.url), "utf8");
    const documented = [...example.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]).sort();
    expect(documented).toEqual(Object.keys(serverEnvSchema.shape).sort());
  });
});
