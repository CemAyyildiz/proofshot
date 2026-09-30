/// <reference path="./heic-decode.d.ts" />
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import heicDecode from "heic-decode";
import sharp from "sharp";
import { type Fingerprint, type RgbImage, FingerprintError, ImageTooLargeError, MAX_PIXELS, fingerprintDecoded } from "./fingerprint";
import { initPdq, isPdqReady } from "./pdq";

export * from "./index";

let wasmPath: string | undefined;

/**
 * Where to load the PDQ binary from. Bundlers (Next) rewrite `import.meta.url`, so hosts that bundle this module
 * pass an explicit path; plain Node and the CLI use the package's own copy.
 */
export function setPdqWasmPath(path: string) {
  wasmPath = path;
}

export async function initNode(): Promise<void> {
  if (isPdqReady()) return;
  await initPdq(await readFile(wasmPath ?? fileURLToPath(new URL("../vendor/pdq/pdq.wasm", import.meta.url))));
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
 * At most this many decodes (and their PDQ passes) run at once per process. Each can hold ~3× its pixel count in
 * RGB copies (decode, PDQ heap, tiles); the rest wait their turn instead of multiplying peak memory.
 */
export const MAX_CONCURRENT_DECODES = 2;
let active = 0;
const waiting: (() => void)[] = [];

async function withDecodeSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active < MAX_CONCURRENT_DECODES) active++;
  else await new Promise<void>((resolve) => waiting.push(resolve)); // the releasing caller hands its slot over
  try {
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

function assertPixelBudget(width: number | undefined, height: number | undefined) {
  if (width && height && width * height > MAX_PIXELS) throw new ImageTooLargeError(width, height);
}

/**
 * Decode JPEG, PNG, WebP, AVIF (sharp) or HEIC (libheif via heic-decode; sharp's prebuilt libvips has no HEVC
 * decoder) to RGB, applying orientation and flattening alpha onto white — the same normalisation as ./browser.
 * Images over MAX_PIXELS are refused from their header, before any pixel is decoded.
 */
export function decode(bytes: Uint8Array): Promise<RgbImage> {
  return withDecodeSlot(() => decodeNow(bytes));
}

async function decodeNow(bytes: Uint8Array): Promise<RgbImage> {
  try {
    const meta = await sharp(bytes).metadata().catch(() => null);
    assertPixelBudget(meta?.width, meta?.height);
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .flatten({ background: "#ffffff" })
      .toColourspace("srgb")
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) throw new FingerprintError(`unexpected channel count ${info.channels}`);
    return { data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
  } catch (e) {
    if (e instanceof FingerprintError) throw e;
    if (/pixel limit/i.test((e as Error).message)) throw new ImageTooLargeError();
    if (isIsoBmff(bytes)) {
      let images: Awaited<ReturnType<typeof heicDecode.all>> | undefined;
      try {
        images = await heicDecode.all({ buffer: bytes });
      } catch {
        // not HEIC either: fall through to the generic error
      }
      if (images) {
        try {
          const first = images[0]!;
          assertPixelBudget(first.width, first.height);
          const img = await first.decode();
          return flattenRgba(img.data, img.width, img.height);
        } catch (err) {
          if (err instanceof FingerprintError) throw err;
        } finally {
          images.dispose();
        }
      }
    }
    throw new FingerprintError(`could not decode image: ${(e as Error).message}`);
  }
}

export async function fingerprintFile(bytes: Uint8Array): Promise<Fingerprint> {
  await initNode();
  return withDecodeSlot(async () => fingerprintDecoded(bytes, await decodeNow(bytes)));
}
