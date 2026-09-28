import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import heicDecode from "heic-decode";
import sharp from "sharp";
import { type Fingerprint, type RgbImage, FingerprintError, fingerprintDecoded } from "./fingerprint";
import { initPdq } from "./pdq";

export * from "./index";

const WASM_PATH = fileURLToPath(new URL("../vendor/pdq/pdq.wasm", import.meta.url));

export async function initNode(): Promise<void> {
  await initPdq(await readFile(WASM_PATH));
}

/** ISO-BMFF container (HEIC/HEIF/AVIF): bytes 4..8 are "ftyp". */
const isIsoBmff = (b: Uint8Array) => b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;

/** RGBA (straight alpha) → RGB flattened onto white, matching sharp's `flatten` and the browser canvas path. */
function flattenRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const a = rgba[i + 3]! / 255;
    data[j] = Math.round(rgba[i]! * a + 255 * (1 - a));
    data[j + 1] = Math.round(rgba[i + 1]! * a + 255 * (1 - a));
    data[j + 2] = Math.round(rgba[i + 2]! * a + 255 * (1 - a));
  }
  return { data, width, height };
}

/**
 * Decode JPEG, PNG, WebP, AVIF (sharp) or HEIC (libheif via heic-decode; sharp's prebuilt libvips has no HEVC
 * decoder) to RGB, applying orientation and flattening alpha onto white — the same normalisation as ./browser.
 */
export async function decode(bytes: Uint8Array): Promise<RgbImage> {
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) throw new FingerprintError(`unexpected channel count ${info.channels}`);
    return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
  } catch (e) {
    if (e instanceof FingerprintError) throw e;
    if (isIsoBmff(bytes)) {
      try {
        const img = await heicDecode({ buffer: bytes });
        return flattenRgba(img.data, img.width, img.height);
      } catch {
        // fall through to the generic error
      }
    }
    throw new FingerprintError(`could not decode image: ${(e as Error).message}`);
  }
}

export async function fingerprintFile(bytes: Uint8Array): Promise<Fingerprint> {
  await initNode();
  return fingerprintDecoded(bytes, await decode(bytes));
}
