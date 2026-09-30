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

---

## Iteration 35 — Frontend UI/UX, pass 8: capture failure and recovery (2026-09-30)

Method: walked through every way a Seal can fail on the capture screen, checking three things for each: what the
Capturer reads, what they can do next, and whether anything already sealed is lost.

Findings:

- **H1** Offline showed the browser's own error. `fetch` rejects with `TypeError: Failed to fetch`, and the capture
  screen put `e.message` under the photo. That is jargon on the Capturer surface, and it gives no next step.
- **H2** Nothing retried when the connection came back. The photo was kept in IndexedDB, but the Capturer had to
  notice and tap Retry on each one.
- **H3** A link revoked mid-session left the shutter live. Every new photo failed one by one with "This link is no
  longer active." and offered a Retry that could never work.
- **M1** Retry and Discard under a failed photo were 12px underlined text with tiny tap targets, although they are
  the only recovery actions on a phone.
- **L1** Non-network failures (decoding, storage) also surfaced raw `Error.message` text.
- OK: camera denied or missing, no platform authenticator, a cancelled Face ID prompt and a lost response after
  sealing (409 → sealed) already had clear handling and tests. Photos persist on the device until sent or
  discarded.

Done: all.

- `SealError.reason` is one of `offline`, `link-closed`, `cancelled` or `other`. Network errors become "No connection.
  This photo is kept on your phone and seals when you're back online."; a 410 becomes `link-closed`. Any other
  exception shows the generic retry message and the details go to the console.
- `failure` is stored with the capture. On the browser's `online` event, every offline-failed photo seals again by
  itself.
- If the link closes, a banner explains it ("New photos can't be sealed with it. Photos already sealed stay valid.
  Ask your insurer for a new link."), the shutter is disabled and Retry is hidden. Discard stays.
- Retry and Discard are now 14px with 36px-high targets.
- Two new e2e tests. Offline: the plain message is shown, no "Failed to fetch", and the photo seals automatically
  after reconnecting. Revoked mid-session: the banner is shown, the shutter is disabled, there is no Retry, and the
  earlier Seal remains.

`pnpm check` is green. e2e: 22/22 in dev mode and 22/22 in production mode.

**Next: Iteration 36 — Backend, pass 8**: the send-to-insurer path (`PUT …/captures/:hash/file`). Check that the
bytes must hash to the sealed Exact Hash, the per-link size and count limits, the behaviour on a revoked link after
sealing (should the Capturer still be able to deliver already-sealed photos?), and idempotent re-sends.

---

## Iteration 36 — Backend, pass 8: delivering sealed photos to the insurer (2026-09-30)

Findings:

- **H1** Sealed evidence could be stranded. `receiveCaptureFile` refused any upload once the link was revoked or had
  expired (14 days), including the original bytes of photos sealed **through that link while it was active**. A
  policyholder who sealed photos and sent them a day later, or whose adjuster revoked the link in between, could never
  deliver them. The Console showed "Not sent yet" indefinitely. The PRD says an inactive link "accepts no Captures",
  meaning new photos; it does not say sealed ones can't be delivered.
- **M1** The capture screen reported every failed send as "Check your connection and try again.", including a
  server refusal that no retry could fix. Iteration 35's banner also said sealed photos "stay valid" while Send was
  certain to fail.
- OK: the bytes must SHA-256 to the sealed Exact Hash, so a Carrier only ever receives files that verify as Original.
  Re-sends are idempotent (`already-received`). Files are capped at 20 MB, with `bodyTooLarge` checked before reading.
  The number of files per link is bounded by the Seal rate limits. A lost `captures` row is restored from the Registry
  only when the Seal's `claimRef` matches this Claim File.

Done: all.

- On an inactive link, a photo that is already sealed in this Claim File can still be delivered, and only its exact
  bytes are accepted. Anything else still gets 410, including restoring a row from the Registry, which stays
  active-link only.
- The client shows the server's reason when the server answered, and the connection hint only when nothing came
  back. The banner says sealed photos "stay valid and can still be sent".
- Tests: a unit test shows that after a revoke the exact bytes are delivered, tampered bytes are refused and unknown
  hashes get 410. The revoked-mid-session e2e now sends the earlier photo and reaches "Sent to your insurer".

`pnpm check` is green. e2e: 22/22 in dev mode and 22/22 in production mode.

**Next: Iteration 37 — Contracts, pass 8**: review the deploy script and deployments JSON against the new
DefaultAdminRules (does the deploy record the admin transfer delay, and does `DeployRegistry.t.sol` assert it?), and
check the keyless probe still matches the Registry's verification path after the fmt changes (re-run
`pnpm --filter @proofshot/contracts probe --no-write`).

---

## Iteration 37 — Contracts, pass 8: the deploy script after the admin changes (2026-09-30)

Method: read `DeployRegistry.s.sol` against iteration 27's DefaultAdminRules, then broadcast it for real to a
throwaway Anvil and read the `deployments/31337.json` it wrote. I deleted the file and the broadcast log afterwards.
I also re-ran the keyless Monad probe.

Findings:

