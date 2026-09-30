import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { FingerprintError, ImageTooLargeError, MAX_PIXELS, TILE_COUNT, decode, fingerprintFile, hamming, initNode, perceptualFingerprint, tileBounds } from "./node";

const W = 800;
const H = 600;

/** Deterministic structured scene (seeded shapes) so PDQ has real content to work with. */
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
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#8a9"/>${shapes}${overlay}</svg>`,
  );
}

const jpeg = (svg: Buffer, quality = 92) => sharp(svg).jpeg({ quality }).toBuffer();

let original: Buffer;

beforeAll(async () => {
  await initNode();
  original = await jpeg(sceneSvg(7));
});

describe("fingerprintFile", () => {
  it("returns bytes32 hashes, 16 tiles and dimensions", async () => {
    const fp = await fingerprintFile(original);
    for (const h of [fp.exactHash, fp.pHash, ...fp.tiles]) expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(fp.tiles).toHaveLength(TILE_COUNT);
    expect(fp.tileQuality).toHaveLength(TILE_COUNT);
    expect([fp.width, fp.height]).toEqual([W, H]);
    expect(fp.quality).toBeGreaterThan(50);
  });

  it("uses SHA-256 of the original file bytes as the Exact Hash", async () => {
    const fp = await fingerprintFile(original);
    expect(fp.exactHash).toBe("0x" + createHash("sha256").update(original).digest("hex"));
  });

  it("is deterministic", async () => {
    expect(await fingerprintFile(original)).toEqual(await fingerprintFile(original));
  });

  it("keeps pHash and every tile close under recompression and 50% resize", async () => {
    const fp = await fingerprintFile(original);
    const variants = [
      await sharp(original).jpeg({ quality: 55 }).toBuffer(),
      await sharp(original).resize(W / 2).jpeg({ quality: 80 }).toBuffer(),
      await sharp(original).webp({ quality: 70 }).toBuffer(),
    ];
    for (const v of variants) {
      const vf = await fingerprintFile(v);
      expect(vf.exactHash).not.toBe(fp.exactHash);
      expect(hamming(fp.pHash, vf.pHash)).toBeLessThanOrEqual(31);
      // Resized copies have different tile pixel sizes but the same grid geometry.
      for (let i = 0; i < TILE_COUNT; i++) expect(hamming(fp.tiles[i]!, vf.tiles[i]!)).toBeLessThanOrEqual(40);
    }
  });

  it("localises a regional edit to the tiles it covers", async () => {
    const fp = await fingerprintFile(original);
    // Paint over most of tile 5 (row 1, col 1): x 200–400, y 150–300.
    const edited = await jpeg(sceneSvg(7, `<ellipse cx="300" cy="225" rx="90" ry="65" fill="#222"/><rect x="230" y="180" width="140" height="20" fill="#eee"/>`));
    const ef = await fingerprintFile(edited);
    const d = fp.tiles.map((t, i) => hamming(t, ef.tiles[i]!));
    const worst = d.indexOf(Math.max(...d));
    expect(worst).toBe(5);
    expect(d[5]).toBeGreaterThan(40);
    for (const i of [0, 3, 12, 15]) expect(d[i]).toBeLessThanOrEqual(20);
  });

  it("separates different scenes", async () => {
    const other = await fingerprintFile(await jpeg(sceneSvg(99)));
    expect(hamming((await fingerprintFile(original)).pHash, other.pHash)).toBeGreaterThan(60);
  });

  it("applies EXIF orientation before hashing", async () => {
    const upright = await fingerprintFile(original);
    // Store pixels rotated 90° CW with orientation tag 8 (rotate 90° CCW to display) → displays upright.
    const tagged = await sharp(await sharp(original).rotate(90).toBuffer())
      .withMetadata({ orientation: 8 })
      .jpeg({ quality: 92 })
      .toBuffer();
    const fp = await fingerprintFile(tagged);
    expect([fp.width, fp.height]).toEqual([W, H]);
    expect(hamming(upright.pHash, fp.pHash)).toBeLessThanOrEqual(31);
  });

  it("flattens alpha onto white", async () => {
    const png = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const img = await decode(png);
    expect(Array.from(img.data.subarray(0, 3))).toEqual([255, 255, 255]);
  });

  it("decodes iPhone-style HEIC to the same scene as its JPEG source", async () => {
    const { readFile } = await import("node:fs/promises");
    const jpg = await fingerprintFile(await readFile(new URL("../test-fixtures/scene.jpg", import.meta.url)));
    const heic = await fingerprintFile(await readFile(new URL("../test-fixtures/scene.heic", import.meta.url)));
    expect([heic.width, heic.height]).toEqual([jpg.width, jpg.height]);
    expect(hamming(jpg.pHash, heic.pHash)).toBeLessThanOrEqual(31);
  });

  it("rejects images that are too small or undecodable", async () => {
    const tiny = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#777" } }).png().toBuffer();
    await expect(fingerprintFile(tiny)).rejects.toBeInstanceOf(FingerprintError);
    await expect(fingerprintFile(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(FingerprintError);
  });
});

describe("tileBounds", () => {
  it("covers the image exactly, row-major, for odd sizes", () => {
    const w = 1001;
    const h = 767;
    let area = 0;
    for (let i = 0; i < TILE_COUNT; i++) area += tileBounds(i, w, h).width * tileBounds(i, w, h).height;
    expect(area).toBe(w * h);
    expect(tileBounds(0, w, h)).toMatchObject({ x: 0, y: 0 });
    expect(tileBounds(3, w, h).x + tileBounds(3, w, h).width).toBe(w);
    expect(tileBounds(15, w, h).y + tileBounds(15, w, h).height).toBe(h);
  });
});

describe("perceptualFingerprint", () => {
  it("gives identical output for identical pixels", async () => {
    const img = await decode(original);
    const copy = { ...img, data: new Uint8Array(img.data) };
    expect(perceptualFingerprint(img)).toEqual(perceptualFingerprint(copy));
  });
});

describe("hamming", () => {
  it("counts differing bits", () => {
    expect(hamming("0x00", "0xff")).toBe(8);
    expect(hamming("0f0f", "0f0e")).toBe(1);
    expect(hamming("0x" + "0".repeat(64), "0x" + "f".repeat(64))).toBe(256);
  });

  it("rejects mismatched lengths", () => {
    expect(() => hamming("00", "0000")).toThrow();
  });
});

describe("decode budget", () => {
  it("refuses a decompression bomb from its header, without decoding it", async () => {
    // 256 MP of flat grey compresses to under 1 MB; decoded it would take ~1 GB.
    const bomb = await sharp({ create: { width: 16000, height: 16000, channels: 3, background: "#808080" } }).png().toBuffer();
    expect(bomb.byteLength).toBeLessThan(2_000_000);
    const before = process.memoryUsage().rss;
    await expect(fingerprintFile(bomb)).rejects.toBeInstanceOf(ImageTooLargeError);
    await expect(decode(bomb)).rejects.toThrow(/16000×16000 .* over the 50 MP limit/);
    expect(process.memoryUsage().rss - before).toBeLessThan(200_000_000);
  });

  it("still accepts an image just inside the budget", async () => {
    const side = Math.floor(Math.sqrt(MAX_PIXELS));
    const big = await sharp({ create: { width: side, height: side, channels: 3, background: "#6a7" } }).jpeg().toBuffer();
    await expect(decode(big)).resolves.toMatchObject({ width: side, height: side });
  });

  it("serves many concurrent requests through the limited decode slots", async () => {
    const fps = await Promise.all(Array.from({ length: 7 }, () => fingerprintFile(original)));
    expect(new Set(fps.map((f) => f.pHash)).size).toBe(1);
  });
});

