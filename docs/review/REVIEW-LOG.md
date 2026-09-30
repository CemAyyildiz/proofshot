# Review log

Rolling senior review of Proofshot. Each iteration reviews one area, records findings with severity, fixes the
highest-value ones, and says what to review next. Screenshots: `SCREENS=1 pnpm --filter web e2e screens`
(→ `apps/web/test-results/screens/`).

Severity: **H** high (hurts trust, correctness or a demo moment) · **M** medium · **L** low.

## Rotation

1. Frontend UI/UX · 2. Backend · 3. Contracts · 4. Tests/CI · 5. Docs/README — then repeat.

---

## Iteration 1 — Frontend UI/UX (2026-09-30)

Design direction (ui-ux-pro-max `--design-system`, insurance/trust): Swiss minimal, IBM Plex Sans + Plex Mono,
SVG icons not emoji, visible focus, reduced motion, 150–250 ms transitions. Palette kept (neutral + navy);
the suggested sky-blue palette reads less "bank statement" than the current one.

Findings:

- **H1** No brand shell on public surfaces (landing, verifier, receipts, /try): no wordmark, no way back, no footer.
  The product looks unfinished when a judge lands on a receipt link.
- **H2** Capture screen: the shutter is a bare white circle with no affordance text; no photo count; no reassurance
  about where photos go. Policyholders need to know tapping seals and that only their insurer receives them.
- **M1** Typography: Geist is fine but generic; Plex Sans/Mono fits insurance and makes hashes/IDs legible.
- **M2** No global `:focus-visible` style, no `cursor-pointer`, no transitions, no reduced-motion rule.
- **M3** Duplicate Alert uses an emoji "⚠" as its icon.
- **M4** Console Claim File list is a plain list; adjusters need at-a-glance evidence count, alerts and link state.
- **M5** Verifier result doesn't show which file was checked unless Altered.
- **M6** Landing on desktop has no primary button (only the QR card and a secondary "Verify a photo").
- **L1** Next dev indicator visible in screenshots (dev only, not shipped).

Fixed this iteration: H1, H2, M1, M2, M3, M4, M5, M6.

Done (commit 6803c64): all eight findings fixed; `pnpm check` and 13 e2e green. Also fixed a build warning
(dynamic storage path traced the whole project).

**Next: Iteration 2 — Backend.** Review: authorization on every route (console APIs, receipts), input validation
and size limits (multipart parsing before size checks), rate limits on the Public Verifier (none yet), error
handling that could leak internals, Seal flow consistency if the DB insert fails after an onchain success,
registry index staleness on multi-instance deploys, security headers (CSP, frame-ancestors), cookie flags.

---

## Iteration 2 — Backend (2026-09-30)

Reviewed every route handler, server action, the auth flow, the Seal/enroll/send services and the config.

Findings:

- **H1** Public Verifier has no rate limit. Fingerprinting a 20 MB image is the most CPU-expensive request in the
  app and it is unauthenticated — a trivial DoS / cost vector.
- **H2** Magic-link sign-in has no rate limit: anyone can make us send unlimited emails to a Carrier User
  (email bombing, sender-reputation damage) or burn CPU on token issuance.
- **H3** Seal consistency: if the relayer's transaction succeeds but the `captures` insert fails (or the response is
  lost and the client retries), the retry hits `AlreadySealed` onchain with no DB row. The Capturer is told the photo
  was "sealed elsewhere" and can never send it — a lost piece of evidence.
- **M1** No security headers: no CSP, no `frame-ancestors` (the capture page and Console could be framed for
  clickjacking), no `Referrer-Policy` (Claim Link tokens could leak in `Referer` to the block explorer), no
  `Permissions-Policy`.
- **M2** Upload routes parse multipart bodies with no `Content-Length` (chunked) before any size check.
- **M3** A registry sync failure (RPC down) surfaces as an opaque 500 on the Verifier and receipts; it should be an
  honest "temporarily unavailable", never a guess.
- **L1** `x-powered-by: Next.js` header is sent.
- OK: tenancy — every Console route and DAL function is Carrier-scoped (covered by tests); cookies are HttpOnly,
  SameSite=Lax (blocks cross-site POSTs to cookie-authenticated upload routes), Secure in production; tokens are
  stored hashed; Claim Link tokens are 192-bit.

Done: H1–H3, M1–M3, L1 fixed; `pnpm check` and all e2e green with the CSP active in dev (capture, browser WASM
and the Verifier all run under it).

- H1 Public Verifier: 30 checks per 10 min per hashed client address → 429 with a plain message.
- H2 Sign-in: 5 links/hour per address (env-tunable for tests) and 20/hour per client, applied before the account
  lookup so the limit reveals nothing; the form shows "Too many sign-in requests".
- H3 Seal reconciliation: the relay and the DB write are separate steps. An onchain Seal never becomes an error;
  on `AlreadySealed`, the indexed Registry is consulted and the Capture is adopted only if both the Claim File
  (`claimRef`) and the Device Key match. The send step does the same, so evidence can't be stranded.
- M1 CSP (no third-party origins, `frame-ancestors 'none'`, `wasm-unsafe-eval` for PDQ), `Referrer-Policy:
  same-origin` (Claim Link tokens never leak to the explorer), `X-Frame-Options`, `Permissions-Policy`
  (camera/geolocation self only), HSTS. Asserted in e2e.
- M2 Upload routes require `Content-Length` (411) and check size before parsing.
- M3 Registry outage → `RegistryUnavailable` → 503 "no Verdict can be given"; error boundaries for public pages and
  the Console say so honestly.
- L1 `poweredByHeader: false`.

**Next: Iteration 3 — Contracts.** Review Registry.sol for gas (event layout, calldata), griefing (relayer key
compromise blast radius, admin powers), `importRecords` unbounded loops, `rpIdHash` extraction edge cases, the
Signing Window with `block.number` on Monad, upgrade/redeploy story, NatSpec, deploy script safety (chain-id check,
dry run), and a Slither-style manual pass.

---

## Iteration 3 — Contracts (2026-09-30)

Reviewed `Registry.sol`, its tests and the deploy script.

Findings:

- **H1** Relayer-key compromise had no containment. The relayer can register a key it controls and forge Seals or
  Imported Records under any `carrierId` (inherent to relayer attestation in v1), and the contract offered no way to
  stop it: no pause, and only the relayer itself could revoke Device Keys.
- **M1** Nothing prevented deploying with `admin == relayer`, which would put the admin role on a server hot key.
- **M2** The deploy script had no chain-id guard (a testnet config could be broadcast to mainnet) and didn't record
  the deploy block the indexer needs (`REGISTRY_DEPLOY_BLOCK`).
- **L1** `MAX_LAG = 100` blocks (~30–40 s) is tight if a Capturer hesitates at the Face ID prompt; the UI already
  says "took too long — retry" and retry re-signs with a fresh block. Kept: a tight Signing Window is the claim.
- **L2** Admin transfer is single-step (`AccessControl`); `AccessControlDefaultAdminRules` would add a delay.
  Deferred: the admin is a cold key used rarely.
- **L3** `forge lint` flags `1 << bit` in fuzz tests as a reversed shift — false positive (intended).
- OK: minimal state (SM-C3), all write paths role-gated, distinct custom errors, replay/window/UV/RP ID checks,
  imports idempotent and never block a later Seal, 1,024-run fuzz over every signed field.

Done: H1, M1, M2.

- `Pausable`: the admin pauses/unpauses every write; the admin can also revoke Device Keys. NatSpec documents the
  incident runbook (pause → revoke relayer role and its keys → grant a fresh relayer → unpause), covered by an
  end-to-end test.
- Constructor rejects `admin == relayer`.
- Deploy script requires `EXPECTED_CHAIN_ID` to match and writes `deployments/<chainId>.json` (address, deploy block,
  roles, RP IDs); `pnpm deploy:testnet` / `deploy:mainnet` set the expected chain.
- `seal()` gas now 100,315 (+2.2k for the pause check). 24 Registry tests.

**Next: Iteration 4 — Tests/CI.** Check CI actually runs e2e with Foundry + Chrome (Playwright browser install,
Anvil on the runner), flaky patterns (fixed sleeps, shared state), coverage gaps (sign-in rate limit, verifier 429,
receipts 404, CSP on capture), test runtime, and add a coverage report for the contracts.

---

## Iteration 4 — Tests/CI (2026-09-30)

Findings:

