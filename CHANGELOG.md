# Changelog

Built between 2026-09-28 and the Monad Metropolis submission. The full, commit-level history is in `git log`; the
review findings behind the hardening work are in [docs/review/REVIEW-LOG.md](docs/review/REVIEW-LOG.md).

## Product (all PRD P0 and P1 requirements)

- **Capture** (FR-1–7): Claim Links, passkey onboarding with one biometric prompt, live-camera-only capture, onchain
  WebAuthn-verified Seals with sponsored fees, burst capture with live status and retry, sending exact sealed files to
  the insurer.
- **Verification** (FR-8–11): Public Verifier with one honest Verdict per copy (Original, Derived Copy, Altered with a
  Tile Map, No Record), public receipts, and a CLI that reproduces every Verdict from chain data alone.
- **Carrier Console** (FR-12–15): magic-link sign-in, tenant isolation, evidence view with in-file verification,
  cross-carrier Duplicate Alerts that reveal nothing about the other carrier, and import of historical fingerprints.
- **Try it** (FR-18): a no-sign-up sandbox that reaches a ready camera in ≤ 3 taps and guides visitors to try to fool
  the verifier.

## Hardening from 15 review iterations (senior review → fix loop)

- **Correctness**: a Seal final onchain can never be lost (DB write and relay split, reconcile from the Registry);
  the Registry index resyncs after the app's own writes (a real race found by the production-mode e2e run); crops
  can never be shown as clean and never as Altered; the indexer adapts to RPC log-range limits.
- **Security**: CSP with no third-party origins, clickjacking and referrer protection (Claim Link tokens never leak),
  rate limits on every unauthenticated cost (verifier, sign-in, sandbox, seal context), no tokens in logs, tenant
  isolation tested on every Console route, developer pages hidden in production.
- **Contracts**: pause and relayer-rotation runbook, admin ≠ relayer, chain-guarded deploys, 100% branch coverage,
  stateful invariants with Solidity-signed passkeys, gas snapshot in CI.
- **Performance**: matching over 10,000 Registry entries went from 220 ms to 4.8 ms.
- **Reliability**: RPC failover, bounded transaction waits, honest 503s instead of guessed Verdicts, a health endpoint
  that alarms on low relayer balance or a paused Registry, daily data-retention job.
- **UX & accessibility**: IBM Plex, brand shell, confirmations for irreversible actions, visible keyboard focus,
  seal success feedback, 0 axe WCAG 2.1 AA violations in light and dark mode.
- **Quality gates**: e2e against dev and production builds with real WebAuthn signatures on a local chain, fresh-clone
  build verified, env drift test, deep fuzz campaign on `main`.

## Pending (needs the owner)

Testnet/mainnet deploy and live gas/latency numbers, hosting accounts (Postgres, a private R2/S3 bucket — the adapter is
built — and email), the real-photo
benchmark, real users and practitioner interviews. See the write-up draft's ⏳ marks.
