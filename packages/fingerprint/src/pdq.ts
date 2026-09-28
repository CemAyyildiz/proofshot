import createPDQModule, { type PdqWasmModule } from "../vendor/pdq/pdq.cjs";

let mod: PdqWasmModule | undefined;
let loading: Promise<void> | undefined;

/**
 * Load the vendored PDQ WebAssembly module. Idempotent; concurrent callers share one load.
 * Callers supply the binary so the core stays environment-agnostic (see ./node and ./browser).
 */
export function initPdq(wasmBinary: ArrayBuffer | Uint8Array): Promise<void> {
  loading ??= createPDQModule({ wasmBinary }).then((m) => {
    mod = m;
  });
  return loading;
}

export function isPdqReady(): boolean {
  return mod !== undefined;
}

export interface PdqResult {
  /** 0x-prefixed, 64 hex chars, in PDQ's canonical hex form. */
  hash: string;
  /** PDQ quality 0–100; low values mean little structure (e.g. a blank wall). */
  quality: number;
}

/** PDQ of a tightly packed RGB buffer (3 bytes per pixel, row-major). */
export function pdqRgb(rgb: Uint8Array, width: number, height: number): PdqResult {
  if (!mod) throw new Error("PDQ not initialised; call initPdq() first");
  if (rgb.length !== width * height * 3) throw new Error("RGB buffer size does not match dimensions");
  const m = mod;
  const img = m._malloc(rgb.length);
  const hash = m._malloc(32);
  const quality = m._malloc(4);
  const hex = m._malloc(65);
  try {
    m.HEAPU8.set(rgb, img);
    const rc = m._pdq_hash_from_rgb(img, width, height, hash, quality);
    if (rc !== 0) throw new Error(`PDQ hashing failed with code ${rc}`);
    m._pdq_hash_to_hex(hash, hex);
    const hexStr = new TextDecoder().decode(m.HEAPU8.subarray(hex, hex + 64));
    return { hash: `0x${hexStr}`, quality: m.HEAP32[quality >> 2]! };
  } finally {
    m._free(img);
    m._free(hash);
    m._free(quality);
    m._free(hex);
  }
}