- **H1** e2e ran only against `next dev`. Both earlier bundling bugs (`import.meta.url`, PGlite) existed only in
  bundled code, and the production CSP (no `unsafe-eval`) was never exercised. Running the suite against
  `next build && next start` immediately found a real bug:
- **H2** (bug) The in-memory Registry index syncs at most once a second. A check made within a second of this
  server's own write — an import followed by an in-file verification, or two quick Seals — could miss the new
  record: a forwarded copy of a just-imported photo came back **No Record** instead of Derived Copy + Duplicate Alert.
- **M1** No tests for the new safeguards: sign-in limits, HTTP guards (411/413, 503), Verifier 429, receipt 404s.
- **M2** CI ran everything in one job, re-downloaded Chromium each time, and kept no artifacts on failure.
- **M3** Registry branch coverage 86.67% (revoke edge cases, zero RP ID untested).
- OK: no fixed sleeps in functional e2e (only in the on-demand screenshot tool); tests isolate state (fresh DB,
  storage and chain per run; per-client rate-limit buckets).

Done: all five.

- `E2E_PROD=1` runs the suite against the production build; CI's e2e job uses it. Both modes pass (14/14).
- The relayer invalidates the Registry index after its own Seals and imports, so the next read resyncs.
- Unit tests for `signInAllowed` (per address, per client, window reset) and `bodyTooLarge` / `withRegistry`;
  e2e for Verifier 429 (isolated client) and receipt 404s.
- CI: parallel `check` and `e2e` jobs, Playwright browser cache, report/trace artifacts on failure, 20-min timeout.
- Contracts: `pnpm --filter @proofshot/contracts coverage` (`--ir-minimum`); Registry now 96% lines, 97% statements,
  **100% branches**, 100% functions.

Totals: 65 web unit tests, 26 fingerprint, 11 shared, 36 contract tests, 14 e2e (dev and prod).

**Next: Iteration 5 — Docs/README.** Root README for judges (what, why Monad, how to run, architecture diagram,
reproducing a Verdict), per-package READMEs, `.env.example` completeness, deploy runbook (testnet/mainnet, Vercel),
threat model page, and consistency of claims with measured numbers.

---

## Iteration 5 — Docs/README (2026-09-30)

Findings:

- **H1** Receipts told third parties to run `npx proofshot-verify …`, but the package isn't published — a broken
  instruction on the page whose whole point is independent reproduction.
- **H2** The README didn't explain the product, the proof boundary or why Monad, and its quickstart didn't work
  (no local chain, no seed; copying `.env.example` left capture unable to seal).
- **H3** `RPC_URL_SECONDARY` was documented but unused: the NFR-4 "secondary RPC" didn't exist.
- **M1** `.env.example` was incomplete ("Filled in by later stories").
- **M2** No architecture, threat-model or deploy documentation outside the PRD.

Done: all five.

- Receipts show the from-source CLI command (`pnpm --filter proofshot-verify start …`) and state that it reads the chain
  directly; `cli/README.md` added.
- `rpcTransport()`: viem `fallback([primary, secondary])` for the relayer, indexer and block-time lookups.
- New README (what, who, proof boundary, why Monad with the measured gas and what is still pending, sequence diagram,
  reproduce a Verdict, working quickstart with `pnpm dev:chain` + `pnpm seed`, quality commands, honest limits).
- `docs/architecture.md` (component diagram, data-placement table, flows), `docs/threat-model.md` (T-1…T-9 incl.
  relayer compromise and crop+edit), `docs/deploy.md` (key roles, deploy script, env table, migrate/seed, pre-judging
  checklist; notes the pending object-storage adapter).
- Root `pnpm seed` / `pnpm e2e`; complete, commented `.env.example`.

Rotation complete. **Next: Iteration 6 — Frontend UI/UX, pass 2**: receipts (desktop + mobile), Console Claim File
page with many items, imports page, error/empty/loading states, dark mode, keyboard-only walkthrough of capture and
Console, copy review against NFR-9 and PRD §12.

---

## Iteration 6 — Frontend UI/UX, pass 2 (2026-09-30)

Screenshots now also cover desktop receipts and dark mode (landing, verifier, receipt, Console).

Findings:

- **H1** At 375 px the public header nav wrapped into two-line items ("Verify a / photo", "Try / it").
- **H2** The receipt's CLI command was clipped (horizontal scroll inside a narrow card) and not copyable in one step
  — on the very section that exists for independent reproduction.
- **H3** Keyboard focus was invisible on the Verifier drop zone, the Console upload control and the import pickers:
  the focused element is a visually hidden file input, so the global focus ring drew nothing.
- **M1** A Verification Receipt didn't identify the file that was checked, so its holder couldn't tie it to a file.
- **M2** Import page didn't state its limits (500 images, formats, 20 MB).
- OK: dark mode holds contrast on every surface checked; Verdict badges keep text + icon in both themes; capture
  "sent" view and Console Claim File read well; no emoji icons remain in UI chrome.

Done: all five.

- Short nav labels on phones ("Verify", "Try it", "Console"), full labels from `sm`, no wrapping.
- Receipt command wraps (`break-all`) and has a **Copy command** button.
- Labels that wrap hidden file inputs draw the focus ring via `has-[:focus-visible]`; e2e asserts that tabbing
  reaches the Verifier's picker and that an outline is shown.
- Verification Receipt adds **File checked**: full Exact Hash (SHA-256) and dimensions, with "compute the SHA-256 of
  your file to confirm".
- Import page states its limits.

**Next: Iteration 7 — Backend, pass 2**: data retention (verifications, rate_limits and sessions tables grow forever;
magic-link tokens), DB indexes for hot queries (rate_limits by bucket, uploads/captures by exact hash, duplicate
alert listing), Duplicate-Alert cost as the Registry grows (linear scan per Seal), timing-safe comparisons, logging
hygiene (no tokens or keys in logs), and the `/seal-context` endpoint's lack of a rate limit.

---

## Iteration 7 — Backend, pass 2 (2026-09-30)

Findings:

- **H1** Performance: a Verdict or Duplicate-Alert scan over 10,000 Registry entries took **~220 ms of blocking CPU**
  (hex strings re-parsed on every Hamming comparison, 17 per entry). Within NFR-2, but it serialises concurrent
  verifications on Node's single thread.
- **H2** Logging hygiene: a production deploy without `RESEND_API_KEY` would print live sign-in links (bearer
  tokens) into server logs.
- **M1** Unbounded tables: `rate_limits` (a row per bucket per window), expired `sessions`, used/expired
  `magic_link_tokens`.
- **M2** `/seal-context` (one RPC call each) had no limit per Claim Link.
- OK: hot queries are covered by primary keys and existing indexes (rate_limits PK, captures.exact_hash unique,
  per-Claim-File indexes, duplicate_alerts unique index leading with claim_file_id); secrets are compared in the DB
  by hash; errors logged by the relayer carry no key material; `verifications` are kept on purpose (stable receipts).

Done: all four.

- Verdict engine pre-parses hashes once per object (WeakMap cache) and uses a bitwise popcount: **220 ms → 4.8 ms**
  per 10k entries (findMatches 2.6 ms), same results (26 fingerprint tests).
- Without an email provider a production build refuses to send (error, no token logged) unless `MAIL_DEV_OUTBOX=1`
  (set only by the e2e harness).
- `pruneExpired()` + `/api/cron/maintenance` (Bearer `CRON_SECRET`, timing-safe, 404 when unset) + `vercel.json`
  daily cron; unit-tested, e2e asserts the route is invisible without the secret.
- `/seal-context`: 300 lookups per Claim Link per hour → 429.

**Next: Iteration 8 — Contracts, pass 2**: gas golf on `seal()` (event encoding, calldata struct copy for the
challenge), `deviceTime` sanity bounds, whether `claimRef` should be indexed in `CaptureSealed` for third-party
queries, a Foundry invariant test (a sealed hash is never re-sealed or imported), and NatSpec for every public item.

---

## Iteration 8 — Contracts, pass 2 (2026-09-30)

Findings:

- **M1** No stateful property testing: unit tests and the bit-flip fuzz cover single calls, but nothing checked that
  *sequences* of Seals, imports and block advances preserve the Registry's core guarantees — and every Seal test
  reused one fixture signature, so the contract never saw many distinct, valid assertions.
- **M2** NatSpec covered intent but not parameters/returns/events; the verified source is what judges read.
- **L1** `deviceTime` isn't bounded. Kept deliberately and documented: it is the device's own clock, recorded as
  claimed; the block-bounded Signing Window is the trustworthy time, and rejecting skewed clocks would fail honest
  phones.
