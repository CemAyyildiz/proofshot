import { type Fingerprint, type RgbImage, FingerprintError, fingerprintDecoded } from "./fingerprint";
import { initPdq } from "./pdq";

export * from "./index";

/** `wasmUrl` must serve the vendored `vendor/pdq/pdq.wasm` (the app copies it to /pdq.wasm). */
export async function initBrowser(wasmUrl = "/pdq.wasm"): Promise<void> {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`failed to fetch PDQ wasm from ${wasmUrl}: ${res.status}`);
  await initPdq(await res.arrayBuffer());
}

/** RGBA canvas pixels → RGB, assuming the canvas was pre-filled white (alpha already flattened). */
export function rgbaToRgb(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    data[j] = rgba[i]!;
    data[j + 1] = rgba[i + 1]!;
    data[j + 2] = rgba[i + 2]!;
  }
  return { data, width, height };
}

/** Decode with the browser's codecs, honouring EXIF orientation and flattening alpha onto white. */
export async function decode(blob: Blob): Promise<RgbImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch (e) {
    throw new FingerprintError(`could not decode image: ${(e as Error).message}`);
  }
  const { width, height } = bitmap;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new FingerprintError("2D canvas unavailable");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return rgbaToRgb(ctx.getImageData(0, 0, width, height).data, width, height);
}

export async function fingerprintBlob(blob: Blob): Promise<Fingerprint> {
  return fingerprintDecoded(new Uint8Array(await blob.arrayBuffer()), await decode(blob));
}