- **H1** An empty RP ID list deployed without complaint. `REGISTRY_RP_IDS=` (or unset, if an env wrapper supplied an
  empty string) produces a Registry that can never accept a single passkey. Nobody would notice until the first
  Seal failed on the live demo, and fixing it takes the cold admin key (`setRpIdHash`).
- **M1** `localhost` was accepted as an RP ID on mainnet. Copying the local `RP_IDS` default would make passkeys
  created on any developer machine valid on the production Registry.
- **M2** The deployment record didn't capture the new admin rules (transfer delay) or who deployed. An auditor had to
  read the chain to learn either.
- **L1** `deployBlock` is the block the script simulated against, not the inclusion block (0 vs 1 on Anvil). That is
  correct as the indexer's inclusive lower bound, but it was undocumented.
- OK: the probe still matches. Testnet and mainnet accept the valid assertion (13,853 gas, precompile accepted) and
  reject the tampered one.

Done: all.

- The script reverts with `NoRpIds`, `EmptyRpId` and `LocalhostOnMainnet`; testnet may keep `localhost` for
  development. The deployment JSON now also records `deployer` and `adminTransferDelaySeconds` (86400).
- `DeployRegistry.t.sol` asserts `defaultAdmin` and the delay, and has a new test for all three refusals plus the
  testnet exception.
- `deploy.md` describes the guards and every field of the record.

`pnpm check` is green (contract suites included). The gas snapshot is unchanged. e2e: 22/22 in dev mode.

**Next: Iteration 38 — Tests/CI, pass 8**: extend the fresh-clone check from iteration 34 into CI. Add a job, or a
step in `check`, that fails when a file referenced by the README or tests is git-ignored, e.g. by running
`git ls-files --others --ignored --exclude-standard` against an allow-list. Also make sure the canary would alert:
decide how a failed scheduled run notifies the owner.

---

## Iteration 38 — Tests/CI, pass 8: docs that point at missing files, and a canary nobody would hear (2026-09-30)

Findings:

- **M1** Nothing kept the docs' file references honest. The `.env.example` miss (iteration 34) belonged to a class of
  bugs: a path named in the README or `docs/` that is git-ignored, renamed or never committed looks fine locally and
  is missing from every clone. CI runs on a fresh checkout, so it would catch *test* breakage there, but the repo has
  no remote yet and no test covered doc references at all.
- **M2** The canary could fail silently. A failed scheduled run only emails the account that last edited the cron,
  and only if its notification settings allow it; the run itself is a red dot nobody opens. A Monad change that breaks
  passkey verification could go unnoticed until the demo.
- OK: CI itself is a fresh clone, so ignored-but-required files fail CI once a remote exists. The new test catches
  them locally, before a push.

Done: both.

- `packages/shared/src/repo-docs.test.ts` runs as part of `pnpm test`. For the README and every tracked `docs/*.md`
  (except this log), every backticked repo path and every relative Markdown link must resolve to a committed file or
  directory. Outputs that are produced later (`docs/latency.md`, `spike-b-testnet.json`, `benchmark/README.md`, the dev
  outbox) are allow-listed with a reason, and a second test fails if an allow-listed entry goes stale.
  Mutation-checked: an invented path and a broken relative link both fail.
- The canary's `probe` job gets `issues: write` (job-scoped; the workflow default stays `contents: read`). On a failed
  scheduled run it opens "Monad canary failing: passkey verification probe", or comments on the open issue.
  Both branches were simulated with a stub `gh`; actionlint and shellcheck are clean.
- README describes both. The owner checklist says to watch the repo's issues after the first push.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 39 — Docs, pass 8**: the judge's guide and README top section, read in 60 seconds. Is the core claim
("verified onchain by Monad's P-256 precompile") the first thing a judge sees, with its evidence one click away? Also
check that `CHANGELOG.md` covers iterations 23–38.

---

## Iteration 39 — Docs, pass 8: the first 60 seconds, and evidence that reproduces (2026-09-30)

Method: read the README top and the judge's guide the way a judge skims them, then ran every "evidence" pointer.

Findings:

- **M1** The gas figure's evidence did not show the figure. Both the README and the judge's guide cited
  `contracts/.gas-snapshot` for "100,340 gas per Seal", but that file holds whole-test totals (e.g. 830,937). The
  100,340 comes from a gas report under the Osaka EVM, and no command in the repo produced it.
- **M2** The core claim ("Monad verifies the passkey onchain") and its proof were several screens apart in the README,
  under "Why Monad".
- **M3** `CHANGELOG.md` stopped at "15 review iterations" and still claimed "fresh-clone build verified", which was
  not true until iteration 34 found the ignored `.env.example`.
- **L1** The probe claim had drifted to "the Registry's exact check". The probe runs the same OpenZeppelin
  `WebAuthn.verify` the Registry calls, not all of `seal()` (RP ID allowlist, Signing Window and so on), so the wording
  had to be narrowed.

Done: all.

- `pnpm --filter @proofshot/contracts gas:seal` prints the `seal` gas report under Osaka (100,340) and then under the
  default Prague profile (326,571). Both numbers were checked against the docs. The README and judge's guide now point
  at the command.
- The README opens with a four-row claim-and-evidence table: the probe on both networks, gas and how to reproduce it,
  the Verdict CLI, and what is still ⏳. All links are kept honest by `repo-docs.test.ts`.
