# Proofshot — submission write-up (draft)

> Draft. ⏳ marks numbers that are not measured yet; fill them from the named source before submitting. Nothing here
> is a projection.

**In one paragraph.** Proofshot seals insurance claim photos at the moment of capture. The policyholder opens a link,
with no app and no wallet, and one Face ID prompt signs each photo's fingerprints with a passkey. A Monad contract
verifies that passkey signature onchain through the P-256 precompile before recording the Seal. From then on, anyone
with *any* copy of the photo (even a WhatsApp-compressed one) gets exactly one Verdict: Original, Derived Copy, Altered
(with the changed regions mapped) or No Record. Insurers also learn when a photo was already used in another claim,
including at another insurer, without either of them sharing a photo.

## 1. Problem

Claims now run on photos, and photos can no longer be trusted: generative editors add a dent or a water stain in
seconds, and genuine photos are recycled across claims and insurers. Provenance metadata (C2PA) is stripped the moment
an image passes through a messaging app. (Industry figures in the PRD §5 — Verisk, March 2026 — re-check the citation
before quoting.)

## 2. What Proofshot proves — and what it does not

A Seal proves: (a) a specific Device Key signed these fingerprints; (b) within the Signing Window; (c) whether the
image changed since, and where; (d) whether the same visual content already exists elsewhere in the Registry.

It does not prove that the pixels came from the device's camera sensor, that the scene is what the Capturer says it
is, or who the Capturer is legally. The full threat model, with what is accepted in v1 and what is planned, is in
`docs/threat-model.md`.

## 3. Why onchain

Cross-insurer duplicate detection needs a shared registry nobody owns. Incumbents pool photos with a vendor;
Proofshot shares only fingerprints on a public ledger, so any carrier, the policyholder, an attorney or a reinsurer
can check a photo without asking anyone.

## 4. Why Monad

- The P-256 precompile lets the contract verify the passkey signature over the whole Capture Record:
  **100,340 gas per Seal** (Foundry, Osaka EVM) vs 326,571 without it. On the live chains, a keyless probe ran the same
  OpenZeppelin verification on Monad testnet and mainnet: passkey assertion accepted (13,853 gas), tampered one
  rejected (`docs/spikes/spike-b-probe.json`). Live `seal()` on a deployed Registry: ⏳ `docs/spikes/spike-b-testnet.json`.
- Seal latency p95 shutter → "Sealed": ⏳ (target ≤ 3 s, NFR-1). Generate `docs/latency.md` from the deployment
  with `DATABASE_URL=… PROOFSHOT_NETWORK=mainnet pnpm --filter web report:latency`; quote the Claim Links row.
- Cost per Seal: ≈ 0.010 MON at the 102 gwei observed on 2026-09-30 (100,340 gas); confirm with the live `seal()` gas.

## 5. Demo

⏳ video link. Script: `docs/demo-script.md`.

## 6. Traction

- Seals and distinct Device Keys on mainnet from people other than the builder: ⏳ (SM-3 target ≥ 60 / ≥ 20).
- Unmoderated onboarding tests: ⏳ (SM-4 target ≥ 5, ≥ 80% seal without help).
- Practitioner conversations: ⏳ (SM-6 target ≥ 5, quotes cleared).

## 7. Accuracy

The benchmark harness is public (`benchmark/`). On generated scenes it meets every SM-2 target (Derived Copy recall
100%, Altered recall 100%, false Altered 0%, false match 0%). Real-photo results: ⏳ `benchmark/README.md`.
Known limit, stated up front: crops beyond ~3% fall to No Record; a crop is never shown as a clean result.

## 8. Engineering quality

- Real WebAuthn signatures sealed on a chain in every end-to-end run (Chrome virtual authenticator + fake camera).
- Registry: 100% branch coverage; stateful invariants (no re-seal, permanent seals, no import of a sealed photo,
  exactly one admin, never admin and relayer at once) over 65k calls with Solidity-signed passkeys and random role
  changes; pause and relayer-rotation runbook tested.
- Hardening found by review and fixed with tests:
  - decompression-bomb images are refused before decoding (50 MP budget);
  - demo access can never act as a real person;
  - a daily sponsored-write budget per carrier stops anyone from draining the relayer through the one-tap demo;
  - a lost RPC response can never make the relayer send a Seal twice;
  - database tests also run on a real Postgres server.
- WCAG 2.1 AA: axe scans every surface, light and dark: 0 violations.
- CLI and Public Verifier are asserted to return the same Verdict.

## 9. Business model

Per-Claim-File fee to carriers for files with sealed evidence; per-Verification API fee for high-volume screening.
Capturers and public verification are free forever — free public checks are what make a receipt worth holding.
Cold start: carriers import their historical fingerprints (FR-13) and get Duplicate Alerts on day one.

## 10. Roadmap

Hardware attestation (App Attest / Play Integrity) bound into the signed payload → claims-system connectors →
consortium governance of the Registry and carrier-signed Claim Links (permissionless `seal()`, which first needs the
chain ID and Registry address inside the signed payload; see `docs/security.md`).

## 11. Links

- Registry: ⏳ address on Monad mainnet, with its source verified on MonadVision (`pnpm --filter @proofshot/contracts verify:mainnet`).
- Repository: ⏳.
- Reproduce a Verdict: README → "Reproduce a Verdict yourself".
