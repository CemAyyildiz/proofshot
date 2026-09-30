# Requirement traceability

Every functional requirement in the PRD, where it lives, and what proves it. Paths are relative to the repository root;
`web/` means `apps/web/`.

| FR | Priority | Implementation | Automated evidence |
|---|---|---|---|
| FR-1 Claim File + Claim Link (2 s, 14-day expiry, revoke, replace) | P0 | `web/src/server/dal/claim-files.ts`, `web/src/app/console/(workspace)/` | `claim-files.test.ts` (replace retires the old token; two replacements at once), `send.test.ts` (a photo sealed through a replaced link is still delivered); e2e `console.spec.ts` (created < 2 s, revoke → "no longer active", replace → new link works, old one is inactive) |
| FR-2 Passkey onboarding, no crypto concepts | P0 | `web/src/lib/passkey.ts`, `web/src/app/c/[token]/capture-app.tsx`, `web/src/server/capture/enroll.ts` | `enroll.test.ts`; e2e `capture.spec.ts` (key registered onchain, returning device, no crypto words, unsupported browser message) |
| FR-3 Live-camera-only capture | P0 | `web/src/app/c/[token]/capture-screen.tsx` | e2e `capture.spec.ts` (no file input; denied camera → guidance only) |
| FR-4 Device-signed Seal verified onchain | P0 | `contracts/src/Registry.sol`, `web/src/lib/seal-pipeline.ts`, `web/src/server/capture/seal.ts` | `Registry.t.sol` (tamper, replay, window, UV, RP ID, fuzz), `RegistryInvariant.t.sol`, `seal.test.ts`, `indexer.test.ts` (lagging RPC, reorg); e2e seals real WebAuthn assertions on a local chain and asserts `isSealed` |
| FR-5 Sub-second perceived Seal feedback, burst, retry | P1 | `capture-screen.tsx`, `web/src/lib/capture-store.ts` | e2e `capture.spec.ts` (3-photo burst, "Sealed ✓ · x s"; offline → plain message and automatic re-seal; a one-off empty frame retried silently; a link revoked mid-session stops the shutter); timings recorded for SM-5 (`send.test.ts`) and reported by `report:latency` (`latency.test.ts`) |
| FR-6 Send to the Carrier, verifies as Original | P0 | `web/src/server/capture/send.ts`, `web/src/server/storage.ts` | `send.test.ts` (hash must match, Carrier-scoped key, reconcile, still deliverable after the link is revoked); e2e sent file verifies as **Original**, and a photo sealed before a revoke is still sent |
| FR-7 Gasless, rate-limited sponsorship | P0 | `web/src/server/chain/relayer.ts`, `web/src/server/rate-limit.ts`, limits in `seal.ts`, `enroll.ts`, `sandbox.ts`, `import.ts` | `rate-limit.test.ts` (atomic), `seal.test.ts` (50 per link, 200 per key/day) |
| FR-8 Verify an image (one Verdict, crop warning, No Record ≠ fake, not retained) | P0 | `web/src/server/verify/verify.ts`, `web/src/app/(public)/verify/`, `packages/fingerprint/src/verdict.ts` | `verdict.test.ts`, `verdict-boundaries.test.ts` (every threshold pinned on both sides; `pnpm --filter @proofshot/fingerprint mutate` kills 26/26 mutants), `verify.test.ts` (incl. a 256 MP decompression bomb → 413), `fingerprint.test.ts` (decode budget); e2e `verify.spec.ts` (Original, Derived Copy, Altered, No Record, unsupported file) |
| FR-9 Verification Receipt | P0 | `web/src/app/(public)/v/[id]/`, `web/src/app/(public)/r/[exactHash]/`, `web/src/components/receipt/` | e2e `verify.spec.ts` (Signing Window, "a carrier", no image, "Verify it yourself", full hashes, print layout with the receipt's own URL, 404s) |
| FR-10 Independent reproducibility | P1 | `cli/src/` | `cli/src/index.test.ts` (records and key revocations from events alone; Signing Window and revocation in the output); e2e `verify.spec.ts`: CLI Verdict equals Verifier Verdict for every copy, and the CLI reports a key the admin revoked on the local chain |
| FR-11 Altered + Tile Map | P1 | `verdict.ts`, `web/src/components/verdict/tile-map.tsx` | `verdict.test.ts` (localized edit → the edited tile), e2e (Tile Map in Verifier and Console); benchmark harness |
| FR-12 Duplicate Alerts | P0 | `web/src/server/evidence/duplicates.ts` (+ `findMatches`) | `evidence.test.ts` (same/another carrier, own Seal excluded, tenant-scoped); e2e `duplicates.spec.ts` (UJ-3 within 10 s, nothing leaks; alerts name and link the photo they are about) |
| FR-13 Import historical fingerprints | P1 | `web/src/server/evidence/import.ts`, `web/src/app/console/(workspace)/imports/` | `import.test.ts`; e2e `import.spec.ts` (zip → imported → forwarded copy flagged "imported (unsigned)", never Original) |
| FR-14 Claim File view + in-file verification | P0 | `web/src/app/console/(workspace)/claims/[id]/`, `web/src/server/evidence/upload.ts` | `evidence.test.ts`; e2e `duplicates.spec.ts` (UJ-2 Altered with Tile Map) |
| FR-15 Carrier sign-in and tenancy | P0 | `web/src/server/auth/`, `web/src/server/dal/` | `core.test.ts` (demo entry never acts as a real person), `limits.test.ts`, `mail.test.ts`, tenancy tests in `claim-files.test.ts` and `evidence.test.ts`; e2e cross-carrier 404, session cookie flags (`__Host-` in production) |
| FR-16 Weather attestation | P2 | — (stretch, not started) | — |
| FR-17 AI damage summary | P2 | — (stretch, not started) | — |
| FR-18 Public try-it flow | P1 | `web/src/app/(public)/try/`, `web/src/server/sandbox.ts`, sandbox mode in `capture-screen.tsx` | `sandbox.test.ts`; e2e `sandbox.spec.ts` (≤ 3 taps on a phone viewport, guided "try to fool it", QR on desktop) |

Cross-cutting: NFR-5 privacy (only hashes onchain; `docs/architecture.md`), NFR-7 accessibility (e2e `a11y.spec.ts`,
axe WCAG 2.1 AA on every surface in light and dark mode, 0 violations), NFR-8 English-only, NFR-9 no crypto vocabulary
(asserted in `capture.spec.ts`). Security model and the test behind each contract guarantee: `docs/security.md`. Data layer: `migrations.test.ts` fails
when `schema.ts` changes without a migration, and CI's `postgres` job runs the deploy-time migrate and seed scripts and
every database test on a real Postgres 17 server. Every
test file named in these docs is checked to exist by `repo-docs.test.ts`.