- The changelog covers the hardening from iterations 16–38, and the fresh-clone claim now carries its caveat.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 40 — Frontend UI/UX, pass 9**: the landing page at 375px and 1440px. Check hierarchy, whether the
primary CTA ("Try it on this phone") is above the fold, the QR hand-off on desktop, and whether it states the one
proof point (verified onchain on Monad) without crypto jargon for non-technical visitors. Use ui-ux-pro-max landing
guidance.

---

## Iteration 40 — Frontend UI/UX, pass 9: the landing page (2026-09-30)

Method: regenerated screens and reviewed the landing page at 375px, 1280px, 320px, in landscape and in dark mode.

Findings:

- **M1** The hero led with an unverifiable absolute: "Generative edits and recycled photos are hitting *every*
  claims desk." The PRD asks for honest claims, and the one statistic behind it (Verisk) is still flagged ⏳ for
  re-checking.
- **M2** The desktop QR card showed no URL in text. It existed only in the `aria-label`, so a visitor whose phone
  camera wouldn't scan the code (a glare-heavy screen, an old phone, a projector at a demo table) had nothing to type.
- OK: at 375px the primary CTA "Try it on this phone" sits above the fold (y ≈ 420); the secondary action is visually
  subordinate.
- OK: the order is problem, how it works, "Checked onchain, on Monad", then proves and does-not-prove. That puts the
  honest limits on the first page, not just in the docs.
- OK: at 320px and in landscape there is no horizontal scroll; dark mode has adequate contrast (and axe passes in
  both schemes since iteration 24).
- OK: the Monad paragraph uses technical terms (smart contract, P-256). That is appropriate on a page aimed at judges
  and carriers; the Capturer surfaces themselves stay free of them.

Done: both.

- The hero now states a checkable capability: "An AI editor can add damage to a photo in seconds, and genuine photos
  get reused from one claim to the next."
- The QR card prints the scheme-less URL under the code (`localhost:3100/try` locally, the deployed host in
  production). The sandbox e2e asserts it.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 41 — Backend, pass 9**: the magic-link and session lifecycle: session expiry and rotation, sign-out
everywhere, cookie flags in production (`Secure`, `HttpOnly`, `SameSite`, `__Host-` prefix), CSRF on server actions,
and what happens to open sessions when a user is removed from a carrier.

---

## Iteration 41 — Backend, pass 9: sign-in and sessions (2026-09-30)

Findings:

- **M1** Account enumeration by timing. `requestSignIn` returned identical text for known and unknown emails, but
  awaited the email provider only for known ones. The Resend round trip (hundreds of ms) made real accounts measurably
  slower to answer.
- **M2** Account enumeration by error. In production without `RESEND_API_KEY`, the send threw `MailNotConfigured`, but
  only for existing accounts, so they got an error page and strangers got "sent". The misconfiguration itself surfaced
  nowhere an operator would look.
- **L1** The session cookie had no `__Host-` prefix. A sibling subdomain (a preview deployment, for example) could
  plant or shadow `ps_session`.
- **L2** Signing in again left the browser's previous session valid in the database until it expired.
- OK: magic links are hashed, single use, expire after 15 minutes, and are redeemed only by an explicit POST (link
  scanners can't burn them). The cookie is `HttpOnly`, `SameSite=Lax` and `Secure` in production. Server actions carry
  Next's Origin check, and cross-site requests carry no cookie under Lax. Demo sessions last 2 h and are rate-limited.
  Expired sessions and tokens are purged daily. A session resolves only through a live user row, so removing a user
  ends their sessions.

Done: all.

- The sign-in email is sent with `after()`, once the response is out; its failures are logged. Known and unknown
  addresses now get the same response in the same time.
- New `mailConfigured()`: `/api/health` reports `sign-in-email-not-configured` (503) in production without a provider,
  so the uptime monitor catches it. Unit tests: a production build without a key is unconfigured and never logs the
  link; a provider key, the test outbox or development count as configured.
- The cookie is `__Host-ps_session` in production (`Secure`, `Path=/`, no `Domain`) and `ps_session` in development.
  e2e asserts the flags in both modes, and the `__Host-` name and `Secure` in production mode.
- `completeSignIn` ends this browser's previous session before setting the new one.
- `deploy.md` updated.

`pnpm check` is green. e2e: 22/22 in dev mode and 22/22 in production mode (plus the console spec re-run in both
modes after the cookie assertion).

**Next: Iteration 42 — Contracts, pass 9**: a final contract read-through as an external auditor would do it: an
invariant list in NatSpec at the top of `Registry.sol`, and a `docs/security.md` summary (roles, trust assumptions,
known limits, how to report). Check that everything claimed there is tested.

---

## Iteration 42 — Contracts, pass 9: an auditor's read-through (2026-09-30)

Method: read `Registry.sol` as an external auditor would, listing roles, guarantees and trust assumptions, and checked
that every guarantee has a test that would break if it stopped holding.

Findings:

- **M1 (design, documented)** Signatures are not domain-separated. The challenge is `sha256(abi.encode(record))`,
  with no `block.chainid` or `address(this)`. In v1 only the relayer can submit, and `refBlock` pins a record to one
  chain's recent ~30 s, so moving a signature to another network is impossible in practice. It could still be sealed
  on a second Registry on the same chain inside its window, by the relayer only. This becomes a real replay vector the
  moment `seal()` goes permissionless (the stated roadmap). I did not change the encoding days before submission:
  that would touch the contract, client, server, fixtures and every quoted gas figure. It is now recorded as a hard
  prerequisite of the permissionless milestone in `docs/security.md` and the write-up's roadmap.
- **L1 (design, documented)** `clientDataJSON.origin` is not checked onchain; the binding comes from the
  authenticator-set RP ID hash plus the allowlist. That is standard, but it was written down nowhere.
- **L2** No single document stated the security model: roles, what each can and cannot do, guarantees, trust
  assumptions, and how to report a vulnerability.
- OK: `requireUV` is on; OpenZeppelin enforces low-s signatures, the type and challenge checks and the UP flag;
  events cover every state change; the revocation path is deliberately live while paused; no external calls besides
  the P-256 precompile, so there is no reentrancy surface.

Done: all.

- New `docs/security.md`, linked from the README. It covers:
  - a roles table;
  - 12 guarantees, each naming its enforcing mechanism and tests (27 distinct unit, fuzz and invariant tests);
  - the four trust assumptions above;
  - the application safeguards;
  - private vulnerability reporting through the repository's security tab.
- `security-doc.test.ts` fails if a test cited there no longer exists (mutation-checked with a renamed test). The
  existing `repo-docs.test.ts` caught the new doc being linked before it was committed, which is exactly its job.
- `Registry.sol` carries `@custom:invariant` and `@custom:security` NatSpec pointing to the model. Runtime bytecode
  is unchanged and the gas snapshot passes.
- The write-up's roadmap names domain separation as the first step towards a permissionless `seal()`.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 43 — Tests/CI, pass 9**: a mutation-testing pass on the Verdict engine (`packages/fingerprint`
`verdict.ts`). Flip each threshold comparison and boundary (≥12 tiles, >8 shifted, T_match 31, T_tile 40) and confirm
a test fails for each. Add boundary tests where none does.

