import "server-only";
import { join } from "node:path";
import { setPdqWasmPath } from "@proofshot/fingerprint/node";

// The build copies the vendored binary to public/ (see `copy-wasm`); read it from there on the server too.
setPdqWasmPath(join(process.cwd(), "public/pdq.wasm"));

export { fingerprintFile, FingerprintError, ImageTooLargeError, MAX_PIXELS, decode as decodeForPreview } from "@proofshot/fingerprint/node";