- **L2** `claimRef` can't be indexed in `CaptureSealed` (three topics already used by exactHash, keyId, carrierId);
  documented — index it offchain.
- **L3** Gas: `seal()` work is dominated by the precompile call and the 16-tile event payload, both inherent.
  No safe savings found.

Done: M1, M2 (and L1/L2 documented).

- `test/utils/WebAuthnSigner.sol`: builds platform-authenticator-shaped WebAuthn assertions in Solidity with
  `vm.signP256` (UP|UV flags, low-s), so tests can seal arbitrary records.
- `test/invariant/RegistryInvariant.t.sol`: a handler drives random Seals (3 keys, 24-hash space so collisions
  happen), imports and block advances. Invariants: no hash is ever re-sealed, sealing is permanent, a sealed photo is
  never re-registered as an unsigned import. 128 runs × 64 depth = 8,192 calls each, `fail_on_revert`, 0 reverts.
- Full NatSpec on events, admin, key, seal and import functions; `forge doc` builds.

Contract tests: 40 (26 Registry, 10 spike, 4 invariant).

**Next: Iteration 9 — Tests/CI, pass 2**: run the invariant suite in CI with a higher budget on main only, add a
Lighthouse/axe accessibility pass over key pages in e2e, check e2e runtime and flakiness over 3 consecutive runs,
and make the screenshot tool part of a manual "design check" script.

---

## Iteration 9 — Tests/CI, pass 2 (2026-09-30)

Findings:

- **M1** No automated accessibility checks: WCAG 2.1 AA was a stated requirement (NFR-7) verified only by eye.
- **M2** Invariant and fuzz budgets were sized for fast PR runs only; nothing ran a deep campaign.
- **M3** e2e stability was unmeasured.
- **L1** The screenshot tool needed a remembered env var.

Done: all four.

- `e2e/a11y.spec.ts`: axe (`wcag2a/aa`, `wcag21a/aa`) over landing, Verifier, /try, sign-in (light and dark), Console
  list, Claim File with an Altered upload and Tile Map, imports, capture intro and capture with photos (375 px),
  Verdicts, and both receipts. **0 violations.** A throwaway sanity test confirmed axe does flag injected
  `color-contrast` and `image-alt` problems, so the clean result is real.
- `FOUNDRY_PROFILE=deep` (10,000 fuzz runs; invariants 512 × 128 = 65,536 calls each) passes in ~20 s; CI runs it in a
  `contracts-deep` job on `main` only.
- Stability: full e2e suite run 3× back to back — 17/17 each time (51/51), no retries.
- `pnpm screens` for design screenshots; README "Quality" updated.

**Next: Iteration 10 — Docs/README, pass 2**: `docs/demo-script.md` aligned with the shipped UI (the A6 script's
exact clicks and copy), a submission write-up draft per A7 with only measured numbers and explicit "pending" marks,
and a CHANGELOG/feature matrix mapping each FR to its code and test.

---

## Iteration 10 — Docs/README, pass 2 (2026-09-30)

Findings:

- **M1** No requirement traceability: a judge or reviewer couldn't see which code and which test backs each FR.
- **M2** The PRD's demo script (A6) predates the UI; its clicks and copy no longer matched the product.
- **M3** No write-up draft; the risk is filling it later with rounded or projected numbers.
- **M4** (security, found while mapping files) `/spike/passkey`, a developer tool, was reachable in production.

Done: all four.

- `docs/traceability.md`: FR-1…FR-18 → implementation paths → unit/contract/e2e evidence, plus NFR-5/7/8/9.
- `docs/demo-script.md`: timed script using the exact on-screen labels, setup checklist and fallbacks.
- `docs/submission-writeup.md`: A7 outline filled with measured numbers only; every unmeasured figure is marked ⏳
  with the file that will hold it; the crop limit is stated up front.
- `/spike/passkey` returns 404 in production unless `ENABLE_SPIKE_PAGES=1` (documented in `.env.example`; the owner
  checklist says to enable it only for the real-device session).

**Next: Iteration 11 — Frontend UI/UX, pass 3**: motion and feedback polish (seal state transitions, a success
moment when a photo seals, reduced-motion safe), loading skeletons for Console pages, empty states with next steps,
the Claim File page at 10+ items (grid density), and copy consistency across Verdict texts.

---

## Iteration 11 — Frontend UI/UX, pass 3 (2026-09-30)

Guidance: ui-ux-pro-max `ux` domain — success feedback, confirmation for irreversible actions, loading indicators.

Findings:

- **H1** "Revoke link" permanently closed a Claim Link on a single click — irreversible, no confirmation.
- **H2** "Discard" on a failed capture deleted the photo (evidence) on a single tap.
- **M1** A Seal landing changed only a text label; nothing on the photo itself confirmed success at a glance.
- **M2** Empty Evidence state ("No photos yet.") gave no next step.
- **M3** Claim Files with many items used two columns even on wide screens.
- **M4** Console navigations show no loading state. Tried `loading.tsx`: it streams the page, so `notFound()` for
  another carrier's Claim File returned **200** instead of 404 (the tenancy e2e caught it). Reverted — correct 404
  semantics beat a skeleton for pages that render in < 200 ms. Revisit with a client-side route-change indicator.

Done: H1, H2, M1, M2, M3 (M4 investigated and deliberately not shipped).

- `ConfirmAction`: inline two-step confirmation stating the consequence; focus moves to Cancel (safe default).
  Used for Revoke link and Discard. e2e asserts Cancel is focused before confirming.
- Sealed thumbnails get a Verdict-green ring and a check badge that pops in (260 ms; off under reduced motion);
  in-flight thumbnails show a spinner; failed ones a danger ring.
- Evidence empty state points to the Claim Link and to upload; evidence grid goes to three columns on `lg`.

**Next: Iteration 12 — Backend, pass 3**: idempotency of the send step under concurrent retries, the relayer's
behaviour under nonce gaps and stuck transactions (timeouts, replacement), what happens when the relayer runs out of
MON (clear Capturer message, alerting hook), and structured logging with request IDs.

---

## Iteration 12 — Backend, pass 3 (2026-09-30)

Findings:

- **H1** The relayer waited for transaction receipts with no timeout: a stuck transaction would hang the Capturer's
  Seal request until the platform killed it.
- **H2** When the relayer ran out of MON or the Registry was paused, Capturers were told "couldn't be sealed — tap
  retry": an endless loop that could never succeed, and nobody was alerted.
- **M1** No alarm path for a draining relayer balance (NFR-4, R-5).
- **M2** A failed Seal's reason lived only in a `title` tooltip — invisible on phones.
- OK: send is idempotent under concurrent retries (same key, same bytes, `sentAt` guarded); nonce gaps are covered by
  the serialised submit queue plus `pending` nonces; retries after a timeout are reconciled from the Registry
  (iteration 2).

Done: all four.

- `relayerErrorKind()` classifies failures (unfunded, paused, already-sealed, window-expired, timeout, other).
  Seal: unfunded/paused → 503 "Sealing is paused on our side… your photo is kept on this phone"; timeout → 504 "taking
  longer than usual — if it went through we'll pick it up"; the link reservation is always released. Enroll and
  import map the same way. Unit-tested.
- Receipt waits are bounded by `RELAYER_RECEIPT_TIMEOUT_MS` (30 s).
- `/api/health` checks the relayer balance and `Registry.paused()`; 503 with `problems` when below
  `RELAYER_MIN_BALANCE_MON`, paused or unreachable — an uptime monitor on it is the low-balance alarm. e2e asserts the
  healthy shape.
- Failed thumbnails show the reason as text under the photo.

**Next: Iteration 13 — Contracts, pass 3**: review the dev-chain and deploy tooling end to end on a fresh checkout
(does `pnpm dev:chain` + `pnpm seed` + `pnpm dev` work from zero?), gas snapshot file checked into CI to catch
regressions (`forge snapshot --check`), and the PasskeySpike contract's future (keep as documentation or remove).

---

## Iteration 13 — Contracts & tooling, pass 3 (2026-09-30)

Ran the README quickstart on a **fresh clone** in a scratch directory (`pnpm install --frozen-lockfile`,
`pnpm dev:chain`, `pnpm seed`, `pnpm dev`, then `pnpm check`).

Findings:

