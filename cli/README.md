# proofshot-verify

Reproduce a Proofshot Verdict from public data only: the image you hold and the Registry's events on Monad. No
Proofshot server is involved.

```bash
pnpm --filter proofshot-verify start photo.jpg --rpc https://testnet-rpc.monad.xyz --registry 0x<registry> [--from-block <deploy block>] [--range 100] [--json]
```

It computes the file's SHA-256 (Exact Hash) and PDQ fingerprints (whole image + 4×4 tiles) with the same code as the
Public Verifier, reads every `CaptureSealed`, `RecordImported` and `DeviceKeyRevoked` event, and applies
`computeVerdict` with the published thresholds. For a matched Seal it prints the Signing Window, the Device Key and
whether that key was later revoked. `--json` prints the Verdict, the matched record, the distances and the thresholds
used.

`pnpm --filter proofshot-verify build` produces a self-contained `dist/` (with the PDQ WebAssembly) for publishing.
