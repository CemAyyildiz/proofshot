import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type RegistryEntry, computeVerdict, fingerprintFile, initNode, type Fingerprint } from "./node";

const W = 800;
const H = 600;
function sceneSvg(seed: number, overlay = ""): Buffer {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let shapes = "";
  for (let i = 0; i < 60; i++) {
    const c = `rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})`;
    shapes +=
      i % 2
        ? `<circle cx="${rnd() * W}" cy="${rnd() * H}" r="${10 + rnd() * 80}" fill="${c}"/>`
        : `<rect x="${rnd() * W}" y="${rnd() * H}" width="${20 + rnd() * 160}" height="${20 + rnd() * 160}" fill="${c}"/>`;
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#8a9"/>${shapes}${overlay}</svg>`);
}
const jpeg = (svg: Buffer, q = 92) => sharp(svg).jpeg({ quality: q }).toBuffer();

function entry(fp: Fingerprint, kind: RegistryEntry["kind"] = "sealed"): RegistryEntry {
  return {
    kind,
    exactHash: fp.exactHash,
    pHash: fp.pHash,
    tiles: fp.tiles,
    width: fp.width,
    height: fp.height,
    carrierId: `0x${"ab".repeat(32)}`,
    blockNumber: 100n,
    txHash: `0x${"cd".repeat(32)}`,
    blockTimestamp: 1_790_000_000,
  };
}

let original: Buffer;
let sealed: Fingerprint;
let registry: RegistryEntry[];

beforeAll(async () => {
  await initNode();
  original = await jpeg(sceneSvg(7));
  sealed = await fingerprintFile(original);
  const unrelated = await Promise.all([11, 12, 13].map(async (s) => entry(await fingerprintFile(await jpeg(sceneSvg(s))))));
  registry = [...unrelated, entry(sealed)];
});

describe("computeVerdict", () => {
  it("returns Original for the identical file", async () => {
    const v = computeVerdict(await fingerprintFile(original), registry);
    expect(v.kind).toBe("original");
  });

  it("returns Derived Copy with a passed Alteration Check for recompressed and resized copies", async () => {
    for (const copy of [await sharp(original).jpeg({ quality: 50 }).toBuffer(), await sharp(original).resize(W / 2).jpeg({ quality: 80 }).toBuffer()]) {
      const v = computeVerdict(await fingerprintFile(copy), registry);
      expect(v).toMatchObject({ kind: "derived-copy", alterationCheck: "passed" });
      if (v.kind === "derived-copy") expect(v.record.exactHash).toBe(sealed.exactHash);
    }
  });

  it("returns Altered with the edited tile for a localized edit, even when the whole-image hash moved past T_match", async () => {
    const edited = await fingerprintFile(await jpeg(sceneSvg(7, `<ellipse cx="300" cy="225" rx="90" ry="65" fill="#222"/><rect x="230" y="180" width="140" height="20" fill="#eee"/>`)));
    const v = computeVerdict(edited, registry);
    expect(v.kind).toBe("altered");
    if (v.kind === "altered") {
      expect(v.alteredTiles).toEqual([5]);
      expect(v.distance).toBeGreaterThan(DEFAULT_THRESHOLDS.tMatch); // matched through tiles, not the whole hash
    }
  });

  it("returns Derived Copy with the Alteration Check unavailable for small crops — never clean, never Altered", async () => {
    const crops = [
      { left: 0, top: 0, width: 788, height: 600 }, // one side, 1.5%: aspect within tolerance, tiles shifted
      { left: 8, top: 6, width: 784, height: 588 }, // centred 2%: same aspect, every tile shifted
    ];
    for (const crop of crops) {
      const v = computeVerdict(await fingerprintFile(await sharp(original).extract(crop).jpeg({ quality: 90 }).toBuffer()), registry);
      expect(v, JSON.stringify(crop)).toMatchObject({ kind: "derived-copy", alterationCheck: "unavailable" });
    }
  });

  it("skips the tile comparison when the aspect ratio changed beyond tolerance", async () => {
    const copy = await fingerprintFile(await sharp(original).jpeg({ quality: 70 }).toBuffer());
    const v = computeVerdict({ ...copy, width: 780 }, registry); // 2.5% narrower: tiles cannot align
    expect(v).toMatchObject({ kind: "derived-copy", alterationCheck: "unavailable" });
    if (v.kind === "derived-copy") expect(v.tileDistances).toBeUndefined();
  });

  it("returns No Record for an unrelated scene", async () => {
    const v = computeVerdict(await fingerprintFile(await jpeg(sceneSvg(99))), registry);
    expect(v.kind).toBe("no-record");
    if (v.kind === "no-record") expect(v.nearestDistance).toBeGreaterThan(DEFAULT_THRESHOLDS.tMatch);
  });

  it("returns No Record for an empty Registry", async () => {
    expect(computeVerdict(sealed, [])).toEqual({ kind: "no-record", nearestDistance: undefined });
  });

  it("never returns Original for an Imported Record, even byte-identical", () => {
    const v = computeVerdict(sealed, [entry(sealed, "imported")]);
    expect(v).toMatchObject({ kind: "derived-copy", alterationCheck: "passed", distance: 0 });
    if (v.kind === "derived-copy") expect(v.record.kind).toBe("imported");
  });

  it("prefers a sealed record over an equally good imported one", () => {
    const imported = { ...entry(sealed, "imported"), exactHash: `0x${"99".repeat(32)}` as const };
    const v = computeVerdict({ ...sealed, exactHash: `0x${"77".repeat(32)}` }, [imported, { ...entry(sealed), exactHash: `0x${"88".repeat(32)}` }]);
    expect(v.kind === "derived-copy" && v.record.kind).toBe("sealed");
  });

  it("ignores featureless tiles of the submitted image when configured", async () => {
    const edited = await fingerprintFile(await jpeg(sceneSvg(7, `<rect x="200" y="150" width="200" height="150" fill="#777"/>`)));
    const strict = computeVerdict(edited, registry);
    expect(strict.kind).toBe("altered");
    const lenient = computeVerdict({ ...edited, tileQuality: edited.tileQuality.map((q, i) => (i === 5 ? 0 : q)) }, registry, {
      ...DEFAULT_THRESHOLDS,
      minTileQuality: 10,
    });
    expect(lenient.kind).toBe("derived-copy");
  });
});
