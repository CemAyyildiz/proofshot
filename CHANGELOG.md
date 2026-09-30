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

## Hardening from 38 review iterations (senior review → fix loop)

- **Correctness**: a Seal final onchain can never be lost (DB write and relay split, reconcile from the Registry);
  the Registry index resyncs after the app's own writes; crops are never shown as clean and never as Altered; the
  indexer adapts to RPC log-range limits, re-reads recent blocks so a lagging RPC node can't make a Seal disappear,
  and drops a record only when its block hash changes (a reorg); photos sealed before a link was revoked or expired can
  still reach the insurer.
- **Security**: CSP with no third-party origins, clickjacking and referrer protection, rate limits on every
  unauthenticated cost, no tokens in logs, tenant isolation tested on every Console route; decompression-bomb images
  are refused from their header (50 MP budget) with at most two decodes at a time; demo access can never act as a real
  person added to a demo carrier.
- **Contracts**: a single admin that moves only by a delayed two-step transfer, admin and relayer can never share an
  account (enforced on every grant, with an invariant under random role changes), pause and relayer-rotation runbook,
  import batches capped below the per-transaction gas limit, a deploy script that refuses the wrong chain, an empty
  RP ID list and localhost on mainnet; 100% branch coverage, Slither clean, `forge fmt` enforced.
- **Performance**: matching over 10,000 Registry entries went from 220 ms to 4.8 ms.
- **Reliability**: RPC failover, bounded transaction waits, honest 503s instead of guessed Verdicts, a health endpoint
  that alarms on low relayer balance or a paused Registry, a daily data-retention job, a seal-latency report
  (`pnpm --filter web report:latency`) for the NFR-1 p95.
- **UX & accessibility**: IBM Plex, confirmations for irreversible actions, visible keyboard focus, seal success
  feedback; on the phone, offline Seals retry by themselves with a plain message, a revoked link stops the shutter
  with a next step, a one-off camera hiccup is retried silently, and the Try-it guide scrolls into view; in the
  Console, Duplicate Alerts name the photo they are about; receipts print cleanly with full hashes and their own URL;
  every surface scanned by axe (WCAG 2.1 AA) in light and dark mode: 0 violations.
- **Quality gates**: e2e against dev and production builds with real WebAuthn signatures on a local chain; CI with
  least-privilege tokens and SHA-pinned actions, failing on flaky tests; Slither and a deep fuzz/invariant campaign; a
  six-hourly Monad canary that opens an issue when it fails; a test that every file the docs name is committed; a
  fresh clone runs `pnpm check` and the e2e suite (verified after fixing an ignored `.env.example`).

## Pending (needs the owner)

Testnet/mainnet deploy and live gas/latency numbers, hosting accounts (a long-running Node host — `railway.json` is
included — with Postgres and a disk or a private S3/R2 bucket, and email), the real-photo benchmark, real users and
practitioner interviews. See the write-up draft's ⏳ marks.