- **H1** (bug, clean checkouts only) `copy-wasm` copied the PDQ binary into `apps/web/public/`, a directory that
  only ever held gitignored files and therefore **does not exist in a clone**. `pnpm dev` and `pnpm build` failed on
  every fresh checkout — including CI and any judge following the README. Local runs never saw it.
- **M1** No gas regression guard: a change could quietly make `seal()` more expensive.
- **L1** `PasskeySpike.sol` is superseded by `Registry.sol`. Kept deliberately: `docs/spikes/spike-b.md` and the
  testnet runner (`tools/spike-b-testnet.ts`) use it to measure raw verification cost; it is never deployed by the
  Registry script.
- OK: `dev:chain` deploys and wires `.env.local` from zero; `seed` works; `/api/health` reports the funded relayer;
  all pages 200; full `pnpm check` passes in the clone (68 web, 26 fingerprint, 11 shared, 40 contract tests).

Done: H1, M1.

- `copy-wasm` creates `public/` first; `public/.gitkeep` committed.
- `contracts/.gas-snapshot` for the Registry unit tests (fuzz excluded, deterministic); CI's check job runs
  `gas:check`; refresh with `pnpm --filter @proofshot/contracts gas:snapshot`.

**Next: Iteration 14 — Tests/CI, pass 3**: add a "fresh clone" CI guard (the check job already starts clean — verify
nothing else depends on untracked files: fixtures, `.env.local`), add a test that `.env.example` lists every
variable in the env schema, and review test data builders for duplication across unit tests.

---

## Iteration 14 — Tests/CI, pass 3 (2026-09-30)

Findings:

- **M1** `benchmark/data/MANIFEST.md` was never committed: the root `.gitignore` excluded the whole `benchmark/data/`
  directory, and Git can't re-include a file inside an excluded directory, so the package-level `!data/MANIFEST.md`
  exception never applied.
- **M2** Env drift: `STORAGE_DIR` was read straight from `process.env` (unvalidated, not in the schema) and nothing
  checked that `.env.example` matches what the server actually reads.
- **L1** Six test files each re-implemented "look up a seeded Carrier and build its scope".
- OK: every fixture tests need is tracked (`scene.jpg`, `scene.heic`, the WebAuthn fixture); the e2e camera file is
  generated in `globalSetup`; nothing depends on `.env.local`.

Done: all three.

- Root `.gitignore` defers to `benchmark/.gitignore`; the manifest is committed.
- `STORAGE_DIR` is in the env schema (absolute path) and read through `env()`.
- `env-example.test.ts` asserts `.env.example` documents exactly the schema's variables (it caught `STORAGE_DIR`).
- `carrierScope(db, slug)` in `test-db.ts`; six test files use it.

**Next: Iteration 15 — Docs/README, pass 3**: check every number and claim in README, write-up, traceability and
spike docs against the current code (gas, test counts, limits, env names), add a CHANGELOG summarising the review
iterations for judges, and make OWNER-TODO.html reflect everything that now needs the owner (CRON_SECRET, RESEND,
uptime monitor on /api/health).

---

## Iteration 15 — Docs, pass 3: every claim checked against the code (2026-09-30)

Findings:

- **H1** Wrong number in the README and write-up: "vs 311,500 without the precompile" was the *spike* contract's
  figure. The Registry's `seal()` without the precompile measures **326,546** gas (100,315 with it).
- **H2** Unverified claim: "the Monad public RPC allows 100 blocks per `eth_getLogs`" (README table, `.env.example`).
  Worse, the claim hid a real fragility: the indexer used a fixed range, so a provider with a smaller limit would stop
  indexing entirely (the CLI already adapted; the app did not).
- **M1** No single summary of what was built and hardened for a reader who won't open the review log.
- **M2** OWNER-TODO lacked the owner steps added by later iterations: `RESEND_API_KEY` (sign-in refuses without it),
  `CRON_SECRET`, and the uptime monitor on `/api/health` that doubles as the low-balance alarm.
- OK: test counts, coverage, invariant budget, crop limit, env names and route names in README, traceability,
  architecture, threat model and deploy docs match the code.

Done: all four.

- Gas figure corrected (README, write-up).
- Indexer halves the `eth_getLogs` range when the RPC refuses it, down to one block (unit-tested); docs now say
  "match your provider's limit" instead of asserting one.
- `CHANGELOG.md`: product scope and the hardening themes from the review iterations, plus what is pending.
- OWNER-TODO.html: Resend key, CRON_SECRET, and a new "uptime monitor" step.

**Next: Iteration 16 — Frontend UI/UX, pass 4**: the capture screen on a real small phone viewport (320 px),
landscape orientation, very long Carrier names and claim references, the Verifier with a 20 MB image (progress and
cancel), and HEIC preview fallback in non-Safari browsers.

---

## Iteration 16 — Frontend UI/UX, pass 4: edge layouts (2026-09-30)

New on-demand screenshots (`e2e/screens-edge.spec.ts`, included in `pnpm screens`): 320 × 568, landscape
812 × 375, and an 80-character unbroken claim reference.

Findings:

- **H1** Capture at 320 px / landscape: the fixed 3:4 portrait viewfinder is taller than the screen, so the viewfinder
  and the shutter never fit together — in landscape the Capturer has to scroll mid-shot (PRD §12 "one-hand capture").
- **H2** Long unbroken claim references overflowed: horizontal scrolling on the capture page at 320 px (it also
  made the shutter unreachable for Playwright), and the Console heading ran past its container.
- **M1** "Revoke link" rendered centred across the card (the confirmation wrapper stretched in a flex column).
- **M2** Uploading a large image to the Verifier showed an indeterminate spinner with no progress.
- **M3** HEIC in non-Safari browsers: no preview can be drawn, and an Altered result then lost its region list.

Done: all five.

- Viewfinder width derives from the height budget (`min(100%, 58svh × 3/4)`); e2e asserts viewfinder + shutter fit the
  viewport at 320 × 568 and 812 × 375, and that there is no horizontal scroll with an 80-character reference.
- References wrap (`overflow-wrap: anywhere`) on capture and the Claim File heading; the Console table truncates them
  with the full value in `title`.
- Revoke link / confirmation are start-aligned.
- Verifier upload uses XHR progress: "Uploading … 45%" with a progress bar, then "Checking…".
- Altered without a displayable preview lists the changed regions as text.

**Next: Iteration 17 — Backend, pass 4**: object-storage adapter interface readiness (S3/Vercel Blob) behind
`Storage` with a contract test both implementations must pass, request-size limits in `next.config` for server
actions, and a review of every `console.error` for PII (emails, tokens) before logs leave the machine.

---

## Iteration 17 — Backend, pass 4: storage for serverless (2026-09-30)

Findings:

- **H1** Deploy blocker: evidence images were stored only on the local filesystem. Serverless hosts (the planned
  Vercel deploy) have no persistent disk, so sent photos and Console uploads would vanish between requests.
- **H2** My own earlier recommendation (OWNER-TODO: "Vercel Blob") was wrong for this data: Blob serves objects by
  URL to anyone who has it, but claim evidence must only ever be served through the tenant-checked Console routes
  (NFR-5).
