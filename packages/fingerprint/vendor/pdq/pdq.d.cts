export interface PdqWasmModule {
  _malloc(size: number): number;
  _free(ptr: number): void;
  HEAPU8: Uint8Array;
  HEAP32: Int32Array;
  _pdq_hash_from_rgb(rgb: number, width: number, height: number, hashOut: number, qualityOut: number): number;
  _pdq_hash_to_hex(hash: number, hexOut: number): void;
}
declare function createPDQModule(options?: { wasmBinary?: ArrayBuffer | Uint8Array }): Promise<PdqWasmModule>;
export default createPDQModule;