---

## Iteration 43 — Tests/CI, pass 9: mutation testing the Verdict engine (2026-09-30)

Method: I applied 26 single-point mutations to `packages/fingerprint/src/verdict.ts`, one at a time, and ran the
package tests after each. The mutations covered every threshold comparison (≤ vs <), every default threshold ±1, the
aspect check, the tile-count guard, the best-match tie-breaks, the "imported never yields Original" rule, and
duplicate ordering.

Findings:

- **H1** 18 of 26 mutants survived. The rules that decide a Verdict (the whole-image distance ≤ 31, tile distance
  ≤ 40, the 12-tile majority, the 8-tile geometry cap, the best-match ordering, and every default threshold) could all
  change by one and no test failed. The existing tests use real images whose distances sit far from every threshold.
  They prove the engine behaves sensibly, but not that it implements the published rules. Because the CLI and the
  website must reproduce exactly these rules, that is a correctness gap for the core product, and it would let a
  silent threshold regression through.
- OK: 8 mutants were already killed, among them "imported yields Original", "exact match first", "sealed preferred
  on a tie" and featureless-tile handling.

Done.

- `verdict-boundaries.test.ts` uses synthetic hashes with exact Hamming distances (`flip(h, n)`) and pins each
  boundary on both sides:
  - whole-image distance 31 matches, 32 does not;
  - a tile at distance 40 is unchanged, at 41 it is altered;
  - 12 aligned tiles match, 11 do not;
  - 8 changed tiles give Altered, 9 give "check unavailable";
  - the 2% aspect tolerance is inclusive, using 50:1 vs 51:1, which is exactly 0.02 in floating point, whereas
    1020/1000 is not;
  - 0.019 is inside the tolerance and 0.021 outside;
  - a record without 16 tiles is never tile-compared;
  - ordering is "more tiles first, then smaller distance", in both input orders and in `findMatches`.
- Result: **26/26 mutants killed**. The runner is committed as `pnpm --filter @proofshot/fingerprint mutate`
  (TypeScript, restores the source even on Ctrl-C, exits 1 on any survivor) and listed in the README.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 44 — Docs, pass 9**: `docs/architecture.md` against the code as it is now: the indexer re-scan,
decode budget, `after()` mail, `__Host-` cookie and security model. Check the diagram is still accurate and trim
anything stale. Also check `docs/traceability.md` maps every FR to tests that still exist (the test renames since
iteration 15).

---

## Iteration 44 — Docs, pass 9: architecture and traceability against the code (2026-09-30)

Method: every concrete claim in `docs/traceability.md` and `docs/architecture.md` checked against the source. I
compared the rate-limit constants (50 Seals per link, 200 per Device Key per day), the 3-photo burst in
`capture.spec.ts` and every test file the docs name.

Findings:

- **M1** Traceability had stopped at iteration ~15. It said nothing about the evidence added since: the Verdict
  boundary tests and mutation campaign, the decode budget, offline re-seal, delivery after a revoke, the indexer's
  reorg handling, the print layout, grouped alerts, the demo-placeholder rule, and the cookie and enumeration fixes.
  A judge reading it would underrate what is actually tested.
