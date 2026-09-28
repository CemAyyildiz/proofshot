import { type Hex32, sha256 } from "./hash";
import { pdqRgb } from "./pdq";

/** Tile grid side; the Registry stores GRID × GRID tile hashes, row-major from the top-left. */
export const GRID = 4;
export const TILE_COUNT = GRID * GRID;
/** Smallest accepted side, so every tile is at least 16 px. */
export const MIN_DIMENSION = 64;

/** Decoded image: tightly packed RGB, orientation already applied, alpha flattened onto white. */
export interface RgbImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export interface PerceptualFingerprint {
  pHash: Hex32;
  tiles: Hex32[];
  width: number;
  height: number;
  /** PDQ quality of the whole image (0–100). Not stored onchain. */
  quality: number;
  /** PDQ quality per tile; low-quality tiles are unreliable for the Alteration Check. Not stored onchain. */
  tileQuality: number[];
}

export interface Fingerprint extends PerceptualFingerprint {
  exactHash: Hex32;
}

export class FingerprintError extends Error {
  override name = "FingerprintError";
}

/** Pixel bounds of tile `i` (row-major). Edges are floor-split so tiles cover the image exactly. */
export function tileBounds(i: number, width: number, height: number) {
  const row = Math.floor(i / GRID);
  const col = i % GRID;
  const x0 = Math.floor((col * width) / GRID);
  const x1 = Math.floor(((col + 1) * width) / GRID);
  const y0 = Math.floor((row * height) / GRID);
  const y1 = Math.floor(((row + 1) * height) / GRID);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function crop(img: RgbImage, b: ReturnType<typeof tileBounds>): Uint8Array {
  const out = new Uint8Array(b.width * b.height * 3);
  const rowBytes = b.width * 3;
  for (let y = 0; y < b.height; y++) {
    const src = ((b.y + y) * img.width + b.x) * 3;
    out.set(img.data.subarray(src, src + rowBytes), y * rowBytes);
  }
  return out;
}

/** Whole-image PDQ plus a GRID × GRID tile PDQ. Synchronous once PDQ is initialised. */
export function perceptualFingerprint(img: RgbImage): PerceptualFingerprint {
  if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
    throw new FingerprintError(`image must be at least ${MIN_DIMENSION}×${MIN_DIMENSION} px`);
  }
  const whole = pdqRgb(img.data, img.width, img.height);
  const tiles: Hex32[] = [];
  const tileQuality: number[] = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const b = tileBounds(i, img.width, img.height);
    const t = pdqRgb(crop(img, b), b.width, b.height);
    tiles.push(t.hash as Hex32);
    tileQuality.push(t.quality);
  }
  return {
    pHash: whole.hash as Hex32,
    tiles,
    width: img.width,
    height: img.height,
    quality: whole.quality,
    tileQuality,
  };
}

/** Full fingerprint: Exact Hash over the original file bytes plus perceptual hashes over decoded pixels. */
export async function fingerprintDecoded(fileBytes: Uint8Array, img: RgbImage): Promise<Fingerprint> {
  const exactHash = await sha256(fileBytes);
  return { exactHash, ...perceptualFingerprint(img) };
}
