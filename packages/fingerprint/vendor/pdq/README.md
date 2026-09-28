# Vendored PDQ WebAssembly build

`pdq.wasm` and `pdq.cjs` (Emscripten glue, renamed from `pdq.js`) are copied verbatim from
[`pdq-wasm@0.3.9`](https://github.com/Raudbjorn/pdq-wasm) (`wasm/`), which compiles Meta's PDQ reference
implementation. Licensed BSD-3-Clause, see `LICENSE`.

Vendored rather than imported because the package's JS wrapper fails under Node ESM and loads its WASM from a
CDN in browsers. Pinning the exact binary also keeps Verdicts reproducible across the app, CLI and benchmark
(FR10). To upgrade, copy both files from a new release and re-run `pnpm --filter @proofshot/fingerprint test`.

SHA-256:

```
614f2b8bc606615ad6dc1dde1c8bd9855818a5d95a9391654e035c0e00137113  vendor/pdq/pdq.wasm
90af8bedbecf10ade0b0e350f73be824df291a896316fe5ecc54794f4aecd693  vendor/pdq/pdq.cjs
```
