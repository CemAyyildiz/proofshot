import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { type Fingerprint, type RgbImage, FingerprintError, fingerprintDecoded } from "./fingerprint";
import { initPdq } from "./pdq";

export * from "./index";

const WASM_PATH = fileURLToPath(new URL("../vendor/pdq/pdq.wasm", import.meta.url));

export async function initNode(): Promise<void> {
  await initPdq(await readFile(WASM_PATH));
}

/**
 * Decode any sharp-supported image (JPEG, PNG, WebP, HEIC where libvips has libheif) to RGB,
 * applying EXIF orientation and flattening alpha onto white — the same normalisation as ./browser.
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
    throw new FingerprintError(`could not decode image: ${(e as Error).message}`);
  }
}

export async function fingerprintFile(bytes: Uint8Array): Promise<Fingerprint> {
  await initNode();
  return fingerprintDecoded(bytes, await decode(bytes));
}
