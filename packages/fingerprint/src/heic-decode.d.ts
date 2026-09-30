declare module "heic-decode" {
  interface DecodedImage {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface LazyImage {
    width: number;
    height: number;
    decode(): Promise<DecodedImage>;
  }
  function decode(input: { buffer: ArrayBufferLike | Uint8Array }): Promise<DecodedImage>;
  namespace decode {
    /** Header-only parse: dimensions first, pixels on demand. Call `dispose()` when done. */
    function all(input: { buffer: ArrayBufferLike | Uint8Array }): Promise<LazyImage[] & { dispose(): void }>;
  }
  export default decode;
}
