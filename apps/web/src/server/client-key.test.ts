import { describe, expect, it } from "vitest";
import { clientIp, clientKey } from "./client-key";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("ignores an x-forwarded-for value the client wrote itself", () => {
    // Railway-style edge: the client's spoofed entry first, the real address appended, x-real-ip set by the edge.
    const edge = { "x-forwarded-for": "6.6.6.6, 203.0.113.9", "x-real-ip": "203.0.113.9" };
    expect(clientIp(h(edge))).toBe("203.0.113.9");
    expect(clientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("a rotating spoofed header does not produce new rate-limit keys", () => {
    const keys = new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((fake) => clientKey(h({ "x-forwarded-for": `${fake}, 203.0.113.9` }))));
    expect(keys.size).toBe(1);
  });

  it("handles a single-hop proxy, a missing header and hashes the address", () => {
    expect(clientIp(h({ "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientIp(h({}))).toBe("unknown");
    expect(clientKey(h({ "x-real-ip": "198.51.100.7" }))).toMatch(/^[0-9a-f]{32}$/);
    expect(clientKey(h({ "x-real-ip": "198.51.100.7" }))).not.toContain("198");
  });
});