- **M2** Nothing protected the traceability table from test renames. A renamed test file would leave a row pointing
  at nothing, and no test would notice.
- **L1** `architecture.md` said nothing about the guard rails: size and pixel budgets, email after the response,
  cookie scope, health conditions. It also did not link the security model.
- OK: all constants, flows and file references were accurate. The diagram still matches the components.

Done: all.

- The traceability rows for FR-4, 5, 6, 8, 9, 12 and 15 now name the new evidence. The cross-cutting line links
  `security.md` and states the dark-mode axe coverage.
- `repo-docs.test.ts` also fails when the README or any doc names a `*.test.ts`, `*.spec.ts` or `*.t.sol` file that
  doesn't exist. Mutation-checked: renaming `enroll.test.ts` in the table fails the test.
- `architecture.md` gains a "Guard rails" paragraph and a link to `security.md`.

`pnpm check` is green. e2e: 22/22 in dev mode.

**Next: Iteration 45 — Frontend UI/UX, pass 10**: the Console list page at 1280px with many Claim Files (20+): scan
speed, status column clarity ("Evidence received" and "Awaiting evidence"), sorting, an empty search. Also check the
imports page's result list for a 10-file batch with mixed outcomes, including the new "over 50 megapixels".

---

## Iteration 45 — Frontend UI/UX, pass 10: the Console list at scale (2026-09-30)

Findings:

- **H1** No search and no paging. The list rendered every Claim File of the carrier, each with two correlated count
  subqueries. On the shared demo carriers every judge and visitor adds files, so after a day of judging a judge's own
  Claim File would sit somewhere in hundreds of rows with no way to find it, and the page would get slower with every
  visitor. A real carrier has the same problem from the first busy week.
- **L1** The create field and the new search field both mention "Claim reference". The search field has a visible
  label ("Find a Claim File") and secondary styling, so I accept this as is.
- OK: status wording, the right-aligned tabular item count, alerts flagged with an icon plus bold text (not colour
  alone), long references truncated with a `title`, horizontal scroll only inside the table on small screens.

Done: H1.

