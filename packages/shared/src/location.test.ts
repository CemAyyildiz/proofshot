import { describe, expect, it } from "vitest";
import { NO_LOCATION, locationCommitment, toMicroDegrees } from "./location";

const salt = `0x${"11".repeat(32)}` as const;

describe("locationCommitment", () => {
  it("is deterministic, salt-dependent and precise to micro-degrees", () => {
    const a = locationCommitment(39.925533, 32.866287, salt);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(NO_LOCATION);
    expect(locationCommitment(39.925533, 32.866287, salt)).toBe(a);
    expect(locationCommitment(39.9255334, 32.8662871, salt)).toBe(a); // below 1e-6 rounds away
    expect(locationCommitment(39.925534, 32.866287, salt)).not.toBe(a);
    expect(locationCommitment(39.925533, 32.866287, `0x${"22".repeat(32)}`)).not.toBe(a);
  });

  it("handles southern and western coordinates", () => {
    expect(toMicroDegrees(-33.868820)).toBe(-33868820n);
    expect(locationCommitment(-33.86882, -151.20929, salt)).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
