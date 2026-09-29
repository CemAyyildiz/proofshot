import { describe, expect, it } from "vitest";
import { bodyTooLarge, withRegistry } from "./http";
import { RegistryUnavailable } from "./registry";

const req = (headers: Record<string, string>) => new Request("http://x/api", { method: "POST", headers });

describe("bodyTooLarge", () => {
  it("requires a declared length and enforces the maximum before parsing", () => {
    expect(bodyTooLarge(req({}), 10)?.status).toBe(411);
    expect(bodyTooLarge(req({ "content-length": "11" }), 10)?.status).toBe(413);
    expect(bodyTooLarge(req({ "content-length": "10" }), 10)).toBeNull();
  });
});

describe("withRegistry", () => {
  it("turns a registry outage into an honest 503 and rethrows anything else", async () => {
    const r = await withRegistry(async () => {
      throw new RegistryUnavailable("down");
    });
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/no Verdict can be given/);
    await expect(withRegistry(async () => Promise.reject(new Error("bug")))).rejects.toThrow("bug");
  });
});