- `listClaimFiles(scope, { q, limit, offset })` does a case-insensitive substring match on the reference and escapes
  `%`, `_` and `\` so they are literal. Order is stable (created, then id). Unit tests cover case-insensitivity,
  literal wildcards and disjoint pages.
- The Console list has a GET search form (`role="search"`, labelled), a "No Claim Files match “…”." state with
  Clear, and 50 rows per page with Newer and Older. It fetches one extra row to detect an older page, so there is no
  count query. The table caption reflects the filter.
- New e2e: three files are created and a search by lower-case reference returns exactly the two matching rows, newest
  first; a no-match search shows the message; Clear resets.

`pnpm check` is green. e2e: 23/23 in dev mode and 23/23 in production mode (the a11y scan now includes the search
form).

**Next: Iteration 46 — Backend, pass 10**: demo data retention. The shared demo carriers grow without bound (Claim
Files, uploads and images in storage from every visitor). Extend the daily maintenance job to prune demo-carrier Claim
Files older than a set window, together with their stored images, never touching real carriers. Check it is
idempotent and tenant-safe.

---

## Iteration 46 — Backend, pass 10: retention for the public demo workspaces (2026-09-30)

Findings:

- **M1** The shared demo carriers and the Try-it sandbox grew without bound. Every visitor's Claim Files, captures,
  uploads, alerts and images were kept forever. On a public judging deployment that meant unbounded Postgres and
  bucket growth, plus other people's leftovers piling up in a workspace each new visitor sees. The daily maintenance
  job pruned only tokens, sessions and rate-limit windows.
- **L1** `Storage` had no way to delete, so even a manual cleanup would have left images in the bucket.
- OK (by design): Seals stay onchain and `/r/<hash>` receipts read the Registry, so they survive any database
  cleanup.

Done: both.

- `Storage.deleteClaimFile(prefix)` works on the filesystem (`rm -r`) and on S3 (ListObjectsV2 plus batched
  DeleteObjects, with continuation). It only accepts an exact `<carrierId>/<claimFileId>/` prefix, so a whole carrier
  or the bucket can't be deleted by mistake.
  - The contract test runs against both implementations. It deletes one Claim File's five objects while keeping a
    sibling whose name shares a string prefix, checks the delete is idempotent, and rejects six unsafe prefixes.
  - The fake S3 pages two keys at a time with key-based continuation. Its first version used offsets, and while
    deleting it skipped keys; the test caught this.
- `pruneDemoData(db, storage)` removes Claim Files of **demo and sandbox carriers only** that are older than 7 days,
  at most 500 per run. Images are deleted first, then one transaction deletes alerts, uploads, captures, links and
  files. Verification Receipts are kept, detached (`claimFileId = null`), so shared `/v/<id>` links keep working.
  - Test: old demo and old sandbox files are deleted with their images and rows. A recent demo file and an old
    real-carrier file are untouched. Receipts survive. A second run deletes nothing.
- The cron route runs both prunes. The demo banner says entries are "removed after 7 days", and `deploy.md` describes
  the job.

`pnpm check` is green. e2e: 23/23 in dev mode and 23/23 in production mode.

**Next: Iteration 47 — Contracts, pass 10**: nothing structural is left from the audit, so look at the operational
side. Write a short admin runbook script, or `cast` one-liners in `deploy.md`, for pausing, rotating the relayer,
allowing a preview RP ID and the two-step admin transfer. Test each command against a local Anvil deploy so the docs
are executable, not aspirational.

---

## Iteration 47 — Contracts, pass 10: an admin runbook that is executed, not just written (2026-09-30)

Findings:

- **M1** The operations that matter in an incident (pause, cutting off a compromised relayer and its Device Keys,
  installing a new relayer, allowing a preview hostname, the two-step admin handover) were described in prose,
  NatSpec and the threat model, and exercised only in Solidity tests. The owner had no commands to run, so the first
  real run would have been during an incident. Hand-written `cast` lines also go stale without anyone noticing.
- **L1** Nothing told the operator how the cold admin key should reach `cast`. The natural reflex, pasting a private
  key into the shell, is exactly what must not happen.

Done: both.

- New `docs/runbook.md`: status checks, the full T-8 incident sequence, adding and removing an RP ID (with the
  `sha256(hostname)` one-liner), and the admin handover including cancel. The admin signs through `$ADMIN_SIGNER`
  (`--ledger` or an encrypted `--account` keystore), never a pasted key.
- `pnpm --filter @proofshot/contracts runbook:check` (`tools/runbook-check.sh`):
  - starts a throwaway Anvil and deploys through the real `DeployRegistry` script (and removes its deployment
    record);
  - registers a "suspect" Device Key, then **extracts each `<!-- step:… -->` block from the Markdown and runs it
    verbatim**;
  - checks the chain state after each step: paused, relayer revoked and the suspect key revoked, new relayer
    granted, unpaused, RP ID allowed, and the new admin in place after the delay (time advanced with `evm_increaseTime`);
  - derives dev keys from Anvil's well-known mnemonic. A hand-typed key had one wrong digit and pointed at an
    unfunded account, which the first run caught.
- Mutation-checked: renaming `unpause()` in the doc makes the check fail. It now runs in CI's `check` job (actionlint
  clean).
- `deploy.md` and `security.md` link the runbook.

`pnpm check` is green. e2e: 23/23 in dev mode.

**Next: Iteration 48 — Tests/CI, pass 10**: total CI wall time and caching. The e2e job builds Next in production
each run, so check whether `.next/cache` can be cached safely. Check Foundry's compilation cache across jobs. Look
for any step that could be parallelised.

---

## Iteration 48 — Tests/CI, pass 10: build determinism and CI caching (2026-09-30)

Method: I measured cold and warm builds locally: `.next` removed, then `contracts/out` and `contracts/cache` removed.

Findings:

- **H1** The build depended on Google Fonts at build time. The first cold `next build` of this pass **failed** with
  24 `next/font/google` errors ("Module not found … internal/font/google/font"); the retry a minute later passed.
  `next/font/google` downloads IBM Plex from `fonts.gstatic.com` during every build that lacks a warm `.next/cache`.
  A network blip therefore breaks CI, and on the day it matters it breaks a production deploy. Runtime was never
  affected: the fonts were already self-hosted and the CSP allows no third-party origins.
- **L1** CI rebuilt Next from scratch in both the `check` and `e2e` jobs with no build cache. Locally the cold build
  took 9 s and a warm one 1–2 s: a small but free saving.
- OK: Foundry compiles cold in about 2 s, not worth a cache. The pnpm store and the Playwright browsers were already
  cached.

Done: both.

- IBM Plex Sans (400/500/600/700) and Mono (400/500), latin subset, are vendored as woff2 in `src/app/fonts/`
  (122 KB), taken from `@fontsource` 5.3.0 together with both SIL OFL 1.1 licence files. `layout.tsx` now uses
  `next/font/local` with the same CSS variables and `display: swap`. A cold build passes with no font fetch, and
  `.next/static` references no Google URL. Screens confirm the typography is unchanged.
- The `check` and `e2e` jobs cache `apps/web/.next/cache`, keyed on the lockfile plus source hashes and restoring from
  lockfile-only (actions pinned by SHA, actionlint clean).

`pnpm check` is green. e2e: 23/23 in dev mode and 23/23 in production mode.

**Next: Iteration 49 — Docs, pass 10**: the OWNER-TODO checklist, read through against what exists now: the runbook,
latency report, health conditions, demo retention and canary issues. Every owner step should point at the doc or
command that now automates or verifies it, and steps that are no longer needed should go.

---

## Iteration 49 — Docs, pass 10: the owner's checklist against the product as it now is (2026-09-30)

`OWNER-TODO.html` is git-ignored by design (it is the owner's private, Turkish checklist), so only this entry is
committed. I read it end to end against what iterations 23–48 changed.

Findings:

- **H1** The key instructions no longer matched the contract. The checklist asked for **one** funded key per network
  (a "deployer"). Since iteration 27 the Registry refuses an account that holds both the admin and the relayer role,
  and the deploy needs `REGISTRY_ADMIN` and `REGISTRY_RELAYER`. The relayer key also has to reach the host and pay
  every Seal. Followed as written, the mainnet step would have produced either a refused deploy or a cold admin key
  sitting in a `.env` file.
- **M1** Nothing told the owner that the production hostname must be decided **before** deploy. The RP ID is written
  into the Registry, and changing it later needs an admin transaction.
- **M2** `docs/security.md` asks reporters to use GitHub's private vulnerability reporting, but nothing told the owner
  to switch it on.
- **L1** The uptime step still described two 503 causes; there are now four (low balance, paused, chain unreachable,
  email not configured). It also didn't say how to read `problems`. The demo retention and the runbook were not
  mentioned.

Done: all.

- Testnet: two keys (deployer, which is also the admin, and a relayer), both in `.env.testnet`.
- Mainnet: three roles, explained in one sentence each:
  - admin in an encrypted keystore (`cast wallet import proofshot-admin --interactive`) or on a Ledger; only its
    **address** goes into `.env.mainnet`, and the runbook's `ADMIN_SIGNER="--account proofshot-admin"` shows how it
    signs later;
  - deployer and relayer as plain keys, with funding amounts derived from the measured gas.
- A new step: decide the final hostname and send it before deploy, with a pointer to the runbook for adding one
  later.
- The GitHub step now includes enabling private vulnerability reporting. The uptime step lists all four `problems`
  and the action for each. The hosting step mentions the 7-day demo retention.

No code changed, so the last green `pnpm check` and e2e runs (iteration 48) still apply.

**Next: Iteration 50 — Frontend UI/UX, pass 11**: the imports page (Console → Import history). Check the upload
affordance, progress for a 10-file batch, the mixed-outcome result list ("imported", "not a readable image", "over 50
megapixels"), and what an adjuster learns about the transaction, with no crypto jargon beyond what a carrier
back-office needs.

---

## Iteration 50 — Frontend UI/UX, pass 11: the imports page, and a hosting blocker it exposed (2026-09-30)

Findings:

- **Critical (deployment)** The recommended host could not have accepted the app's own uploads. Reviewing batch
  sizes led me to check the limits: **Vercel Functions cap request bodies at 4.5 MB** (Vercel docs, updated
  2026-08-24; `413 FUNCTION_PAYLOAD_TOO_LARGE`). Four flows upload photos to the app: sealed photos sent to the insurer
  (12 MP JPEG, 3–6 MB), the Public Verifier and Console uploads (phone photos of 2–8 MB, 20 MB promised), and import
  batches of 10. On the Vercel plan in the owner checklist most real uses would have failed on launch day. Nothing
  local could catch it: every test ran on a Node server with no such cap, using small images. The app's own stack is
  fine: all uploads go through route handlers, not server actions with their 1 MB default.
- **H1** Imports could run twice at once. The pickers stayed enabled during an import, so a second selection
  interleaved with the first: rows mixed and progress jumped. There was no "done" state, and closing the tab stopped
  the import silently.
- **M1** A file over 20 MB inside a batch was dropped by the server without a row. If a whole batch was oversized,
  the server answered 400 ("Send 1–10 images per batch.") and the import stopped.

Done: all.

- Hosting:
  - `railway.json` at the repo root (Railway has no platform body limit): build, `db:migrate` as the pre-deploy step,
    start on `$PORT`, health check `/`, restart on failure.
  - `deploy.md` opens its app section with *why a long-running Node host*: the Vercel limit with a link, plus a warm
    in-memory Registry index and a meaningful per-process decode limit. It gives a Volume-based `STORAGE_DRIVER=fs`
    setup, with R2 as the alternative, and the generic commands for any Node host.
  - The daily cleanup no longer depends on Vercel cron. A new `Daily maintenance` GitHub workflow (`permissions: {}`,
    actionlint clean) calls `/api/cron/maintenance` with `CRON_SECRET`, and skips while `APP_URL` is unset.
  - The owner checklist's hosting step is rewritten for Railway: Postgres, a Volume at `/data`, Resend, `DEMO_ACCESS`,
    `CRON_SECRET` in both places, and the domain decided before deploy. It says plainly not to use Vercel, and why.
  - New e2e test: a 9.8 MB, 12 MP photo verifies through the **production** server (200, No Record), so the app keeps
    the 20 MB it promises.
- Importer:
  - One run at a time: the pickers are disabled, and visibly dimmed, while busy.
  - `beforeunload` asks before leaving mid-import.
  - Files over 20 MB are listed as "over 20 MB" instead of being sent.
  - The status line reads "Importing — keep this tab open." and then "Import complete: …".
  - The import e2e asserts the completion text and that the pickers are re-enabled.

`pnpm check` is green. e2e: 24/24 in dev mode and 24/24 in production mode.

**Next: Iteration 51 — Backend, pass 11**: behaviour on a real long-running host. Are the process singletons, the
registry index and the decode limiter safe across Railway restarts and zero-downtime deploys, with two instances
briefly overlapping? That covers the DB unique constraints, idempotent Seal submission from two processes and the
relayer nonce handling.

---

## Iteration 51 — Backend, pass 11: restarts, overlapping instances and lost responses (2026-09-30)

Method: I went through each write path assuming a long-running host (iteration 50) that restarts and, during
zero-downtime deploys, briefly runs two instances. For each path I asked what happens if a request dies after its
transaction was sent, and what happens if two processes write at once.

Findings:

- **H1** Device-key enrollment could lock a passkey out permanently. If `registerDeviceKey` landed onchain but its
  response was lost (a receipt timeout, a restart mid-request, or a fallback RPC answering "already known" and the
  send being retried), `enroll` treated it as a failure and deleted the DB row. Every later attempt with the same
  passkey then reverted in gas estimation with `DeviceKeyExists`, so enrollment returned 503 forever. Seals already
  had this recovery (a 409 `AlreadySealed` adopts the onchain record); enrollment did not.
- **L1** Nonce collisions were retried three times back to back. Against a lagging fallback node, or a second
  instance still draining, all three retries could hit the same stale nonce within milliseconds.
- OK: captures are unique on Exact Hash; the rate limits are atomic in the DB; magic-link redemption is a
  single-row atomic claim; the Registry index is per-process and rebuilt from DB and chain; the decode limiter is
  per-process by design; migrations run once as Railway's pre-deploy step; a Seal whose response is lost is
  reconciled from the Registry (existing tests).

Done: both.

- `Relayer.deviceKey(keyId)` reads the Registry's view of a key, and the error classifier has a new kind,
  `key-exists`. When registration reverts with `DeviceKeyExists`, `enroll` checks the key onchain. If the key is
  there, has the **same public key** and is not revoked, it keeps the row and returns `registered`. Otherwise it
  cleans up as before. A different key under the same id is never adopted.
  - Unit test: the adopt case, and the refusal for a mismatching onchain key.
  - I also ran a real check against a throwaway Anvil: a second `registerDeviceKey` through viem's `writeContract`
    yields an error that `relayerErrorKind` classifies as `key-exists`. The string-based classifier therefore
    matches what viem really throws, not just a test fake.
- Nonce retries back off for 250, 500 and 750 ms.

`pnpm check` is green. e2e: 24/24 in dev mode and 24/24 in production mode.

**Next: Iteration 52 — Contracts, pass 11**: gas-price behaviour on Monad for the relayer. Check whether viem's fee
estimation (EIP-1559 on Monad) could overpay or underpay during spikes, whether we should cap `maxFeePerGas` (config)
so a fee spike can't drain the relayer, and whether `/api/health` should report the current base fee. Use the public
RPC keylessly to read `eth_feeHistory`.

---

## Iteration 52 — Contracts, pass 11: what a Seal really costs on Monad, and fee spikes (2026-09-30)

Method: read Monad's gas-pricing docs, measured live fees from the public RPCs without keys (`eth_feeHistory`,
`eth_maxPriorityFeePerGas`), and measured real Seal transactions end to end on the local chain.

Findings:

- **Fact that changes the cost model:** Monad charges `min(base + tip, maxFee) × gasLimit`. It charges the gas
  **limit**, not gas used. Any padding of the gas limit is money burnt on every Seal.
- **M1 (checked, no change needed)** I suspected the "≈ 0.010 MON per Seal" figure used execution gas only and left
  out the 21,000 base and ~1.35 KB of calldata. The e2e run disproves that: full Seal transactions use 99,961–101,729
  gas, and viem sets the gas **limit exactly to the estimate**, so nothing is padded. The published figure holds at the
  transaction level. It is now written down with its source, and the e2e asserts that the limit stays within 10 % of
  gas used, so a future padding change can't slip in.
- **H1** Fees had no ceiling. viem's EIP-1559 default is `maxFee = 1.2 × base + tip`, with no upper bound.
  Measured today: base fee at the 100 gwei floor, tip 2 gwei, and the mainnet p90 tip up to 80 gwei in the last 20
  blocks. In a fee spike every sponsored Seal simply cost more, until the relayer ran dry.
- **H2 (latent)** A relayer transaction whose max fee ended up below the base fee would sit pending and block **every
  later nonce** of the relayer. All Seals would stall until it cleared.

Done: H1 and H2.

- `capFees()` (pure, unit-tested):
  - clamps `maxFeePerGas` to `RELAYER_MAX_FEE_GWEI` (default 500, which is 5× the floor and at most about 0.05 MON
    per Seal);
  - keeps the tip within what the cap leaves above the base fee;
  - throws `FeeTooHigh` *before sending* when the base fee alone exceeds the cap, so nothing is left pending to block
    the nonce queue.
- Every relayer write (register key, seal, import) goes through it. `FeeTooHigh` is the new `fee-too-high` kind and
  counts as service-unavailable, so the Capturer hears "paused on our side" and not a retry prompt.
- `/api/health` now reports `baseFeeGwei` and returns 503 with `gas-price-above-cap` above the ceiling.
  `.env.example`, the env schema (the drift test passes), `deploy.md` and the owner checklist ("what to do") are
  updated.
- `spike-b.md` records the fee and transaction-gas measurements with their dates.

`pnpm check` is green. e2e: 24/24 in dev mode and 24/24 in production mode, and the fee path ran on Anvil in both.

**Next: Iteration 53 — Tests/CI, pass 11**: coverage for the web app. Run vitest with v8 coverage on `apps/web` and
`packages/*`, list the least-covered server modules, and add tests where a gap hides a real branch (error paths in
routes, not trivial getters). Consider a coverage floor in CI once the number is known.
