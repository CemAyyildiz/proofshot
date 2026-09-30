import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Hex32 } from "./hash";
import { DEFAULT_THRESHOLDS, type RegistryEntry, computeVerdict, findMatches } from "./verdict";

/**
 * Exact-boundary tests for the Verdict rules, on synthetic hashes with known Hamming distances. The image-based
 * tests elsewhere land far from every threshold; these pin each comparison (≤ vs <) and each default value, so a
 * one-off change to a threshold or an operator fails here (checked by mutating verdict.ts).
 */
const T = DEFAULT_THRESHOLDS;
const hash = (): Hex32 => `0x${randomBytes(32).toString("hex")}`;
/** `h` with its first `n` bits flipped: Hamming distance exactly `n`. */
function flip(h: Hex32, n: number): Hex32 {
  const b = Buffer.from(h.slice(2), "hex");
  for (let i = 0; i < n; i++) b[i >> 3]! ^= 0x80 >> (i & 7);
  return `0x${b.toString("hex")}`;
}

function record(over: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    kind: "sealed",
    exactHash: hash(),
    pHash: hash(),
    tiles: Array.from({ length: 16 }, hash),
    width: 1000,
    height: 1000,
    carrierId: `0x${"ab".repeat(32)}`,
    blockNumber: 1n,
    txHash: hash(),
    blockTimestamp: 1_790_000_000,
    ...over,
  };
}

/** A submitted copy of `r`: whole-image distance `d`, tile i at distance `tiles[i]`. */
function copyOf(r: RegistryEntry, d: number, tiles: number[], size = { width: r.width, height: r.height }) {
  return { exactHash: hash(), pHash: flip(r.pHash, d), tiles: r.tiles.map((t, i) => flip(t, tiles[i]!)), ...size, quality: 100, tileQuality: Array(16).fill(100) };
}
const all = (n: number) => Array<number>(16).fill(n);
/** `k` tiles at distance `near`, the rest at `far`. */
const split = (k: number, near: number, far: number) => all(far).map((f, i) => (i < k ? near : f));

describe("Verdict boundaries (default thresholds)", () => {
  it("whole-image match is inclusive at tMatch = 31", () => {
    expect(T.tMatch).toBe(31);
    const r = record();
    expect(computeVerdict(copyOf(r, 31, all(100)), [r]).kind).toBe("derived-copy");
    expect(computeVerdict(copyOf(r, 32, all(100)), [r]).kind).toBe("no-record");
  });

  it("a tile at exactly tTile = 40 is unchanged; at 41 it is altered", () => {
    expect(T.tTile).toBe(40);
    const r = record();
    expect(computeVerdict(copyOf(r, 0, all(40)), [r])).toMatchObject({ kind: "derived-copy", alterationCheck: "passed" });
    const v = computeVerdict(copyOf(r, 0, [41, ...all(0).slice(1)]), [r]);
    expect(v).toMatchObject({ kind: "altered", alteredTiles: [0] });
  });

  it("tile majority matches at exactly 12 tiles within tTile, not 11", () => {
    expect(T.minTileMatches).toBe(12);
    const r = record();
    // Whole-image hash far away (a localized edit can move it a lot); 12 tiles still line up → a match.
    expect(computeVerdict(copyOf(r, 100, split(12, 40, 100)), [r])).toMatchObject({ kind: "altered", alteredTiles: [12, 13, 14, 15] });
    expect(computeVerdict(copyOf(r, 100, split(11, 40, 100)), [r]).kind).toBe("no-record");
  });

  it("up to maxAlteredTiles = 8 changed tiles is Altered; 9 means the geometry changed (check unavailable)", () => {
    expect(T.maxAlteredTiles).toBe(8);
    const r = record();
    expect(computeVerdict(copyOf(r, 0, split(8, 41, 0)), [r])).toMatchObject({ kind: "altered" });
    expect(computeVerdict(copyOf(r, 0, split(9, 41, 0)), [r])).toMatchObject({ kind: "derived-copy", alterationCheck: "unavailable" });
  });

  it("aspect ratio within 2% keeps tiles comparable; beyond it the check is unavailable", () => {
    expect(T.aspectTolerance).toBe(0.02);
    const r = record();
    expect(computeVerdict(copyOf(r, 0, all(0), { width: 1019, height: 1000 }), [r])).toMatchObject({ alterationCheck: "passed" });
    const off = computeVerdict(copyOf(r, 0, all(0), { width: 1021, height: 1000 }), [r]);
    expect(off).toMatchObject({ kind: "derived-copy", alterationCheck: "unavailable" });
    expect("tileDistances" in off && off.tileDistances).toBeFalsy();
  });

  it("the 2% aspect tolerance is inclusive (50:1 vs 51:1 is exactly 0.02 in floating point)", () => {
    const r = record({ width: 50, height: 1 });
    expect(computeVerdict(copyOf(r, 0, all(0), { width: 51, height: 1 }), [r])).toMatchObject({ alterationCheck: "passed" });
  });

  it("a record without exactly 16 tiles is never tile-compared", () => {
    const r = record();
    const malformed = { ...r, tiles: r.tiles.slice(0, 15) };
    const v = computeVerdict(copyOf(r, 0, all(0)), [malformed]);
    expect(v).toMatchObject({ kind: "derived-copy", alterationCheck: "unavailable" });
  });

  it("picks the best match: more aligned tiles first, then the smaller whole-image distance", () => {
    const base = record();
    const manyTiles = { ...base, exactHash: hash(), pHash: flip(base.pHash, 20) }; // 16 tiles aligned, distance 20
    const fewerTiles = { ...base, exactHash: hash(), tiles: base.tiles.map((t, i) => (i < 13 ? t : flip(t, 60))) }; // 13 tiles, distance 0
    const copy = copyOf(base, 0, all(0));
    const pick = (rs: RegistryEntry[]) => {
      const v = computeVerdict(copy, rs);
      return "record" in v ? v.record : null;
    };
    expect(pick([fewerTiles, manyTiles])).toBe(manyTiles);
    expect(pick([manyTiles, fewerTiles])).toBe(manyTiles);

    const near = { ...base, exactHash: hash(), pHash: flip(base.pHash, 5) };
    const far = { ...base, exactHash: hash(), pHash: flip(base.pHash, 25) };
    expect(pick([far, near])).toBe(near);
    expect(pick([near, far])).toBe(near);
    expect(findMatches(copy, [far, near]).map((m) => m.record)).toEqual([near, far]);
  });
});