- **M1** Storage implementations had no shared contract, and `FsStorage` checked path escapes but not key shape.
- OK: server actions only take small forms (Next's 1 MB action limit is right); route handlers enforce their own
  sizes (iteration 2). Logs: no emails or tokens are logged outside the development outbox; relayer errors carry
  transaction data only.

Done: all three.

- `S3Storage` (any S3-compatible, private bucket: AWS S3, Cloudflare R2, MinIO) selected by `STORAGE_DRIVER=s3`;
  `fs` stays the default for local and single-node hosts. Env schema, `.env.example` and `docs/deploy.md` updated.
- A shared `storageContract` suite (round-trip bytes, missing key → null, refuses escaping/malformed keys) runs against
  both implementations (S3 through an in-memory command fake); both validate key shape.
- OWNER-TODO now asks for a **private** Cloudflare R2 bucket and lists the exact variables; CHANGELOG notes the adapter
  is built.

**Next: Iteration 18 — Contracts, pass 4**: final pre-deploy checklist for the Registry (compiler version pin,
optimizer runs vs verified source, constructor args encoding for verification, a `DeployRegistry` dry run against a
fork of Monad testnet if reachable without keys), and document the exact verification command sequence.

---

## Iteration 18 — Contracts, pass 4: live-chain checks without keys (2026-09-30)

Findings:

- **H1** The project's core technical claim — passkey signatures verify onchain on Monad via the P-256 precompile —
  had only been exercised on a local Anvil (Osaka) chain. Nothing had touched Monad itself.
- **M1** The deploy script wrote `deployments/<chainId>.json` even when only simulating, which would leave a record for
  a contract that was never deployed.
- **M2** Funding guidance (OWNER-TODO, write-up) had no numbers from the live chains.
- OK: solc 0.8.30 pinned in `foundry.toml`; the script guards the chain ID; RPCs for testnet (10143) and mainnet (143)
  are reachable and return the configured chain IDs.

Done: all three.

- Direct `eth_call` to `0x100` on both networks with the fixture signature: returns `1`; a tampered `s` returns empty.
- `script/WebAuthnProbe.sol` + `pnpm --filter @proofshot/contracts probe`: executes the probe's creation code via
  `eth_call` so the Registry's exact OpenZeppelin `WebAuthn.verify` runs on each chain's own EVM — **valid on testnet
  and mainnet, 13,853 gas; tampered signature rejected** — with no deployment, key or funds. Raw output:
  `docs/spikes/spike-b-probe.json`.
- Deploy script writes the deployment record only under `ScriptBroadcast`; a testnet-fork simulation now runs clean
  (~3.2M gas).
- Live gas price 102 gwei on both networks → deploy ≈ 0.33 MON, Seal ≈ 0.010 MON (5,000 ≈ 51 MON); recorded in the
  spike doc, write-up and OWNER-TODO funding steps. README and write-up state what the probe proved and what still
  needs a funded key.

**Next: Iteration 19 — Tests/CI, pass 4**: run the keyless probe in CI on `main` as a scheduled canary (network drift
would surface early), add a unit test for the deploy script's chain guard, and review the total CI duration.

---

## Iteration 19 — Tests/CI, pass 4 (2026-09-30)

Findings:

- **M1** The live-chain probe (iteration 18) was a one-off. If Monad changed the precompile or an RPC started
  misbehaving, we'd learn during the demo.
- **M2** The deploy script's chain guard and role wiring had no test. A first attempt using `vm.setEnv` was flaky
  by construction: environment variables are process-global and Foundry runs test functions in parallel, so two
  tests raced on `EXPECTED_CHAIN_ID`.
- **M3** The probe always exited 0, so it couldn't gate anything.
- OK: CI duration is dominated by the production build in the e2e job (~1 min locally) and web unit tests; jobs
  already run in parallel and cache pnpm and Playwright.

Done: all three.

- `.github/workflows/monad-canary.yml`: every 6 hours (and on demand) runs the keyless probe against testnet and
  mainnet; `--no-write` keeps the committed evidence file unchanged.
- The probe exits non-zero if either network stops accepting a valid assertion natively or accepts a tampered one.
- `DeployRegistry` gained an env-free `deploy(expectedChainId, admin, relayer, rpIds)`; `run()` reads env and calls it.
  `test/DeployRegistry.t.sol` covers the wrong-chain revert and that roles and RP IDs are wired exactly (admin is not a
  relayer, only listed RP IDs allowed).

Contract tests: 42.

**Next: Iteration 20 — Docs, pass 4**: a one-page "judge's guide" (5-minute path through the product, what to click,
what each proof shows, where the evidence files are), linked from the README top; and a final pass on the landing
page copy against the now-measured live-chain facts.

---

## Iteration 20 — Docs, pass 4: the judge's path (2026-09-30)

Findings:

- **H1** Landing copy claimed the seal is verified "within seconds" — live latency is not measured yet.
- **M1** The landing page never mentioned Monad or the one thing now proven on the live chains (native passkey
  verification on testnet and mainnet).
- **M2** No short path for a judge: the README is thorough but long; nothing says "do this, then look here".
- **M3** (product gap, found while writing the guide) Judges can't enter the Console on a hosted demo: sign-in is a
  magic link to demo inboxes they don't control. The Carrier half of the product (UJ-2, UJ-3) is only visible in the
  video or by running locally.

Done: H1, M1, M2. M3 goes to the next backend iteration.

- Landing: "a public ledger checks that signature before recording the seal" (no timing claim) and a calm
  "Checked onchain, on Monad" section stating what was confirmed on testnet and mainnet.
- `docs/judges-guide.md`: a 3-minute hands-on path with every Verdict to expect, an evidence table (claim → file →
  how to re-run), where the Console flows are shown, and the honest limits. Linked at the top of the README.

**Next: Iteration 21 — Backend, pass 5**: judge access to the demo Console — an opt-in (`DEMO_ACCESS=1`) one-tap
sign-in limited to the seeded demo carriers, with its own rate limits and upload caps, never available for real
carriers, clearly labelled as a demo.

---

## Iteration 21 — Backend, pass 5: judge access to the demo Console (2026-09-30)

Closes M3 from iteration 20.

Design constraints: opt-in per deployment; impossible to use against a real carrier; bounded cost; unmistakably a
demo to whoever enters.

Done:

- `carriers.is_demo` (migration 0005); the seed marks Northwind and Harbor as demo carriers and now updates flags on
  every run (it used to be insert-only, which would have left existing databases unflagged).
- `openDemoSession(db, slug)` opens a **2-hour** session for a seeded user, and only when the carrier is `is_demo`.
  Unit tests: works for Harbor; `null` for a real carrier, the sandbox and unknown slugs; expires after 2 h.
- `enterDemo` server action behind `DEMO_ACCESS=1`, rate-limited to 20 demo sessions per client per hour.
- Sign-in shows **Explore the demo Console** (Northwind · adjuster / Harbor · investigator) only when enabled; the
  Console shows a "Demo workspace · fictional carrier · visible to other visitors" banner.
- New general safeguard: in-file verifications capped at 500 per carrier per day (storage and CPU), since demo
  carriers are open to visitors.
- e2e: one tap into Harbor's Console with the banner; the axe scan covers the new sign-in section.
- Judge's guide step 3 is now hands-on; deploy docs and OWNER-TODO ask for `DEMO_ACCESS=1` on the judging deployment.

**Next: Iteration 22 — Contracts, pass 5**: review `importRecords` batch size vs the Osaka per-transaction gas cap
(2^24) — the app sends 10 per batch; compute the real ceiling and enforce it in both the contract docs and the app.

---

## Iteration 22 — Contracts, pass 5: import batch ceiling (2026-09-30)

Measured `importRecords` execution gas: 1 record 36,982 · 10 → 335,890 · 50 → 1,692,692 · 200 → 7,085,999
(~35k per record), plus ~11k calldata gas per record (21 words).

Findings:

- **M1** `importRecords` accepted any array length. Past ~350 records a batch exceeds the 2^24 per-transaction gas
  cap (EIP-7825) and reverts only after the relayer has paid for the attempt.
- **M2** Contract limits (`MAX_LAG`, the new batch cap) were duplicated in TypeScript by hand with nothing keeping the
  copies in step.
- OK: the app sends 10 images per import request (bounded by upload size), far below any ceiling; `seal()` is a single
  record (~100k gas).

Done: both.

- `Registry.MAX_IMPORT_BATCH = 200` with `BatchTooLarge(size, max)`; a test proves 201 reverts and that a full 200-record
  batch — execution plus the worst-case EIP-7623 calldata floor plus the 21k base — stays under 16,777,216. ABI and gas
  snapshot regenerated.
- `packages/shared/src/registry-limits.ts` mirrors `MAX_IMPORT_BATCH` and `MAX_LAG`; `registry-limits.test.ts` parses
  `Registry.sol` and fails on drift. The app asserts `IMPORT_BATCH ≤ MAX_IMPORT_BATCH` at load and maps a
  `BatchTooLarge` revert to a clear 400.

**Next: Iteration 23 — Tests/CI, pass 5**: a final full-suite stability run in production mode ×2, check the CI YAML
with `actionlint` if available (or a manual review of expressions and permissions), and set least-privilege
`permissions:` on every workflow.

---

## Iteration 23 — Tests/CI, pass 5: workflow hardening and stability (2026-09-30)

Findings:

- **H1** The production-mode stability run failed twice out of two on the same check: axe reported `.btn-primary` at a
  4.39:1 contrast on the capture screen. Root cause was the global 150 ms `opacity` transition on buttons. Axe measured
  the Send button while it was fading from disabled (0.5) to enabled (1), at about 0.65 opacity. The settled button and
  its hover state are fine (hover is about 8:1). A fast production build hits this window every time, so it was a
  flaky gate, not a product defect.
- **M1** Neither workflow declared `permissions:`, so the `GITHUB_TOKEN` scope depended on repository defaults, which
  can be write-all.
- **M2** Every action was pinned to a movable tag (`@v4`, `@v1`), a supply-chain risk.
- **M3** The pnpm, Node, Foundry and install steps were copied into four jobs.
- **L1** A failed axe assertion printed only the selector, so the contrast ratio and colours were missing from the CI
  log.

Done: all.

- `audit()` now waits for every finite animation and transition before running axe. Infinite ones, such as spinners,
  are skipped so they cannot hang the check. The failure message now includes axe's own summary.
- Both workflows have top-level `permissions: contents: read`. All actions are pinned to full commit SHAs, with the tag
  kept in a comment.
- The shared setup is a composite action, `.github/actions/setup`, used by `check`, `contracts-deep`, `e2e` and the
  Monad canary.
- `actionlint` 1.7.12 reports no problems. `pnpm check` is green. The e2e suite passes 19/19 in production mode twice
  and 19/19 in dev mode.

**Next: Iteration 24 — Docs, pass 5**: check README, judge's guide and submission write-up against the code as it is
now (the CI section, canary, batch cap and demo access), and fix any stale numbers or commands. Then run a fresh-clone
quickstart dry run as described in the README.

---

## Iteration 24 — Docs, pass 5: every documented command and claim, run against the code (2026-09-30)

Method: ran each README and runbook command as written, and traced each claim in the judge's guide and write-up back to
a test.

Findings:

- **H1 (privacy)** `docs/deploy.md` told the operator to seed `northwind=you@example.com`. `openDemoSession` then picked
  *any* user of the demo carrier (`limit(1)`, unordered), so a visitor who tapped "Explore the demo Console" could be
  signed in as the operator and see their real email in the Console header.
- **H2** The README's `pnpm --filter proofshot-verify start photo.jpg …` failed with ENOENT for a photo in the repo
  root. pnpm runs the script inside `cli/`, and the CLI read the path relative to that directory.
- **M1** README, judge's guide and write-up said axe scans "every surface, light and dark". In fact only the four
  public pages ran in dark mode; the Console, capture, Verdicts and receipts ran in light mode only.
- **M2** The Try-it screen and the judge's guide both suggested "crop it", and the guide promised **Derived Copy**
  for a crop. Any real crop beyond about 3% returns **No Record** (a documented limit), so a judge following the guide
  would see the product apparently fail.
- **L1** A local setup had no one-tap demo Console (`DEMO_ACCESS` defaults to `0`), and the README did not mention CI
  or the Monad canary.

Done: all.

- H1: demo sessions act only as the seeded `*.demo` placeholder for that carrier. A new unit test proves that a real
  person on a demo carrier is never chosen. `deploy.md` now says demo tenants are public and must never hold real
  data.
- H2: the CLI resolves the image path against `INIT_CWD`, the directory where the user typed the command. Checked from
  the repo root.
- M1: `audit()` scans every page in both colour schemes (`emulateMedia`): 0 violations. The claim is now true as
  written.
- M2: the Try-it screen no longer suggests cropping and states the crop limit in one line. The guide now says a thin
  edge trim gives **Derived Copy · check unavailable** and a bigger crop gives **No Record**.
- L1: `pnpm dev:chain` sets `DEMO_ACCESS=1` locally unless the developer has already set it. The README documents the
  demo Console, CLI path handling, `--json`, CI and the canary.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 25 — Frontend UI/UX, pass 6**: review the Try-it flow end to end at 375px (landing QR → capture →
fool-it → verifier → receipt) for copy density, tap targets and loading states. Also review the Console claim page on
desktop for information hierarchy now that Duplicate Alerts and uploads share it.

---

## Iteration 25 — Frontend UI/UX, pass 6: Try-it on a phone, Console claim page (2026-09-30)

Method: regenerated `pnpm screens` and walked through the Try-it flow at 375px and the claim page at 1280px. Added the
missing screenshot of the sandbox state after a Seal (`m-try-sealed`).

Findings:

- **H1** Try-it at 375px: after the first Seal, the **Now try to fool it** guide, which is the whole point of the
  demo, sat about 130px below the fold under the viewfinder. Nothing on screen said to scroll.
- **H2** Console claim page: Duplicate Alerts did not say *which* item they were about. With two uploads, "An image
  uploaded to this file" was ambiguous. Four near-identical cards also pushed the Evidence off the first screen, and
  nothing linked an alert to its photo or a photo to its alerts.
- **M1** The evidence cards were laid out differently: a policyholder photo had its title and Verdict below the image,
  while an upload had its title and Verdict above the Tile Map caption.
- **L1** The Tile Map's alt text said "Your image…" inside the Console, where the image is not the viewer's own.

Done: all.

- H1: the guide scrolls into view once, when the first Seal lands (instant under reduced motion). The sandbox e2e now
  asserts `toBeInViewport()`, and I confirmed that assertion fails without the fix.
- H2: items are numbered ("Policyholder photo 1", "Team upload 1") and carry anchors. Alerts are grouped by the item
  they are about: one card per item, one line per match (kind · same/another carrier · time · strength). Each group
  links to its item, and each card shows "N Duplicate Alerts" linking back. The e2e checks both links.
- M1: both card types now put the title and Verdict first.
- L1: `TileMap` takes an `alt` prop, so the Console passes "Team upload N with changed regions highlighted".

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 26 — Backend, pass 6**: review the upload and verify paths for decode bombs and CPU cost (a very
large pixel count within 20 MB, e.g. a 30000×30000 PNG), `sharp` `limitInputPixels`, the time budget per request, and
concurrent verification pressure on a small instance.

---

## Iteration 26 — Backend, pass 6: decode bombs and decode pressure (2026-09-30)

Method: built a 16000×16000 flat-grey PNG (776 KB, well inside the 20 MB upload limit) and fed it to the server
decode path.

Findings:

- **H1** Decompression bomb. The file was accepted and decoded: peak RSS was **963 MB**, then the PDQ WebAssembly
  module **aborted** ("Aborted()"). The request returned a 500, and a few of these in parallel would OOM-kill an
  instance. sharp's default limit is about 268 MP, far above anything a phone produces. PDQ did recover for later
  requests, which I checked directly.
- **H2** The HEIC fallback had no pixel limit at all. Worse, any ISO-BMFF file that sharp refused went on to
  heic-decode, which would have bypassed a sharp-only limit.
- **M1** Decoding had no concurrency bound. Each decode holds about 3× its pixel count in RGB copies (decoded image,
  PDQ heap, tiles), so parallel requests multiply peak memory.
- **L1** A Team upload decodes the image twice, once to verify and once for the preview JPEG. This is bounded by the
  500/day per-carrier limit and needed for HEIC previews, so it stays for now.
- OK: the fingerprint algorithm stays full-resolution on both browser and server. Downscaling first would change
  hashes against existing Seals, so the fix is a budget, not a resize.

Done: H1, H2, M1.

- `MAX_PIXELS = 50 MP`, which covers 48 MP phone cameras (8064×6048). Oversized files are refused from their header
  (sharp `metadata()`, and heic-decode's lazy `all()` for HEIC) before any pixel is decoded. `limitInputPixels` is a
  backstop, and a pixel-limit error never falls through to HEIC.
- `ImageTooLargeError` maps to **413** "This image is over 50 megapixels. Use a smaller copy." on the verifier and
  uploads, and to "over 50 megapixels" per file in imports.
- At most 2 decodes (with their PDQ passes) run at once per process; the rest queue.
- Tests: the bomb is rejected in about 300 ms with under 200 MB of RSS growth; an image just inside the budget still
  decodes; 7 concurrent fingerprints all complete and agree; the verifier returns 413 with the specific message.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 27 — Contracts, pass 6**: review the Registry's admin paths: `setRpIdHash` removal semantics,
role-renounce footguns (an admin renouncing the last admin), event coverage for every admin action (so indexers and
auditors can reconstruct config history), and whether `pause` should also block `revokeDeviceKey`.

---

## Iteration 27 — Contracts, pass 6: admin paths (2026-09-30)

Findings:

- **H1** The admin/relayer split was only checked in the constructor. Under plain `AccessControl` the admin could
  later `grantRole(RELAYER_ROLE, admin)`, or `grantRole(DEFAULT_ADMIN_ROLE, relayer)` and hand the cold role to the
  hot server key. Either one silently defeats the incident runbook (T-8).
- **H2** One `renounceRole(DEFAULT_ADMIN_ROLE, admin)` call, or a grant to a mistyped address followed by a renounce,
  would orphan the Registry for good: no pause, no relayer rotation, no RP ID changes.
- OK: every admin action already emits an event (`RpIdHashAllowed`, OZ `Paused`/`Unpaused`, `RoleGranted`/`RoleRevoked`),
  so config history can be rebuilt from logs. `revokeDeviceKey` deliberately works while paused, because revocation is
  part of incident response. That is documented, so no change.

Done: both.

- `Registry` is now `AccessControlDefaultAdminRules` with `ADMIN_TRANSFER_DELAY = 1 days`. There is exactly one admin,
  transfers take two steps and the new admin must accept after the delay, and a direct admin grant or instant
  renounce reverts.
- `_grantRole` is overridden so no account can hold both roles, whether through deploy, `grantRole` or accepting an
  admin transfer (`AdminIsRelayer`).
- Two new tests cover role separation in both directions and the two-step, delayed transfer, including the
  instant-renounce revert. 45 contract tests pass, including the deep profile (fuzz 10k, invariants 512×128), and
  branch coverage stays at 100%.
- Cost: `seal()` is +25 gas from the longer selector dispatch: **100,340** with the precompile (Osaka), **326,571**
  without. README, judge's guide, write-up and spike notes are updated; the gas snapshot and ABI are regenerated;
  `deploy.md` and threat model T-8 describe the admin rules.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 28 — Tests/CI, pass 6**: add an invariant that no account ever holds both roles (let the handler
call role functions as the admin); check how long CI takes end to end and whether the Playwright browser cache key
is right; and make sure a failed e2e uploads the server log as well as the report.

---

## Iteration 28 — Tests/CI, pass 6: role invariants, flake policy, failure artifacts (2026-09-30)

Findings:

- **M1** The new admin rules from iteration 27 were covered only by example tests. No stateful campaign mixed role
  changes with Seals and imports.
- **M2** CI used `retries: 1` and nothing more, so a test that failed once and passed on retry turned the build
  green. The iteration 23 axe timing bug is exactly the kind of failure this would have hidden.
- **M3** The e2e workflow uploads `apps/web/playwright-report` on failure, but on CI Playwright's default reporter
  never writes that directory, so the upload was always empty. There was also no `forbidOnly`: a stray `test.only`
  would silently shrink the suite to one test.
- OK: the Playwright browser cache key (OS plus lockfile hash) changes whenever Playwright's version changes, and the
  app server's stdout is piped to the job log.

Done: all.

- The invariant handler now also runs grant/revoke relayer, begin transfer and accept transfer, always as whoever is
  admin at that moment, across five actors. Two new invariants: **no account holds both roles** and **exactly one
  admin**. The deep profile passes (512 runs × 128 calls = 65,536 calls). A mutation check confirmed the role
  invariant fails once the `_grantRole` guard is removed.
- Playwright on CI: `failOnFlakyTests`, `forbidOnly`, and the `github`, `list` and `html` reporters. A local run with
  `CI=1 E2E_PROD=1` passes 19/19 and writes `playwright-report/index.html`.
- The README and judge's guide list the new invariants.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in CI/production mode.

**Next: Iteration 29 — Docs, pass 6**: read the submission write-up end to end as a judge would (structure, the first
100 words, claims-to-evidence links, ⏳ items) and tighten it. Also make sure `docs/demo-script.md` matches the UI as it
is now (Try-it scroll, numbered evidence, grouped alerts).

---

## Iteration 29 — Docs, pass 6: the write-up and demo script, read as a judge (2026-09-30)

Findings:

- **H1** The write-up's latency line points at `docs/latency.md`, but nothing produced that file. Seal timings
  (`captures.timings`) were stored on every Seal and never aggregated, so after launch the owner had no way to fill
  in the NFR-1 / SM-5 p95.
- **H2** The demo script opened with "99% of insurers have already received manipulated evidence" stated as fact.
  The write-up itself says to re-check that citation before quoting it.
- **M1** The demo script quoted Duplicate Alert copy that no longer exists after iteration 25's grouping.
- **M2** Section 2 of the write-up ("what a Seal proves") was still a paste-me placeholder, and the first 100 words
  opened with the problem, without saying what Proofshot is.
- **L1** The write-up's engineering section did not mention the role invariants or the review hardening.
- OK: every other on-screen label quoted in the demo script matches the UI strings exactly (checked by grep).

Done: all.

- `pnpm --filter web report:latency [--since] [--out]` reads the deployment's database and writes `docs/latency.md`:
  nearest-rank p50/p95/max of shutter → "Sealed ✓", split into Claim Links and Try-it sandbox, plus the on-device
  signing part and the p95 ≤ 3 s verdict. It says "no data" rather than inventing numbers. Unit-tested, and run
  against the e2e database (local: p95 1.12 s over 11 Seals; that is a local chain, so it is not quoted as Monad).
  Added to `deploy.md` and to the owner checklist.
- The demo opener no longer states the statistic; it is an optional ⏳ line that requires a source check first. The
  alert beat uses the current copy.
- The write-up opens with a one-paragraph summary; §2 carries the threat model's proves/does-not-prove statement;
  §8 lists the role invariants and the hardening.

`pnpm check` is green. e2e: 19/19 in dev mode.

**Next: Iteration 30 — Frontend UI/UX, pass 7**: review the Public Verifier result states at 375px (all four
Verdicts plus the crop warning) for scannability, and receipts on desktop for print/PDF (an adjuster will attach them
to a claim file). Consider a print stylesheet.

---

## Iteration 30 — Frontend UI/UX, pass 7: Verifier results and receipts on paper (2026-09-30)

Method: regenerated screens; reviewed the four Verdicts and the crop warning at 375px, then rendered both receipts as
printed at A4 width (new `print-receipt-*` screenshots).

Findings:

- **H1** Receipts had no print styles. An adjuster who prints one, or saves it as PDF for a claim file, got the site
  navigation, the footer and a "Copy command" button, and nowhere on the page was the receipt's own URL. Browsers also
  drop background colours when printing, so the white-on-colour Verdict badge would print as white on white. A
  dark-mode browser would print the dark palette.
- **H2** The Device Key, Exact Hash and ledger record were shortened (`0x82ab4850…ddf4a6`). A receipt is audit
  evidence, and a shortened value can't be checked against the chain, least of all on paper.
- **L1** The Signing Window read "a window of 0 s" whenever the two blocks fell within the same second, which on
  Monad is the normal case.
- **L2** The receipt's CLI command still said `photo.jpg`; iteration 24 made paths resolve from the caller's
  directory, and the README uses `./photo.jpg`.
- OK: at 375px the Verifier results read in the right order (badge, warning, summary, then what it means and what it
  does not mean), and the crop warning is as prominent as the Verdict.

Done: all.

- Print: the dark palette is now `screen`-only, and printing uses `print-color-adjust: exact`, a white body and no card
  split across pages. Navigation, footer, copy buttons and "verify another" links are hidden on paper, and each
  receipt prints "This receipt online: <URL>".
- Every hash on the receipt is shown in full and wraps. The explorer link keeps the full hash.
- Windows under a second read "under 1 s".
- e2e: the receipt shows the full Exact Hash; under print media (with a dark colour scheme) the navigation and copy
  button are hidden, the URL line is visible, the body is white and `print-color-adjust` is exact; the URL line is
  hidden again on screen.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 31 — Backend, pass 7**: review the indexer and registry cache under chain reorgs and RPC
inconsistencies (Monad finality, a log served then missing, duplicate logs across range boundaries). Also check
`registryEntries` memory growth as the Registry grows (every request loads every entry).

---

## Iteration 31 — Backend, pass 7: indexer under reorgs and inconsistent RPCs (2026-09-30)

Findings:

- **H1** Missed logs were permanent. Each sync read `lastBlock + 1 … head` and never looked back. With the fallback
  transport (`RPC_URL_SECONDARY`) or any load-balanced RPC, the head can come from one node and `eth_getLogs` from
  another that is a block behind. The logs in that gap were skipped forever, so a real Seal would read as **No Record**.
- **H2** A reorged block left a phantom record: a Seal indexed from a block that was later replaced stayed in
  `registry_records` and in memory. A file could then verify as **Original** against something the chain no longer
  holds.
- **L1** A halved `eth_getLogs` range isn't remembered between syncs, so a provider with a small cap costs a few
  refused calls on each sync. Left as is: `LOGS_BLOCK_RANGE` lets the operator set the right cap.
- OK: memory. `registryEntries` holds every entry, about 2 KB each, so the 10,000-entry NFR-2 scale is about 20 MB.
  Documented in the code; revisit past that scale.

Done: H1, H2.

- New `NetworkConfig.rescanBlocks` (local 0, Monad testnet and mainnet 64, about 25 s): every sync re-reads that many
  already-indexed blocks. Within each chunk, indexed rows are reconciled with the fresh read:
  - New logs, and logs that moved to a different block, are upserted.
  - An indexed record that is missing is removed **only if its block's hash changed** (a reorg).
  - If the hash is unchanged, or the node doesn't have the block yet, it is an RPC omission and the record stays.
  This is why logs alone are not enough: a lagging node must never delete a real Seal.
- `registry_records.block_hash` was added (migration 0006). `syncRegistry` returns `{ added, removed }`; the in-memory
  index drops removed and moved records and appends the new ones.
- Four new tests: a lagging node's log is caught on the next pass; an omitted record in an unchanged block is kept;
  a reorg drops one record and moves another to its new block; re-reading unchanged blocks writes nothing.
- The architecture doc describes the behaviour.

`pnpm check` is green. e2e: 19/19 in dev mode and 19/19 in production mode.

**Next: Iteration 32 — Contracts, pass 7**: gas and calldata review of `seal()` (can `tiles` be packed? calldata
dominates on L1s but Monad pricing differs, so measure first). Re-check that every NatSpec `@dev` still matches the
code after iterations 22 and 27, and run `forge fmt --check` and `slither` if available.

---

## Iteration 32 — Contracts, pass 7: static analysis, formatting, and the block time behind every window (2026-09-30)

Findings:

- **M1** Solidity formatting was not enforced: `forge fmt --check` failed on 7 files, and nothing in `pnpm lint` or CI
  ran it.
- **M2** Two contradictory block-time assumptions. The Registry says `MAX_LAG` is "~30 s at 300 ms blocks";
  iteration 31's `rescanBlocks` comment assumed about 400 ms ("~25 s"). I measured instead of guessing, from the
  public RPCs, using the timestamps of the head and the block 10,000 earlier: **testnet 304 ms, mainnet 301 ms**. The
  Registry comment was right; 64 re-scanned blocks is about **19 s**, not 25 s, which corrects the iteration 31 entry.
- OK: **Slither** (via `uvx`, 102 detectors, dependencies, tests and spikes excluded) reports **0 findings** on
  `Registry.sol`.
- OK: NatSpec matches the code after iterations 22 and 27: the check order in `seal()`, import skipping, the admin
  rules and the incident runbook.
- OK, by design: `seal()` does not reject a zero `exactHash` or `carrierId`. The relayer builds records from its own
  fingerprinting and Claim Links, and a zero SHA-256 is not a real photo. A check would cost gas on every Seal to guard
  the trusted role against itself.
- OK, measured: calldata. The 16 tiles are 256-bit PDQ hashes, which are incompressible, so packing gains nothing.

Done: M1, M2.

- `forge fmt` applied; contracts now have `lint: forge fmt --check`, so `pnpm lint`, `pnpm check` and CI enforce it.
- The measured block time is recorded in the README ("Why Monad") and `docs/spikes/spike-b.md`, together with what it
  means for the Signing Window (~30 s) and the re-scan (~19 s). Code comments are corrected.

`pnpm check` is green, including the new lint. The gas snapshot is unchanged. e2e: 19/19 in dev mode.

**Next: Iteration 33 — Tests/CI, pass 7**: add the Slither run to CI as a contracts job (pinned version via `uvx`),
and verify that the local `pnpm check` time stays reasonable (measure it). Also check that `pnpm test` has no
order-dependent tests by running vitest with `--sequence.shuffle`.

---

## Iteration 33 — Tests/CI, pass 7: static analysis in CI, order independence, check time (2026-09-30)

Findings:

- **M1** Slither ran once, by hand, in iteration 32. Nothing stops a later change from introducing a finding.
- OK, measured: order independence. Three shuffled runs of the web suite (`--sequence.shuffle`, random seeds) passed
  86/86 each; `fingerprint` passed 29/29 and `shared` 13/13. No test relies on another's state, as expected from the
  cloned per-test PGlite databases.
- OK, measured: `pnpm check` time. Typecheck 3 s, lint 3 s, tests 14 s, build 6 s (warm), about 26 s in total. It
  stays a reasonable before-every-commit gate.

Done: M1.

- `contracts/slither.config.json` holds the filters (dependencies, tests, scripts and spikes excluded).
  `pnpm --filter @proofshot/contracts slither` pins `slither-analyzer==0.11.6` through `uvx` and uses
  `--fail-pedantic`.
- New CI job `slither` (pinned `uv==0.12.9` via pipx, the version verified locally; both versions confirmed on PyPI).
  actionlint passes.
- Mutation-checked: a planted `to.transfer(address(this).balance)` makes the gate report `arbitrary-send-eth` and exit
  255. A non-authorising `tx.origin` comparison is correctly not flagged.
- The README lists the command and the CI job.

`pnpm check` is green. e2e: 19/19 in dev mode.

**Next: Iteration 34 — Docs, pass 7**: a fresh-clone dry run following only the README (clone to a temp dir, `pnpm
install`, `pnpm dev:chain`, `pnpm seed`, `pnpm dev`, open `/`, `/verify`, the demo Console), timing each step and
fixing any gap a newcomer would hit.

---

## Iteration 34 — Docs, pass 7: a fresh clone, following only the README (2026-09-30)

Method: `git clone` into a temp directory, then the README steps in order, timed: `pnpm install` 5 s (warm pnpm
store), `pnpm dev:chain` 2 s, `pnpm seed` 2 s, `pnpm dev` ready in 5 s. Then `/`, `/verify`, `/try`,
`/console/sign-in` and `/api/health` all returned 200; `/api/verify` returned a Verdict; the demo Console was offered;
the README CLI command worked from the repo root; and `pnpm check` and `pnpm e2e` ran inside the clone.

Findings:

- **H1** `apps/web/.env.example` was never committed. `apps/web/.gitignore` has `.env*`, which overrides the root
  `!.env.example`. A fresh clone therefore had no env documentation, even though the README and runbook point at it,
  and `pnpm check` **failed** in the clone (`env-example.test.ts`: ENOENT). CI would have been red on the first push.
- **H2** A frame-grab failure was reported to the Capturer on the first failure. During the verification runs the
  UJ-3 e2e failed once with "The camera didn't return a photo. Try again.": the pipeline never reached `seal-context`.
  One `canvas.toBlob` returning null (Chrome can under memory pressure), or a not-yet-decoded frame, went straight to
  an error, and the `catch` discarded the cause.
- **M1** With port 8545 busy (a second `pnpm dev:chain` or a leftover anvil), the newcomer saw only anvil's bare
  `Address already in use (os error 48)`. Worse, the readiness probe could reach the *other* process and deploy onto
  someone else's chain.
- **L1** Every `forge build` printed ten false-positive `incorrect-shift` lint warnings (tests deliberately use
  `1 << bit`), burying real output in `dev:chain`, e2e and screens logs.

Done: all.

- `!.env.example` in `apps/web/.gitignore`; the template, which has no values for secrets (checked), is now tracked.
  `pnpm check` passes in the fresh clone, and so does the full e2e suite (19/19 before the new test).
- `grabFrame` retries up to 3 times on the next presented video frame (`requestVideoFrameCallback`, 250 ms fallback)
  and throws specific errors. The capture screen logs the cause. A new e2e makes the first JPEG encode return null and
  asserts the photo still seals with no error shown; it fails without the fix.
- `dev:chain` checks the port before spawning anvil and prints what to do (`ANVIL_PORT=8555 pnpm dev:chain`, then
  restart `pnpm dev`). Verified in the clone.
- `forge-lint: disable-next-line(incorrect-shift)` on the five intentional shifts; `forge build --force` prints no
  warnings.

`pnpm check` is green. e2e: 20/20 in dev mode and 20/20 in production mode.

**Next: Iteration 35 — Frontend UI/UX, pass 8**: the capture error and recovery states at 375px (camera denied, no
passkey support, a Seal failing mid-burst, offline and then back online, a revoked link while capturing). Check that
each has a clear next step and that nothing already sealed is lost.
